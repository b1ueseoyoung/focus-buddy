// Publish only complete frames. A failed load leaves the current tray image intact.
export class TrayImageCache<Image extends object> {
  private readonly images = new Map<string, Image>();
  private readonly warned = new Set<string>();

  constructor(
    private readonly present: (image: Image) => void,
    private readonly warn: (key: string, error: unknown) => void,
  ) {}

  show(key: string, load: () => Image): void {
    let image = this.images.get(key);
    if (!image) {
      try {
        image = load();
        this.images.set(key, image);
        this.warned.delete(key);
      } catch (error) {
        if (!this.warned.has(key)) {
          this.warned.add(key);
          this.warn(key, error);
        }
        return;
      }
    }
    this.present(image);
  }

  clear(): void { this.images.clear(); this.warned.clear(); }
}
