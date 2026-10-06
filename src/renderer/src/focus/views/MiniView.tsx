import { useEffect } from "react";
import { useFocus } from "../store";
import { PixelWidget } from "./PixelWidget";
import { useWidgetScale } from "../use-widget-scale";
export function MiniView(): JSX.Element {
  const { windows } = useFocus();
  const { scale, setScale } = useWidgetScale();
  useEffect(() => {
    // macOS forwards mouse moves while clicks pass through, allowing opaque UI to reclaim input.
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let previous: boolean | null = null;
    let sampledSource = "";
    const transparent = (value: boolean): void => {
      if (value === previous) return;
      previous = value;
      window.electron?.ipcRenderer.send("focus:pointer-transparent", value);
    };
    const move = (event: MouseEvent): void => {
      if(document.querySelector(".widget-resize.resizing")){transparent(false);return;}
      if(document.elementFromPoint(event.clientX,event.clientY)?.closest('button,.pixel-size-menu')) {transparent(false);return;}
      const panel = document.querySelector(".pixel-panel");
      if (
        panel?.contains(document.elementFromPoint(event.clientX, event.clientY))
      ) {
        transparent(false);
        return;
      }
      const image = document.querySelector<HTMLImageElement>(".pixel-cat");
      if (image?.complete && image.naturalWidth && context) {
        const rect = image.getBoundingClientRect();
        const x = Math.floor(
          ((event.clientX - rect.left) * image.naturalWidth) / rect.width,
        );
        const y = Math.floor(
          ((event.clientY - rect.top) * image.naturalHeight) / rect.height,
        );
        if (
          x >= 0 &&
          y >= 0 &&
          x < image.naturalWidth &&
          y < image.naturalHeight
        ) {
          if (sampledSource !== image.src) {
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            context.drawImage(image, 0, 0);
            sampledSource = image.src;
          }
          transparent(context.getImageData(x, y, 1, 1).data[3] < 32);
          return;
        }
      }
      transparent(true);
    };
    const leave = (): void => transparent(!document.querySelector(".widget-resize.resizing"));
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseleave", leave);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseleave", leave);
    };
  }, []);
  return (
    <PixelWidget onResize={setScale}
      scale={scale}
      onSettings={() => {
        void windows.showMain();
      }}
    />
  );
}
