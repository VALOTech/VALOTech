/**
 * Next.js runs `register` once, at startup, before the server listens. Reading
 * the configuration here is what makes a missing or invalid required variable
 * stop the process at deploy — where an operator sees it — rather than on the
 * first request, where an investor would (CRED-001/T2).
 *
 * The check runs only in the Node.js runtime: the configuration reads
 * `process.env`, which the edge runtime does not carry, and the credentials it
 * validates are never needed there.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    return;
  }
  const { getConfig } = await import('./config/index');
  getConfig();
}
