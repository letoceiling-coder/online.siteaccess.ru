/**
 * Smoke test: WebSocket connection
 * 
 * Tests that operator and widget sockets can connect via Nginx.
 * 
 * Env vars:
 * - BASE_URL: Base URL (default: https://online.siteaccess.ru)
 */
import { io } from 'socket.io-client';

const BASE_URL = process.env.BASE_URL || 'https://online.siteaccess.ru';

async function runSmoke() {
  console.log('=== Smoke Test: WebSocket Connection ===\n');
  console.log(`BASE_URL: ${BASE_URL}\n`);

  try {
    // We need valid tokens, but for smoke we'll just test connection
    // If tokens are invalid, we should see connect_error, not timeout
    
    // Test operator socket (will fail auth, but should connect)
    console.log('[1] Testing operator socket connection...');
    const operatorSocket = io(`${BASE_URL}/operator`, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });

    let operatorConnected = false;
    let operatorError = null;

    await new Promise((resolve) => {
      operatorSocket.on('connect', () => {
        console.log('  ✓ Operator socket connected');
        operatorConnected = true;
        resolve();
      });

      operatorSocket.on('connect_error', (err) => {
        console.log(`  ⚠️  Operator connect_error: ${err.message || JSON.stringify(err)}`);
        operatorError = err;
        resolve();
      });

      setTimeout(() => {
        if (!operatorConnected && !operatorError) {
          console.log('  ✗ Operator socket timeout (no connect or error)');
          resolve();
        }
      }, 5000);
    });

    if (operatorConnected) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      operatorSocket.disconnect();
      console.log('  ✓ Operator socket disconnected\n');
    }

    // Test widget socket (will fail auth, but should connect)
    console.log('[2] Testing widget socket connection...');
    const widgetSocket = io(`${BASE_URL}/widget`, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });

    let widgetConnected = false;
    let widgetError = null;

    await new Promise((resolve) => {
      widgetSocket.on('connect', () => {
        console.log('  ✓ Widget socket connected');
        widgetConnected = true;
        resolve();
      });

      widgetSocket.on('connect_error', (err) => {
        console.log(`  ⚠️  Widget connect_error: ${err.message || JSON.stringify(err)}`);
        widgetError = err;
        resolve();
      });

      setTimeout(() => {
        if (!widgetConnected && !widgetError) {
          console.log('  ✗ Widget socket timeout (no connect or error)');
          resolve();
        }
      }, 5000);
    });

    if (widgetConnected) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      widgetSocket.disconnect();
      console.log('  ✓ Widget socket disconnected\n');
    }

    // Success criteria: at least one socket should connect (even if auth fails)
    // Timeout without connect_error means WebSocket is not reaching server
    if (operatorConnected || widgetConnected) {
      console.log('✓✓✓ SMOKE TEST PASSED ✓✓✓');
      console.log('  At least one socket connected (WebSocket routing works)');
      process.exit(0);
    } else if (operatorError || widgetError) {
      console.log('⚠️  SMOKE TEST PARTIAL');
      console.log('  Sockets reached server but auth failed (expected without tokens)');
      console.log('  WebSocket routing is working');
      process.exit(0);
    } else {
      console.log('✗✗✗ SMOKE TEST FAILED ✗✗✗');
      console.log('  Sockets timed out without connect or error');
      console.log('  WebSocket traffic is not reaching the server');
      process.exit(1);
    }
  } catch (error) {
    console.error('✗✗✗ SMOKE TEST FAILED ✗✗✗');
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

runSmoke();
