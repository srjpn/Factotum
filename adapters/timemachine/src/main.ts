import { stopOnSignals } from '@facto/adapter-sdk';
import { loadConfig } from './config.js';
import { createTimeMachineAdapter } from './run.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const tm = createTimeMachineAdapter(config, {
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
