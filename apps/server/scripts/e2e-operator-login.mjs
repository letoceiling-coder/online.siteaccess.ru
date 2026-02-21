#!/usr/bin/env node

/**
 * E2E test for operator login flow
 * Creates owner, project, operator, and tests login
 */

const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';

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
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: { error: error.message } };
  }
}

async function main() {
  console.log('=== E2E OPERATOR LOGIN TEST ===\n');

  // STEP 1: Register owner
  console.log('STEP 1: Register owner...');
  const ownerReg = await makeRequest(`${API_URL}/api/auth/register`, {
    method: 'POST',
    body: JSON.stringify({
      email: 'owner@test.com',
      password: '12345678',
    }),
  });
  console.log(`Status: ${ownerReg.status}`);
  console.log(`Response: ${JSON.stringify(ownerReg.body)}`);
  if (ownerReg.status !== 201 && ownerReg.status !== 409) {
    console.error(`❌ Owner registration failed with status ${ownerReg.status}`);
    process.exit(1);
  }
  console.log('');

  // STEP 2: Login owner
  console.log('STEP 2: Login owner...');
  const ownerLogin = await makeRequest(`${API_URL}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: 'owner@test.com',
      password: '12345678',
    }),
  });
  console.log(`Status: ${ownerLogin.status}`);
  if (ownerLogin.status !== 200 && ownerLogin.status !== 201) {
    console.error(`❌ Owner login failed: ${JSON.stringify(ownerLogin.body)}`);
    process.exit(1);
  }
  const ownerToken = ownerLogin.body.accessToken;
  if (!ownerToken) {
    console.error('❌ No accessToken in owner login response');
    process.exit(1);
  }
  console.log(`✅ Owner token: ${ownerToken.substring(0, 50)}...`);
  console.log('');

  // STEP 3: Create project
  console.log('STEP 3: Create project...');
  const projectResp = await makeRequest(`${API_URL}/api/projects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      name: 'test-project',
      domains: ['online.siteaccess.ru'],
    }),
  });
  console.log(`Status: ${projectResp.status}`);
  if (projectResp.status !== 201) {
    console.error(`❌ Project creation failed: ${JSON.stringify(projectResp.body)}`);
    process.exit(1);
  }
  const projectId = projectResp.body.id;
  if (!projectId) {
    console.error('❌ No project ID in response');
    process.exit(1);
  }
  console.log(`✅ Project ID: ${projectId}`);
  console.log('');

  // STEP 4: Register operator
  console.log('STEP 4: Register operator...');
  const opReg = await makeRequest(`${API_URL}/api/auth/register`, {
    method: 'POST',
    body: JSON.stringify({
      email: 'operator@test.com',
      password: '12345678',
    }),
  });
  console.log(`Status: ${opReg.status}`);
  console.log(`Response: ${JSON.stringify(opReg.body)}`);
  if (opReg.status !== 201 && opReg.status !== 409) {
    console.error(`❌ Operator registration failed with status ${opReg.status}`);
    process.exit(1);
  }
  console.log('');

  // STEP 5: Add operator to project
  console.log('STEP 5: Add operator to project...');
  const addOp = await makeRequest(`${API_URL}/api/projects/${projectId}/operators`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      email: 'operator@test.com',
    }),
  });
  console.log(`Status: ${addOp.status}`);
  console.log(`Response: ${JSON.stringify(addOp.body)}`);
  if (addOp.status !== 201) {
    console.error(`❌ Add operator failed: ${JSON.stringify(addOp.body)}`);
    process.exit(1);
  }
  console.log('');

  // STEP 6: Test operator login
  console.log('STEP 6: Test operator login...');
  const opLogin = await makeRequest(`${API_URL}/api/operator/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: 'operator@test.com',
      password: '12345678',
      channelId: projectId,
    }),
  });
  console.log(`Status: ${opLogin.status}`);
  const safeResponse = { ...opLogin.body };
  if (safeResponse.operatorAccessToken) {
    safeResponse.operatorAccessToken = '***';
  }
  console.log(`Response: ${JSON.stringify(safeResponse, null, 2)}`);
  console.log('');

  // Final result
  if (opLogin.status === 200 || opLogin.status === 201) {
    console.log('✅✅✅ E2E TEST PASSED ✅✅✅');
    process.exit(0);
  } else {
    console.error(`❌ E2E TEST FAILED: Status ${opLogin.status}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
