import { stopOnSignals } from '@facto/adapter-sdk';
import { loadConfig } from './config.js';
import { createClaudeAdapter } from './run.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const claude = createClaudeAdapter(config, {
    onFatal: (err) => {
      console.error(`stopping: ${err.message}`);
      process.exit(1);
    },
  });
  await claude.start();
  stopOnSignals(claude.adapter);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
