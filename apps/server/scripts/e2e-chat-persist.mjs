#!/usr/bin/env node

/**
 * E2E test for chat message persistence
 * Tests: message delivery, DB persistence, history load
 * Usage: node e2e-chat-persist.mjs
 */

const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';
const { io } = await import('socket.io-client');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    console.log('=== E2E CHAT PERSIST TEST ===\n');

    const timestamp = Date.now();
    const ownerEmail = `owner_persist_${timestamp}@test.local`;
    const ownerPass = '123123123';
    const opEmail = `operator_persist_${timestamp}@test.local`;
    const opPass = '123123123';
    const projectName = `PersistTest_${timestamp}`;

    // Step 1: Register owner
    console.log('[1/8] Register owner...');
    const regOwner = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass }),
    });
    if (!regOwner.ok) {
      const text = await regOwner.text();
      throw new Error(`Owner registration failed: ${regOwner.status} - ${text}`);
    }
    console.log('✓ Owner registered');

    // Step 2: Login owner
    console.log('[2/8] Login owner...');
    const loginOwner = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerPass }),
    });
    if (!loginOwner.ok) {
      const text = await loginOwner.text();
      throw new Error(`Owner login failed: ${loginOwner.status} - ${text}`);
    }
    const ownerData = await loginOwner.json();
    const ownerToken = ownerData.accessToken;
    console.log('✓ Owner logged in');

    // Step 3: Create project
    console.log('[3/8] Create project...');
    const createProject = await fetch(`${API_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: projectName,
        domains: ['online.siteaccess.ru'],
      }),
    });
    if (!createProject.ok) {
      const text = await createProject.text();
      throw new Error(`Project creation failed: ${createProject.status} - ${text}`);
    }
    const projectData = await createProject.json();
    const projectId = projectData.id;
    const rawToken = projectData.token;
    console.log(`✓ Project created: ${projectId}`);

    // Step 4: Widget session
    console.log('[4/8] Create widget session...');
    const widgetSession = await fetch(`${API_URL}/api/widget/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://online.siteaccess.ru',
      },
      body: JSON.stringify({
        token: rawToken,
        externalId: `persist-visitor-${timestamp}`,
      }),
    });
    if (!widgetSession.ok) {
      const text = await widgetSession.text();
      throw new Error(`Widget session failed: ${widgetSession.status} - ${text}`);
    }
    const widgetData = await widgetSession.json();
    const visitorToken = widgetData.visitorSessionToken;
    const conversationId = widgetData.conversationId;
    console.log(`✓ Widget session created: conversationId=${conversationId}`);

    // Step 5: Register operator
    console.log('[5/8] Register operator...');
    const regOp = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: opEmail, password: opPass }),
    });
    if (!regOp.ok) {
      const text = await regOp.text();
      throw new Error(`Operator registration failed: ${regOp.status} - ${text}`);
    }
    console.log('✓ Operator registered');

    // Step 6: Invite operator
    console.log('[6/8] Invite operator...');
    const inviteOp = await fetch(`${API_URL}/api/projects/${projectId}/operators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ email: opEmail, role: 'operator' }),
    });
    if (!inviteOp.ok) {
      const text = await inviteOp.text();
      throw new Error(`Invite failed: ${inviteOp.status} - ${text}`);
    }
    console.log('✓ Operator invited');

    // Step 7: Operator login
    console.log('[7/8] Operator login...');
    const opLogin = await fetch(`${API_URL}/api/operator/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: opEmail,
        password: opPass,
        channelId: projectId,
      }),
    });
    if (!opLogin.ok) {
      const text = await opLogin.text();
      throw new Error(`Operator login failed: ${opLogin.status} - ${text}`);
    }
    const opData = await opLogin.json();
    const opToken = opData.operatorAccessToken;
    console.log('✓ Operator logged in');

    // Step 8: Check DB before messages
    console.log('[8/8] Check DB before messages...');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const countBefore = await execAsync(
      `sudo -u postgres psql -d online_siteaccess -t -c "SELECT COUNT(*) FROM messages WHERE \\"conversationId\\"='${conversationId}';"`
    );
    const countBeforeNum = parseInt(countBefore.stdout.trim()) || 0;
    console.log(`Messages before: ${countBeforeNum}`);

    // Step 9: Connect widget socket and send message
    console.log('\n[9/10] Connect widget and send message...');
    const widgetSocket = io(`${API_URL}/widget`, {
      auth: { token: visitorToken },
      query: { token: visitorToken },
      transports: ['websocket', 'polling'],
    });

    await new Promise((resolve, reject) => {
      widgetSocket.on('connect', resolve);
      widgetSocket.on('connect_error', reject);
      setTimeout(() => reject(new Error('Widget socket connection timeout')), 10000);
    });
    console.log('✓ Widget connected');

    const visitorMsgId = `visitor-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
    const visitorText = `Visitor message ${timestamp}`;

    await new Promise((resolve, reject) => {
      widgetSocket.emit('message:send', {
        conversationId,
        text: visitorText,
        clientMessageId: visitorMsgId,
      });

      widgetSocket.on('message:ack', (data) => {
        if (data.clientMessageId === visitorMsgId) {
          console.log(`✓ Visitor message sent: ${data.serverMessageId}`);
          resolve();
        }
      });

      widgetSocket.on('error', (err) => {
        reject(new Error(`Widget error: ${JSON.stringify(err)}`));
      });

      setTimeout(() => reject(new Error('Message ack timeout')), 5000);
    });

    await sleep(1000);

    // Step 10: Connect operator socket and send message
    console.log('[10/10] Connect operator and send message...');
    const opSocket = io(`${API_URL}/operator`, {
      auth: { token: opToken },
      transports: ['websocket', 'polling'],
    });

    await new Promise((resolve, reject) => {
      opSocket.on('connect', resolve);
      opSocket.on('connect_error', reject);
      setTimeout(() => reject(new Error('Operator socket connection timeout')), 10000);
    });
    console.log('✓ Operator connected');

    const operatorMsgId = `operator-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
    const operatorText = `Operator message ${timestamp}`;

    await new Promise((resolve, reject) => {
      opSocket.emit('message:send', {
        conversationId,
        text: operatorText,
        clientMessageId: operatorMsgId,
      });

      opSocket.on('message:ack', (data) => {
        if (data.clientMessageId === operatorMsgId) {
          console.log(`✓ Operator message sent: ${data.serverMessageId}`);
          resolve();
        }
      });

      opSocket.on('error', (err) => {
        reject(new Error(`Operator error: ${JSON.stringify(err)}`));
      });

      setTimeout(() => reject(new Error('Message ack timeout')), 5000);
    });

    await sleep(2000);

    // Step 11: Verify DB has messages
    console.log('\n[11/12] Verify DB persistence...');
    const countAfter = await execAsync(
      `sudo -u postgres psql -d online_siteaccess -t -c "SELECT COUNT(*) FROM messages WHERE \\"conversationId\\"='${conversationId}';"`
    );
    const countAfterNum = parseInt(countAfter.stdout.trim()) || 0;
    console.log(`Messages after: ${countAfterNum}`);

    if (countAfterNum < 2) {
      throw new Error(`Expected at least 2 messages, got ${countAfterNum}`);
    }
    console.log('✓ DB has messages');

    // Step 12: Verify history via API
    console.log('[12/12] Verify history via API...');
    const historyResponse = await fetch(
      `${API_URL}/api/operator/messages?conversationId=${conversationId}&limit=50`,
      {
        headers: {
          Authorization: `Bearer ${opToken}`,
        },
      }
    );

    if (!historyResponse.ok) {
      const text = await historyResponse.text();
      throw new Error(`History fetch failed: ${historyResponse.status} - ${text}`);
    }

    const history = await historyResponse.json();
    console.log(`History returned ${history.length} messages`);

    const visitorMsg = history.find(m => m.text === visitorText);
    const operatorMsg = history.find(m => m.text === operatorText);

    if (!visitorMsg) {
      throw new Error(`Visitor message not found in history. Messages: ${JSON.stringify(history.map(m => m.text))}`);
    }
    if (!operatorMsg) {
      throw new Error(`Operator message not found in history. Messages: ${JSON.stringify(history.map(m => m.text))}`);
    }

    console.log('✓ Visitor message in history:', visitorMsg.text);
    console.log('✓ Operator message in history:', operatorMsg.text);

    // Step 13: Verify widget sync:request
    console.log('\n[13/13] Verify widget sync:request...');
    await new Promise((resolve, reject) => {
      widgetSocket.emit('sync:request', {
        conversationId,
        limit: 50,
      });

      widgetSocket.on('sync:response', (data) => {
        const syncVisitorMsg = data.messages.find(m => m.text === visitorText);
        const syncOperatorMsg = data.messages.find(m => m.text === operatorText);

        if (!syncVisitorMsg) {
          reject(new Error(`Visitor message not in sync response. Messages: ${JSON.stringify(data.messages.map(m => m.text))}`));
          return;
        }
        if (!syncOperatorMsg) {
          reject(new Error(`Operator message not in sync response. Messages: ${JSON.stringify(data.messages.map(m => m.text))}`));
          return;
        }

        console.log('✓ Widget sync returned both messages');
        resolve();
      });

      setTimeout(() => reject(new Error('Sync response timeout')), 5000);
    });

    widgetSocket.disconnect();
    opSocket.disconnect();

    console.log('\n=== SUCCESS: All checks passed ===');
    console.log(`DB messages: ${countBeforeNum} -> ${countAfterNum}`);
    console.log(`History API: ${history.length} messages`);
    console.log('Both messages persisted and returned by history endpoints');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
