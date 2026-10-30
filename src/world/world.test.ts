import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import type { WorldGenInfo } from './gen/populate';
import { BLOCK_TYPES } from './blocks/blockTypes';
import { BLOCK_TILES, TILE_NAMES, buildAtlasData, getTilePixels, ATLAS_WIDTH, ATLAS_HEIGHT } from './blocks/textures';
import { createWorldHook } from './hook';
import { meshChunk } from './render/meshChunk';
import { FACE_SHADE_BY_INDEX } from './render/config';
import { WorldRenderer } from './render/WorldRenderer';
import { ArrayVoxelWorld } from './VoxelWorld';

const ALL_IDS: BlockId[] = [
  'air', 'grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'iron_ore', 'water', 'bedrock',
  'furnace', 'kawara', 'brick',
  'torch', 'start_torch', 'tansu',
  // M7
  'farmland', 'farmland_wet', 'crop_onion', 'crop_tomato', 'crop_pumpkin', 'crop_eggplant',
  'wild_onion', 'wild_tomato', 'wild_pumpkin', 'wild_eggplant', 'kakashi', 'kakashi_head', 'saku', 'sprinkler',
  // #184 VOX-I-1（うしろに足す）
  'snow', 'momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o', 'flower_p', 'bamboo', 'susuki',
  // FLORA-75（うしろに足す）
  'kusa', 'nobana',
  // LIVE-2（うしろに足す）
  'nukunuku', 'toriya_fence', 'toriya_gate', 'toriya_nest', 'toriya_box',
  // こたつ 2×2（うしろに足す）
  'nukunuku_e', 'nukunuku_s', 'nukunuku_se',
  // #293 試作（間欠泉の つち。うしろに足す）
  'geyser_dirt',
  // ITEM-FX-1（#342。小物 3 つが 置ける ブロックに なった。うしろに足す）
  'lantern', 'futon', 'haniwa',
  // ふとん 2 マスの のこり（頭の 3 向き ＋ 足の 4 向き）
  'futon_s', 'futon_w', 'futon_n', 'futon_foot_e', 'futon_foot_s', 'futon_foot_w', 'futon_foot_n',
];

/** この試験は M1 の 64×32×64 の世界で書かれている */
const OLD_SIZE = { x: 64, y: 32, z: 64 };

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
    // CALM（#194）: calmColor(#5DBB3F, #5DBB3F) = (106,181,82)
    expect(has('grass_top', '6ab552')).toBe(true);
    expect(has('grass_top', '5dbb3f')).toBe(false);
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
    const w = new ArrayVoxelWorld(OLD_SIZE);
    expect(w.size).toEqual({ y: 32 });
    expect(w.loadedBounds()).toEqual({ x0: 0, z0: 0, x1: 64, z1: 64 });
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
    const w = new ArrayVoxelWorld(OLD_SIZE);
    const h = w.hash();
    expect(w.setBlock(-1, 0, 0, 'stone')).toBe(false);
    expect(w.setBlock(0, 32, 0, 'stone')).toBe(false);
    expect(w.setBlock(0, 0, 0, 'nope' as BlockId)).toBe(false);
    expect(w.setBlock(1.5, 0, 0, 'stone')).toBe(false);
    expect(w.hash()).toBe(h);
  });
  it('fill は箱の中を変え、変えた数を返す。範囲外は変えない', () => {
    const w = new ArrayVoxelWorld(OLD_SIZE);
    expect(w.fill(2, 2, 2, 0, 0, 0, 'dirt')).toBe(27);
    expect(w.getBlock(1, 1, 1)).toBe('dirt');
    expect(w.fill(-3, 0, 0, 1, 0, 0, 'stone')).toBe(2);
    expect(w.getBlock(0, 0, 0)).toBe('stone');
    expect(w.fill(0, 0, 0, 1, 0, 0, 'stone')).toBe(0);
    expect(w.fill(62, 31, 62, 70, 40, 70, 'sand')).toBe(2 * 1 * 2);
  });
  it('countBlocks と hash', () => {
    const a = new ArrayVoxelWorld(OLD_SIZE);
    const b = new ArrayVoxelWorld(OLD_SIZE);
    a.fill(0, 0, 0, 63, 0, 63, 'bedrock');
    b.fill(0, 0, 0, 63, 0, 63, 'bedrock');
    expect(a.countBlocks().bedrock).toBe(4096);
    expect(a.countBlocks().air).toBe(64 * 32 * 64 - 4096);
    expect(a.hash()).toBe(b.hash());
    b.setBlock(5, 5, 5, 'sand');
    expect(a.hash()).not.toBe(b.hash());
  });
  it('markDirty(reach 2): 光は面の角が 2 マス先まで読むので、ふちから 2 マスはとなりも作り直す', () => {
    const w = new ArrayVoxelWorld(OLD_SIZE);
    w.takeDirtyChunks();
    w.markDirty(17, 5); // 次のチャンクの 1 列目
    expect(w.takeDirtyChunks().sort()).toEqual([1]);
    w.markDirty(17, 5, 2);
    expect(w.takeDirtyChunks().sort((p, q) => p - q)).toEqual([0, 1]);
    w.markDirty(17, 17, 2); // かど: ななめも
    expect(w.takeDirtyChunks().sort((p, q) => p - q)).toEqual([0, 1, 4, 5]);
  });
  it('変わったチャンクを覚える。チャンクの端はとなりも', () => {
    const w = new ArrayVoxelWorld(OLD_SIZE);
    expect(w.takeDirtyChunks()).toHaveLength(16);
    expect(w.takeDirtyChunks()).toHaveLength(0);
    w.setBlock(5, 5, 5, 'stone');
    expect(w.takeDirtyChunks()).toEqual([0]);
    w.setBlock(5, 5, 5, 'stone'); // 同じ値は変化なし
    expect(w.takeDirtyChunks()).toEqual([]);
    w.setBlock(15, 5, 5, 'stone');
    expect(w.takeDirtyChunks().sort()).toEqual([0, 1]);
    w.setBlock(16, 5, 16, 'stone');
    expect(w.takeDirtyChunks().sort((p, q) => p - q)).toEqual([0, 1, 4, 5]);
  });
});

