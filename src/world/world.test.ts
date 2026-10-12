import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { BlockId, IslandInfo } from '../contracts';
import { BLOCK_TYPES } from './blocks/blockTypes';
import { BLOCK_TILES, TILE_NAMES, buildAtlasData, getTilePixels, ATLAS_WIDTH, ATLAS_HEIGHT } from './blocks/textures';
import { createWorldHook } from './hook';
import { meshChunk } from './render/meshChunk';
import { WorldRenderer } from './render/WorldRenderer';
import { ArrayVoxelWorld } from './VoxelWorld';

const ALL_IDS: BlockId[] = [
  'air', 'grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'iron_ore', 'water', 'bedrock',
  'furnace', 'kawara', 'brick',
  'torch', 'start_torch',
];

describe('ブロックの定義 (AC16)', () => {
  it('14 種そろっている（M4 で かまど・かわら・レンガ を後ろに足した）', () => {
    expect(BLOCK_TYPES.map((t) => t.id)).toEqual(ALL_IDS);
    expect(BLOCK_TYPES.every((t) => t.name.length > 0)).toBe(true);
  });
  it('bedrock と water は掘れない、water と air は固くない', () => {
    const t = (id: BlockId) => BLOCK_TYPES.find((b) => b.id === id)!;
    expect(t('bedrock').breakable).toBe(false);
    expect(t('water').breakable).toBe(false);
    expect(t('water').solid).toBe(false);
    expect(t('air').solid).toBe(false);
    expect(t('stone').solid && t('stone').breakable).toBe(true);
  });
});

