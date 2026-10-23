import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CROP_KINDS, type CropStage } from './../contracts';
import { BLOCK_TYPES, isOpaqueIndex, isSolidIndex } from './blocks/blockTypes';
import { createFarmVisual } from './render/farmVisual';
import { RIPE_FLAG, meshChunk } from './render/meshChunk';
import { WorldRenderer } from './render/WorldRenderer';
import { OPACITY } from './light/opacity';
import { skyDarkness } from './light/skyDarkness';
import { ArrayVoxelWorld } from './VoxelWorld';

const vis = (stage: CropStage = 3) => ({ stageAt: () => stage });
const tex = (n: string) =>
  createFarmVisual({ world: new ArrayVoxelWorld({ x: 16, y: 8, z: 16 }), light: null as never, crops: vis() }).texture(n);
const rows = (px: Array<string | null>): number[] => {
  const ys = new Set<number>();
  px.forEach((c, i) => c && ys.add(Math.floor(i / 16)));
  return [...ys].sort((a, b) => a - b);
};

describe('農業の絵 (AC9)', () => {
  it('作物 16 まい: 絵のある行の数が 4・7・11・14 で、すべてちがう', () => {
    const seen = new Set<string>();
    for (const k of CROP_KINDS) {
      [4, 7, 11, 14].forEach((n, s) => {
        const px = tex(`crop_${k}_${s}`);
        expect(px).toHaveLength(256);
        const r = rows(px);
        expect([k, s, r.length, r[0], r[r.length - 1]]).toEqual([k, s, n, 16 - n, 15]);
        seen.add(px.join());
      });
    }
    expect(seen.size).toBe(16);
  });
  it('やせいの やさい 4 まいは 3 だんかいと ちがう（AC32）', () => {
    for (const k of CROP_KINDS) expect(tex(`wild_${k}`).join()).not.toBe(tex(`crop_${k}_3`).join());
  });
  it('はたけ: かわいた／しめった で上の絵がちがい、しめった方は しずくの色がある', () => {
    expect(tex('farmland_top').join()).not.toBe(tex('farmland_wet_top').join());
    expect(tex('farmland_wet_top')).toContain('#6f8fb8');
    expect(tex('farmland_top')[0]).toBe('#6e4520');
    expect(tex('farmland_side')[0]).toBe('#6e4520');
    expect(tex('farmland_wet_side')[16]).toBe('#4a3a33');
    for (const n of ['kakashi', 'kakashi_head', 'saku']) expect(rows(tex(n)).length).toBeGreaterThan(5);
  });
});

describe('十字の板の描画', () => {
  const ids = ['crop_onion', 'wild_tomato', 'kakashi', 'saku'] as const;
  it('固くなく、光を通し、まわりの面を隠さない', () => {
    BLOCK_TYPES.forEach((t, i) => {
      if (!(ids as readonly string[]).includes(t.id)) return;
      expect(isSolidIndex(i)).toBe(false);
      expect(OPACITY[i]).toBe(0);
      expect(isOpaqueIndex(i)).toBe(false);
    });
  });
  it('作物は 4 面（2 まい×表裏）。となりの面は隠れず、みのった作物には印がつく', () => {
    const w = new ArrayVoxelWorld({ x: 16, y: 8, z: 16 });
    w.fill(0, 0, 0, 15, 1, 15, 'dirt');
    w.setBlock(5, 2, 5, 'crop_tomato');
    const w0 = new ArrayVoxelWorld({ x: 16, y: 8, z: 16 });
    w0.fill(0, 0, 0, 15, 1, 15, 'dirt');
    expect(meshChunk(w, 0, 0).opaque.faceCount).toBe(meshChunk(w0, 0, 0).opaque.faceCount + 4);
    const ripe = meshChunk(w, 0, 0, undefined, vis(3)).opaque;
    const young = meshChunk(w, 0, 0, undefined, vis(2)).opaque;
    expect(ripe.lights.some((v, i) => i % 2 === 1 && v >= RIPE_FLAG)).toBe(true);
    expect(young.lights.some((v, i) => i % 2 === 1 && v >= RIPE_FLAG)).toBe(false);
  });
  it('みのった作物・やせいの やさいは 夜でも光らない: まわりと同じ明るさ（#76。下限 0.7 は 設定 ripeMin で入れたときだけ）', () => {
    const w = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
    w.fill(0, 0, 0, 31, 3, 31, 'stone');
    w.setBlock(5, 4, 5, 'crop_pumpkin');
    w.setBlock(8, 4, 5, 'wild_onion');
    const r = new WorldRenderer(w);
    r.attach(new Scene());
    skyDarkness.value = 15;
    let stage: CropStage = 3;
    const v = createFarmVisual({ world: w, light: r.light, crops: { stageAt: () => stage } });
    expect(v.look(5, 4, 5)).toMatchObject({ tile: 'crop_pumpkin_3' });
    expect(v.look(5, 4, 5)!.brightness).toBeCloseTo(r.light.brightness(5, 4, 5), 5);
    expect(v.look(5, 4, 5)!.brightness).toBeLessThan(0.1);
    expect(v.look(8, 4, 5)).toMatchObject({ tile: 'wild_onion' });
    expect(v.look(8, 4, 5)!.brightness).toBeCloseTo(r.light.brightness(8, 4, 5), 5);
    stage = 2;
    expect(v.look(5, 4, 5)).toMatchObject({ tile: 'crop_pumpkin_2' });
    expect(v.look(5, 4, 5)!.brightness).toBeCloseTo(r.light.brightness(5, 4, 5), 5);
    // 設定は のこしてある: ripeMin に 0.7 を渡せば 今までどおり 下限が入る
    stage = 3;
    const v7 = createFarmVisual({ world: w, light: r.light, crops: { stageAt: () => stage }, ripeMin: () => 0.7 });
    expect(v7.look(5, 4, 5)!.brightness).toBeGreaterThanOrEqual(0.7);
    expect(v.look(1, 1, 1)).toBeNull();
    skyDarkness.value = 0;
  });
});
