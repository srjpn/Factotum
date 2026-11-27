import { EnrolResponseSchema, HeartbeatSchema, type Heartbeat } from '@facto/contracts';
import { backoffDelay } from './backoff.js';
import type { AgentConfig } from './config.js';
import { readState, writeState, type AgentState } from './state.js';

export type Logger = {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
};

export type AgentDeps = {
  config: AgentConfig;
  collect: () => Promise<Heartbeat>;
  collectTailscale?: () => Promise<unknown>;
  log: Logger;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
  fetchFn?: typeof fetch;
};

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}

export type RunResult = 'stopped' | 'revoked';

// Returns on shutdown ('stopped') or when the control plane rejects the credential ('revoked').
export async function runAgent(deps: AgentDeps, signal: AbortSignal): Promise<RunResult> {
  const { config, log } = deps;
  const sleep = deps.sleep ?? abortableSleep;
  const doFetch = deps.fetchFn ?? fetch;

  let state = await readState(config.stateFile);
  if (state && state.apiUrl !== config.apiUrl) {
    log.warn(`stored credential was issued for ${state.apiUrl}, not ${config.apiUrl}; using it anyway`);
  }

  let attempt = 0;
  const failed = async (why: string) => {
    attempt += 1;
    const delay = backoffDelay(attempt, deps.random);
    log.warn(`${why}; retrying in ${Math.round(delay / 1000)}s (attempt ${attempt})`);
    await sleep(delay, signal);
  };

  // Enrol once. The token is only needed here.
  while (!state && !signal.aborted) {
    if (!config.enrolmentToken) {
      throw new Error('no stored credential and FACTO_ENROLMENT_TOKEN is not set');
    }
    try {
      const res = await doFetch(`${config.apiUrl}/nodes/enrol`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: config.enrolmentToken }),
        signal,
      });
      if (res.status === 200 || res.status === 201) {
        const body = EnrolResponseSchema.parse(await res.json());
        state = { apiUrl: config.apiUrl, nodeId: body.nodeId, nodeName: body.nodeName, credential: body.credential };
        await writeState(config.stateFile, state);
        log.info(`enrolled as node "${body.nodeName}" (${body.nodeId}); credential saved to ${config.stateFile}`);
        attempt = 0;
      } else if (res.status >= 400 && res.status < 500) {
        throw new Error(`enrolment rejected with HTTP ${res.status}; the token is invalid, used or expired`);
      } else {
        await failed(`enrolment failed with HTTP ${res.status}`);
      }
    } catch (err) {
      if (signal.aborted) break;
      if (err instanceof TypeError) await failed(`control plane unreachable (${(err.cause as Error | undefined)?.message ?? err.message})`);
      else throw err;
    }
  }
  if (!state) return 'stopped';

  return heartbeatLoop(deps, state, signal, sleep, doFetch);
}

async function heartbeatLoop(
  deps: AgentDeps,
  state: AgentState,
  signal: AbortSignal,
  sleep: (ms: number, signal: AbortSignal) => Promise<void>,
  doFetch: typeof fetch,
): Promise<RunResult> {
  const { config, log } = deps;
  let attempt = 0;
  log.info(`sending heartbeats to ${config.apiUrl} every ${config.heartbeatIntervalMs / 1000}s`);

  while (!signal.aborted) {
    let delay = config.heartbeatIntervalMs;
    try {
      const body = HeartbeatSchema.parse(await deps.collect());
      const ts = await deps.collectTailscale?.().catch(() => null);
      if (ts) log.debug(`tailscale: ${JSON.stringify(ts)}`);
      const res = await doFetch(`${config.apiUrl}/nodes/heartbeat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${state.credential}` },
        body: JSON.stringify(body),
        signal,
      });
      if (res.status === 401) {
        log.error('control plane rejected the credential (revoked or unknown); stopping. Enrol again with a new token.');
        return 'revoked';
      }
      if (res.status === 204 || res.ok) {
        if (attempt > 0) log.info('control plane reachable again');
        attempt = 0;
        log.debug('heartbeat sent');
      } else {
        attempt += 1;
        delay = backoffDelay(attempt, deps.random);
        log.warn(`heartbeat failed with HTTP ${res.status}; retrying in ${Math.round(delay / 1000)}s`);
      }
    } catch (err) {
      if (signal.aborted) break;
      attempt += 1;
      delay = backoffDelay(attempt, deps.random);
      const reason = (err as Error).cause ? ((err as Error).cause as Error).message : (err as Error).message;
      log.warn(`heartbeat error (${reason}); retrying in ${Math.round(delay / 1000)}s (attempt ${attempt})`);
    }
    await sleep(delay, signal);
  }
  return 'stopped';
}
