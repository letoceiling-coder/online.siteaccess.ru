import { io } from 'socket.io-client';
import { fileURLToPath } from 'url';
import path from 'path';
import { config } from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, '../.env') });

const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';
const WS_BASE = process.env.WS_BASE || API_URL;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runE2ETest() {
  console.log('=== E2E Realtime Message Test ===');
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
    const ownerEmail = `owner_realtime_${timestamp}@test.local`;
    const ownerPassword = '123123123';
    console.log(`\n[1/8] Registering owner: ${ownerEmail}...`);
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
    console.log('\n[2/8] Logging in owner...');
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
    console.log(`✓ Owner logged in, token prefix: ${ownerToken.substring(0, 10)}...`);

    // 3. Create project
    console.log('\n[3/8] Creating project...');
    const createProjectResp = await fetch(`${API_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ name: `RealtimeTest_${timestamp}`, domains: ['online.siteaccess.ru'] }),
    });
    const projectData = await createProjectResp.json();
    projectId = projectData.id;
    rawToken = projectData.token;
    if (!projectId || !rawToken) {
      throw new Error('Project creation failed: missing id or token');
    }
    console.log(`✓ Project created: ${projectId}`);

    // 4. Register operator
    operatorEmail = `operator_realtime_${timestamp}@test.local`;
    console.log(`\n[4/8] Registering operator: ${operatorEmail}...`);
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
    console.log('\n[5/8] Inviting operator to project...');
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
    console.log('\n[6/8] Operator login...');
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
    console.log(`✓ Operator logged in, token prefix: ${operatorAccessToken.substring(0, 10)}...`);

    // 7. Create widget session
    console.log('\n[7/8] Creating widget session...');
    const widgetSessionResp = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': API_URL,
      },
      body: JSON.stringify({ token: rawToken, externalId: `realtime_test_${timestamp}` }),
    });
    const widgetSessionData = await widgetSessionResp.json();
    visitorSessionToken = widgetSessionData.visitorSessionToken;
    conversationId = widgetSessionData.conversationId;
    if (!visitorSessionToken || !conversationId) {
      throw new Error('Widget session failed: missing token or conversationId');
    }
    console.log(`✓ Widget session created, conversationId: ${conversationId}`);

    // 8. Connect sockets and test realtime
    console.log('\n[8/8] Testing realtime message delivery...');

    // Connect widget socket
    const widgetSocket = io(`${WS_BASE}/widget`, {
      auth: { token: visitorSessionToken },
      query: { token: visitorSessionToken },
      transports: ['websocket', 'polling'],
    });

    // Connect operator socket
    const operatorSocket = io(`${WS_BASE}/operator`, {
      auth: { token: operatorAccessToken },
      query: { token: operatorAccessToken },
      transports: ['websocket', 'polling'],
    });

    // Wait for both connections
    await Promise.all([
      new Promise((resolve, reject) => {
        widgetSocket.on('connect', () => {
          console.log('✓ Widget socket connected');
          resolve(true);
        });
        widgetSocket.on('connect_error', reject);
        setTimeout(() => reject(new Error('Widget connection timeout')), 10000);
      }),
      new Promise((resolve, reject) => {
        operatorSocket.on('connect', () => {
          console.log('✓ Operator socket connected');
          resolve(true);
        });
        operatorSocket.on('connect_error', reject);
        setTimeout(() => reject(new Error('Operator connection timeout')), 10000);
      }),
    ]);

    await sleep(1000);

    // Join operator to conversation room
    operatorSocket.emit('operator:conversation:join', { conversationId });
    await new Promise((resolve) => {
      operatorSocket.on('operator:conversation:joined', () => {
        console.log('✓ Operator joined conversation room');
        resolve(true);
      });
      setTimeout(() => resolve(true), 2000); // Timeout after 2s
    });

    await sleep(500);

    // Test 1: Widget -> Operator
    console.log('\n[TEST 1] Widget sends message, operator should receive...');
    const widgetMessageText = `widget-to-operator-${timestamp}`;
    const widgetClientMessageId = `widget-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

    let operatorReceived = false;
    const operatorPromise = new Promise((resolve, reject) => {
      operatorSocket.on('message:new', (data) => {
        if (data.conversationId === conversationId && data.text === widgetMessageText) {
          console.log(`✓ Operator received message:new: ${data.text}`);
          operatorReceived = true;
          resolve(true);
        }
      });
      setTimeout(() => {
        if (!operatorReceived) {
          reject(new Error('Operator did not receive message:new within 2s'));
        }
      }, 2000);
    });

    widgetSocket.emit('message:send', {
      conversationId,
      text: widgetMessageText,
      clientMessageId: widgetClientMessageId,
    });

    await operatorPromise;
    console.log('✓ TEST 1 PASSED: Widget -> Operator realtime delivery');

    await sleep(500);

    // Test 2: Operator -> Widget
    console.log('\n[TEST 2] Operator sends message, widget should receive...');
    const operatorMessageText = `operator-to-widget-${timestamp}`;
    const operatorClientMessageId = `op-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

    let widgetReceived = false;
    const widgetPromise = new Promise((resolve, reject) => {
      widgetSocket.on('message:new', (data) => {
        if (data.conversationId === conversationId && data.text === operatorMessageText) {
          console.log(`✓ Widget received message:new: ${data.text}`);
          widgetReceived = true;
          resolve(true);
        }
      });
      setTimeout(() => {
        if (!widgetReceived) {
          reject(new Error('Widget did not receive message:new within 2s'));
        }
      }, 2000);
    });

    operatorSocket.emit('message:send', {
      conversationId,
      text: operatorMessageText,
      clientMessageId: operatorClientMessageId,
    });

    await widgetPromise;
    console.log('✓ TEST 2 PASSED: Operator -> Widget realtime delivery');

    // Cleanup
    widgetSocket.disconnect();
    operatorSocket.disconnect();

    console.log('\n=== SUCCESS: All realtime tests passed ===');
    process.exit(0);

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

runE2ETest();
