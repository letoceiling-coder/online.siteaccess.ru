#!/usr/bin/env node

/**
 * Smoke test for operator login endpoint
 * Exit code 1 if status not 200/401 (must not be 500)
 */

const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';

// Read credentials from environment (no hardcoded secrets)
const OP_EMAIL = process.env.OP_EMAIL;
const OP_PASSWORD = process.env.OP_PASSWORD;
const OP_CHANNEL_ID = process.env.OP_CHANNEL_ID;

function truncateToken(token) {
  if (!token) return 'null';
  return token.substring(0, 20) + '...';
}

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: response.status, body, headers: Object.fromEntries(response.headers.entries()) };
  } catch (error) {
    return { status: 0, body: { error: error.message }, headers: {} };
  }
}

async function main() {
  console.log('=== Operator Login Smoke Test ===\n');

  // Check if credentials provided
  if (!OP_EMAIL || !OP_PASSWORD || !OP_CHANNEL_ID) {
    console.log('SKIPPED: No credentials provided (OP_EMAIL, OP_PASSWORD, OP_CHANNEL_ID)');
    console.log('To run with real credentials:');
    console.log('  OP_EMAIL=... OP_PASSWORD=... OP_CHANNEL_ID=... pnpm -C apps/server smoke:operator');
    process.exit(0);
  }

  // Step 1: Operator login (main test)
  console.log('Step 1: Operator login...');
  const operatorLogin = await makeRequest(`${API_URL}/api/operator/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: OP_EMAIL,
      password: OP_PASSWORD,
      channelId: OP_CHANNEL_ID,
    }),
  });
  console.log(`Status: ${operatorLogin.status}`);
  const safeResponse = JSON.stringify(operatorLogin.body, null, 2).replace(
    /"(token|accessToken|operatorAccessToken|password)":"[^"]+"/g,
    '"$1":"***"'
  );
  console.log(`Response: ${safeResponse}`);

  if (operatorLogin.status === 200) {
    console.log(`✅ Operator login successful`);
    if (operatorLogin.body.operatorAccessToken) {
      console.log(`Token: ${truncateToken(operatorLogin.body.operatorAccessToken)}`);
    }
    console.log('\n✅✅✅ ALL TESTS PASSED ✅✅✅');
    process.exit(0);
  } else if (operatorLogin.status >= 500) {
    console.error(`❌❌❌ CRITICAL: Operator login returned ${operatorLogin.status} (Internal Server Error)`);
    console.error('This must be fixed!');
    process.exit(1);
  } else if (operatorLogin.status === 401 || operatorLogin.status === 400) {
    console.error(`❌ Operator login failed with ${operatorLogin.status}`);
    console.error('For real credentials, this should return 200. Check:');
    console.error('  - Email/password correct');
    console.error('  - ChannelId exists and user is member');
    process.exit(1);
  } else {
    console.error(`❌ Unexpected status: ${operatorLogin.status}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
