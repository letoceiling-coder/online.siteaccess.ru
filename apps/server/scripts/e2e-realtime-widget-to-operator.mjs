import { io } from 'socket.io-client';
import { fileURLToPath } from 'url';
import path from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, '../.env') });

const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';
const WS_BASE = process.env.WS_BASE || API_URL;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runE2ETest() {
  console.log('=== E2E Realtime Widget-to-Operator Test ===');
  console.log(`API_URL: ${API_URL}`);
  console.log(`WS_BASE: ${WS_BASE}`);

  let ownerToken = '';
  let projectId = '';
  let rawToken = '';
  let conversationId = '';
  let visitorSessionToken = '';
  let operatorAccessToken = '';
  let operatorEmail = '';
  let operatorPassword = '123123123';

  try {
    // 1. Register owner
    const timestamp = Date.now();
    const ownerEmail = `owner_w2o_${timestamp}@test.local`;
    const ownerPassword = '123123123';
    console.log(`\n[1/7] Registering owner: ${ownerEmail}...`);
    const regOwnerResp = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
    });
    if (!regOwnerResp.ok) {
      throw new Error(`Owner registration failed: ${regOwnerResp.status}`);
    }
    console.log('✓ Owner registered');

    // 2. Login owner
    console.log('\n[2/7] Logging in owner...');
    const loginOwnerResp = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
    });
    const ownerData = await loginOwnerResp.json();
    ownerToken = ownerData.accessToken;
    if (!ownerToken) {
      throw new Error('Owner login failed: no token');
    }
    console.log(`✓ Owner logged in`);

    // 3. Create project
    console.log('\n[3/7] Creating project...');
    const createProjectResp = await fetch(`${API_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ name: `W2OTest_${timestamp}`, domains: ['online.siteaccess.ru'] }),
    });
    const projectData = await createProjectResp.json();
    projectId = projectData.id;
    rawToken = projectData.token;
    if (!projectId || !rawToken) {
      throw new Error('Project creation failed: missing id or token');
    }
    console.log(`✓ Project created: ${projectId}`);

    // 4. Register operator
    operatorEmail = `operator_w2o_${timestamp}@test.local`;
    console.log(`\n[4/7] Registering operator: ${operatorEmail}...`);
    const regOpResp = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: operatorEmail, password: operatorPassword }),
    });
    if (!regOpResp.ok) {
      throw new Error(`Operator registration failed: ${regOpResp.status}`);
    }
    console.log('✓ Operator registered');

    // 5. Invite operator
    console.log('\n[5/7] Inviting operator to project...');
    const inviteResp = await fetch(`${API_URL}/api/projects/${projectId}/operators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ email: operatorEmail, role: 'operator' }),
    });
    if (!inviteResp.ok) {
      throw new Error(`Invite failed: ${inviteResp.status}`);
    }
    console.log('✓ Operator invited');

    // 6. Operator login
    console.log('\n[6/7] Operator login...');
    const opLoginResp = await fetch(`${API_URL}/api/operator/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: operatorEmail, password: operatorPassword, channelId: projectId }),
    });
    const opLoginData = await opLoginResp.json();
    operatorAccessToken = opLoginData.operatorAccessToken;
    if (!operatorAccessToken) {
      throw new Error('Operator login failed: no token');
    }
    console.log(`✓ Operator logged in`);

    // 7. Create widget session
    console.log('\n[7/7] Creating widget session...');
    const widgetSessionResp = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': API_URL,
      },
      body: JSON.stringify({ token: rawToken, externalId: `w2o_test_${timestamp}` }),
    });
    const widgetSessionData = await widgetSessionResp.json();
    visitorSessionToken = widgetSessionData.visitorSessionToken;
    conversationId = widgetSessionData.conversationId;
    if (!visitorSessionToken || !conversationId) {
      throw new Error('Widget session failed: missing token or conversationId');
    }
    console.log(`✓ Widget session created, conversationId: ${conversationId}`);

    // 8. Connect sockets and test
    console.log('\n[TEST] Testing widget -> operator realtime delivery...');

    // Connect operator socket FIRST (simulating operator being online)
    const operatorSocket = io(`${WS_BASE}/operator`, {
      auth: { token: operatorAccessToken },
      query: { token: operatorAccessToken },
      transports: ['websocket', 'polling'],
    });

    await new Promise((resolve, reject) => {
      operatorSocket.on('connect', () => {
        console.log('✓ Operator socket connected');
        resolve(true);
      });
      operatorSocket.on('connect_error', reject);
      setTimeout(() => reject(new Error('Operator connection timeout')), 10000);
    });

    await sleep(1000);

    // Connect widget socket
    const widgetSocket = io(`${WS_BASE}/widget`, {
      auth: { token: visitorSessionToken },
      query: { token: visitorSessionToken },
      transports: ['websocket', 'polling'],
    });

    await new Promise((resolve, reject) => {
      widgetSocket.on('connect', () => {
        console.log('✓ Widget socket connected');
        resolve(true);
      });
      widgetSocket.on('connect_error', reject);
      setTimeout(() => reject(new Error('Widget connection timeout')), 10000);
    });

    await sleep(1000);

    // Send message from widget
    const widgetMessageText = `widget-to-operator-${timestamp}`;
    const widgetClientMessageId = `widget-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`\n[TEST] Sending message from widget: "${widgetMessageText}"...`);

    let operatorReceived = false;
    const operatorPromise = new Promise((resolve, reject) => {
      operatorSocket.on('message:new', (data) => {
        console.log(`[REALTIME] Operator received message:new:`, JSON.stringify(data));
        if (data.conversationId === conversationId && data.text === widgetMessageText) {
          console.log(`✓ Operator received message:new within timeout`);
          operatorReceived = true;
          resolve(true);
        }
      });
      setTimeout(() => {
        if (!operatorReceived) {
          reject(new Error('Operator did not receive message:new within 3 seconds'));
        }
      }, 3000);
    });

    widgetSocket.emit('message:send', {
      conversationId,
      text: widgetMessageText,
      clientMessageId: widgetClientMessageId,
    });

    await operatorPromise;
    console.log('✓ TEST PASSED: Widget -> Operator realtime delivery works');

    // Verify messages endpoint returns the message
    console.log('\n[VERIFY] Checking messages endpoint returns the message...');
    const messagesResp = await fetch(
      `${API_URL}/api/operator/messages?conversationId=${conversationId}&limit=50`,
      {
        headers: {
          Authorization: `Bearer ${operatorAccessToken}`,
        },
      }
    );

    if (!messagesResp.ok) {
      throw new Error(`Messages endpoint failed: ${messagesResp.status}`);
    }

    const messagesData = await messagesResp.json();
    const foundMessage = messagesData.find((m) => m.text === widgetMessageText);
    
    if (!foundMessage) {
      throw new Error('Message not found in messages endpoint response');
    }

    console.log(`✓ Messages endpoint returned the message: ${foundMessage.serverMessageId || foundMessage.id}`);

    // Cleanup
    widgetSocket.disconnect();
    operatorSocket.disconnect();

    console.log('\n=== SUCCESS: Widget-to-Operator realtime test passed ===');
    process.exit(0);

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

runE2ETest();
