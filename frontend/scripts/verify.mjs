// Manual verification script for frontend behaviors.
// Run with: node scripts/verify.mjs
// This documents reproducible manual checks for the brief's verification checklist.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}`);
    failed++;
  }
}

function readFile(relativePath) {
  return readFileSync(join(root, relativePath), 'utf-8');
}

console.log('=== Frontend Verification Checks ===\n');

// 1. FormData field names
console.log('1. FormData field names');
const clientTs = readFile('src/api/client.ts');
check('Uses "image" field name', clientTs.includes("formData.append('image', image)"));
check('Uses "metadata" field name', clientTs.includes("formData.append('metadata', JSON.stringify(metadata))"));

// 2. No manually set multipart boundary
console.log('\n2. No manually set multipart boundary');
check('No Content-Type header on FormData', !clientTs.includes("Content-Type: 'multipart/form-data'"));
check('No manual boundary setting', !clientTs.includes('boundary'));

// 3. Job polling termination
console.log('\n3. Job polling termination');
const useCropAppTs = readFile('src/hooks/useCropApp.ts');
check('stopPolling on completed status', useCropAppTs.includes("if (jobData.status === 'completed'"));
check('stopPolling on failed status', useCropAppTs.includes("if (jobData.status === 'failed'"));
check('stopPolling on unmount', useCropAppTs.includes('return () => {'));

// 4. Selection race protection
console.log('\n4. Selection race protection');
check('Uses zoneRequestIdRef', useCropAppTs.includes('zoneRequestIdRef'));
check('Uses observationRequestIdRef', useCropAppTs.includes('observationRequestIdRef'));
check('Checks requestId before setState', useCropAppTs.includes('requestId !== zoneRequestIdRef.current'));

// 5. No duplicate POST on rerender
console.log('\n5. No duplicate POST on rerender');
check('Uses jobCache', useCropAppTs.includes('jobCache'));
check('Checks cache before POST', useCropAppTs.includes('const cachedJobId = jobCache.get(id)'));

// 6. Error envelope handling
console.log('\n6. Error envelope handling');
check('Parses error envelope', clientTs.includes('isErrorEnvelope'));
check('Extracts code from envelope', clientTs.includes('data.error.code'));
check('Extracts message from envelope', clientTs.includes('data.error.message'));
check('Handles NETWORK_ERROR', clientTs.includes('NETWORK_ERROR'));
check('Handles TIMEOUT', clientTs.includes('TIMEOUT'));
check('Handles INVALID_RESPONSE', clientTs.includes('INVALID_RESPONSE'));

// 7. Unavailable Ollama
console.log('\n7. Unavailable Ollama');
const chatPanelTs = readFile('src/chat/ChatPanel.tsx');
check('Displays limitations separately', chatPanelTs.includes('msg.limitations'));
check('Does not fabricate answers', !chatPanelTs.includes('cannedResponse'));

// 8. Evidence navigation
console.log('\n8. Evidence navigation');
check('Has onOpenEvidence prop', chatPanelTs.includes('onOpenEvidence'));
check('Evidence chips are buttons', chatPanelTs.includes('chat-panel__evidence-chip'));

// 9. Fixture mode safety
console.log('\n9. Fixture mode safety');
const viteConfig = readFile('vite.config.ts');
check('Rejects fixture production builds', viteConfig.includes('VITE_DATA_MODE=fixture'));
const fixturesTransport = readFile('src/fixtures/transport.ts');
check('Fixture mode is build-time constant', fixturesTransport.includes('import.meta.env.VITE_DATA_MODE'));

// 10. AbortController usage
console.log('\n10. AbortController usage');
check('Uses AbortController for timeouts', clientTs.includes('AbortController'));
check('Chat has 120s timeout', clientTs.includes('CHAT_TIMEOUT_MS = 120_000'));
check('Default 30s timeout', clientTs.includes('DEFAULT_TIMEOUT_MS = 30_000'));

// 11. No dangerous innerHTML
console.log('\n11. No dangerous innerHTML');
check('No dangerouslySetInnerHTML', !chatPanelTs.includes('dangerouslySetInnerHTML'));
check('No dangerouslySetInnerHTML in App', !readFile('src/App.tsx').includes('dangerouslySetInnerHTML'));

// 12. Dev proxy configuration
console.log('\n12. Dev proxy configuration');
check('Proxy /api to 127.0.0.1:8000', viteConfig.includes("target: 'http://127.0.0.1:8000'"));

// 13. Build output
console.log('\n13. Build output');
check('Build outputs to dist', viteConfig.includes("outDir: 'dist'"));

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
