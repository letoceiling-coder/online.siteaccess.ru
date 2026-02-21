#!/usr/bin/env node

/**
 * Smoke test for health endpoint
 * Exit code 1 if status >= 500
 */

const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';

async function makeRequest(url) {
  try {
    const response = await fetch(url);
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
  console.log('=== Health Endpoint Smoke Test ===\n');

  const health = await makeRequest(`${API_URL}/health`);
  console.log(`Status: ${health.status}`);
  console.log(`Response: ${JSON.stringify(health.body, null, 2)}`);

  if (health.status >= 500) {
    console.error(`❌ Health check returned ${health.status} (Internal Server Error)`);
    process.exit(1);
  }

  if (health.status === 200) {
    if (health.body.ok === true) {
      console.log(`✅ Health check passed: ${health.body.ok}`);
      if (health.body.db !== undefined) {
        console.log(`   DB: ${health.body.db ? '✅' : '❌'}`);
      }
      if (health.body.redis !== undefined) {
        console.log(`   Redis: ${health.body.redis ? '✅' : '❌'}`);
      }
      console.log('\n✅✅✅ HEALTH TEST PASSED ✅✅✅');
      process.exit(0);
    } else {
      console.log(`⚠️  Health check returned ok=false`);
      process.exit(0); // Not a 500, so exit 0
    }
  } else {
    console.log(`⚠️  Health check returned ${health.status} (not 200, but not 500)`);
    process.exit(0); // Not a 500, so exit 0
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
