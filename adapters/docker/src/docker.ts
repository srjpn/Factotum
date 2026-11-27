import { request } from 'node:http';

/** The only fields of the Engine API's container list that this adapter reads. Env, mounts, commands and logs are never requested or kept. */
export interface RawContainer {
  Id?: unknown;
  Names?: unknown;
  Image?: unknown;
  State?: unknown;
  Status?: unknown;
  Ports?: unknown;
  Labels?: unknown;
}

export class DockerUnreachableError extends Error {}

/**
 * Read-only client for the local Docker Engine API over a unix socket. It issues a single GET
 * (`/containers/json?all=1`) and nothing else: no start, stop, restart or exec.
 */
export class DockerClient {
  constructor(
    private readonly socketPath: string,
    private readonly timeoutMs = 10_000,
  ) {}

  listContainers(): Promise<RawContainer[]> {
    return new Promise((resolve, reject) => {
      const req = request({ socketPath: this.socketPath, path: '/containers/json?all=1', method: 'GET', headers: { host: 'docker' }, timeout: this.timeoutMs }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode !== 200) return reject(new DockerUnreachableError(`Docker returned HTTP ${res.statusCode}`));
          try {
            const json: unknown = JSON.parse(text);
            if (!Array.isArray(json)) throw new Error('not a list');
            resolve(json as RawContainer[]);
          } catch {
            reject(new DockerUnreachableError('Docker returned an unreadable container list'));
          }
        });
      });
      req.on('timeout', () => req.destroy(new Error('timed out')));
      req.on('error', (err: NodeJS.ErrnoException) =>
        reject(new DockerUnreachableError(`cannot reach Docker at ${this.socketPath} (${err.code ?? err.message})`)),
      );
      req.end();
    });
  }
}
