#!/usr/bin/env node
/**
 * Smoke test for widget messages history endpoint
 * Tests: GET /api/widget/messages?conversationId=...&limit=100
 */

const API_URL = process.env.BASE_URL || 'https://online.siteaccess.ru';

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const body = await response.text();
    let parsedBody;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      parsedBody = body;
    }

    return {
      status: response.status,
      ok: response.ok,
      body: parsedBody,
      headers: Object.fromEntries(response.headers.entries()),
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      body: { error: error.message },
    };
  }
}

async function runSmoke() {
  console.log('=== Widget Messages History Smoke Test ===\n');

  // Check if required env vars are set
  const WIDGET_TOKEN = process.env.WIDGET_TOKEN;
  const ORIGIN = process.env.ORIGIN || 'https://example.com';

  if (!WIDGET_TOKEN) {
    console.log('⚠️  WIDGET_TOKEN not set');
    console.log('⚠️  Skipping widget messages test (requires token)');
    console.log('\n✅✅✅ WIDGET MESSAGES TEST SKIPPED ✅✅✅');
    process.exit(0);
  }

  try {
    // 1. Create widget session
    console.log('[1] Creating widget session...');
    const sessionRes = await makeRequest(`${API_URL}/api/widget/session`, {
      method: 'POST',
      body: JSON.stringify({
        token: WIDGET_TOKEN,
        externalId: `smoke_${Date.now()}`,
      }),
      headers: {
        Origin: ORIGIN,
      },
    });

    if (!sessionRes.ok || sessionRes.status !== 200) {
      console.error(`❌ Session creation failed: ${sessionRes.status}`);
      console.error(`Response: ${JSON.stringify(sessionRes.body, null, 2)}`);
      process.exit(1);
    }

    const { conversationId, visitorSessionToken } = sessionRes.body;
    console.log(`✓ Session created: conversationId=${conversationId?.substring(0, 8)}...`);

    // 2. Get messages history
    console.log('[2] Fetching messages history...');
    const messagesRes = await makeRequest(
      `${API_URL}/api/widget/messages?conversationId=${conversationId}&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${visitorSessionToken}`,
        },
      }
    );

    console.log(`Status: ${messagesRes.status}`);

    if (messagesRes.status >= 500) {
      console.error(`❌ Server error: ${messagesRes.status}`);
      console.error(`Response: ${JSON.stringify(messagesRes.body, null, 2)}`);
      process.exit(1);
    }

    if (messagesRes.status !== 200) {
      console.error(`❌ Expected 200, got ${messagesRes.status}`);
      console.error(`Response: ${JSON.stringify(messagesRes.body, null, 2)}`);
      process.exit(1);
    }

    if (!Array.isArray(messagesRes.body)) {
      console.error(`❌ Expected array, got ${typeof messagesRes.body}`);
      console.error(`Response: ${JSON.stringify(messagesRes.body, null, 2)}`);
      process.exit(1);
    }

    console.log(`✓ Messages history retrieved: ${messagesRes.body.length} messages`);
    console.log('\n✅✅✅ WIDGET MESSAGES TEST PASSED ✅✅✅');
    process.exit(0);
  } catch (error) {
    console.error(`❌❌❌ TEST FAILED ❌❌❌`);
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(`Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

runSmoke();
