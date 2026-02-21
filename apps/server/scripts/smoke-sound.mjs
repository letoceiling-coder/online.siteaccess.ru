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
    const response = await fetch(`${API_URL}/sounds/new-message.mp3`, {
      method: 'HEAD',
    });

    console.log(`\nResponse status: ${response.status}`);
    console.log(`Response headers:`);
    response.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });

    if (response.ok) {
      console.log('\n✓ SUCCESS: Sound file is accessible');
      process.exit(0);
    } else {
      console.error(`\n✗ FAILED: Sound file returned status ${response.status}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n✗ ERROR: ${error.message}`);
    process.exit(1);
  }
}

runSmokeTest();
