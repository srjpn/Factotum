import { stopOnSignals } from '@facto/adapter-sdk';
import { loadConfig } from './config.js';
import { createPaniAdapter } from './run.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const pani = createPaniAdapter(config, {
    onFatal: (err) => {
      console.error(`stopping: ${err.message}`);
      process.exit(1);
    },
  });
  await pani.start();
  stopOnSignals(pani.adapter);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
