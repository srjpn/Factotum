import { stopOnSignals } from '@facto/adapter-sdk';
import { loadConfig } from './config.js';
import { createTrelloAdapter } from './run.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const trello = createTrelloAdapter(config, {
    onFatal: (err) => {
      console.error(`stopping: ${err.message}`);
      process.exit(1);
    },
  });
  await trello.start();
  stopOnSignals(trello.adapter);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
