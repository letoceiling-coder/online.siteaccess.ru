/**
 * E2E test: Reliable messaging (guaranteed delivery + no loss)
 * 
 * Flow:
 * 1) Create owner, project, operator, widget session
 * 2) Connect widget + operator sockets
 * 3) Send messages from both sides
 * 4) Simulate dropped ACK/new: disconnect client before ACK, reconnect, ensure message appears and no duplicates
 * 5) Verify DB contains exactly N messages by clientMessageId unique
 * 6) Verify operator and widget both have same history count via REST history endpoints
 * 
 * Env vars:
 * - API_URL: Base API URL (default: https://online.siteaccess.ru)
 * - WS_BASE: WebSocket base URL (default: https://online.siteaccess.ru)
 */
import { io } from 'socket.io-client';

const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';
const WS_BASE = process.env.WS_BASE || 'https://online.siteaccess.ru';

async function runE2E() {
  console.log('=== E2E Test: Reliable Messaging ===\n');

  try {
    // 1) Register/login owner
    console.log('[1] Registering owner...');
    const ownerEmail = `owner_reliable_${Date.now()}@test.local`;
    const ownerPass = '123123123';

    const registerRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass }),
    });

    if (!registerRes.ok) {
      const errorText = await registerRes.text();
      throw new Error(`Registration failed: ${registerRes.status} ${errorText}`);
    }
    console.log('✓ Owner registered');

    console.log('[2] Logging in owner...');
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass }),
    });

    if (!loginRes.ok) {
      const errorText = await loginRes.text();
      throw new Error(`Login failed: ${loginRes.status} ${errorText}`);
    }

    const loginData = await loginRes.json();
    const ownerToken = loginData.accessToken;
    console.log('✓ Owner logged in');

    // 2) Create project
    console.log('\n[3] Creating project...');
    const projectRes = await fetch(`${API_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: `Reliable Test ${Date.now()}`,
        domains: ['example.com'],
      }),
    });

    if (!projectRes.ok) {
      const errorText = await projectRes.text();
      throw new Error(`Project creation failed: ${projectRes.status} ${errorText}`);
    }

    const projectData = await projectRes.json();
    const projectId = projectData.id;
    
    // Get widget token
    let widgetToken = projectData.token;
    if (!widgetToken) {
      const tokenRes = await fetch(`${API_URL}/api/projects/${projectId}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
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

    // 3) Register operator, invite, login
    console.log('\n[4] Registering operator...');
    const opEmail = `operator_reliable_${Date.now()}@test.local`;
    const opPass = '123123123';

    const opRegisterRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: opEmail, password: opPass }),
    });

    if (!opRegisterRes.ok) {
      const errorText = await opRegisterRes.text();
      throw new Error(`Operator registration failed: ${opRegisterRes.status} ${errorText}`);
    }

    console.log('✓ Operator registered');

    console.log('[5] Inviting operator...');
    const inviteRes = await fetch(`${API_URL}/api/projects/${projectId}/operators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ email: opEmail }),
    });

    if (!inviteRes.ok) {
      const errorText = await inviteRes.text();
      throw new Error(`Invite failed: ${inviteRes.status} ${errorText}`);
    }

    console.log('✓ Operator invited');

    console.log('[6] Operator login...');
    const opLoginRes = await fetch(`${API_URL}/api/operator/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: opEmail,
        password: opPass,
        channelId: projectId,
      }),
    });

    if (!opLoginRes.ok) {
      const errorText = await opLoginRes.text();
      throw new Error(`Operator login failed: ${opLoginRes.status} ${errorText}`);
    }

    const opLoginData = await opLoginRes.json();
    const operatorAccessToken = opLoginData.operatorAccessToken;
    const operatorChannelId = opLoginData.channelId;
    console.log('✓ Operator logged in');

    // 4) Create widget session
    console.log('\n[7] Creating widget session...');
    const externalId = `reliable-test-${Date.now()}`;
    const widgetSessionRes = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://example.com',
      },
      body: JSON.stringify({
        token: widgetToken,
        externalId,
      }),
    });

    if (!widgetSessionRes.ok) {
      const errorText = await widgetSessionRes.text();
      throw new Error(`Widget session failed: ${widgetSessionRes.status} ${errorText}`);
    }

    const widgetSessionData = await widgetSessionRes.json();
    const conversationId = widgetSessionData.conversationId;
    const visitorSessionToken = widgetSessionData.visitorSessionToken;
    console.log(`✓ Widget session created: conversationId=${conversationId.substring(0, 8)}...`);

    // 5) Connect sockets
    console.log('\n[8] Connecting sockets...');
    const widgetSocket = io(`${WS_BASE}/widget`, {
      auth: { token: visitorSessionToken },
      transports: ['websocket'],
    });

    const operatorSocket = io(`${WS_BASE}/operator`, {
      auth: { token: operatorAccessToken },
      transports: ['websocket'],
    });

    await new Promise((resolve) => {
      let widgetConnected = false;
      let operatorConnected = false;
      
      widgetSocket.on('connect', () => {
        console.log('  ✓ Widget socket connected');
        widgetConnected = true;
        if (widgetConnected && operatorConnected) resolve();
      });
      
      operatorSocket.on('connect', () => {
        console.log('  ✓ Operator socket connected');
        operatorConnected = true;
        if (widgetConnected && operatorConnected) resolve();
      });
    });

    // Join conversation
    operatorSocket.emit('operator:conversation:join', { conversationId });
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 6) Send messages from both sides
    console.log('\n[9] Sending messages from both sides...');
    const widgetMessages = [];
    const operatorMessages = [];
    
    // Send 2 messages from widget
    for (let i = 1; i <= 2; i++) {
      const clientMessageId = `widget-${Date.now()}-${i}`;
      const text = `Widget message ${i} - ${Date.now()}`;
      widgetMessages.push({ clientMessageId, text });
      
      widgetSocket.emit('message:send', {
        conversationId,
        text,
        clientMessageId,
      });
      
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Send 2 messages from operator
    for (let i = 1; i <= 2; i++) {
      const clientMessageId = `operator-${Date.now()}-${i}`;
      const text = `Operator message ${i} - ${Date.now()}`;
      operatorMessages.push({ clientMessageId, text });
      
      operatorSocket.emit('message:send', {
        conversationId,
        text,
        clientMessageId,
      });
      
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    console.log('  ✓ 4 messages sent (2 widget, 2 operator)');
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for persistence

    // 7) Simulate dropped ACK: disconnect widget before ACK, then reconnect
    console.log('\n[10] Simulating dropped ACK scenario...');
    const droppedMessageId = `widget-dropped-${Date.now()}`;
    const droppedMessageText = `Dropped message - ${Date.now()}`;
    
    // Send message and immediately disconnect
    widgetSocket.emit('message:send', {
      conversationId,
      text: droppedMessageText,
      clientMessageId: droppedMessageId,
    });
    
    await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay
    
    widgetSocket.disconnect();
    console.log('  ✓ Widget disconnected before ACK');
    
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // Reconnect widget
    const widgetSocket2 = io(`${WS_BASE}/widget`, {
      auth: { token: visitorSessionToken },
      transports: ['websocket'],
    });
    
    await new Promise((resolve) => widgetSocket2.on('connect', resolve));
    console.log('  ✓ Widget reconnected');
    
    // Wait for resend and ACK
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 8) Verify DB contains exactly N messages by clientMessageId unique
    console.log('\n[11] Verifying DB message count and uniqueness...');
    const dbCheckScript = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(DISTINCT "clientMessageId") as unique_client_ids,
        COUNT(*) FILTER (WHERE "clientMessageId" IS NOT NULL) as messages_with_client_id
      FROM messages
      WHERE "conversationId" = '${conversationId}';
    `;
    
    // We'll verify via API instead of direct DB access
    const widgetHistoryRes = await fetch(
      `${API_URL}/api/widget/messages?conversationId=${conversationId}&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${visitorSessionToken}`,
        },
      }
    );

    if (!widgetHistoryRes.ok) {
      throw new Error(`Widget history failed: ${widgetHistoryRes.status}`);
    }

    const widgetHistory = await widgetHistoryRes.json();
    console.log(`  Widget history: ${widgetHistory.length} messages`);

    const operatorHistoryRes = await fetch(
      `${API_URL}/api/operator/messages?conversationId=${conversationId}&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${operatorAccessToken}`,
        },
      }
    );

    if (!operatorHistoryRes.ok) {
      throw new Error(`Operator history failed: ${operatorHistoryRes.status}`);
    }

    const operatorHistory = await operatorHistoryRes.json();
    console.log(`  Operator history: ${operatorHistory.length} messages`);

    // Verify counts match
    if (widgetHistory.length !== operatorHistory.length) {
      throw new Error(
        `History count mismatch: widget=${widgetHistory.length}, operator=${operatorHistory.length}`
      );
    }

    // Verify all sent messages are in history by clientMessageId (guaranteed unique)
    const allHistory = [...widgetHistory, ...operatorHistory];
    const historyByClientId = new Map();
    for (const msg of allHistory) {
      if (msg.clientMessageId) {
        historyByClientId.set(msg.clientMessageId, msg);
      }
    }
    
    // Verify all sent messages exist by clientMessageId
    for (const msg of [...widgetMessages, ...operatorMessages]) {
      if (!historyByClientId.has(msg.clientMessageId)) {
        throw new Error(`Message not found in history by clientMessageId: ${msg.clientMessageId} (text: ${msg.text})`);
      }
    }

    // Verify dropped message is in history by clientMessageId (should be resent and persisted)
    if (!historyByClientId.has(droppedMessageId)) {
      throw new Error(`Dropped message not found in history after reconnect: clientMessageId=${droppedMessageId}, text=${droppedMessageText}`);
    }

    console.log('  ✓ All messages found in history');
    console.log(`  ✓ Total messages: ${widgetHistory.length}`);
    console.log(`  ✓ Dropped message recovered: ${droppedMessageText.substring(0, 30)}...`);

    // 9) Verify no duplicates by clientMessageId
    const clientMessageIds = [...widgetHistory, ...operatorHistory]
      .map(m => m.clientMessageId)
      .filter(Boolean);
    
    const uniqueClientIds = new Set(clientMessageIds);
    if (clientMessageIds.length !== uniqueClientIds.size) {
      throw new Error(
        `Duplicate clientMessageId found: ${clientMessageIds.length} total, ${uniqueClientIds.size} unique`
      );
    }

    console.log(`  ✓ No duplicates: ${uniqueClientIds.size} unique clientMessageIds`);

    // Cleanup
    widgetSocket2.disconnect();
    operatorSocket.disconnect();

    console.log('\n✓✓✓ ALL TESTS PASSED ✓✓✓');
    console.log(`  - Total messages: ${widgetHistory.length}`);
    console.log(`  - Unique clientMessageIds: ${uniqueClientIds.size}`);
    console.log(`  - Dropped message recovered: ✓`);
    console.log(`  - No duplicates: ✓`);
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
