// Runs tests/tours/*.test.ts: bundles each with esbuild (already a Vite dependency) into a
// temp dir and executes them with Node's built-in test runner. No extra test framework.
//   npm run test:tours
import { build } from 'esbuild';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'tests', 'tours');
const out = mkdtempSync(join(tmpdir(), 'tour-tests-'));
const files = readdirSync(dir).filter((f) => f.endsWith('.test.ts'));
await build({
  entryPoints: files.map((f) => join(dir, f)),
  outdir: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
});
const r = spawnSync(process.execPath, ['--test', ...files.map((f) => join(out, f.replace(/\.ts$/, '.mjs')))], { stdio: 'inherit' });
process.exit(r.status ?? 1);
