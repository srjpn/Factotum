import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

export const AgentStateSchema = z.object({
  apiUrl: z.string(),
  nodeId: z.string(),
  nodeName: z.string(),
  credential: z.string().min(1),
});
export type AgentState = z.infer<typeof AgentStateSchema>;

export async function readState(file: string): Promise<AgentState | null> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  return AgentStateSchema.parse(JSON.parse(raw));
}

// The file holds the node credential: written with mode 0600 via a temp file and rename.
export async function writeState(file: string, state: AgentState): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, file);
}
