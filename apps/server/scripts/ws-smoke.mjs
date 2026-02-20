import { io } from 'socket.io-client';
import { execSync } from 'child_process';

console.log('=== WebSocket Smoke Test ===\n');

// 1. Получить visitorSessionToken через REST API
console.log('1. Getting visitorSessionToken...');
const channelResp = JSON.parse(execSync('curl -s -X POST http://127.0.0.1:3100/api/channels -H "Content-Type: application/json" -d \'{"name":"WSTest"}\'').toString());
const token = channelResp.token;
console.log('   Channel ID:', channelResp.id);
console.log('   Token received:', token.substring(0, 20) + '...');

const sessionResp = JSON.parse(execSync(`curl -s -X POST http://127.0.0.1:3100/api/widget/session -H "Origin: http://localhost" -H "Content-Type: application/json" -d '{"token":"${token}","externalId":"ws-test-user"}'`).toString());
const visitorToken = sessionResp.visitorSessionToken;
const conversationId = sessionResp.conversationId;
console.log('   Visitor token received');
console.log('   Conversation ID:', conversationId);
console.log('');

// 2. Подключиться к /widget namespace
console.log('2. Connecting to /widget namespace...');
const socket = io('http://127.0.0.1:3100/widget', {
  auth: { token: visitorToken },
  transports: ['websocket'],
});

await new Promise((resolve, reject) => {
  socket.on('connect', () => {
    console.log('   ✓ Connected:', socket.id);
    resolve();
  });
  socket.on('connect_error', (err) => {
    console.error('   ✗ Connection error:', err.message);
    reject(err);
  });
  setTimeout(() => reject(new Error('Connection timeout')), 5000);
});

// 3. Отправить message:send
console.log('\n3. Sending message:send...');
const clientMessageId = 'test-' + Date.now();
socket.emit('message:send', {
  conversationId,
  text: 'Hello from smoke test!',
  clientMessageId,
});

const ack = await new Promise((resolve, reject) => {
  socket.on('message:ack', (data) => {
    console.log('   ✓ Received message:ack:', data);
    resolve(data);
  });
  socket.on('error', (err) => {
    console.error('   ✗ Error:', err);
    reject(err);
  });
  setTimeout(() => reject(new Error('ACK timeout')), 5000);
});

// 4. Запросить sync:request
console.log('\n4. Requesting sync:request...');
socket.emit('sync:request', {
  conversationId,
  limit: 10,
});

const sync = await new Promise((resolve, reject) => {
  socket.on('sync:response', (data) => {
    console.log('   ✓ Received sync:response:', data.messages.length, 'messages');
    resolve(data);
  });
  setTimeout(() => reject(new Error('Sync timeout')), 5000);
});

console.log('\n=== All tests passed! ===');
socket.disconnect();
process.exit(0);
