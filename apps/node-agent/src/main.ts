import { runAgent, type Logger } from './agent.js';
import { loadConfig } from './config.js';
import { collectTailscale, createCollector } from './metrics.js';

const debugOn = process.env.FACTO_LOG_LEVEL === 'debug';
const stamp = () => new Date().toISOString();
const log: Logger = {
  debug: (m) => debugOn && console.debug(`${stamp()} DEBUG ${m}`),
  info: (m) => console.log(`${stamp()} INFO ${m}`),
  warn: (m) => console.warn(`${stamp()} WARN ${m}`),
  error: (m) => console.error(`${stamp()} ERROR ${m}`),
};

async function main(): Promise<number> {
  const config = loadConfig();
  const abort = new AbortController();
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      log.info(`received ${sig}, stopping`);
      abort.abort();
    });
  }
  const collector = createCollector();
  const result = await runAgent({ config, log, collect: () => collector.collect(), collectTailscale }, abort.signal);
  return result === 'revoked' ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  },
);
