/**
 * Smoke test: Widget domain lock
 * Quick check: /api/widget/session rejects wrong Origin with 403
 */
const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';

async function runSmoke() {
  console.log('=== Smoke Test: Widget Domain Lock ===\n');

  try {
    // 1. Register owner
    const ownerEmail = `owner_smoke_${Date.now()}@test.local`;
    const ownerPass = '123123123';
    
    console.log('[1] Registering owner...');
    const registerRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass }),
    });
    if (!registerRes.ok) {
      throw new Error(`Registration failed: ${registerRes.status}`);
    }

    // 2. Login owner
    console.log('[2] Logging in owner...');
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass }),
    });
    if (!loginRes.ok) {
      throw new Error(`Login failed: ${loginRes.status}`);
    }
    const loginData = await loginRes.json();
    const ownerToken = loginData.accessToken;

    // 3. Create project with allowed domain
    const testDomain = 'allowed.example.com';
    console.log(`[3] Creating project with allowedDomain=${testDomain}...`);
    const createRes = await fetch(`${API_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: `Smoke Test ${Date.now()}`,
        domains: [testDomain],
      }),
    });
    if (!createRes.ok) {
      const errorText = await createRes.text();
      throw new Error(`Project creation failed: ${createRes.status} - ${errorText}`);
    }
    const projectData = await createRes.json();
    const rawToken = projectData.token;

    // 4. Test widget session from ALLOWED domain (should work)
    console.log(`[4] Testing widget session from ALLOWED domain (${testDomain})...`);
    const allowedRes = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: `https://${testDomain}`,
      },
      body: JSON.stringify({
        token: rawToken,
        externalId: `test-visitor-${Date.now()}`,
      }),
    });
    if (!allowedRes.ok) {
      throw new Error(`Widget session from allowed domain failed: ${allowedRes.status}`);
    }
    console.log('✓ Widget session from allowed domain: 200 OK');

    // 5. Test widget session from FORBIDDEN domain (should return 403)
    console.log(`[5] Testing widget session from FORBIDDEN domain (forbidden.example.com)...`);
    const forbiddenRes = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://forbidden.example.com',
      },
      body: JSON.stringify({
        token: rawToken,
        externalId: `test-visitor-${Date.now()}`,
      }),
    });
    if (forbiddenRes.status !== 403) {
      throw new Error(`Expected 403, got ${forbiddenRes.status}`);
    }
    const forbiddenData = await forbiddenRes.json();
    if (forbiddenData.message !== 'DOMAIN_NOT_ALLOWED') {
      throw new Error(`Expected DOMAIN_NOT_ALLOWED, got ${forbiddenData.message || 'no message'}`);
    }
    console.log('✓ Widget session from forbidden domain: 403 DOMAIN_NOT_ALLOWED');

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
