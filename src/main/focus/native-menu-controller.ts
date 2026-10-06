import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export interface NativeMenuControllerDeps {
  launch(): ChildProcessWithoutNullStreams;
  connect(child: ChildProcessWithoutNullStreams, isCurrent: () => boolean): () => void;
  onUnavailable(): void;
  onError(error: Error): void;
  schedule(callback: () => void, delayMs: number): () => void;
}

interface Session {
  child: ChildProcessWithoutNullStreams;
  retired: boolean;
  disconnect: () => void;
}

export function createNativeMenuController(deps: NativeMenuControllerDeps) {
  let current: Session | null = null;
  let cancelRetry: (() => void) | undefined;
  let stopped = false;
  let latest: unknown;

  const report = (error: unknown): void => {
    deps.onError(error instanceof Error ? error : new Error(String(error)));
  };
  const write = (session: Session, message: unknown): void => {
    try {
      if (session.child.stdin.writable)
        session.child.stdin.write(JSON.stringify(message) + '\n');
    } catch (error) {
      report(error);
    }
  };
  const recover = (): void => {
    if (stopped) return;
    if (!cancelRetry) {
      cancelRetry = deps.schedule(() => {
        cancelRetry = undefined;
        start();
      }, 1000);
    }
    deps.onUnavailable();
  };
  const retire = (session: Session, error?: unknown): void => {
    if (session.retired) return;
    session.retired = true;
    const wasCurrent = current === session;
    if (wasCurrent) current = null;
    session.disconnect();
    try { session.child.stdin.end(); } catch (endError) { report(endError); }
    if (error !== undefined) report(error);
    if (wasCurrent) recover();
  };

  function start(): void {
    if (stopped || current || cancelRetry) return;
    let child: ChildProcessWithoutNullStreams;
    try {
      child = deps.launch();
    } catch (error) {
      report(error);
      recover();
      return;
    }
    const session: Session = { child, retired: false, disconnect: () => {} };
    current = session;
    child.on('error', (error) => retire(session, error));
    child.on('exit', () => retire(session));
    child.on('close', () => retire(session));
    // An ended or failed pipe can report EPIPE after its session was retired.
    child.stdin.on('error', () => {});
    try {
      const disconnect = deps.connect(child, () => !stopped && !session.retired && current === session);
      if (session.retired) disconnect();
      else session.disconnect = disconnect;
    } catch (error) {
      retire(session, error);
      return;
    }
    if (!session.retired && latest !== undefined) write(session, latest);
  }

  return {
    start,
    update(message: unknown): void {
      latest = message;
      if (!stopped && current) write(current, message);
    },
    send(message: unknown): void {
      if (!stopped && current) write(current, message);
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      cancelRetry?.();
      cancelRetry = undefined;
      if (current) {
        const session = current;
        write(session, { type: 'quit' });
        retire(session);
      }
    },
  };
}
