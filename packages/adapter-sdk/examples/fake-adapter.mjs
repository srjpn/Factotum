// Minimal adapter: registers once, reports health, and syncs two fake tasks.
// Run it as described in docs/runbooks/adapter-sdk.md. Copy this file as the start of a real adapter.
import { FactoAdapter, stopOnSignals } from '../dist/index.js';

const adapter = new FactoAdapter({
  apiUrl: process.env.FACTO_API_URL, // no default: the caller must say where the core is
  stateFile: process.env.FACTO_ADAPTER_STATE_FILE ?? './fake-adapter.state.json', // holds the service token (mode 0600)
  // First registration only: FACTO_ADMIN_TOKEN is read from the environment. Later runs use the stored token.
  privacyClass: 'personal',
  healthIntervalMs: 30_000,
  healthCheck: async () => ({ status: 'up', detail: 'fake tool is fine' }),
  onFatal: (err) => {
    console.error(`stopping: ${err.message}`);
    process.exit(1);
  },
  manifest: {
    name: 'fake',
    version: '0.1.0',
    domain: 'workflows',
    tier: 'observe',
    reports: ['task'],
    health: '/healthz',
  },
});

await adapter.start();
stopOnSignals(adapter);

const result = await adapter.syncInventory('task', [
  { externalId: 'fake-1', title: 'Write the report', status: 'in-progress', statusLabel: 'Doing', source: 'fake', project: 'demo' },
  { externalId: 'fake-2', title: 'Book the dentist', status: 'todo', statusLabel: 'To do', source: 'fake' },
]);
console.log('synced tasks:', result);

if (process.env.FACTO_EXAMPLE_ONCE) await adapter.stop(); // for scripted runs; otherwise keep reporting health
