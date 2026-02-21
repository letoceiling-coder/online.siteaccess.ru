import { fileURLToPath } from 'url';
import path from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, '../.env') });

const API_URL = process.env.API_URL || 'https://online.siteaccess.ru';

async function runSmokeTest() {
  console.log('=== Smoke Test: Sound File Availability ===');
  console.log(`API_URL: ${API_URL}`);

  try {
    const response = await fetch(`${API_URL}/sounds/new-message.wav`, {
      method: 'HEAD',
    });

    console.log(`\nResponse status: ${response.status}`);
    console.log(`Response headers:`);
    response.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });

    // Strict validation
    const status = response.status;
    const contentType = response.headers.get('content-type') || '';
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

    console.log(`\nValidation:`);
    console.log(`  Status: ${status} (expected: 200)`);
    console.log(`  Content-Type: ${contentType} (expected: starts with "audio/")`);
    console.log(`  Content-Length: ${contentLength} bytes (expected: > 1000)`);

    if (status !== 200) {
      console.error(`\n✗ FAILED: Status is not 200 (got ${status})`);
      process.exit(1);
    }

    if (!contentType.startsWith('audio/')) {
      console.error(`\n✗ FAILED: Content-Type is not audio/* (got "${contentType}")`);
      process.exit(1);
    }

    if (contentLength <= 1000) {
      console.error(`\n✗ FAILED: Content-Length is too small (got ${contentLength}, expected > 1000)`);
      process.exit(1);
    }

    console.log('\n✓ SUCCESS: All validations passed');
    process.exit(0);
  } catch (error) {
    console.error(`\n✗ ERROR: ${error.message}`);
    process.exit(1);
  }
}

runSmokeTest();
