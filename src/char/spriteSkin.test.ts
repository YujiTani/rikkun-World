import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Lighting } from '../sky/lighting';
import { PALETTE_RGB } from './palette';
import { createCharSprite } from './index';
import type { LoadImage } from './loader';
import type { SpriteStepInput } from './motion';

/** WEAPON-9 AC51: 虹の 手持ちの 絵は 刀の組 6 まいの 入れかえ（べつの 絵の もと）。足さない・重さが ふえない */
const COLS = 2;
const W = 256 * COLS;
const H = 256 * 24;
function img(): ImageData {
  const data = new Uint8ClampedArray(W * H * 4);
  const c = PALETTE_RGB[3]!;
  for (let row = 0; row < 24; row++)
    for (let y = 10; y < 20; y++)
      for (let x = 10; x < 20; x++) {
        const o = ((row * 256 + y) * W + x) * 4;
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
        data[o + 3] = 255;
      }
  return { width: W, height: H, data } as unknown as ImageData;
}
const flush = async (): Promise<void> => {
  for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0));
};
const KATANA = ['katana_thrust', 'katana_walk_chudan', 'katana_kesa', 'katana_walk_jodan', 'katana_kiriage', 'katana_walk_gedan'];

function make() {
  const urls: string[] = [];
  const loadImage: LoadImage = async (url) => {
    urls.push(url);
    return img();
  };
  const sprite = createCharSprite({
    parent: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(),
    lighting: new Lighting(),
    basePath: './models/char/girl/',
    loadJson: async (url) => {
      if (url.endsWith('niji/atlas.json')) return { extras: [[1, 2, 3]], motions: Object.fromEntries(KATANA.map((m) => [m, { frames: 2 }])) };
      return { modelH: 1.7 };
    },
    loadImage,
    initTexture: (t) => t.onUpdate?.(t as never),
  });
  return { sprite, urls };
}
const step = (s: ReturnType<typeof make>['sprite'], skin: string | null): void =>
  s.step({
    position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, onGround: true, inWater: false, running: false, facingDeg: 0,
    weapon: 'katana', blade: { stance: 'chudan', tech: null, phase: 'idle', frame: 0, lengths: null }, bow: null, weaponSkin: skin,
  } as SpriteStepInput);

describe('手に 持つ 絵の 差しかえ', () => {
  it('持つ 前から 虹なら 刀の組は 最初から niji/ の 絵（通常の 刀の 絵は 読まない）', async () => {
    const { sprite, urls } = make();
    await flush();
    step(sprite, 'niji');
    await flush();
    for (const m of KATANA) {
      expect(urls.some((u) => u.endsWith(`niji/${m}.png`)), m).toBe(true);
      expect(urls.some((u) => u.endsWith(`girl/${m}.png`)), `${m} 通常`).toBe(false);
    }
    expect(sprite.info().skin).toBe('niji');
    expect(sprite.info().bladeColors).toBeNull();
  });
  it('刀 → 虹 で 入れかえる: 重さは 6 まいぶんの ままで ふえない（足さない）', async () => {
    const { sprite, urls } = make();
    await flush();
    step(sprite, null);
    await flush();
    const before = sprite.info().gpuBytes;
    step(sprite, 'niji');
    await flush();
    const after = sprite.info();
    expect(after.gpuBytes).toBe(before);
    expect(urls.filter((u) => u.includes('niji/'))).toHaveLength(6);
    for (const m of KATANA) expect(after.status[m as 'idle']).toBe('ready');
    // もどす
    step(sprite, null);
    await flush();
    expect(sprite.info().gpuBytes).toBe(before);
    expect(sprite.info().skin).toBeNull();
  });
  it('虹を 持たない ときは niji の 絵を ぜったい 読まない', async () => {
    const { sprite, urls } = make();
    await flush();
    for (let i = 0; i < 5; i++) step(sprite, null);
    await flush();
    expect(urls.some((u) => u.includes('niji'))).toBe(false);
  });
});
