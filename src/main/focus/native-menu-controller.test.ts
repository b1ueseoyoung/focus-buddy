import {expect, test} from 'bun:test';
import {EventEmitter} from 'node:events';
import type {ChildProcessWithoutNullStreams} from 'node:child_process';
import {createNativeMenuController} from './native-menu-controller';

class FakeStdin extends EventEmitter {
  writable = true;
  readonly writes: string[] = [];
  endCalls = 0;

  write(value: string): boolean {
    this.writes.push(value);
    return true;
  }

  end(value?: string): this {
    if (value !== undefined) this.write(value);
    this.endCalls += 1;
    this.writable = false;
    return this;
  }

  messages(): unknown[] {
    return this.writes.map(line => JSON.parse(line));
  }
}

class FakeChild extends EventEmitter {
  readonly stdin = new FakeStdin();
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();

  process(): ChildProcessWithoutNullStreams {
    return this as unknown as ChildProcessWithoutNullStreams;
  }
}

interface ScheduledRetry {
  callback(): void;
  delayMs: number;
  cancelled: boolean;
  ran: boolean;
}

interface Connection {
  child: FakeChild;
  isCurrent(): boolean;
  cleanups: number;
}

function harness(outcomes: Array<FakeChild | Error> = [new FakeChild(), new FakeChild()]) {
  const retries: ScheduledRetry[] = [];
  const connections: Connection[] = [];
  const errors: Error[] = [];
  let launches = 0;
  let unavailable = 0;
  const controller = createNativeMenuController({
    launch() {
      const outcome = outcomes[launches++];
      if (outcome instanceof Error) throw outcome;
      if (!outcome) throw new Error('Unexpected extra helper launch');
      return outcome.process();
    },
    connect(child, isCurrent) {
      const connection: Connection = {child: child as unknown as FakeChild, isCurrent, cleanups: 0};
      connections.push(connection);
      return () => { connection.cleanups += 1; };
    },
    onUnavailable() { unavailable += 1; },
    onError(error) { errors.push(error); },
    schedule(callback, delayMs) {
      const retry: ScheduledRetry = {callback, delayMs, cancelled: false, ran: false};
      retries.push(retry);
      return () => { retry.cancelled = true; };
    },
  });
  const pending = () => retries.filter(retry => !retry.cancelled && !retry.ran);
  const runRetry = () => {
    const scheduled = pending();
    expect(scheduled).toHaveLength(1);
    const retry = scheduled[0];
    retry.ran = true;
    retry.callback();
  };
  return {controller, retries, connections, errors, pending, runRetry,
    launches: () => launches, unavailable: () => unavailable};
}

test('a launch error followed by close, without exit, retires once and retries after one second', () => {
  const first = new FakeChild();
  const replacement = new FakeChild();
  const h = harness([first, replacement]);
  expect(h.launches()).toBe(0);
  h.controller.start();
  const error = new Error('ENOENT');
  first.emit('error', error);
  first.emit('close', -2, null);

  expect(h.errors).toEqual([error]);
  expect(h.unavailable()).toBe(1);
  expect(h.pending()).toHaveLength(1);
  expect(h.pending()[0].delayMs).toBe(1000);
  expect(h.connections[0].isCurrent()).toBe(false);
  expect(h.connections[0].cleanups).toBe(1);
  expect(first.stdin.endCalls).toBe(1);
  h.runRetry();
  expect(h.launches()).toBe(2);
  expect(h.connections[1].isCurrent()).toBe(true);
  h.controller.stop();
});

test('exit followed by close schedules one retry and cleans up the connection once', () => {
  const first = new FakeChild();
  const h = harness([first, new FakeChild()]);
  h.controller.start();
  first.emit('exit', 1, null);
  first.emit('close', 1, null);

  expect(h.unavailable()).toBe(1);
  expect(h.pending()).toHaveLength(1);
  expect(h.connections[0].cleanups).toBe(1);
  expect(first.stdin.endCalls).toBe(1);
  h.runRetry();
  expect(h.launches()).toBe(2);
  h.controller.stop();
});

