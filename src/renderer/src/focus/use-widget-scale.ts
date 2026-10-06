import { useEffect, useState } from "react";
const KEY = "focus-buddy.pixel.scale";
export function useWidgetScale(): {
  scale: number;
  setScale: (value: number) => Promise<void>;
} {
  const [scale, update] = useState(1);
  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    if (!ipc) {
      update(Number(localStorage.getItem(KEY)) || 1);
      return;
    }
    const changed = (_event: unknown, value: number): void => update(value);
    ipc.on("focus:widget-scale-changed", changed);
    void ipc.invoke("focus:widget-scale").then((value) => update(value));
    return () => {
      ipc.removeListener("focus:widget-scale-changed", changed);
    };
  }, []);
  const setScale = async (value: number): Promise<void> => {
    if (window.electron)
      update(
        await window.electron.ipcRenderer.invoke("focus:widget-scale", value),
      );
    else {
      localStorage.setItem(KEY, String(value));
      update(value);
    }
  };
  return { scale, setScale };
}
