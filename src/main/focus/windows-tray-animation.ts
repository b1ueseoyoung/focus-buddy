import { nativeImage, nativeTheme, type Tray, type NativeImage } from 'electron';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { TrayAnimation, tintTrayBitmap, type TrayPose } from './tray-animation';

export function createWindowsTrayAnimation(tray: Tray, directory: string) {
  const images = new Map<string, NativeImage>();
  const show = (mode: TrayPose, frame: number): void => {
    const dark = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI;
    const key = `${mode}/${frame}/${dark}`;
    let image = images.get(key);
    if (!image) {
      image = nativeImage.createEmpty();
      for (const factor of [1, 2]) {
        const original = nativeImage.createFromBuffer(readFileSync(join(directory, `${mode}-${frame}${factor === 2 ? '@2x' : ''}.png`)));
        if (original.isEmpty()) throw new Error(`Missing Windows tray frame: ${key}`);
        const size = original.getSize();
        const tinted = nativeImage.createFromBitmap(tintTrayBitmap(original.toBitmap(), dark), size);
        image.addRepresentation({ scaleFactor: factor, buffer: tinted.toPNG() });
      }
      images.set(key, image);
    }
    if (!tray.isDestroyed()) tray.setImage(image);
  };
  const animation = new TrayAnimation({
    now: () => performance.now(),
    setTimeout(callback, ms) { const timer = setTimeout(callback, ms); timer.unref(); return timer; },
    clearTimeout(handle) { clearTimeout(handle as ReturnType<typeof setTimeout>); },
  }, show);
  const repaint = (): void => show(animation.mode, animation.frame);
  nativeTheme.on('updated', repaint);
  return {
    update: (status: string, phase: string) => animation.update(status, phase),
    diagnostics: () => ({ mode: animation.mode, frame: animation.frame, changes: animation.changes, running: animation.running, frames: 4, darkTaskbar: nativeTheme.shouldUseDarkColorsForSystemIntegratedUI }),
    dispose() { animation.dispose(); nativeTheme.removeListener('updated', repaint); images.clear(); },
  };
}
