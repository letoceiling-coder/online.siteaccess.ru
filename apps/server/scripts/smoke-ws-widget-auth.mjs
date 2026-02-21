#!/usr/bin/env node

/**
 * Smoke test for widget WebSocket authentication and message sending
 * Usage: VISITOR_SESSION_TOKEN=... CONVERSATION_ID=... WS_BASE=https://online.siteaccess.ru node smoke-ws-widget-auth.mjs
 */

const WS_BASE = process.env.WS_BASE || 'https://online.siteaccess.ru';
const VISITOR_SESSION_TOKEN = process.env.VISITOR_SESSION_TOKEN;
const CONVERSATION_ID = process.env.CONVERSATION_ID;

if (!VISITOR_SESSION_TOKEN || !CONVERSATION_ID) {
  console.error('ERROR: Missing required env vars: VISITOR_SESSION_TOKEN, CONVERSATION_ID');
  process.exit(1);
}

const { io } = await import('socket.io-client');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    console.log('=== Widget WS Auth Smoke Test ===\n');
    console.log(`WS_BASE: ${WS_BASE}`);
    console.log(`CONVERSATION_ID: ${CONVERSATION_ID}`);
    console.log(`TOKEN_PREFIX: ${VISITOR_SESSION_TOKEN.substring(0, 10)}...\n`);

    // Connect with both auth and query to be safe
    console.log('[1/4] Connecting to /widget...');
    const socket = io(`${WS_BASE}/widget`, {
      auth: { token: VISITOR_SESSION_TOKEN },
      query: { token: VISITOR_SESSION_TOKEN },
      transports: ['websocket', 'polling'],
    });

    // Wait for connect
    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        console.log('✓ Connected successfully');
        resolve();
      });

      socket.on('connect_error', (error) => {
        console.error(`✗ Connection error: ${error.message}`);
        reject(error);
      });

      socket.on('disconnect', (reason) => {
        console.error(`✗ Disconnected: ${reason}`);
        reject(new Error(`Disconnected: ${reason}`));
      });

      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });

    await sleep(500);

    // Send message
    const timestamp = Date.now();
    const testText = `auth-fix-${timestamp}`;
    const clientMessageId = `test-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[2/4] Sending message: "${testText}"...`);
    socket.emit('message:send', {
      conversationId: CONVERSATION_ID,
      text: testText,
      clientMessageId,
    });

    // Wait for ack
    console.log('[3/4] Waiting for message:ack...');
    await new Promise((resolve, reject) => {
      socket.on('message:ack', (data) => {
        if (data.clientMessageId === clientMessageId) {
          console.log(`✓ Message ack received: serverMessageId=${data.serverMessageId}`);
          resolve();
        }
      });

      socket.on('error', (err) => {
        console.error(`✗ Socket error: ${JSON.stringify(err)}`);
        reject(new Error(`Socket error: ${JSON.stringify(err)}`));
      });

      setTimeout(() => reject(new Error('Message ack timeout')), 5000);
    });

    // Wait for message:new (echo)
    console.log('[4/4] Waiting for message:new...');
    await new Promise((resolve, reject) => {
      socket.on('message:new', (data) => {
        if (data.text === testText) {
          console.log(`✓ Message new received: text="${data.text}"`);
          resolve();
        }
      });

      setTimeout(() => {
        // message:new is optional (only if other clients are listening)
        console.log('⚠ message:new not received (may be normal if no other clients)');
        resolve();
      }, 2000);
    });

    socket.disconnect();
    await sleep(500);

    console.log('\n=== SUCCESS: All checks passed ===');
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
