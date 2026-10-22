// CHAR-4 AC12: 板の 刃の色（色見本の 20・21 番 = 色番号 21・22）。持っている 刀の 色に ぬりかえる
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Lighting } from '../sky/lighting';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { PALETTE_RGB } from './palette';
import { createCharSprite } from './index';
import type { SpriteStepInput } from './motion';

const srgbToLinear = (v8: number): number => {
  const c = v8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const hex = (n: number): [number, number, number] => [(n >> 16) & 255, (n >> 8) & 255, n & 255];

/** 1 コマ(0,0) に 20 番・21 番の 色の ドットが ある 絵 */
function bladeImage(): ImageData {
  const W = 256 * 2;
  const H = 256 * 24;
  const data = new Uint8ClampedArray(W * H * 4);
  for (const [x, k] of [[30, 20], [31, 21]] as const) {
    const o = (10 * W + x) * 4;
    data.set([...PALETTE_RGB[k]!, 255], o);
  }
  return { width: W, height: H, data } as unknown as ImageData;
}

function make(loadImage: () => Promise<ImageData> = () => new Promise(() => undefined)) {
  const parent = new THREE.Group();
  const sprite = createCharSprite({
    parent,
    camera: new THREE.PerspectiveCamera(),
    lighting: new Lighting(),
    basePath: './models/char/girl/',
    loadJson: async () => ({ modelH: 1.7 }),
    loadImage,
    initTexture: (t) => t.onUpdate?.(t as never),
  });
  const palette = (): THREE.Vector3[] => ((parent.getObjectByName('charSprite') as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uPalette!.value as THREE.Vector3[];
  return { sprite, palette };
}

const step = (s: ReturnType<typeof make>['sprite'], o: Partial<SpriteStepInput>): void =>
  s.step({
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    inWater: false,
    running: false,
    facingDeg: 0,
    weapon: 'none',
    blade: null,
    bow: null,
    ...o,
  });
const katana = (item: 'bokuto' | 'katana' | 'crystal_katana'): Partial<SpriteStepInput> => {
  const row = W2_SETTING_DEFAULTS.bladeTrail[item]!;
  return {
    weapon: 'katana',
    blade: { stance: 'chudan', tech: null, phase: 'idle', frame: 0, lengths: null },
    bladeColors: { body: row.blade, shine: row.bladeShine },
  };
};

/** 板の 色の 表の 値が 色見本の 値（sRGB → 線形）と 同じか */
const same = (v: THREE.Vector3, rgb: readonly number[]): boolean => [0, 1, 2].every((k) => Math.abs([v.x, v.y, v.z][k]! - srgbToLinear(rgb[k]!)) < 1e-9);

describe('CHAR-4 AC12 板の 刃の色', () => {
  it('はじめは null・色見本の まま（20・21 番 = 板の 21・22 番目）', () => {
    const { sprite, palette } = make();
    step(sprite, {});
    expect(sprite.info().bladeColors).toBeNull();
    expect(palette()).toHaveLength(23);
    expect(same(palette()[21]!, PALETTE_RGB[20]!)).toBe(true);
    expect(same(palette()[22]!, PALETTE_RGB[21]!)).toBe(true);
  });
  it('ぼくとう・かたな・きらきらの かたなを 持つと その刀の 色（持ったステップの 次の info から）', () => {
    const { sprite, palette } = make();
    for (const item of ['bokuto', 'katana', 'crystal_katana'] as const) {
      const row = W2_SETTING_DEFAULTS.bladeTrail[item]!;
      step(sprite, katana(item));
      expect(sprite.info().bladeColors).toEqual({ body: row.blade, shine: row.bladeShine });
      expect(same(palette()[21]!, hex(row.blade))).toBe(true);
      expect(same(palette()[22]!, hex(row.bladeShine))).toBe(true);
    }
    expect(sprite.info().bladeColors).toEqual({ body: 0x6fcdf5, shine: 0xe6faff });
  });
  it('持ちかえた 同じ ステップで もう 新しい 色（ぼくとう → かたな）', () => {
    const { sprite } = make();
    step(sprite, katana('bokuto'));
    expect(sprite.info().bladeColors).toEqual({ body: 0xb98b54, shine: 0xe0bc86 });
    step(sprite, katana('katana'));
    expect(sprite.info().bladeColors).toEqual({ body: 0xc8cdd8, shine: 0xffffff });
  });
  it('弓・素手・ほかの 物では null に もどり、板の 20・21 番は 色見本の まま。ほかの 番号は 変わらない', () => {
    const { sprite, palette } = make();
    const before = palette().map((v) => v.toArray());
    step(sprite, katana('crystal_katana'));
    for (let i = 0; i < 21; i++) expect(palette()[i]!.toArray()).toEqual(before[i]);
    step(sprite, { weapon: 'bow', bow: { drawing: false, drawTicks: 0, shot: false } });
    expect(sprite.info().bladeColors).toBeNull();
    expect(palette().map((v) => v.toArray())).toEqual(before);
    step(sprite, katana('katana'));
    step(sprite, {});
    expect(sprite.info().bladeColors).toBeNull();
    expect(palette().map((v) => v.toArray())).toEqual(before);
  });
  it('readCell は PNG の 色の まま（武器の 色に しない。CHAR-2 AC33）', async () => {
    const { sprite } = make(async () => bladeImage());
    for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
    step(sprite, katana('crystal_katana'));
    expect(sprite.info().bladeColors).not.toBeNull();
    const cell = await sprite.readCell('katana_thrust', 0, 0, 0);
    const at = (x: number): number[] => [...cell.slice((10 * 256 + x) * 4, (10 * 256 + x) * 4 + 4)];
    expect(at(30)).toEqual([...PALETTE_RGB[20]!, 255]);
    expect(at(31)).toEqual([...PALETTE_RGB[21]!, 255]);
  });
  it('weapon が 刀で ないとき bladeColors を もらっても 使わない', () => {
    const { sprite } = make();
    step(sprite, { weapon: 'none', bladeColors: { body: 0xff0000, shine: 0x00ff00 } });
    expect(sprite.info().bladeColors).toBeNull();
  });
});
