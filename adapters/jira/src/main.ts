import { stopOnSignals } from '@facto/adapter-sdk';
import { loadConfig } from './config.js';
import { createJiraAdapter } from './run.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const jira = createJiraAdapter(config, {
    onFatal: (err) => {
      console.error(`stopping: ${err.message}`);
      process.exit(1);
    },
  });
  await jira.start();
  stopOnSignals(jira.adapter);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