test('a replacement receives only the latest stored state from backoff, not one-shot commands', () => {
  const first = new FakeChild();
  const replacement = new FakeChild();
  const h = harness([first, replacement]);
  const initial = {type: 'update', title: '25:00'};
  const latest = {type: 'update', title: '24:58'};
  h.controller.update(initial);
  h.controller.start();
  expect(first.stdin.messages()).toEqual([initial]);
  h.controller.send({type: 'testAction', id: 2});
  first.emit('exit', 1, null);
  h.controller.update({type: 'update', title: '24:59'});
  h.controller.update(latest);
  h.controller.send({type: 'testAction', id: 3});
  h.runRetry();

  expect(first.stdin.messages()).toEqual([initial, {type: 'testAction', id: 2}]);
  expect(replacement.stdin.messages()).toEqual([latest]);
  h.controller.stop();
});

test('retired child events and its current predicate cannot invalidate the replacement', () => {
  const first = new FakeChild();
  const replacement = new FakeChild();
  const h = harness([first, replacement]);
  h.controller.start();
  const oldConnection = h.connections[0];
  first.emit('exit', 1, null);
  h.runRetry();
  const currentConnection = h.connections[1];
  first.emit('error', new Error('late old-child error'));
  first.emit('close', 1, null);
  first.emit('exit', 1, null);

  expect(oldConnection.isCurrent()).toBe(false);
  expect(currentConnection.isCurrent()).toBe(true);
  expect(h.unavailable()).toBe(1);
  expect(h.pending()).toHaveLength(0);
  expect(oldConnection.cleanups).toBe(1);
  expect(currentConnection.cleanups).toBe(0);
  h.controller.update({type: 'update', title: '24:57'});
  expect(replacement.stdin.messages()).toEqual([{type: 'update', title: '24:57'}]);
  h.controller.stop();
});

test('stop sends quit and ends only the owned current child once, ignoring late failures', () => {
  const first = new FakeChild();
  const replacement = new FakeChild();
  const h = harness([first, replacement]);
  h.controller.start();
  first.emit('exit', 1, null);
  h.runRetry();
  h.controller.stop();
  h.controller.stop();
  replacement.emit('error', new Error('late shutdown error'));
  replacement.emit('exit', 0, null);
  replacement.emit('close', 0, null);
  h.controller.update({type: 'update', title: 'after quit'});
  h.controller.send({type: 'testAction', id: 1});
  h.controller.start();

  expect(first.stdin.messages()).toEqual([]);
  expect(first.stdin.endCalls).toBe(1);
  expect(replacement.stdin.messages()).toEqual([{type: 'quit'}]);
  expect(replacement.stdin.endCalls).toBe(1);
  expect(h.connections.map(connection => connection.cleanups)).toEqual([1, 1]);
  expect(h.connections.every(connection => !connection.isCurrent())).toBe(true);
  expect(h.unavailable()).toBe(1);
  expect(h.pending()).toHaveLength(0);
  expect(h.launches()).toBe(2);
});

test('stop cancels a pending retry and a late scheduler callback cannot launch another child', () => {
  const first = new FakeChild();
  const h = harness([first, new FakeChild()]);
  h.controller.start();
  first.emit('error', new Error('EACCES'));
  const retry = h.pending()[0];
  h.controller.stop();
  expect(retry.cancelled).toBe(true);
  retry.callback();
  first.emit('close', -1, null);

  expect(h.pending()).toHaveLength(0);
  expect(h.launches()).toBe(1);
  expect(h.unavailable()).toBe(1);
  expect(first.stdin.endCalls).toBe(1);
  expect(h.connections[0].cleanups).toBe(1);
});

test('a synchronous launch exception reports unavailable and replays latest state after retry', () => {
  const error = new Error('launch threw');
  const replacement = new FakeChild();
  const h = harness([error, replacement]);
  const latest = {type: 'update', title: '25:00'};
  h.controller.update(latest);
  expect(() => h.controller.start()).not.toThrow();

  expect(h.errors).toEqual([error]);
  expect(h.unavailable()).toBe(1);
  expect(h.connections).toHaveLength(0);
  expect(h.pending()).toHaveLength(1);
  expect(h.pending()[0].delayMs).toBe(1000);
  h.runRetry();
  expect(replacement.stdin.messages()).toEqual([latest]);
  expect(h.connections[0].isCurrent()).toBe(true);
  h.controller.stop();
});
