import {expect, test} from 'bun:test';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {Script} from 'node:vm';
import ts from 'typescript';
import type {FocusTray, FocusTrayDeps} from './tray';
import type {Snapshot} from '../../shared/focus/types';

interface MenuRow {
  id?: string;
  label: string;
  enabled: boolean;
  click(): void;
}

class FakeMenu {
  constructor(readonly items: MenuRow[]) {}
  getMenuItemById(id: string): MenuRow | undefined {
    return this.items.find(item => item.id === id);
  }
}

class FakeImage {
  private readonly scales: number[] = [];
  private template = false;
  addRepresentation(value: {scaleFactor: number}): void { this.scales.push(value.scaleFactor); }
  isEmpty(): boolean { return this.scales.length === 0; }
  getSize() { return {width: 18, height: 18}; }
  getScaleFactors(): number[] { return [...this.scales]; }
  setTemplateImage(value: boolean): void { this.template = value; }
  isTemplateImage(): boolean { return this.template; }
}

function harness(platform: 'darwin' | 'win32' = 'darwin', failDuringStart = false) {
  const trays: FakeTray[] = [];
  class FakeTray extends EventEmitter {
    title = '';
    tooltip = '';
    titleWrites = 0;
    menu: FakeMenu | null = null;
    destroyCalls = 0;
    private destroyed = false;
    constructor(readonly image: FakeImage) { super(); trays.push(this); }
    setTitle(value: string): void { this.title = value; this.titleWrites += 1; }
    setToolTip(value: string): void { this.tooltip = value; }
    setContextMenu(value: FakeMenu): void { this.menu = value; }
    getBounds() { return {x: 10, y: 0, width: 74, height: 24}; }
    isDestroyed(): boolean { return this.destroyed; }
    destroy(): void { this.destroyCalls += 1; this.destroyed = true; }
    popUpContextMenu(): void {}
  }

  const app = new EventEmitter() as EventEmitter & {quit(): void};
  let quitCalls = 0;
  app.quit = () => { quitCalls += 1; app.emit('will-quit'); };
  let onAvailability: ((ready: boolean) => void) | undefined;
  let nativeCreates = 0;
  let helper: Record<string, unknown> = {backend: 'AppKit', ready: false};
  const nativeUpdates: unknown[][] = [];
  const animation = {
    updates: [] as Array<[string, string]>,
    disposeCalls: 0,
    update(status: string, phase: string) { this.updates.push([status, phase]); },
    dispose() { this.disposeCalls += 1; },
    diagnostics: () => ({fixture: 'windows animation'}),
  };
  const animationTrays: FakeTray[] = [];
  const immediates: Array<() => void> = [];
  const modules: Record<string, unknown> = {
    electron: {app, Tray: FakeTray, Menu: {buildFromTemplate: (rows: MenuRow[]) => new FakeMenu(rows)},
      nativeImage: {createEmpty: () => new FakeImage()}},
    'node:fs': {readFileSync: () => Buffer.from('fake icon')},
    'node:path': {dirname, join},
    '../../../resources/tray-icon.png?asset': '/fixture/resources/tray-icon.png',
    '../../../resources/tray-icon@2x.png?asset': '/fixture/resources/tray-icon@2x.png',
    './native-menu': {createNativeMenu(_icon: string, _action: (id: number) => void, availability: (ready: boolean) => void) {
      nativeCreates += 1;
      onAvailability = availability;
      if (failDuringStart) availability(false);
      return {update: (...values: unknown[]) => nativeUpdates.push(values), diagnostics: () => ({...helper}),
        testAction() {}, testOpen() {}};
    }},
    './windows-tray-animation': {createWindowsTrayAnimation(tray: FakeTray) {
      animationTrays.push(tray);
      return animation;
    }},
  };
  const source = readFileSync(new URL('./tray.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  }}).outputText;
  const module = {exports: {}};
  new Script(compiled, {filename: 'tray.ts'}).runInNewContext({
    module, exports: module.exports,
    require(name: string) {
      if (!Object.prototype.hasOwnProperty.call(modules, name)) throw new Error(`Unexpected require: ${name}`);
      return modules[name];
    },
    process: {platform, pid: 123, env: {FOCUS_BUDDY_E2E: '1'}},
    console: {log() {}, error() {}},
    setImmediate(callback: () => void) { immediates.push(callback); },
  });

  let starts = 0;
  let mainShows = 0;
  let widget = false;
  let scale = 1;
  const panels: string[] = [];
  const deps: FocusTrayDeps = {
    showMain: () => { mainShows += 1; }, showMini: () => { widget = true; }, hideMini: () => { widget = false; },
    widgetEnabled: () => widget, openPanel: panel => { panels.push(panel); },
    start: async () => { starts += 1; }, pause: async () => {}, resume: async () => {},
    reset: async () => {}, finish: async () => {}, skip: async () => {},
    scale: () => scale, setScale: value => { scale = value; },
  };
  const exports = module.exports as {createFocusTray(deps: FocusTrayDeps): FocusTray};
  const focus = exports.createFocusTray(deps);
  const availability = (ready: boolean) => {
    if (!onAvailability) throw new Error('No native helper on this platform');
    helper = ready ? {backend: 'AppKit', ready: true, visible: true} : {backend: 'AppKit', ready: false};
    onAvailability(ready);
  };
  return {focus, trays, app, availability, animation, animationTrays, nativeUpdates, panels,
    nativeCreates: () => nativeCreates, starts: () => starts, mainShows: () => mainShows,
    quitCalls: () => quitCalls, runImmediates: () => { for (const callback of immediates.splice(0)) callback(); }};
}

const snapshot = (remainingMs = 1_500_000, status = 'idle', phase: string | null = null): Snapshot =>
  ({remainingMs, status, phase, suggestedNext: null}) as Snapshot;

function controls(tray: {menu: FakeMenu | null}): MenuRow[] {
  expect(tray.menu).not.toBeNull();
  const items = tray.menu!.items;
  for (const label of ['시작', '설정 및 작업명', 'Focus Buddy 종료']) {
    expect(items.find(item => item.label === label)?.enabled).toBe(true);
  }
  return items;
}

test('macOS failure installs the latest title, tooltip, and working controls with an unchanged signature', () => {
  const h = harness();
  h.focus.update(snapshot());
  h.availability(true);
  h.focus.update(snapshot(1_425_000)); // Only the clock changed; the menu signature stayed idle/null/null.
  expect(h.trays).toHaveLength(0);
  h.availability(false);

  expect(h.trays).toHaveLength(1);
  const tray = h.trays[0];
  expect(tray.title).toBe('23:45');
  expect(tray.tooltip).toBe('Focus Buddy · 집중 23:45 · 대기');
  const items = controls(tray);
  expect(items[0].label).toBe('집중 23:45 · 대기');
  items.find(item => item.label === '시작')!.click();
  items.find(item => item.label === '설정 및 작업명')!.click();
  expect(h.starts()).toBe(1);
  expect(h.panels).toEqual(['settings']);
  expect(h.focus.diagnostics()).toMatchObject({backend: 'Electron', ready: true, fallback: true,
    native: {backend: 'AppKit', ready: false}});
  items.find(item => item.label === 'Focus Buddy 종료')!.click();
  expect(h.quitCalls()).toBe(0);
  h.runImmediates();
  expect(h.quitCalls()).toBe(1);
  expect(tray.destroyCalls).toBe(1);
});

test('current-helper readiness destroys one fallback and another failure recreates current controls', () => {
  const h = harness();
  h.focus.update(snapshot());
  h.availability(false);
  h.availability(false);
  expect(h.trays).toHaveLength(1);
  const first = h.trays[0];
  controls(first);
  h.availability(true);
  h.availability(true);
  expect(first.destroyCalls).toBe(1);
  expect(h.focus.diagnostics()).toMatchObject({backend: 'AppKit', ready: true, fallback: false});

  h.availability(false); // No intervening snapshot or signature change.
  expect(h.trays).toHaveLength(2);
  const replacement = h.trays[1];
  expect(replacement).not.toBe(first);
  expect(replacement.title).toBe('25:00');
  expect(replacement.tooltip).toBe('Focus Buddy · 집중 25:00 · 대기');
  controls(replacement);
  expect(h.focus.diagnostics()).toMatchObject({backend: 'Electron', ready: true, fallback: true,
    native: {backend: 'AppKit', ready: false}});
  h.app.emit('will-quit');
  expect(replacement.destroyCalls).toBe(1);
  expect(first.destroyCalls).toBe(1);
});

test('a synchronous startup failure gains its controls when the first snapshot arrives', () => {
  const h = harness('darwin', true);
  expect(h.trays).toHaveLength(1);
  h.focus.update(snapshot());
  expect(h.trays[0].title).toBe('25:00');
  controls(h.trays[0]);
  h.app.emit('will-quit');
});

test('will-quit prevents fallback recreation and double destruction before or after native recovery', () => {
  for (const recovered of [false, true]) {
    const h = harness();
    h.focus.update(snapshot());
    h.availability(false);
    const tray = h.trays[0];
    if (recovered) h.availability(true);
    h.app.emit('will-quit');
    h.app.emit('will-quit');
    h.availability(false);
    h.availability(true);
    h.availability(false);
    expect(h.trays).toHaveLength(1);
    expect(tray.destroyCalls).toBe(1);
  }
});

test('Windows keeps its persistent tray, menu clock, and animation without launching a native helper', () => {
  const h = harness('win32');
  expect(h.nativeCreates()).toBe(0);
  expect(h.trays).toHaveLength(1);
  const tray = h.trays[0];
  expect(h.animationTrays).toEqual([tray]);
  expect(tray.image.isTemplateImage()).toBe(false);
  h.focus.update(snapshot());
  controls(tray);
  h.focus.update(snapshot(90_000, 'running', 'focus'));
  const menu = tray.menu;
  h.focus.update(snapshot(89_000, 'running', 'focus'));
  expect(h.trays).toEqual([tray]);
  expect(tray.menu).toBe(menu);
  expect(tray.menu!.items[0].label).toBe('집중 01:29 · 진행 중');
  expect(tray.tooltip).toBe('Focus Buddy · 집중 01:29 · 진행 중');
  expect(tray.titleWrites).toBe(0);
  expect(h.animation.updates).toEqual([['idle', 'focus'], ['running', 'focus'], ['running', 'focus']]);
  expect(h.focus.diagnostics()).toMatchObject({backend: 'Electron', ready: true,
    animation: {fixture: 'windows animation'}});
  tray.emit('double-click');
  expect(h.mainShows()).toBe(1);
  h.app.emit('will-quit');
  h.app.emit('will-quit');
  expect(h.animation.disposeCalls).toBe(1);
  expect(tray.destroyCalls).toBe(1);
});
