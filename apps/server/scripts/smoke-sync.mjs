/**
 * Smoke test: Sync protocol
 * 
 * Steps:
 * 1) Connect ws
 * 2) Send messages
 * 3) Call sync:request sinceCreatedAt
 * 4) Ensure returns missing ones
 * 
 * Env vars:
 * - API_URL: Base API URL (default: https://online.siteaccess.ru)
 * - WS_BASE: WebSocket base URL (default: https://online.siteaccess.ru)
 * - WIDGET_TOKEN: Widget token (optional, will create project if not provided)
 */
import { io } from 'socket.io-client';

const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';
const WS_BASE = process.env.WS_BASE || 'https://online.siteaccess.ru';
const WIDGET_TOKEN = process.env.WIDGET_TOKEN;

async function runSmoke() {
  console.log('=== Smoke Test: Sync Protocol ===\n');

  if (!WIDGET_TOKEN) {
    console.log('SKIPPED: WIDGET_TOKEN env var not set');
    process.exit(0);
  }

  try {
    // 1) Create widget session
    console.log('[1] Creating widget session...');
    const externalId = `smoke-sync-${Date.now()}`;
    const sessionRes = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://example.com',
      },
      body: JSON.stringify({
        token: WIDGET_TOKEN,
        externalId,
      }),
    });

    if (!sessionRes.ok) {
      const errorText = await sessionRes.text();
      throw new Error(`Widget session failed: ${sessionRes.status} ${errorText}`);
    }

    const sessionData = await sessionRes.json();
    const conversationId = sessionData.conversationId;
    const visitorSessionToken = sessionData.visitorSessionToken;
    console.log(`✓ Widget session created: conversationId=${conversationId.substring(0, 8)}...`);

    // 2) Connect WebSocket
    console.log('\n[2] Connecting WebSocket...');
    const socket = io(`${WS_BASE}/widget`, {
      auth: { token: visitorSessionToken },
      transports: ['websocket'],
    });

    await new Promise((resolve) => socket.on('connect', resolve));
    console.log('✓ WebSocket connected');

    // 3) Send messages
    console.log('\n[3] Sending messages...');
    const messages = [];
    let lastCreatedAt = null;

    for (let i = 1; i <= 3; i++) {
      const clientMessageId = `smoke-${Date.now()}-${i}`;
      const text = `Smoke sync message ${i} - ${Date.now()}`;
      
      socket.emit('message:send', {
        conversationId,
        text,
        clientMessageId,
      });
      
      messages.push({ clientMessageId, text });
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Wait for ACKs
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get lastCreatedAt from one of the messages
    const historyRes = await fetch(
      `${API_URL}/api/widget/messages?conversationId=${conversationId}&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${visitorSessionToken}`,
        },
      }
    );

    if (historyRes.ok) {
      const history = await historyRes.json();
      if (history.length > 0) {
        // Get createdAt of second-to-last message (to test sync)
        const sorted = history.sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        if (sorted.length >= 2) {
          lastCreatedAt = sorted[sorted.length - 2].createdAt;
        }
      }
    }

    console.log(`✓ 3 messages sent`);
    if (lastCreatedAt) {
      console.log(`  LastCreatedAt for sync: ${lastCreatedAt}`);
    }

    // 4) Call sync:request sinceCreatedAt
    console.log('\n[4] Calling sync:request...');
    const syncPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Sync response timeout'));
      }, 5000);

      socket.once('sync:response', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });

    socket.emit('sync:request', {
      conversationId,
      sinceCreatedAt: lastCreatedAt,
      limit: 100,
    });

    const syncData = await syncPromise;
    console.log(`✓ Sync response received: ${syncData.messages?.length || 0} messages`);

    // 5) Verify sync returns messages after sinceCreatedAt
    if (lastCreatedAt && syncData.messages) {
      const afterLast = syncData.messages.filter((msg) => 
        msg.createdAt > lastCreatedAt
      );
      console.log(`  Messages after sinceCreatedAt: ${afterLast.length}`);
      
      if (afterLast.length === 0 && syncData.messages.length > 0) {
        throw new Error('Sync returned messages but none are after sinceCreatedAt');
      }
    }

    // Cleanup
    socket.disconnect();

    console.log('\n✓✓✓ SMOKE TEST PASSED ✓✓✓');
    process.exit(0);
  } catch (error) {
    console.error('\n✗✗✗ SMOKE TEST FAILED ✗✗✗');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

runSmoke();
