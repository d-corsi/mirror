/** Minimal image preloader. */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

export async function loadImages<K extends string>(
  map: Record<K, string>,
): Promise<Record<K, HTMLImageElement>> {
  const keys = Object.keys(map) as K[];
  const images = await Promise.all(keys.map((k) => loadImage(map[k])));
  const out = {} as Record<K, HTMLImageElement>;
  keys.forEach((k, i) => (out[k] = images[i]!));
  return out;
}
