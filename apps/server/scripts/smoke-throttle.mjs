#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL || 'https://online.siteaccess.ru';
const SMOKE_KEY = process.env.SMOKE_KEY;
const SMOKE_ENABLED = process.env.SMOKE_ENABLED === 'true';

if (!SMOKE_ENABLED) {
  console.log('⚠️  SMOKE_ENABLED is not set to "true". Skipping throttle smoke test.');
  process.exit(0);
}

if (!SMOKE_KEY) {
  console.error('❌ SMOKE_KEY environment variable is required when SMOKE_ENABLED=true');
  process.exit(1);
}

const endpoint = `${BASE_URL}/api/_smoke/throttle`;
const numRequests = 110; // Send more than the 100/min limit
const delay = 5; // ms between requests (faster)

console.log(`=== Throttle Smoke Test ===`);
console.log(`Endpoint: ${endpoint}`);
console.log(`Sending ${numRequests} requests with ${delay}ms delay...`);
console.log('');

let successCount = 0;
let rateLimitCount = 0;
let errorCount = 0;
const statusCodes = {};

async function makeRequest(index) {
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'X-Smoke-Key': SMOKE_KEY,
      },
    });

    const status = response.status;
    statusCodes[status] = (statusCodes[status] || 0) + 1;

    if (status === 200) {
      successCount++;
    } else if (status === 429) {
      rateLimitCount++;
      console.log(`[${index}] ⚠️  Rate limited (429)`);
    } else {
      errorCount++;
      const text = await response.text();
      console.log(`[${index}] ❌ Unexpected status ${status}: ${text.substring(0, 100)}`);
    }
  } catch (error) {
    errorCount++;
    console.error(`[${index}] ❌ Error: ${error.message}`);
  }
}

async function run() {
  const startTime = Date.now();
  
  // Send requests sequentially with small delay
  for (let i = 1; i <= numRequests; i++) {
    await makeRequest(i);
    if (i < numRequests) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  const duration = Date.now() - startTime;

  console.log('');
  console.log('=== Results ===');
  console.log(`Total requests: ${numRequests}`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Status codes:`, statusCodes);
  console.log(`✅ 200 (success): ${successCount}`);
  console.log(`⚠️  429 (rate limited): ${rateLimitCount}`);
  console.log(`❌ Errors: ${errorCount}`);

  if (rateLimitCount > 0) {
    console.log('');
    console.log('✅✅✅ THROTTLE TEST PASSED (rate limiting detected) ✅✅✅');
    process.exit(0);
  } else {
    console.log('');
    console.log('❌ THROTTLE TEST FAILED (no rate limiting detected)');
    console.log('Expected at least one 429 response.');
    process.exit(1);
  }
}

run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