describe('ドット絵', () => {
  it('どのタイルも 16x16 で、地面や草の色が仕様どおり', () => {
    for (const n of TILE_NAMES) expect(getTilePixels(n)).toHaveLength(256);
    expect(buildAtlasData()).toHaveLength(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
    const hexOf = (c: readonly number[]) => c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
    const has = (n: Parameters<typeof getTilePixels>[0], h: string) => getTilePixels(n).some((c) => hexOf(c) === h);
    expect(has('grass_top', '5dbb3f')).toBe(true);
    expect(has('coal_ore', '222222')).toBe(true);
    expect(has('iron_ore', 'e0a872')).toBe(true);
  });
  it('水だけ半透明（60%）', () => {
    expect(getTilePixels('water')[0][3]).toBe(153);
    expect(getTilePixels('stone')[0][3]).toBe(255);
  });
  it('ブロックごとに上・下・横のタイルがある', () => {
    for (const id of ALL_IDS.filter((i) => i !== 'air')) expect(BLOCK_TILES[id]).toHaveLength(3);
  });
});

describe('ArrayVoxelWorld', () => {
  it('大きさ・範囲外・get/set', () => {
    const w = new ArrayVoxelWorld();
    expect(w.size).toEqual({ x: 64, y: 32, z: 64 });
    expect(w.getBlock(10, 10, 10)).toBe('air');
    expect(w.getBlock(-1, 10, 10)).toBe('outside');
    expect(w.getBlock(64, 10, 10)).toBe('outside');
    expect(w.getBlock(10, 32, 10)).toBe('outside');
    expect(w.setBlock(10, 10, 10, 'stone')).toBe(true);
    expect(w.getBlock(10, 10, 10)).toBe('stone');
    expect(w.isSolid(10, 10, 10)).toBe(true);
    expect(w.isSolid(-1, 10, 10)).toBe(false);
    w.setBlock(11, 10, 10, 'water');
    expect(w.isSolid(11, 10, 10)).toBe(false);
  });
  it('範囲外・知らない id の setBlock は false で hash が変わらない', () => {
    const w = new ArrayVoxelWorld();
    const h = w.hash();
    expect(w.setBlock(-1, 0, 0, 'stone')).toBe(false);
    expect(w.setBlock(0, 32, 0, 'stone')).toBe(false);
    expect(w.setBlock(0, 0, 0, 'nope' as BlockId)).toBe(false);
    expect(w.setBlock(1.5, 0, 0, 'stone')).toBe(false);
    expect(w.hash()).toBe(h);
  });
  it('fill は箱の中を変え、変えた数を返す。範囲外は変えない', () => {
    const w = new ArrayVoxelWorld();
    expect(w.fill(2, 2, 2, 0, 0, 0, 'dirt')).toBe(27);
    expect(w.getBlock(1, 1, 1)).toBe('dirt');
    expect(w.fill(-3, 0, 0, 1, 0, 0, 'stone')).toBe(2);
    expect(w.getBlock(0, 0, 0)).toBe('stone');
    expect(w.fill(0, 0, 0, 1, 0, 0, 'stone')).toBe(0);
    expect(w.fill(62, 31, 62, 70, 40, 70, 'sand')).toBe(2 * 1 * 2);
  });
  it('countBlocks と hash', () => {
    const a = new ArrayVoxelWorld();
    const b = new ArrayVoxelWorld();
    a.fill(0, 0, 0, 63, 0, 63, 'bedrock');
    b.fill(0, 0, 0, 63, 0, 63, 'bedrock');
    expect(a.countBlocks().bedrock).toBe(4096);
    expect(a.countBlocks().air).toBe(64 * 32 * 64 - 4096);
    expect(a.hash()).toBe(b.hash());
    b.setBlock(5, 5, 5, 'sand');
    expect(a.hash()).not.toBe(b.hash());
  });
  it('変わったチャンクを覚える。チャンクの端はとなりも', () => {
    const w = new ArrayVoxelWorld();
    expect(w.takeDirtyChunks()).toHaveLength(16);
    expect(w.takeDirtyChunks()).toHaveLength(0);
    w.setBlock(5, 5, 5, 'stone');
    expect(w.takeDirtyChunks()).toEqual([0]);
    w.setBlock(5, 5, 5, 'stone'); // 同じ値は変化なし
    expect(w.takeDirtyChunks()).toEqual([]);
    w.setBlock(15, 5, 5, 'stone');
    expect(w.takeDirtyChunks().sort()).toEqual([0, 1]);
    w.setBlock(16, 5, 16, 'stone');
    expect(w.takeDirtyChunks().sort((p, q) => p - q)).toEqual([1, 4, 5]);
  });
});

describe('メッシュ（見えない面を描かない）', () => {
  it('1 個だけなら 6 面、くっつけると内側の面が消える', () => {
    const w = new ArrayVoxelWorld();
    w.setBlock(5, 5, 5, 'stone');
    expect(meshChunk(w, 0, 0).opaque.faceCount).toBe(6);
    w.setBlock(6, 5, 5, 'dirt');
    expect(meshChunk(w, 0, 0).opaque.faceCount).toBe(10);
    w.fill(0, 0, 0, 3, 3, 3, 'stone'); // 4x4x4 の箱: 表面だけ。世界の外へ向く面は描かない
    const m = meshChunk(w, 0, 0).opaque;
    expect(m.faceCount).toBe(10 + 3 * 16); // 箱の x/y/z の 0 側は外向きで描かない → 上・+x・+z の 3 方向 x 16
  });
  it('世界の外へ向く面は描かない', () => {
    const w = new ArrayVoxelWorld();
    w.setBlock(0, 0, 0, 'bedrock');
    expect(meshChunk(w, 0, 0).opaque.faceCount).toBe(3);
  });
  it('面の頂点・index・色の数が合い、明るさは上 1.0・横 0.8・下 0.6', () => {
    const w = new ArrayVoxelWorld();
    w.setBlock(5, 5, 5, 'grass');
    const m = meshChunk(w, 0, 0).opaque;
    expect(m.positions).toHaveLength(6 * 4 * 3);
    expect(m.uvs).toHaveLength(6 * 4 * 2);
    expect(m.indices).toHaveLength(6 * 6);
    const shades = new Set(m.colors.filter((_, i) => i % 3 === 0));
    expect([...shades].sort()).toEqual([0.6, 0.8, 1]);
  });
  it('水は別メッシュ。海の水は上の面だけ', () => {
    const w = new ArrayVoxelWorld();
    w.fill(0, 0, 0, 63, 6, 63, 'sand');
    w.fill(0, 7, 0, 63, 7, 63, 'water');
    const m = meshChunk(w, 0, 0);
    expect(m.water.faceCount).toBe(16 * 16);
    // すなの上の面は水に隠れない（水は色つきではない）
    expect(m.opaque.faceCount).toBe(16 * 16);
  });
  it('チャンクのさかいでも面をまちがって消さない', () => {
    const w = new ArrayVoxelWorld();
    w.setBlock(15, 5, 5, 'stone');
    w.setBlock(16, 5, 5, 'stone');
    expect(meshChunk(w, 0, 0).opaque.faceCount).toBe(5);
    expect(meshChunk(w, 1, 0).opaque.faceCount).toBe(5);
  });
});

describe('WorldRenderer', () => {
  function setup() {
    const w = new ArrayVoxelWorld();
    w.fill(0, 0, 0, 63, 0, 63, 'bedrock');
    w.fill(0, 1, 0, 63, 6, 63, 'stone');
    const r = new WorldRenderer(w);
    const scene = new Scene();
    r.attach(scene);
    return { w, r, scene };
  }
  it('attach で全チャンクができ、描画回数は 100 以下', () => {
    const { r, scene } = setup();
    expect(scene.children).toContain(r.group);
    expect(r.meshCount()).toBe(16);
    expect(r.triangleCount()).toBeGreaterThan(0);
    expect(r.rebuildStats().count).toBe(0);
  });
  it('変えたチャンクだけ作り直す', () => {
    const { w, r } = setup();
    const before = r.group.children.slice();
    w.setBlock(5, 6, 5, 'air');
    r.update();
    expect(r.rebuildStats().count).toBe(1);
    const changed = r.group.children.filter((c) => !before.includes(c));
    expect(changed).toHaveLength(1);
    expect(before.filter((c) => r.group.children.includes(c))).toHaveLength(15);
    r.update();
    expect(r.rebuildStats().count).toBe(1);
  });
  it('チャンクの端のブロックを変えるととなりも作り直す', () => {
    const { w, r } = setup();
    w.setBlock(15, 6, 5, 'air');
    r.update();
    expect(r.rebuildStats().count).toBe(2);
  });
  it('ブロックをこわすと三角形の数が変わる (AC15)', () => {
    const { w, r } = setup();
    const n = r.triangleCount();
    w.setBlock(32, 6, 32, 'air');
    r.update();
    expect(r.triangleCount()).not.toBe(n);
    expect(r.rebuildStats().lastMs).toBeGreaterThanOrEqual(0);
  });
  it('水のメッシュは半透明で、色つきのは不透明', () => {
    const { w, r } = setup();
    w.fill(0, 7, 0, 15, 7, 15, 'water');
    r.update();
    const mats = r.group.children.map((c) => (c as import('three').Mesh).material as import('three').Material);
    expect(mats.some((m) => m.transparent)).toBe(true);
    expect(mats.some((m) => !m.transparent)).toBe(true);
  });
});

describe('createWorldHook', () => {
  it('world.* が使える', () => {
    const w = new ArrayVoxelWorld();
    const r = new WorldRenderer(w);
    r.attach(new Scene());
    const island: IslandInfo = {
      seed: 7,
      genTimeMs: 12,
      groundHeight: () => 10,
      spawn: () => ({ x: 32.5, y: 11, z: 32.5, yawDeg: 0, pitchDeg: 0 }),
      testArea: () => ({ x0: 0, x1: 12, z0: 0, z1: 12, y0: 8, y1: 31 }),
    };
    const h = createWorldHook(w, r, island);
    expect(h.seed()).toBe(7);
    expect(h.size()).toEqual({ x: 64, y: 32, z: 64 });
    expect(h.setBlock(1, 1, 1, 'iron_ore')).toBe(true);
    expect(h.getBlock(1, 1, 1)).toBe('iron_ore');
    expect(h.getBlock(-1, 1, 1)).toBe('outside');
    expect(h.fill(0, 0, 0, 1, 0, 0, 'sand')).toBe(2);
    expect(h.countBlocks().sand).toBe(2);
    expect(typeof h.hash()).toBe('string');
    expect(h.groundHeight(1, 1)).toBe(10);
    expect(h.spawn().y).toBe(11);
    expect(h.testArea().y0).toBe(8);
    expect(h.genTimeMs()).toBe(12);
    expect(h.blockTypes()).toHaveLength(16);
    r.update();
    expect(h.rebuildStats().count).toBeGreaterThan(0);
  });
});
