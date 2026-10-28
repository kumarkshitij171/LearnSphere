// Serves Monaco's prebuilt AMD bundle from our own origin (/monaco/vs) for the UI-config editor:
// no third-party script on an admin page, works offline, and avoids bundling Monaco's web
// workers through webpack. Runs on postinstall; public/monaco is gitignored.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'monaco-editor', 'min', 'vs');
const target = join(root, 'public', 'monaco', 'vs');

if (!existsSync(source)) {
  console.warn('[copy-monaco] monaco-editor is not installed; the UI-config editor will not load.');
  process.exit(0);
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log('[copy-monaco] copied monaco-editor/min/vs -> public/monaco/vs');
