#!/usr/bin/env node

/**
 * Smoke test for /api/calls/ice endpoint
 * Exit code 1 if status >= 500 or missing iceServers field
 */

const API_URL = process.env.API_URL || process.env.BASE_URL || 'https://online.siteaccess.ru';

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: { error: error.message } };
  }
}

async function main() {
  console.log('=== Smoke Test: /api/calls/ice ===\n');

  // 1) Health check first
  console.log('[1] Checking health endpoint...');
  const health = await makeRequest(`${API_URL}/health`);
  if (health.status !== 200) {
    console.error(`❌ Health check failed: ${health.status}`);
    process.exit(1);
  }
  console.log(`✅ Health check passed: ${health.status}\n`);

  // 2) Test /api/calls/ice (requires auth, but we'll test structure)
  console.log('[2] Testing /api/calls/ice endpoint...');
  const iceRes = await makeRequest(`${API_URL}/api/calls/ice`, {
    headers: {
      'Authorization': 'Bearer fake-token-for-structure-test',
    },
  });

  console.log(`Status: ${iceRes.status}`);

  // If 401/403, that's expected (auth required), but structure should be valid if 200
  if (iceRes.status >= 500) {
    console.error(`❌ Server error: ${iceRes.status}`);
    console.error(`Response: ${JSON.stringify(iceRes.body, null, 2)}`);
    process.exit(1);
  }

  if (iceRes.status === 200) {
    // Validate structure
    if (!iceRes.body || !iceRes.body.iceServers) {
      console.error('❌ Missing iceServers field in response');
      console.error(`Response: ${JSON.stringify(iceRes.body, null, 2)}`);
      process.exit(1);
    }

    if (!Array.isArray(iceRes.body.iceServers)) {
      console.error('❌ iceServers must be an array');
      process.exit(1);
    }

    // Validate each server (without logging credentials)
    let hasCredentials = false;
    for (const server of iceRes.body.iceServers) {
      if (!server.urls) {
        console.error('❌ Each iceServer must have urls field');
        process.exit(1);
      }
      if (server.credential) {
        hasCredentials = true;
        // Don't log credential, only indicate presence
        const masked = { ...server, credential: '***' };
        console.log(`  Server: ${JSON.stringify(masked)}`);
      } else {
        console.log(`  Server: ${JSON.stringify(server)}`);
      }
    }

    console.log(`✅ iceServers structure valid (${iceRes.body.iceServers.length} servers)`);
    if (hasCredentials) {
      console.log('  ⚠️  Credentials present (masked in logs)');
    }
  } else if (iceRes.status === 401 || iceRes.status === 403) {
    console.log(`✅ Endpoint exists (auth required, status: ${iceRes.status})`);
  } else {
    console.log(`⚠️  Unexpected status: ${iceRes.status}`);
  }

  console.log('\n✅✅✅ ICE ENDPOINT TEST PASSED ✅✅✅');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
