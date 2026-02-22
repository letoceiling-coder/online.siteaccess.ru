/**
 * Smoke test: Widget ping endpoint
 * Requires env var WIDGET_TOKEN
 */
const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';
const WIDGET_TOKEN = process.env.WIDGET_TOKEN;

async function runSmoke() {
  console.log('=== Smoke Test: Widget Ping ===\n');

  if (!WIDGET_TOKEN) {
    console.log('SKIPPED: WIDGET_TOKEN env var not set');
    process.exit(0);
  }

  try {
    const tokenPreview = WIDGET_TOKEN.substring(0, 8) + '...';
    console.log(`[1] Testing POST /api/widget/ping with token ${tokenPreview}...`);

    const response = await fetch(`${API_URL}/api/widget/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://online.siteaccess.ru',
        'User-Agent': 'SmokeTest/1.0',
      },
      body: JSON.stringify({
        token: WIDGET_TOKEN,
        pageUrl: 'https://online.siteaccess.ru/demo/demo.html?token=' + WIDGET_TOKEN,
      }),
    });

    console.log(`Response status: ${response.status}`);

    let body = null;
    try {
      const text = await response.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch (e) {
      // No body or invalid JSON - that's OK for 204
    }

    if (response.status === 204 || response.status === 200) {
      console.log('✓ Widget ping: SUCCESS');
      if (body) {
        console.log(`  Body: ${JSON.stringify(body)}`);
      }
      process.exit(0);
    }

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      console.error(`✗ Widget ping: FAILED with ${response.status}`);
      console.error(`  Body: ${JSON.stringify(body)}`);
      console.error('  Reason: Token should be valid for this smoke test');
      process.exit(1);
    }

    if (response.status >= 500) {
      console.error(`✗ Widget ping: FAILED with ${response.status} (server error)`);
      console.error(`  Body: ${JSON.stringify(body)}`);
      process.exit(1);
    }

    // Other status codes
    console.error(`✗ Widget ping: UNEXPECTED status ${response.status}`);
    console.error(`  Body: ${JSON.stringify(body)}`);
    process.exit(1);
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