describe('メッシュ（見えない面を描かない）', () => {
  it('1 個だけなら 6 面、くっつけると内側の面が消える', () => {
    const w = new ArrayVoxelWorld(OLD_SIZE);
    w.setBlock(5, 5, 5, 'stone');
    expect(meshChunk(w, 0, 0).opaque.faceCount).toBe(6);
    w.setBlock(6, 5, 5, 'dirt');
    expect(meshChunk(w, 0, 0).opaque.faceCount).toBe(10);
    w.fill(0, 0, 0, 3, 3, 3, 'stone'); // 4x4x4 の箱: 表面だけ。世界の外へ向く面は描かない
    const m = meshChunk(w, 0, 0).opaque;
    expect(m.faceCount).toBe(10 + 3 * 16); // 箱の x/y/z の 0 側は外向きで描かない → 上・+x・+z の 3 方向 x 16
  });
  it('世界の外へ向く面は描かない', () => {
    const w = new ArrayVoxelWorld(OLD_SIZE);
    w.setBlock(0, 0, 0, 'bedrock');
    expect(meshChunk(w, 0, 0).opaque.faceCount).toBe(3);
  });
  it('面の頂点・index・色の数が合い、明るさは config の表どおり（上 1.0・南北 0.68・東西 0.5・下 0.45。#309）', () => {
    const w = new ArrayVoxelWorld(OLD_SIZE);
    w.setBlock(5, 5, 5, 'grass');
    const m = meshChunk(w, 0, 0).opaque;
    expect(m.positions).toHaveLength(6 * 4 * 3);
    expect(m.uvs).toHaveLength(6 * 4 * 2);
    expect(m.indices).toHaveLength(6 * 6);
    const shades = new Set(m.colors.filter((_, i) => i % 3 === 0));
    // TEX-A（#146）: 面の明るさが マイクラ式（#309 で 上 1.0・南北 0.68・東西 0.5・下 0.45）
    expect([...shades].sort()).toEqual([...new Set(FACE_SHADE_BY_INDEX)].sort());
  });
  it('水は別メッシュ。海の水は上の面だけ', () => {
    const w = new ArrayVoxelWorld(OLD_SIZE);
    w.fill(0, 0, 0, 63, 6, 63, 'sand');
    w.fill(0, 7, 0, 63, 7, 63, 'water');
    const m = meshChunk(w, 0, 0);
    expect(m.water.faceCount).toBe(16 * 16);
    // すなの上の面は水に隠れない（水は色つきではない）
    expect(m.opaque.faceCount).toBe(16 * 16);
  });
  it('チャンクのさかいでも面をまちがって消さない', () => {
    const w = new ArrayVoxelWorld(OLD_SIZE);
    w.setBlock(15, 5, 5, 'stone');
    w.setBlock(16, 5, 5, 'stone');
    expect(meshChunk(w, 0, 0).opaque.faceCount).toBe(5);
    expect(meshChunk(w, 1, 0).opaque.faceCount).toBe(5);
  });
});

