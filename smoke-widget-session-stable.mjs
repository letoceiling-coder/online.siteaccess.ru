/**
 * Smoke test: Widget session stability
 * Ensures same externalId returns same conversationId
 * 
 * Env vars:
 * - WIDGET_TOKEN: Widget token to test
 * - WIDGET_EXTERNAL_ID: External ID to use (optional, will generate if not provided)
 * - API_URL: Base API URL (default: https://online.siteaccess.ru)
 */
const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';
const WIDGET_TOKEN = process.env.WIDGET_TOKEN;
const WIDGET_EXTERNAL_ID = process.env.WIDGET_EXTERNAL_ID || `smoke-${Date.now()}`;

async function runSmoke() {
  console.log('=== Smoke Test: Widget Session Stability ===\n');

  if (!WIDGET_TOKEN) {
    console.log('SKIPPED: WIDGET_TOKEN env var not set');
    process.exit(0);
  }

  try {
    console.log(`[1] Creating first session with externalId=${WIDGET_EXTERNAL_ID}...`);
    const response1 = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://online.siteaccess.ru',
      },
      body: JSON.stringify({
        token: WIDGET_TOKEN,
        externalId: WIDGET_EXTERNAL_ID,
      }),
    });

    if (!response1.ok) {
      const errorText = await response1.text();
      throw new Error(`First session failed: ${response1.status} ${errorText}`);
    }

    const data1 = await response1.json();
    const conversationId1 = data1.conversationId;
    const externalId1 = data1.externalId;

    console.log(`✓ First session: conversationId=${conversationId1}, externalId=${externalId1}`);

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`\n[2] Creating second session with SAME externalId=${WIDGET_EXTERNAL_ID}...`);
    const response2 = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://online.siteaccess.ru',
      },
      body: JSON.stringify({
        token: WIDGET_TOKEN,
        externalId: WIDGET_EXTERNAL_ID,
      }),
    });

    if (!response2.ok) {
      const errorText = await response2.text();
      throw new Error(`Second session failed: ${response2.status} ${errorText}`);
    }

    const data2 = await response2.json();
    const conversationId2 = data2.conversationId;
    const externalId2 = data2.externalId;

    console.log(`✓ Second session: conversationId=${conversationId2}, externalId=${externalId2}`);

    // Verify stability
    console.log('\n[3] Verifying stability...');
    
    if (externalId1 !== externalId2) {
      throw new Error(`externalId changed: ${externalId1} -> ${externalId2}`);
    }
    
    if (conversationId1 !== conversationId2) {
      throw new Error(`conversationId changed: ${conversationId1} -> ${conversationId2}`);
    }

    console.log('✓ externalId stable:', externalId1);
    console.log('✓ conversationId stable:', conversationId1);

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
