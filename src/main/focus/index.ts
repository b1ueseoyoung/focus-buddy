import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {EventEmitter} from 'node:events';
import {SnoreCueClock,observeSnoreCue} from './snore-cue';
import {SnorePreferences} from './snore-preferences';
import { app, BrowserWindow, ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { CHANNELS } from "../../shared/focus/constants";
import type { Snapshot } from "../../shared/focus/types";
import { registerIpc } from "./ipc";
import { electronNotifier } from "./notify";
import { registerPower } from "./power";
import { JsonStore } from "./store";
import { createSystemClock } from "./system-clock";
import { registerTestHooks } from "./test-hooks";
import { TimerService } from "./timer-service";
import { createFocusTray } from "./tray";
import { createFocusWindows } from "./windows";

export interface FocusMain {
  service: TimerService;
  ready: Promise<Snapshot>;
  attachMainWindow(win: BrowserWindow): void;
  showMain(): void;
  flushOnQuit(): Promise<void>;
}

// app ready 뒤, 기본 창을 만들기 전에 부른다: 렌더러의 첫 getState 보다 핸들러가 먼저 있어야 한다.
export function registerFocusMain(): FocusMain {
  const cuePath=join(app.getPath('userData'),'focus-snore.json');
  const snorePreferences=new SnorePreferences(cuePath);
  const cueClock=new SnoreCueClock(undefined,v=>snorePreferences.setCheckpoint(v));
  const observeCue=(snapshot:Snapshot):string|null=>observeSnoreCue(cueClock,snapshot,error=>console.error('snore preference access failed',error),()=>snorePreferences.checkpoint);
  const ourWindows = new Set<BrowserWindow>();
  let mainWindow: BrowserWindow | null = null;
  let onPowerState: (snapshot: Snapshot) => void = () => undefined;

  const broadcast = (snapshot: Snapshot): void => {
    onPowerState(snapshot);
    const cue=observeCue(snapshot);
    if(cue){const widget=[...ourWindows].find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('#/mini')&&w.isVisible());
      widget?.webContents.send('focus:snore-cue',{id:cue,sound:false,visual:true});
      if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('focus:snore-cue',{id:cue,sound:snorePreferences.sound,visual:false});
    }
    ourWindows.forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send(CHANNELS.state, snapshot);
    });
  };

  const clock = createSystemClock();
  const service = new TimerService({
    clock,
    scheduler: { setTimeout, clearTimeout, setInterval, clearInterval },
    store: new JsonStore(app.getPath("userData")),
    notifier: electronNotifier,
    broadcast,
  });
  const ready = service.init();

  const assertKnownSender = (event: IpcMainInvokeEvent): void => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win === null || !ourWindows.has(win))
      throw new Error("focus IPC from an unknown sender");
  };

  // 종료 중에만 작은 창이 실제로 닫힌다(그 외 close 는 숨기기).
  let quitting = false;
  app.on("before-quit", () => {
    quitting = true;
  });

  let refreshTray = (): void => undefined;
  const windows = createFocusWindows({
    getMain: () => mainWindow,
    register: (win) => {
      ourWindows.add(win);
      win.on("closed", () => ourWindows.delete(win));
    },
    alwaysOnTop: () => service.getSnapshot().settings.alwaysOnTop,
    isQuitting: () => quitting,
    onWidgetChanged: () => refreshTray(),
  });
  const { showMain } = windows;
  // 작은 창을 만들 때 현재 설정을 읽으므로 init 을 기다린다.
  const showMini = async (): Promise<void> => {
    await ready;
    windows.showMini();
  };

  const updateScale=(value:number):void=>{windows.setScale(value);ourWindows.forEach(win=>{if(!win.isDestroyed())win.webContents.send('focus:widget-scale-changed',windows.scale());});refreshTray();};
  const tray = createFocusTray({
    scale:windows.scale,setScale:updateScale,
    showMain,
    showMini,
    hideMini: windows.hideMini,
    widgetEnabled: windows.widgetEnabled,
    openPanel: (panel) => { showMain();mainWindow?.webContents.send('focus:open-panel',panel); },
    start: async () => {
      await ready;
      const taskName = mainWindow ? await mainWindow.webContents.executeJavaScript("localStorage.getItem('focus-buddy.pixel.next-task') || ''") : '';
      return service.dispatch({type:service.getSnapshot().status==='awaiting_next'?'startNext':'startFocus',taskName});
    },
    pause: () => service.dispatch({ type: "pause" }),
    resume: () => service.dispatch({ type: "resume" }),
    reset: () => service.dispatch({type:'resetCurrent'}),
    finish: () => service.dispatch({type:'finishCurrent'}),
    skip: () => service.dispatch({type:service.getSnapshot().phase ? 'finishCurrent' : 'skipBreak'}),
  });
  refreshTray = () => tray.update(service.getSnapshot());
  const onPower = registerPower(service, ready);
  onPowerState = (snapshot) => {
    onPower(snapshot);
    windows.setAlwaysOnTop(snapshot.settings.alwaysOnTop);
    tray.update(snapshot);
  };
  // 서비스는 init 에서 broadcast 하지 않는다: 복구된 상태(paused 등)를 트레이에 한 번 반영한다.
  ready
    .then((snapshot) => {observeCue(snapshot);tray.update(snapshot);setTimeout(()=>{try{writeFileSync(join(app.getPath('userData'),'focus-runtime.json'),JSON.stringify({build:'dot-cat-r5',pid:process.pid,executable:process.execPath,userData:app.getPath('userData'),tray:tray.diagnostics()},null,2));}catch(e){console.warn('runtime diagnostic write failed',e);}},2500).unref();})
    .catch((error: unknown) => {
      console.error("focus init failed", error);
    });

  registerIpc({ service, ready, assertKnownSender, showMain, showMini });
  let lastAudioStatus:unknown=null;
  ipcMain.on('focus:audio-status',(event,status:unknown)=>{assertKnownSender(event);if(BrowserWindow.fromWebContents(event.sender)===mainWindow)lastAudioStatus=status;});
  ipcMain.handle('focus:audio-info',event=>{assertKnownSender(event);return lastAudioStatus;});
  ipcMain.handle('focus:snore-settings',(event,value:unknown)=>{assertKnownSender(event);if(value!==undefined){if(typeof value!=='boolean')throw new Error('invalid snore sound');snorePreferences.setSound(value);}return snorePreferences.sound;});
  ipcMain.handle('focus:runtime-info',event=>{assertKnownSender(event);return {build:'dot-cat-r5',pid:process.pid,executable:process.execPath,userData:app.getPath('userData'),tray:tray.diagnostics()};});
  if(process.env.FOCUS_BUDDY_E2E==='1')ipcMain.handle('focus:native-menu-test',(event,label:unknown)=>{assertKnownSender(event);if(label==='open')tray.testNativeOpen();else if(typeof label==='string')tray.testNativeAction(label);else throw Error('Invalid native menu test');});
  if(process.env.FOCUS_BUDDY_E2E==='1')(app as EventEmitter).on('focus-buddy:e2e-tray-action',(label:unknown)=>{
    // Native tray actions originate in the main process. A renderer round-trip
    // can stall when that very action hides its window on Windows.
    if(typeof label!=='string')throw Error('Invalid native menu test');
    tray.testNativeAction(label);
  });
  if(process.env.FOCUS_BUDDY_E2E==='1')(app as EventEmitter).on('focus-buddy:e2e-tray-info',(reply:(value:unknown)=>void)=>{
    reply({userData:app.getPath('userData'),tray:tray.diagnostics(),items:tray.items().map(({label,enabled})=>({label,enabled}))});
  });
  ipcMain.handle("focus:widget-scale", (event, value: unknown) => {
    assertKnownSender(event);
    if (value !== undefined) {
      if (typeof value !== "number") throw new Error("invalid widget scale");
      updateScale(value);
    }
    return windows.scale();
  });
  ipcMain.on("focus:pointer-transparent", (event, transparent: unknown) => {
    assertKnownSender(event);
    if (typeof transparent !== "boolean") return;
    const sender = BrowserWindow.fromWebContents(event.sender);
    if (sender && sender !== mainWindow)
      sender.setIgnoreMouseEvents(transparent, { forward: true });
  });
  ipcMain.on("focus:quit", (event) => {
    assertKnownSender(event);
    app.quit();
  });
  registerTestHooks({
    clock,
    service,
    ready,
    assertKnownSender,
    trayItems: tray.items,
    trayTitle: tray.title,
    windowsInfo: windows.info,
  });

  return {
    service,
    ready,
    attachMainWindow(win) {
      mainWindow = win;
      ourWindows.add(win);
      win.on("closed", () => {
        ourWindows.delete(win);
        if (mainWindow === win) mainWindow = null;
      });
      win.once("ready-to-show", () => {
        void ready.then(() => windows.restoreWidget());
      });
    },
    showMain,
    async flushOnQuit() {
      await ready;
      await service.flushOnQuit();
    },
  };
}
