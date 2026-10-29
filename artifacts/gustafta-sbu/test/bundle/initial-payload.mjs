import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

// Run after `vite build --manifest`. Count the full static dependency graph,
// not just the entry chunk: moving bytes to an eager vendor chunk isn't a win.
const root = resolve(import.meta.dirname, '../../dist/public');
const manifest = JSON.parse(readFileSync(resolve(root, '.vite/manifest.json'), 'utf8'));
const initial = new Set();
function visit(key) {
  assert.ok(manifest[key], `Manifest entry missing: ${key}`);
  if (initial.has(key)) return;
  initial.add(key);
  for (const dependency of manifest[key].imports ?? []) visit(dependency);
}
visit('index.html');

const features = [
  'sbu-simulator-page', 'mini-apps-page', 'sbu-chat-page', 'personnel-page',
  'document-vault-page', 'regulations-page', 'case-workroom', 'help-desk',
];
for (const feature of features) {
  const key = `src/components/${feature}.tsx`;
  assert.ok(manifest[key]?.isDynamicEntry, `${feature} must remain on demand`);
  assert.ok(!initial.has(key), `${feature} must not enter the initial graph`);
}
const files = [...initial].map(key => {
  const file = manifest[key].file;
  const buffer = readFileSync(resolve(root, file));
  return { file, bytes: buffer.length, gzip: gzipSync(buffer).length };
});
const bytes = files.reduce((total, file) => total + file.bytes, 0);
const gzip = files.reduce((total, file) => total + file.gzip, 0);
// The measured pre-split graph was 951,544 bytes / 263,484 gzip.
assert.ok(bytes < 570926, `Initial JS exceeds the 60% baseline budget: ${bytes}`);
assert.ok(gzip < 158090, `Initial gzip JS exceeds the 60% baseline budget: ${gzip}`);
console.log(JSON.stringify({ files, bytes, gzip, deferredFeatures: features }, null, 2));
