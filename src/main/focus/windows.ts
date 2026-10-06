import { app, BrowserWindow, screen } from "electron";
import { join } from "path";
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "fs";

const MINI_WIDTH = 280;
const MINI_HEIGHT = 310;
const MINI_MARGIN = 24;

export interface WindowInfo {
  name: "main" | "mini";
  visible: boolean;
  alwaysOnTop: boolean;
}

export interface FocusWindowsDeps {
  getMain(): BrowserWindow | null;
  // broadcast 대상·assertKnownSender 판정에 작은 창을 넣는다.
  register(win: BrowserWindow): void;
  alwaysOnTop(): boolean;
  isQuitting(): boolean;
  onWidgetChanged?(): void;
}

export interface FocusWindows {
  showMain(): void;
  showMini(): void;
  setAlwaysOnTop(value: boolean): void;
  scale(): number;
  setScale(value: number): void;
  widgetEnabled(): boolean;
  hideMini(): void;
  restoreWidget(): void;
  info(): WindowInfo[];
}

// 기본 창과 작은 창은 배타적으로 보인다. 작은 창은 같은 main 타이머를 구독만 한다(세션을 만들지 않는다).
export function createFocusWindows(deps: FocusWindowsDeps): FocusWindows {
  let mini: BrowserWindow | null = null;
  const scalePath = join(app.getPath("userData"), "pixel-widget-window.json");
  let scale = 1;
  let widgetEnabled = false;
  try {
    const preference = JSON.parse(readFileSync(scalePath, "utf8"));
    const value = preference.scale;
    widgetEnabled = preference.widgetEnabled === true;
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0.8 &&
      value <= 1.5
    )
      scale = value;
  } catch {
    /* Separate optional UI preference; never reset the timer store. */
  }
  const savePreference = (): void => {
    mkdirSync(app.getPath('userData'), {recursive:true});
    writeFileSync(`${scalePath}.tmp`, JSON.stringify({scale,widgetEnabled}), 'utf8');
    renameSync(`${scalePath}.tmp`,scalePath);
  };

  const liveMain = (): BrowserWindow | null => {
    const win = deps.getMain();
    return win && !win.isDestroyed() ? win : null;
  };

  // 첫 showMini 때 만든다(lazy).
  const createMini = (): BrowserWindow => {
    const { x, y, width } = screen.getPrimaryDisplay().workArea;
    const win = new BrowserWindow({
      width: Math.round(MINI_WIDTH * scale),
      height: Math.round(MINI_HEIGHT * scale),
      x: x + width - Math.round(MINI_WIDTH * scale) - MINI_MARGIN,
      y: y + MINI_MARGIN,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      show: false,
      hasShadow: false,
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(deps.alwaysOnTop(), "floating");
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.on("close", (event) => {
      if (!deps.isQuitting()) {
        event.preventDefault();
        widgetEnabled = false; savePreference(); deps.onWidgetChanged?.();
        win.hide();
      }
    });
    win.on("closed", () => {
      if (mini === win) mini = null;
    });
    deps.register(win);
    const base =
      !app.isPackaged && process.env.ELECTRON_RENDERER_URL
        ? process.env.ELECTRON_RENDERER_URL
        : "app://renderer/index.html";
    win.loadURL(`${base}#/mini`).catch((error: unknown) => {
      console.error("focus mini window failed to load", error);
    });
    return win;
  };

  return {
    scale: () => scale,
    widgetEnabled: () => widgetEnabled,
    hideMini() { widgetEnabled = false; savePreference(); mini?.hide(); deps.onWidgetChanged?.(); },
    restoreWidget() { if (widgetEnabled) { mini ??= createMini(); mini.show(); } },
    setScale(value) {
      if (!Number.isFinite(value) || value < 0.8 || value > 1.5)
        throw new Error("widget scale must be 0.8–1.5");
      const previous = scale;
      scale = value;
      try { savePreference(); } catch(error) { scale=previous;throw error; }
      if (mini && !mini.isDestroyed()) {
        const bounds = mini.getBounds();
        const work = screen.getDisplayMatching(bounds).workArea;
        const w = Math.round(MINI_WIDTH * scale),
          h = Math.round(MINI_HEIGHT * scale);
        mini.setBounds({
          width: w,
          height: h,
          x: Math.max(work.x, Math.min(bounds.x, work.x + work.width - w)),
          y: Math.max(work.y, Math.min(bounds.y, work.y + work.height - h)),
        });
      }
    },
    showMain() {
      const main = liveMain();
      if (!main) return;
      if (main.isMinimized()) main.restore();
      main.show();
      main.focus();
    },
    showMini() {
      widgetEnabled = true; savePreference();
      mini ??= createMini();
      mini.show();
      liveMain()?.hide();
      deps.onWidgetChanged?.();
    },
    setAlwaysOnTop(value) {
      if (mini && mini.isAlwaysOnTop() !== value)
        mini.setAlwaysOnTop(value, "floating");
    },
    info() {
      const out: WindowInfo[] = [];
      const main = liveMain();
      if (main)
        out.push({
          name: "main",
          visible: main.isVisible(),
          alwaysOnTop: main.isAlwaysOnTop(),
        });
      if (mini)
        out.push({
          name: "mini",
          visible: mini.isVisible(),
          alwaysOnTop: mini.isAlwaysOnTop(),
        });
      return out;
    },
  };
}
