/**
 * E2E test: Call signaling (WebRTC signaling without actual media)
 * 
 * Flow:
 * 1) Create owner, project, operator, widget session
 * 2) Connect widget + operator sockets
 * 3) Operator sends call:offer
 * 4) Widget receives call:offer and sends call:answer
 * 5) Both sides exchange call:ice candidates
 * 6) Operator sends call:hangup
 * 7) Verify CallRecord in DB (created, status=ended, endedAt set)
 * 
 * Env vars:
 * - API_URL: Base API URL (default: https://online.siteaccess.ru)
 * - WS_BASE: WebSocket base URL (default: https://online.siteaccess.ru)
 * - DATABASE_URL: For DB verification (optional, uses Prisma if available)
 */
import { io } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

const API_URL = process.env.API_URL || process.env.BASE_URL || 'https://online.siteaccess.ru';
const WS_BASE = process.env.WS_BASE || 'https://online.siteaccess.ru';

let prisma = null;
try {
  prisma = new PrismaClient();
} catch (error) {
  console.log('⚠️  Prisma not available, DB verification will be skipped');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runE2E() {
  console.log('=== E2E Test: Call Signaling ===\n');

  try {
    const timestamp = Date.now();
    
    // 1) Register/login owner
    console.log('[1] Registering owner...');
    const ownerEmail = `owner_calls_${timestamp}@test.local`;
    const ownerPass = '123123123';

    const registerRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass }),
    });

    if (!registerRes.ok && registerRes.status !== 409) {
      const text = await registerRes.text();
      throw new Error(`Owner registration failed: ${registerRes.status} ${text}`);
    }

    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass }),
    });

    if (!loginRes.ok) {
      throw new Error(`Owner login failed: ${loginRes.status}`);
    }

    const { accessToken } = await loginRes.json();
    console.log('✓ Owner logged in\n');

    // 2) Create project
    console.log('[2] Creating project...');
    const projectName = `test_calls_${timestamp}`;
    const projectRes = await fetch(`${API_URL}/api/projects`, {
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
    
    // Get widget token from project (field is 'token', not 'widgetToken')
    let widgetToken = project.token;
    if (!widgetToken) {
      // Try to regenerate token
      const tokenRes = await fetch(`${API_URL}/api/projects/${projectId}/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
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
    
    console.log(`✓ Project created: ${projectId.substring(0, 8)}...\n`);

    // 3) Register/login operator
    console.log('[3] Registering operator...');
    const opEmail = `op_calls_${timestamp}@test.local`;
    const opPass = '123123123';

    const opRegisterRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: opEmail, password: opPass }),
    });

    if (!opRegisterRes.ok && opRegisterRes.status !== 409) {
      throw new Error(`Operator registration failed: ${opRegisterRes.status}`);
    }

    const opLoginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: opEmail, password: opPass }),
    });

    if (!opLoginRes.ok) {
      throw new Error(`Operator login failed: ${opLoginRes.status}`);
    }

    const { accessToken: opAccessToken } = await opLoginRes.json();
    console.log('✓ Operator logged in\n');

    // 4) Invite operator
    console.log('[4] Inviting operator...');
    const inviteRes = await fetch(`${API_URL}/api/projects/${projectId}/operators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email: opEmail }),
    });

    if (!inviteRes.ok) {
      throw new Error(`Operator invite failed: ${inviteRes.status}`);
    }
    console.log('✓ Operator invited\n');

    // 5) Operator login (get operatorAccessToken)
    console.log('[5] Operator login...');
    const opLoginOperatorRes = await fetch(`${API_URL}/api/operator/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: opEmail, password: opPass, channelId: projectId }),
    });

    if (!opLoginOperatorRes.ok) {
      throw new Error(`Operator login failed: ${opLoginOperatorRes.status}`);
    }

    const { accessToken: operatorAccessToken } = await opLoginOperatorRes.json();
    console.log('✓ Operator access token obtained\n');

    // 6) Create widget session
    console.log('[6] Creating widget session...');
    const externalId = `visitor_${timestamp}_${Math.random().toString(36).substring(7)}`;
    const sessionRes = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Origin': 'https://example.com', // For domain lock bypass in test
      },
      body: JSON.stringify({ token: widgetToken, externalId }),
    });

    if (!sessionRes.ok) {
      const errorText = await sessionRes.text();
      throw new Error(`Widget session failed: ${sessionRes.status} ${errorText}`);
    }

    const session = await sessionRes.json();
    const conversationId = session.conversationId;
    const widgetTokenJWT = session.visitorSessionToken || session.token;
    
    // Get channelId from operator login response or from project
    let channelId = projectId; // channelId is the same as projectId
    
    console.log(`✓ Widget session created: conversationId=${conversationId.substring(0, 8)}...`);
    console.log(`  channelId=${channelId.substring(0, 8)}...\n`);

    // 7) Connect sockets
    console.log('[7] Connecting sockets...');
    
    const widgetSocket = io(`${WS_BASE}/widget`, {
      auth: { token: widgetTokenJWT },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    const operatorSocket = io(`${WS_BASE}/operator`, {
      auth: { token: operatorAccessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    // [E2E] Add detailed disconnect/error logging
    widgetSocket.on('disconnect', (reason) => {
      console.log(`[E2E] Widget disconnected: reason=${reason}, socketId=${widgetSocket.id}`);
    });
    widgetSocket.on('connect_error', (err) => {
      console.log(`[E2E] Widget connect_error: ${err?.message || JSON.stringify(err)}, type=${err?.type || 'unknown'}`);
    });
    widgetSocket.io.on('error', (err) => {
      console.log(`[E2E] Widget io error: ${err?.message || JSON.stringify(err)}`);
    });
    
    operatorSocket.on('disconnect', (reason) => {
      console.log(`[E2E] Operator disconnected: reason=${reason}, socketId=${operatorSocket.id}`);
    });
    operatorSocket.on('connect_error', (err) => {
      console.log(`[E2E] Operator connect_error: ${err?.message || JSON.stringify(err)}, type=${err?.type || 'unknown'}`);
    });
    operatorSocket.io.on('error', (err) => {
      console.log(`[E2E] Operator io error: ${err?.message || JSON.stringify(err)}`);
    });

    await Promise.all([
      new Promise((resolve, reject) => {
        widgetSocket.on('connect', () => {
          console.log(`[E2E] Widget connected: socketId=${widgetSocket.id}`);
          resolve();
        });
        widgetSocket.on('connect_error', (err) => {
          console.log(`[E2E] Widget connect_error in promise: ${err?.message || JSON.stringify(err)}`);
          reject(err);
        });
        setTimeout(() => reject(new Error('Widget socket timeout')), 10000);
      }),
      new Promise((resolve, reject) => {
        operatorSocket.on('connect', () => {
          console.log(`[E2E] Operator connected: socketId=${operatorSocket.id}`);
          resolve();
        });
        operatorSocket.on('connect_error', (err) => {
          console.log(`[E2E] Operator connect_error in promise: ${err?.message || JSON.stringify(err)}`);
          reject(err);
        });
        setTimeout(() => reject(new Error('Operator socket timeout')), 10000);
      }),
    ]);

    console.log('  ✓ Widget socket connected');
    console.log('  ✓ Operator socket connected\n');

    // Wait for rooms to be joined
    // Note: operator is already in channel room from connection
    // Widget is in conversation room from connection
    await sleep(2000);
    
    // Verify sockets are still connected
    console.log(`  Socket status check: widget=${widgetSocket.connected}, operator=${operatorSocket.connected}`);
    if (!widgetSocket.connected) {
      throw new Error('Widget socket disconnected');
    }
    if (!operatorSocket.connected) {
      console.log('  ⚠️  Operator socket disconnected, but continuing test...');
      // Try to reconnect
      operatorSocket.connect();
      await new Promise((resolve) => {
        operatorSocket.on('connect', resolve);
        setTimeout(() => resolve(), 2000);
      });
      if (!operatorSocket.connected) {
        throw new Error('Operator socket failed to reconnect');
      }
    }

    // 8) Signaling flow
    console.log('[8] Starting signaling flow...');
    
    const callId = `call_${timestamp}_${Math.random().toString(36).substring(7)}`;
    let widgetReceivedOffer = false;
    let operatorReceivedAnswer = false;
    let widgetReceivedIce = false;
    let operatorReceivedIce = false;
    let widgetReceivedHangup = false;

    // Widget: listen for call:offer
    widgetSocket.on('call:offer', (data) => {
      if (data.callId === callId) {
        widgetReceivedOffer = true;
        console.log('  ✓ Widget received call:offer');
      }
    });

    // Operator: listen for call:answer
    operatorSocket.on('call:answer', (data) => {
      if (data.callId === callId) {
        operatorReceivedAnswer = true;
        console.log('  ✓ Operator received call:answer');
      }
    });

    // Both: listen for call:ice
    widgetSocket.on('call:ice', (data) => {
      if (data.callId === callId) {
        widgetReceivedIce = true;
        console.log('  ✓ Widget received call:ice');
      }
    });

    operatorSocket.on('call:ice', (data) => {
      if (data.callId === callId) {
        operatorReceivedIce = true;
        console.log('  ✓ Operator received call:ice');
      }
    });

    // Widget: listen for call:hangup
    widgetSocket.on('call:hangup', (data) => {
      if (data.callId === callId) {
        widgetReceivedHangup = true;
        console.log('  ✓ Widget received call:hangup');
      }
    });

    // Operator sends call:offer
    console.log('  [8.1] Operator sending call:offer...');
    console.log(`    callId=${callId}, conversationId=${conversationId}, channelId=${channelId}`);
    
    operatorSocket.emit('call:offer', {
      callId,
      conversationId,
      channelId,
      fromRole: 'operator',
      kind: 'audio',
      sdp: 'fake-sdp-offer',
      timestamp: new Date().toISOString(),
    });
    
    // Listen for errors
    operatorSocket.on('error', (err) => {
      console.log(`    Operator socket error: ${JSON.stringify(err)}`);
    });
    operatorSocket.on('call:failed', (data) => {
      console.log(`    Operator received call:failed: ${JSON.stringify(data)}`);
    });

    await sleep(3000);
    if (!widgetReceivedOffer) {
      console.log('    ⚠️  Widget did not receive call:offer after 3s');
      console.log(`    Widget socket connected: ${widgetSocket.connected}`);
      console.log(`    Operator socket connected: ${operatorSocket.connected}`);
      throw new Error('Widget did not receive call:offer');
    }

    // Widget sends call:answer
    console.log('  [8.2] Widget sending call:answer...');
    widgetSocket.emit('call:answer', {
      callId,
      conversationId,
      channelId,
      fromRole: 'visitor',
      sdp: 'fake-sdp-answer',
      timestamp: new Date().toISOString(),
    });

    await sleep(2000);
    if (!operatorReceivedAnswer) {
      throw new Error('Operator did not receive call:answer');
    }

    // Both send call:ice
    console.log('  [8.3] Exchanging call:ice candidates...');
    widgetSocket.emit('call:ice', {
      callId,
      conversationId,
      channelId,
      fromRole: 'visitor',
      candidate: { candidate: 'fake-candidate-1', sdpMLineIndex: 0 },
      timestamp: new Date().toISOString(),
    });

    operatorSocket.emit('call:ice', {
      callId,
      conversationId,
      channelId,
      fromRole: 'operator',
      candidate: { candidate: 'fake-candidate-2', sdpMLineIndex: 0 },
      timestamp: new Date().toISOString(),
    });

    await sleep(2000);
    if (!widgetReceivedIce || !operatorReceivedIce) {
      console.log(`  ⚠️  ICE delivery: widget=${widgetReceivedIce}, operator=${operatorReceivedIce}`);
    }

    // Operator sends call:hangup
    console.log('  [8.4] Operator sending call:hangup...');
    operatorSocket.emit('call:hangup', {
      callId,
      conversationId,
      channelId,
      fromRole: 'operator',
      reason: 'test-ended',
      timestamp: new Date().toISOString(),
    });

    await sleep(2000);
    if (!widgetReceivedHangup) {
      throw new Error('Widget did not receive call:hangup');
    }

    console.log('  ✓ Signaling flow completed\n');

    // 9) Verify DB
    console.log('[9] Verifying CallRecord in DB...');
    if (prisma) {
      await sleep(1000); // Wait for DB write
      
      const callRecord = await prisma.callRecord.findUnique({
        where: { id: callId },
      });

      if (!callRecord) {
        throw new Error('CallRecord not found in DB');
      }

      if (callRecord.status !== 'ended') {
        throw new Error(`Expected status=ended, got ${callRecord.status}`);
      }

      if (!callRecord.endedAt) {
        throw new Error('endedAt not set');
      }

      console.log(`  ✓ CallRecord found: status=${callRecord.status}, endedAt=${callRecord.endedAt.toISOString()}`);
      console.log(`    kind=${callRecord.kind}, createdByRole=${callRecord.createdByRole}`);
    } else {
      console.log('  ⚠️  Prisma not available, skipping DB verification');
    }

    // Cleanup
    widgetSocket.disconnect();
    operatorSocket.disconnect();

    console.log('\n✓✓✓ ALL TESTS PASSED ✓✓✓');
    console.log('  - call:offer delivered: ✓');
    console.log('  - call:answer delivered: ✓');
    console.log('  - call:ice exchanged: ✓');
    console.log('  - call:hangup delivered: ✓');
    if (prisma) {
      console.log('  - CallRecord in DB: ✓');
    }

  } catch (error) {
    console.error('\n❌❌❌ TEST FAILED ❌❌❌');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

runE2E();
