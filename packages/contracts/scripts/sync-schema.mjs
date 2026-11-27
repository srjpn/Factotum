import { URL } from 'node:url';
// Copies the canonical adapter manifest schema (schemas/ at the repo root) next to the
// source so it can be imported and bundled into dist. The copy is gitignored.
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../../../schemas/adapter-manifest.schema.json', import.meta.url));
const to = fileURLToPath(new URL('../src/adapter-manifest.schema.json', import.meta.url));
copyFileSync(from, to);
