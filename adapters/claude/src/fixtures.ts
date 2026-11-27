/** Synthetic transcript lines for tests. Contains deliberate "secret" markers to prove they never leave the parser. */
export const SECRET = 'TOP-SECRET-PROMPT-TEXT';
export const SECRET_PATH = '/Users/someone/client-acme/secret.ts';

export const assistant = (ts: string, model: string, u: [number, number, number, number], extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    type: 'assistant', timestamp: ts, sessionId: 'sess', cwd: SECRET_PATH, isSidechain: false,
    message: {
      id: 'msg_1', model, role: 'assistant',
      content: [{ type: 'text', text: SECRET }, { type: 'tool_use', input: { file_path: SECRET_PATH } }],
      usage: { input_tokens: u[0], output_tokens: u[1], cache_creation_input_tokens: u[2], cache_read_input_tokens: u[3] },
    },
    ...extra,
  });

export const user = (ts: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ type: 'user', timestamp: ts, cwd: SECRET_PATH, message: { role: 'user', content: SECRET }, ...extra });

export const QUESTION = 'WHICH-SECRET-OPTION-SHOULD-WE-PICK';

/** An assistant line whose only block is a tool_use (a question or plan approval for the owner). */
export const toolUse = (ts: string, name: string, id: string): string =>
  JSON.stringify({
    type: 'assistant', timestamp: ts, message: { model: 'm', content: [{ type: 'tool_use', id, name, input: { questions: [{ question: QUESTION, options: [{ label: SECRET }] }] } }], usage: { input_tokens: 1, output_tokens: 1 } },
  });

/** A user line carrying the answer to a tool_use. */
export const toolResult = (ts: string, id: string): string =>
  JSON.stringify({ type: 'user', timestamp: ts, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: SECRET }] } });
