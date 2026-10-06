import { expect, test } from 'bun:test';
import { TrayImageCache } from './tray-image-cache';

type Image = { representations: number[] };
function fixture() {
  const shown: Image[] = [];
  const warnings: Array<[string, unknown]> = [];
  const cache = new TrayImageCache<Image>((image) => shown.push(image), (key, error) => warnings.push([key, error]));
  return { cache, shown, warnings };
}

test('frame read, decode, and tint failures retain the last image and permit later valid frames', () => {
  for (const failure of ['readFileSync', 'PNG decode', 'bitmap tint']) {
    const { cache, shown, warnings } = fixture();
    const previous = { representations: [1, 2] };
    cache.show('sleep/0/false', () => previous);
    const error = new Error(failure);
    expect(() => cache.show('sleep/1/false', () => { throw error; })).not.toThrow();
    expect(shown).toEqual([previous]);
    expect(warnings).toEqual([['sleep/1/false', error]]);
    const next = { representations: [1, 2] };
    cache.show('sleep/2/false', () => next);
    expect(shown).toEqual([previous, next]);
  }
});

test('failed second representation is never cached; repeated failure warns once and later retry succeeds', () => {
  const { cache, shown, warnings } = fixture();
  let attempts = 0;
  const load = (): Image => {
    attempts++;
    const image = { representations: [1] };
    if (attempts < 3) throw new Error('2x frame could not decode');
    image.representations.push(2);
    return image;
  };
  cache.show('rest/1/true', load);
  cache.show('rest/1/true', load);
  expect(attempts).toBe(2);
  expect(shown).toEqual([]);
  expect(warnings).toHaveLength(1);
  cache.show('rest/1/true', load);
  expect(shown).toEqual([{ representations: [1, 2] }]);
  cache.show('rest/1/true', () => { throw new Error('a cached image must not reload'); });
  expect(shown).toHaveLength(2);
  expect(shown[0]).toBe(shown[1]);
  expect(attempts).toBe(3);
});

test('theme variants cache separately and clearing releases cached frames', () => {
  const { cache, shown } = fixture();
  let loads = 0;
  const load = (): Image => ({ representations: [++loads] });
  cache.show('sleep/0/false', load);
  cache.show('sleep/0/true', load);
  cache.show('sleep/0/false', load);
  expect(loads).toBe(2);
  expect(shown[0]).toBe(shown[2]);
  expect(shown[0]).not.toBe(shown[1]);
  cache.clear();
  cache.show('sleep/0/false', load);
  expect(loads).toBe(3);
  expect(shown[0]).not.toBe(shown[3]);
});
