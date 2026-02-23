/**
 * Smoke test: WebSocket connection with authentication
 * 
 * Tests that operator and widget sockets can connect via Nginx with valid tokens.
 * 
 * Env vars:
 * - BASE_URL: Base URL (default: https://online.siteaccess.ru)
 */
import { io } from 'socket.io-client';

const BASE_URL = process.env.BASE_URL || 'https://online.siteaccess.ru';

async function runSmoke() {
  console.log('=== Smoke Test: WebSocket Connection (with Auth) ===\n');
  console.log(`BASE_URL: ${BASE_URL}\n`);

  try {
    const timestamp = Date.now();
    
    // 1) Register/login owner
    console.log('[1] Registering owner...');
    const ownerEmail = `owner_ws_${timestamp}@test.local`;
    const ownerPass = '123123123';

    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass }),
    });

    if (!registerRes.ok && registerRes.status !== 409) {
      const text = await registerRes.text();
      throw new Error(`Owner registration failed: ${registerRes.status} ${text}`);
    }

    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass }),
    });

    if (!loginRes.ok) {
      throw new Error(`Owner login failed: ${loginRes.status}`);
    }

    const { accessToken } = await loginRes.json();
    console.log('✓ Owner logged in');

    // 2) Create project
    console.log('[2] Creating project...');
    const projectName = `test_ws_${timestamp}`;
    const projectRes = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name: projectName }),
    });

    if (!projectRes.ok) {
      throw new Error(`Project creation failed: ${projectRes.status}`);
    }

    const project = await projectRes.json();
    const projectId = project.id;
    
    // Get widget token
    let widgetToken = project.token;
    if (!widgetToken) {
      const tokenRes = await fetch(`${BASE_URL}/api/projects/${projectId}/token`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        widgetToken = tokenData.token;
      }
    }
    
    if (!widgetToken) {
      throw new Error('Widget token not found');
    }
    
    console.log(`✓ Project created: ${projectId.substring(0, 8)}...`);

    // 3) Register/login operator
    console.log('[3] Registering operator...');
    const opEmail = `op_ws_${timestamp}@test.local`;
    const opPass = '123123123';

    const opRegisterRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: opEmail, password: opPass }),
    });

    if (!opRegisterRes.ok && opRegisterRes.status !== 409) {
      throw new Error(`Operator registration failed: ${opRegisterRes.status}`);
    }

    const opLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: opEmail, password: opPass }),
    });

    if (!opLoginRes.ok) {
      throw new Error(`Operator login failed: ${opLoginRes.status}`);
    }

    const { accessToken: opAccessToken } = await opLoginRes.json();
    console.log('✓ Operator logged in');

    // 4) Invite operator
    console.log('[4] Inviting operator...');
    const inviteRes = await fetch(`${BASE_URL}/api/projects/${projectId}/operators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email: opEmail }),
    });

    if (!inviteRes.ok && inviteRes.status !== 409) {
      throw new Error(`Operator invite failed: ${inviteRes.status}`);
    }
    console.log('✓ Operator invited');

    // 5) Operator login (get operator access token)
    console.log('[5] Operator login...');
    const opAuthRes = await fetch(`${BASE_URL}/api/operator/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: opEmail,
        password: opPass,
        channelId: projectId,
      }),
    });

    if (!opAuthRes.ok) {
      throw new Error(`Operator auth failed: ${opAuthRes.status}`);
    }

    const { accessToken: operatorAccessToken } = await opAuthRes.json();
    console.log('✓ Operator access token obtained');

    // 6) Create widget session
    console.log('[6] Creating widget session...');
    const sessionRes = await fetch(`${BASE_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://example.com',
      },
      body: JSON.stringify({
        token: widgetToken,
        externalId: `test_${timestamp}`,
      }),
    });

    if (!sessionRes.ok) {
      throw new Error(`Widget session failed: ${sessionRes.status}`);
    }

    const sessionData = await sessionRes.json();
    const visitorSessionToken = sessionData.visitorSessionToken;
    const conversationId = sessionData.conversationId;
    console.log(`✓ Widget session created: conversationId=${conversationId.substring(0, 8)}...`);

    // 7) Test operator socket connection
    console.log('\n[7] Testing operator socket connection...');
    const operatorSocket = io(`${BASE_URL}/operator`, {
      path: '/socket.io',
      auth: { token: operatorAccessToken },
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
    });

    let operatorConnected = false;
    let operatorError = null;

    await new Promise((resolve) => {
      operatorSocket.on('connect', () => {
        console.log('  ✓ Operator socket CONNECTED');
        operatorConnected = true;
        resolve();
      });

      operatorSocket.on('connect_error', (err) => {
        console.log(`  ✗ Operator connect_error: ${err.message || JSON.stringify(err)}`);
        operatorError = err;
        resolve();
      });

      setTimeout(() => {
        if (!operatorConnected && !operatorError) {
          console.log('  ✗ Operator socket timeout (no connect or error)');
          resolve();
        }
      }, 10000);
    });

    if (operatorConnected) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      operatorSocket.disconnect();
      console.log('  ✓ Operator socket disconnected\n');
    }

    // 8) Test widget socket connection
    console.log('[8] Testing widget socket connection...');
    const widgetSocket = io(`${BASE_URL}/widget`, {
      path: '/socket.io',
      auth: { token: visitorSessionToken },
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
    });

    let widgetConnected = false;
    let widgetError = null;

    await new Promise((resolve) => {
      widgetSocket.on('connect', () => {
        console.log('  ✓ Widget socket CONNECTED');
        widgetConnected = true;
        resolve();
      });

      widgetSocket.on('connect_error', (err) => {
        console.log(`  ✗ Widget connect_error: ${err.message || JSON.stringify(err)}`);
        widgetError = err;
        resolve();
      });

      setTimeout(() => {
        if (!widgetConnected && !widgetError) {
          console.log('  ✗ Widget socket timeout (no connect or error)');
          resolve();
        }
      }, 10000);
    });

    if (widgetConnected) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      widgetSocket.disconnect();
      console.log('  ✓ Widget socket disconnected\n');
    }

    // Success criteria: both sockets must connect
    if (operatorConnected && widgetConnected) {
      console.log('✓✓✓ SMOKE TEST PASSED ✓✓✓');
      console.log('  Both operator and widget sockets connected successfully');
      console.log('  WebSocket upgrade through Nginx is working');
      process.exit(0);
    } else {
      console.log('✗✗✗ SMOKE TEST FAILED ✗✗✗');
      if (!operatorConnected) {
        console.log(`  Operator socket failed: ${operatorError ? operatorError.message : 'timeout'}`);
      }
      if (!widgetConnected) {
        console.log(`  Widget socket failed: ${widgetError ? widgetError.message : 'timeout'}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('✗✗✗ SMOKE TEST FAILED ✗✗✗');
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

runSmoke();
