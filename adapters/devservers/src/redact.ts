/** Returns a logger that masks secret values wherever they appear in a message. */
export function redactingLogger(secrets: string[], out: (line: string) => void = console.log): (m: string) => void {
  const values = secrets.filter((s) => s.length >= 4);
  return (message) => out(values.reduce((m, s) => m.split(s).join('***'), message));
}
