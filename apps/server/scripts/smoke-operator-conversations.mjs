#!/usr/bin/env node

/**
 * Smoke test for operator conversations endpoint
 * Usage: OP_EMAIL=... OP_PASSWORD=... OP_CHANNEL_ID=... node smoke-operator-conversations.mjs
 */

const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';

const OP_EMAIL = process.env.OP_EMAIL;
const OP_PASSWORD = process.env.OP_PASSWORD;
const OP_CHANNEL_ID = process.env.OP_CHANNEL_ID;

if (!OP_EMAIL || !OP_PASSWORD || !OP_CHANNEL_ID) {
  console.error('ERROR: Missing required environment variables');
  console.error('Required: OP_EMAIL, OP_PASSWORD, OP_CHANNEL_ID');
  process.exit(1);
}

async function main() {
  try {
    // Step 1: Login operator
    console.log(`[1/2] Logging in operator: ${OP_EMAIL}...`);
    const loginResponse = await fetch(`${API_URL}/api/operator/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: OP_EMAIL,
        password: OP_PASSWORD,
        channelId: OP_CHANNEL_ID,
      }),
    });

    if (loginResponse.status >= 500) {
      const text = await loginResponse.text();
      console.error(`ERROR: Login returned ${loginResponse.status}`);
      console.error(`Response: ${text}`);
      process.exit(1);
    }

    if (loginResponse.status === 401) {
      console.error('ERROR: Login returned 401 Unauthorized');
      const text = await loginResponse.text();
      console.error(`Response: ${text}`);
      process.exit(1);
    }

    if (!loginResponse.ok) {
      const text = await loginResponse.text();
      console.error(`ERROR: Login returned ${loginResponse.status}`);
      console.error(`Response: ${text}`);
      process.exit(1);
    }

    const loginData = await loginResponse.json();
    const operatorAccessToken = loginData.operatorAccessToken;

    if (!operatorAccessToken) {
      console.error('ERROR: No operatorAccessToken in login response');
      console.error(`Response: ${JSON.stringify(loginData, null, 2)}`);
      process.exit(1);
    }

    console.log(`✓ Login successful, token prefix: ${operatorAccessToken.substring(0, 8)}...`);

    // Step 2: Get conversations
    console.log(`[2/2] Fetching conversations for channel: ${OP_CHANNEL_ID}...`);
    const conversationsResponse = await fetch(
      `${API_URL}/api/operator/conversations?channelId=${OP_CHANNEL_ID}`,
      {
        headers: {
          Authorization: `Bearer ${operatorAccessToken}`,
        },
      }
    );

    if (conversationsResponse.status >= 500) {
      const text = await conversationsResponse.text();
      console.error(`ERROR: Conversations endpoint returned ${conversationsResponse.status}`);
      console.error(`Response: ${text}`);
      process.exit(1);
    }

    if (conversationsResponse.status === 401) {
      console.error('ERROR: Conversations endpoint returned 401 Unauthorized');
      const text = await conversationsResponse.text();
      console.error(`Response: ${text}`);
      process.exit(1);
    }

    if (!conversationsResponse.ok) {
      const text = await conversationsResponse.text();
      console.error(`ERROR: Conversations endpoint returned ${conversationsResponse.status}`);
      console.error(`Response: ${text}`);
      process.exit(1);
    }

    const conversations = await conversationsResponse.json();

    if (!Array.isArray(conversations)) {
      console.error('ERROR: Conversations response is not an array');
      console.error(`Response: ${JSON.stringify(conversations, null, 2)}`);
      process.exit(1);
    }

    console.log(`✓ Conversations fetched successfully: ${conversations.length} conversation(s)`);
    console.log(`Status: ${conversationsResponse.status}`);
    console.log('SUCCESS: All checks passed');

    process.exit(0);
  } catch (error) {
    console.error('ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
