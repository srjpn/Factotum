import { stopOnSignals } from '@facto/adapter-sdk';
import { loadConfig } from './config.js';
import { createDevServersAdapter } from './run.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const tm = createDevServersAdapter(config, {
    onFatal: (err) => {
      console.error(`stopping: ${err.message}`);
      process.exit(1);
    },
  });
  await tm.start();
  stopOnSignals(tm.adapter);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
