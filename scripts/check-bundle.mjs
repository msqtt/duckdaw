import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const assetsDir = path.resolve('dist/assets');
const files = await readdir(assetsDir);
const budgets = [
  { pattern: /^DAWApp-.*\.js$/, maxBytes: 400 * 1024 },
  { pattern: /^vendor-tone-.*\.js$/, maxBytes: 300 * 1024 },
  { pattern: /^vendor-react-.*\.js$/, maxBytes: 220 * 1024 },
  { pattern: /^ExportModal-.*\.js$/, maxBytes: 40 * 1024 },
  { pattern: /^daw-domain-.*\.js$/, maxBytes: 40 * 1024 },
];

const errors = [];
for (const budget of budgets) {
  const match = files.find(file => budget.pattern.test(file));
  if (!match) {
    errors.push(`Missing expected bundle: ${budget.pattern}`);
    continue;
  }
  const bytes = (await stat(path.join(assetsDir, match))).size;
  console.log(`${match}: ${(bytes / 1024).toFixed(2)} KiB / ${(budget.maxBytes / 1024).toFixed(0)} KiB`);
  if (bytes > budget.maxBytes) errors.push(`${match} exceeds its bundle budget`);
}
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
