import { stopOnSignals } from '@facto/adapter-sdk';
import { loadConfig } from './config.js';
import { createDockerAdapter } from './run.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const docker = createDockerAdapter(config, {
    onFatal: (err) => {
      console.error(`stopping: ${err.message}`);
      process.exit(1);
    },
  });
  await docker.start();
  stopOnSignals(docker.adapter);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
