import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

const StateSchema = z.object({ token: z.string().min(1) });

/** Reads the stored service token, or undefined if there is none yet. */
export async function loadToken(stateFile: string): Promise<string | undefined> {
  let text: string;
  try {
    text = await readFile(stateFile, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  return StateSchema.parse(JSON.parse(text)).token;
}

/** Stores the service token with owner-only permissions. The token is never logged. */
export async function saveToken(stateFile: string, token: string): Promise<void> {
  await mkdir(dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify({ token }), { mode: 0o600 });
  await chmod(stateFile, 0o600); // writeFile's mode only applies when the file is created
}
