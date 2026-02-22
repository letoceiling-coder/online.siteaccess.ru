/**
 * E2E test: History parity between widget and operator
 * 
 * Flow:
 * 1) Register/login owner
 * 2) Create project -> get token + projectId
 * 3) Register operator, invite operator, operator login -> operatorAccessToken
 * 4) Create widget session with FIXED externalId
 * 5) Send 3 messages visitor->operator via widget WS
 * 6) Send 2 messages operator->visitor via operator WS
 * 7) Fetch widget history GET /api/widget/messages?conversationId=...
 * 8) Fetch operator history GET /api/operator/messages?conversationId=...
 * 9) Assert counts equal and texts match in order
 * 10) Simulate "refresh": call /api/widget/session again with same externalId
 *     and assert SAME conversationId, then fetch history again and assert it still contains all messages
 * 
 * Env vars:
 * - API_URL: Base API URL (default: https://online.siteaccess.ru)
 * - WS_BASE: WebSocket base URL (default: https://online.siteaccess.ru)
 */
import { io } from 'socket.io-client';

const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';
const WS_BASE = process.env.WS_BASE || 'https://online.siteaccess.ru';

const FIXED_EXTERNAL_ID = `e2e-stable-visitor-${Date.now()}`;

async function runE2E() {
  console.log('=== E2E Test: History Parity ===\n');

  try {
    // 1) Register/login owner
    console.log('[1] Registering owner...');
    const ownerEmail = `owner_e2e_${Date.now()}@test.local`;
    const ownerPass = '123123123';

    const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ownerEmail,
        password: ownerPass,
      }),
    });

    if (!registerResponse.ok) {
      const errorText = await registerResponse.text();
      throw new Error(`Registration failed: ${registerResponse.status} ${errorText}`);
    }

    console.log('✓ Owner registered');

    console.log('[2] Logging in owner...');
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ownerEmail,
        password: ownerPass,
      }),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      throw new Error(`Login failed: ${loginResponse.status} ${errorText}`);
    }

    const loginData = await loginResponse.json();
    const ownerToken = loginData.accessToken;
    console.log('✓ Owner logged in');

    // 2) Create project
    console.log('\n[3] Creating project...');
    const projectResponse = await fetch(`${API_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: `E2E Project ${Date.now()}`,
        domains: ['example.com'],
      }),
    });

    if (!projectResponse.ok) {
      const errorText = await projectResponse.text();
      throw new Error(`Project creation failed: ${projectResponse.status} ${errorText}`);
    }

    const projectData = await projectResponse.json();
    const projectId = projectData.id;
    
    // Get widget token (may need to call /token endpoint)
    let widgetToken = projectData.widgetSettings?.token;
    
    if (!widgetToken) {
      // Try to get token from /token endpoint
      console.log('  Widget token not in response, fetching from /token endpoint...');
      const tokenResponse = await fetch(`${API_URL}/api/projects/${projectId}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        widgetToken = tokenData.token;
      }
    }
    
    if (!widgetToken) {
      throw new Error('Widget token not found in project response or /token endpoint');
    }

    console.log(`✓ Project created: ${projectId.substring(0, 8)}...`);
    console.log(`  Widget token: ${widgetToken.substring(0, 8)}...`);

    // 3) Register operator, invite, login
    console.log('\n[4] Registering operator...');
    const opEmail = `operator_e2e_${Date.now()}@test.local`;
    const opPass = '123123123';

    const opRegisterResponse = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: opEmail,
        password: opPass,
      }),
    });

    if (!opRegisterResponse.ok) {
      const errorText = await opRegisterResponse.text();
      throw new Error(`Operator registration failed: ${opRegisterResponse.status} ${errorText}`);
    }

    console.log('✓ Operator registered');

    console.log('[5] Inviting operator to project...');
    const inviteResponse = await fetch(`${API_URL}/api/projects/${projectId}/operators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        email: opEmail,
      }),
    });

    if (!inviteResponse.ok) {
      const errorText = await inviteResponse.text();
      throw new Error(`Invite failed: ${inviteResponse.status} ${errorText}`);
    }

    console.log('✓ Operator invited');

    console.log('[6] Operator login...');
    const opLoginResponse = await fetch(`${API_URL}/api/operator/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: opEmail,
        password: opPass,
        channelId: projectId,
      }),
    });

    if (!opLoginResponse.ok) {
      const errorText = await opLoginResponse.text();
      throw new Error(`Operator login failed: ${opLoginResponse.status} ${errorText}`);
    }

    const opLoginData = await opLoginResponse.json();
    const operatorAccessToken = opLoginData.operatorAccessToken;
    const operatorChannelId = opLoginData.channelId;
    console.log('✓ Operator logged in');

    // 4) Create widget session with FIXED externalId
    console.log('\n[7] Creating widget session with fixed externalId...');
    const widgetSessionResponse = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://example.com',
      },
      body: JSON.stringify({
        token: widgetToken,
        externalId: FIXED_EXTERNAL_ID,
      }),
    });

    if (!widgetSessionResponse.ok) {
      const errorText = await widgetSessionResponse.text();
      throw new Error(`Widget session failed: ${widgetSessionResponse.status} ${errorText}`);
    }

    const widgetSessionData = await widgetSessionResponse.json();
    const conversationId = widgetSessionData.conversationId;
    const visitorSessionToken = widgetSessionData.visitorSessionToken;
    console.log(`✓ Widget session created: conversationId=${conversationId.substring(0, 8)}...`);

    // 5) Send 3 messages visitor->operator via widget WS
    console.log('\n[8] Sending 3 messages from widget...');
    const widgetSocket = io(`${WS_BASE}/widget`, {
      auth: { token: visitorSessionToken },
      transports: ['websocket'],
    });

    await new Promise((resolve) => widgetSocket.on('connect', resolve));

    const widgetMessages = [];
    for (let i = 1; i <= 3; i++) {
      const text = `Widget message ${i} - ${Date.now()}`;
      widgetMessages.push(text);
      
      widgetSocket.emit('message:send', {
        conversationId,
        text,
        clientMessageId: `widget-${Date.now()}-${i}`,
      });
      
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log('✓ 3 widget messages sent');
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for persistence

    // 6) Send 2 messages operator->visitor via operator WS
    console.log('\n[9] Sending 2 messages from operator...');
    const operatorSocket = io(`${WS_BASE}/operator`, {
      auth: { token: operatorAccessToken },
      transports: ['websocket'],
    });

    await new Promise((resolve) => operatorSocket.on('connect', resolve));
    operatorSocket.emit('operator:conversation:join', { conversationId });

    const operatorMessages = [];
    for (let i = 1; i <= 2; i++) {
      const text = `Operator message ${i} - ${Date.now()}`;
      operatorMessages.push(text);
      
      operatorSocket.emit('message:send', {
        conversationId,
        text,
        clientMessageId: `operator-${Date.now()}-${i}`,
      });
      
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log('✓ 2 operator messages sent');
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for persistence

    // 7) Fetch widget history
    console.log('\n[10] Fetching widget history...');
    const widgetHistoryResponse = await fetch(
      `${API_URL}/api/widget/messages?conversationId=${conversationId}&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${visitorSessionToken}`,
        },
      }
    );

    if (!widgetHistoryResponse.ok) {
      const errorText = await widgetHistoryResponse.text();
      throw new Error(`Widget history failed: ${widgetHistoryResponse.status} ${errorText}`);
    }

    const widgetHistory = await widgetHistoryResponse.json();
    console.log(`✓ Widget history: ${widgetHistory.length} messages`);

    // 8) Fetch operator history
    console.log('\n[11] Fetching operator history...');
    const operatorHistoryResponse = await fetch(
      `${API_URL}/api/operator/messages?conversationId=${conversationId}&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${operatorAccessToken}`,
        },
      }
    );

    if (!operatorHistoryResponse.ok) {
      const errorText = await operatorHistoryResponse.text();
      throw new Error(`Operator history failed: ${operatorHistoryResponse.status} ${errorText}`);
    }

    const operatorHistory = await operatorHistoryResponse.json();
    console.log(`✓ Operator history: ${operatorHistory.length} messages`);

    // 9) Assert counts equal and texts match in order
    console.log('\n[12] Verifying history parity...');
    
    if (widgetHistory.length !== operatorHistory.length) {
      throw new Error(
        `Message count mismatch: widget=${widgetHistory.length}, operator=${operatorHistory.length}`
      );
    }

    // Extract texts in order (ignore senderType)
    const widgetTexts = widgetHistory.map(m => m.text).filter(Boolean);
    const operatorTexts = operatorHistory.map(m => m.text).filter(Boolean);

    if (widgetTexts.length !== operatorTexts.length) {
      throw new Error(
        `Text count mismatch: widget=${widgetTexts.length}, operator=${operatorTexts.length}`
      );
    }

    // Check that all widget messages are in operator history (and vice versa)
    const widgetTextSet = new Set(widgetTexts);
    const operatorTextSet = new Set(operatorTexts);

    for (const text of widgetTexts) {
      if (!operatorTextSet.has(text)) {
        throw new Error(`Widget message not found in operator history: ${text}`);
      }
    }

    for (const text of operatorTexts) {
      if (!widgetTextSet.has(text)) {
        throw new Error(`Operator message not found in widget history: ${text}`);
      }
    }

    console.log('✓ History parity verified');
    console.log(`  Total messages: ${widgetHistory.length}`);
    console.log(`  Widget texts: ${widgetTexts.length}`);
    console.log(`  Operator texts: ${operatorTexts.length}`);

    // 10) Simulate "refresh": call /api/widget/session again with same externalId
    console.log('\n[13] Simulating refresh (new session with same externalId)...');
    const refreshSessionResponse = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://example.com',
      },
      body: JSON.stringify({
        token: widgetToken,
        externalId: FIXED_EXTERNAL_ID,
      }),
    });

    if (!refreshSessionResponse.ok) {
      const errorText = await refreshSessionResponse.text();
      throw new Error(`Refresh session failed: ${refreshSessionResponse.status} ${errorText}`);
    }

    const refreshSessionData = await refreshSessionResponse.json();
    const refreshConversationId = refreshSessionData.conversationId;

    if (refreshConversationId !== conversationId) {
      throw new Error(
        `conversationId changed after refresh: ${conversationId.substring(0, 8)}... -> ${refreshConversationId.substring(0, 8)}...`
      );
    }

    console.log('✓ Same conversationId after refresh');

    // Fetch history again and assert it still contains all messages
    console.log('\n[14] Fetching history after refresh...');
    const refreshHistoryResponse = await fetch(
      `${API_URL}/api/widget/messages?conversationId=${refreshConversationId}&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${refreshSessionData.visitorSessionToken}`,
        },
      }
    );

    if (!refreshHistoryResponse.ok) {
      const errorText = await refreshHistoryResponse.text();
      throw new Error(`Refresh history failed: ${refreshHistoryResponse.status} ${errorText}`);
    }

    const refreshHistory = await refreshHistoryResponse.json();

    if (refreshHistory.length < widgetHistory.length) {
      throw new Error(
        `History lost after refresh: before=${widgetHistory.length}, after=${refreshHistory.length}`
      );
    }

    // Verify all original messages are still there
    const refreshTextSet = new Set(refreshHistory.map(m => m.text).filter(Boolean));
    for (const text of widgetTexts) {
      if (!refreshTextSet.has(text)) {
        throw new Error(`Message lost after refresh: ${text}`);
      }
    }

    console.log(`✓ History preserved after refresh: ${refreshHistory.length} messages`);

    // Cleanup
    widgetSocket.disconnect();
    operatorSocket.disconnect();

    console.log('\n✓✓✓ ALL TESTS PASSED ✓✓✓');
    process.exit(0);
  } catch (error) {
    console.error('\n✗✗✗ TEST FAILED ✗✗✗');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

runE2E();