describe('WorldRenderer', () => {
  function setup() {
    const w = new ArrayVoxelWorld(OLD_SIZE);
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
  /** メッシュの順番待ちが空になるまで進める（VOX-E: 箱から小ブロックへの差しかえは 1 コマ 8ms の予算で少しずつ） */
  const settle = (r: WorldRenderer) => {
    for (let i = 0; i < 2000 && (i === 0 || r.meshStats().pending > 0 || r.light.pendingCount() > 0); i++) r.update();
  };
  it('変えたチャンクだけ作り直す', () => {
    const { w, r } = setup();
    settle(r);
    const before = r.group.children.slice();
    w.setBlock(5, 6, 5, 'air');
    r.update();
    settle(r);
    expect(r.rebuildStats().count).toBe(1);
    const changed = r.group.children.filter((c) => !before.includes(c));
    expect(changed).toHaveLength(1);
    expect(before.filter((c) => r.group.children.includes(c))).toHaveLength(15);
    r.update();
    expect(r.rebuildStats().count).toBe(1);
  });
  it('チャンクの端のブロックを変えるととなりも作り直す', () => {
    const { w, r } = setup();
    settle(r);
    w.setBlock(15, 6, 5, 'air');
    settle(r); // 1 コマの予算（8ms）で 2 つ目は次のコマになる
    expect(r.rebuildStats().count).toBe(2);
  });
  it('ブロックをこわすと三角形の数が変わる (AC15)', () => {
    const { w, r } = setup();
    settle(r);
    const n = r.triangleCount();
    w.setBlock(32, 6, 32, 'air');
    settle(r);
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
    const w = new ArrayVoxelWorld(OLD_SIZE);
    const r = new WorldRenderer(w);
    r.attach(new Scene());
    const island = {
      seaY: () => 144,
      spawnInfo: () => ({ from: { x: 64, z: 64 }, fallback: false, checked: 1 }),
      startTorch: () => ({ x: 34, y: 11, z: 31 }),
      startFeatures: () => ({ rock: { cx: 0, cz: 0, r: 4, peakY: 12 }, trees: [] }),
      caveMouths: () => [],
      terrainAt: () => ({ h: 150, biome: 'harappa' as const, sea: false }),
      genHash: () => 'x',
      genStats: () => ({ columns: 1, medianMs: 1, maxMs: 1, spawnSearchMs: 1 }),
      loadedChunks: () => [{ cx: 0, cz: 0 }],
      seed: 7,
      genTimeMs: 12,
      groundHeight: () => 10,
      spawn: () => ({ x: 32.5, y: 11, z: 32.5, yawDeg: 0, pitchDeg: 0 }),
      testArea: () => ({ x0: 0, x1: 12, z0: 0, z1: 12, y0: 8, y1: 31 }),
      regions: () => { throw new Error("not used"); },
    } as WorldGenInfo;
    const h = createWorldHook(w, r, island, {} as never);
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
    expect(h.seaY()).toBe(144);
    expect(h.isLoaded(1, 1)).toBe(true);
    expect(h.isLoaded(1000, 1)).toBe(false);
    expect(h.loadedChunks()).toEqual([{ cx: 0, cz: 0 }]);
    expect(h.startTorch().x).toBe(34);
    expect(h.terrainAt(0, 0).biome).toBe('harappa');
    expect(h.blockTypes()).toHaveLength(BLOCK_TYPES.length); // #184: 新しいブロックが足されても数を決め打ちしない
    r.update();
    expect(h.rebuildStats().count).toBeGreaterThan(0);
  });
});
