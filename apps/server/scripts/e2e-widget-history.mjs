/**
 * E2E test: Widget history loading + domain lock
 * Tests:
 * 1. Widget session from allowed domain works
 * 2. Widget session from forbidden domain returns 403
 * 3. Message history endpoint returns messages
 */
import { io } from 'socket.io-client';

const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';
const WS_BASE = process.env.WS_BASE || API_URL;

async function runE2E() {
  console.log('=== E2E Widget History Test ===\n');

  try {
    // 1. Register owner
    const ownerEmail = `owner_e2e_${Date.now()}@test.local`;
    const ownerPass = '123123123';
    
    console.log('[1] Registering owner...');
    const registerRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass }),
    });
    if (!registerRes.ok) {
      throw new Error(`Registration failed: ${registerRes.status}`);
    }
    console.log('✓ Owner registered');

    // 2. Login owner
    console.log('\n[2] Logging in owner...');
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass }),
    });
    if (!loginRes.ok) {
      throw new Error(`Login failed: ${loginRes.status}`);
    }
    const loginData = await loginRes.json();
    const ownerToken = loginData.accessToken;
    console.log('✓ Owner logged in');

    // 3. Create project with allowed domain
    const testDomain = 'example.com';
    console.log(`\n[3] Creating project with allowedDomain=${testDomain}...`);
    const createRes = await fetch(`${API_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: `E2E Widget Test ${Date.now()}`,
        domains: [testDomain],
      }),
    });
    if (!createRes.ok) {
      const errorText = await createRes.text();
      throw new Error(`Project creation failed: ${createRes.status} - ${errorText}`);
    }
    const projectData = await createRes.json();
    const projectId = projectData.id;
    const rawToken = projectData.token;
    console.log(`✓ Project created: ${projectId.substring(0, 8)}...`);

    // 4. Test widget session from ALLOWED domain
    console.log(`\n[4] Testing widget session from ALLOWED domain (${testDomain})...`);
    const sessionRes = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: `https://${testDomain}`,
      },
      body: JSON.stringify({
        token: rawToken,
        externalId: `test-visitor-${Date.now()}`,
      }),
    });
    if (!sessionRes.ok) {
      throw new Error(`Widget session failed: ${sessionRes.status} - ${await sessionRes.text()}`);
    }
    const sessionData = await sessionRes.json();
    const visitorSessionToken = sessionData.visitorSessionToken;
    const conversationId = sessionData.conversationId;
    console.log('✓ Widget session created from allowed domain');

    // 5. Test widget session from FORBIDDEN domain
    console.log(`\n[5] Testing widget session from FORBIDDEN domain (forbidden.com)...`);
    const forbiddenRes = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://forbidden.com',
      },
      body: JSON.stringify({
        token: rawToken,
        externalId: `test-visitor-${Date.now()}`,
      }),
    });
    if (forbiddenRes.status !== 403) {
      throw new Error(`Expected 403, got ${forbiddenRes.status}`);
    }
    const forbiddenData = await forbiddenRes.json();
    if (forbiddenData.message !== 'DOMAIN_NOT_ALLOWED') {
      throw new Error(`Expected DOMAIN_NOT_ALLOWED, got ${forbiddenData.message}`);
    }
    console.log('✓ Widget session correctly rejected from forbidden domain (403 DOMAIN_NOT_ALLOWED)');

    // 6. Send 2 messages via WebSocket
    console.log('\n[6] Sending 2 messages via WebSocket...');
    const socket = io(`${WS_BASE}/widget`, {
      auth: { token: visitorSessionToken },
      transports: ['websocket'],
    });

    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    console.log('✓ WebSocket connected');

    const message1 = `Test message 1 - ${Date.now()}`;
    const message2 = `Test message 2 - ${Date.now()}`;

    await new Promise((resolve) => {
      socket.emit('message:send', {
        conversationId,
        text: message1,
        clientMessageId: `client-1-${Date.now()}`,
      });
      socket.on('message:ack', () => {
        socket.emit('message:send', {
          conversationId,
          text: message2,
          clientMessageId: `client-2-${Date.now()}`,
        });
        socket.on('message:ack', resolve);
      });
    });
    console.log('✓ 2 messages sent');

    // Wait a bit for DB to persist
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 7. Request history endpoint
    console.log('\n[7] Requesting message history...');
    const historyRes = await fetch(
      `${API_URL}/api/widget/messages?conversationId=${conversationId}&limit=50`,
      {
        headers: {
          Authorization: `Bearer ${visitorSessionToken}`,
        },
      }
    );
    if (!historyRes.ok) {
      throw new Error(`History request failed: ${historyRes.status}`);
    }
    const historyData = await historyRes.json();
    console.log(`✓ History endpoint returned ${historyData.length} messages`);

    // Verify messages are present
    const found1 = historyData.find((m) => m.text === message1);
    const found2 = historyData.find((m) => m.text === message2);
    if (!found1 || !found2) {
      throw new Error('Expected messages not found in history');
    }
    console.log('✓ Both messages found in history');

    socket.disconnect();

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
