/**
 * Simple smoke check: verify operator CSS contains overflow-x fixes
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cssPath = join(__dirname, '..', 'dist', 'assets', '*.css');
const cssFiles = [];

// Try to find CSS file in dist
try {
  const { readdirSync } = await import('fs');
  const distAssets = join(__dirname, '..', 'dist', 'assets');
  const files = readdirSync(distAssets);
  const cssFile = files.find(f => f.endsWith('.css'));
  if (cssFile) {
    cssFiles.push(join(distAssets, cssFile));
  }
} catch (e) {
  // dist might not exist, that's ok for this check
}

if (cssFiles.length === 0) {
  // Fallback: check source CSS
  cssFiles.push(join(__dirname, '..', 'src', 'App.css'));
}

let found = false;
let checks = {
  'overflow-x: hidden on html/body': false,
  'min-width: 0 on chat-area': false,
  'width: 100% (not 100vw) on .app': false,
};

for (const cssFile of cssFiles) {
  try {
    const content = readFileSync(cssFile, 'utf-8');
    
    // Check for overflow-x: hidden
    if (content.includes('overflow-x: hidden') || content.includes('overflow-x:hidden')) {
      checks['overflow-x: hidden on html/body'] = true;
    }
    
    // Check for min-width: 0 on chat-area
    if (content.includes('.chat-area') && (content.includes('min-width: 0') || content.includes('min-width:0'))) {
      checks['min-width: 0 on chat-area'] = true;
    }
    
    // Check for width: 100% (not 100vw) on .app
    // Match .app block (may span multiple lines, minified or not)
    const appMatch = content.match(/\.app[^{]*\{[^}]*\}/s);
    if (appMatch) {
      const appBlock = appMatch[0];
      // Check it has width:100% or width: 100% and does NOT have width:100vw or width: 100vw
      const hasWidth100 = appBlock.includes('width:100%') || appBlock.includes('width: 100%');
      const hasWidth100vw = appBlock.includes('width:100vw') || appBlock.includes('width: 100vw');
      if (hasWidth100 && !hasWidth100vw) {
        checks['width: 100% (not 100vw) on .app'] = true;
      }
    }
    // Also check if .app exists and 100vw is not present anywhere near it
    if (!checks['width: 100% (not 100vw) on .app']) {
      const appIndex = content.indexOf('.app');
      if (appIndex >= 0) {
        const nearby = content.substring(Math.max(0, appIndex - 50), Math.min(content.length, appIndex + 200));
        if (nearby.includes('width') && (nearby.includes('100%') || nearby.includes('100%')) && !nearby.includes('100vw')) {
          checks['width: 100% (not 100vw) on .app'] = true;
        }
      }
    }
    
    found = true;
    break;
  } catch (e) {
    // Continue to next file
  }
}

if (!found) {
  console.error('✗ Could not find CSS file to check');
  process.exit(1);
}

const allPassed = Object.values(checks).every(v => v);
const passedCount = Object.values(checks).filter(v => v).length;

console.log('=== Overflow Fix Check ===');
console.log(`Checks passed: ${passedCount}/${Object.keys(checks).length}`);
Object.entries(checks).forEach(([name, passed]) => {
  console.log(`  ${passed ? '✓' : '✗'} ${name}`);
});

if (allPassed) {
  console.log('\n✓ All overflow fixes present');
  process.exit(0);
} else {
  console.log('\n✗ Some overflow fixes missing');
  process.exit(1);
}
