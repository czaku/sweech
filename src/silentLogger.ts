import { scrubSecrets } from './scrubSecrets';

type DebugEnv = Record<string, string | undefined>;
type StderrLike = Pick<NodeJS.WriteStream, 'write'>;

export function logSilent(
  error: unknown,
  context: string,
  env: DebugEnv = process.env,
  stderr: StderrLike = process.stderr,
): void {
  const debug = env.SWEECH_DEBUG;
  if (debug !== '1' && debug !== 'true') return;

  const message = error instanceof Error ? error.message : String(error);
  stderr.write(`[sweech debug] ${context}: ${scrubSecrets(message)}\n`);
}
