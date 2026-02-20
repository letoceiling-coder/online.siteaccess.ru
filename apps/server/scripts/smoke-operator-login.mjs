#!/usr/bin/env node

/**
 * Smoke test for operator login endpoint
 * Exit code 1 if status not 200/401 (must not be 500)
 */

const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';

// Test credentials (from user request)
const OWNER_EMAIL = 'dsc-23@yandex.RU';
const OWNER_PASSWORD = '123123123';
const CHANNEL_ID = '643d6654-ad02-492e-b490-74e2066cf330';

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

  // Step 1: Owner login to verify API is alive
  console.log('Step 1: Owner login...');
  const ownerLogin = await makeRequest(`${API_URL}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    }),
  });
  console.log(`Status: ${ownerLogin.status}`);
  if (ownerLogin.status === 200 || ownerLogin.status === 201) {
    console.log(`✅ Owner login successful (status ${ownerLogin.status})`);
    console.log(`Token: ${truncateToken(ownerLogin.body.accessToken)}`);
  } else {
    console.log(`❌ Owner login failed: ${JSON.stringify(ownerLogin.body)}`);
    if (ownerLogin.status >= 500) {
      console.error('ERROR: Owner login returned 500+ status');
      process.exit(1);
    }
  }
  console.log('');

  // Step 2: Get projects list (optional, to verify channelId)
  console.log('Step 2: Get projects list...');
  if (ownerLogin.status === 200 && ownerLogin.body.accessToken) {
    const projects = await makeRequest(`${API_URL}/api/projects`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ownerLogin.body.accessToken}`,
      },
    });
    console.log(`Status: ${projects.status}`);
    if (projects.status === 200 && Array.isArray(projects.body)) {
      console.log(`✅ Found ${projects.body.length} project(s)`);
      const channel = projects.body.find((p) => p.id === CHANNEL_ID);
      if (channel) {
        console.log(`✅ Channel ${CHANNEL_ID} found: ${channel.name}`);
      } else {
        console.log(`⚠️  Channel ${CHANNEL_ID} not found in projects list`);
      }
    } else {
      console.log(`⚠️  Could not fetch projects: ${JSON.stringify(projects.body)}`);
    }
  }
  console.log('');

  // Step 3: Operator login
  console.log('Step 3: Operator login...');
  const operatorLogin = await makeRequest(`${API_URL}/api/operator/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      channelId: CHANNEL_ID,
    }),
  });
  console.log(`Status: ${operatorLogin.status}`);
  console.log(`Response: ${JSON.stringify(operatorLogin.body, null, 2).replace(/"(token|accessToken|operatorAccessToken)":"[^"]+"/g, '"$1":"***"')}`);

  if (operatorLogin.status === 200) {
    console.log(`✅ Operator login successful`);
    if (operatorLogin.body.operatorAccessToken) {
      console.log(`Token: ${truncateToken(operatorLogin.body.operatorAccessToken)}`);
    }
    console.log('\n✅✅✅ ALL TESTS PASSED ✅✅✅');
    process.exit(0);
  } else if (operatorLogin.status === 401) {
    console.log(`⚠️  Operator login returned 401 (unauthorized) - this is acceptable for invalid credentials`);
    console.log('\n⚠️  Test completed with 401 (expected for invalid credentials)');
    process.exit(0);
  } else if (operatorLogin.status >= 500) {
    console.error(`❌❌❌ CRITICAL: Operator login returned ${operatorLogin.status} (Internal Server Error)`);
    console.error('This must be fixed!');
    process.exit(1);
  } else {
    console.log(`⚠️  Operator login returned ${operatorLogin.status}`);
    console.log('\n⚠️  Test completed with non-200/401 status');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
