import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CropStage, CropStageSource } from '../../../contracts';
import { AIR, BLOCK_INDEX, WATER, isOpaqueIndex } from '../../blocks/blockTypes';
import { populateWorld } from '../../gen/populate';
import { regionRect } from '../../gen/region';
import { WorldLight } from '../../light/WorldLight';
import { SkyDarkness } from '../../light/skyDarkness';
import { ArrayVoxelWorld } from '../../VoxelWorld';
import type { MeshData } from '../meshChunk';
import { SectionMesher, type MeshTier, type SectionMeshData } from './sectionMesher';

/**
 * PERF-2（docs/tickets/PERF-2.md テスト 1）: 1 セクションの作り直しを「続きから再開できる仕事」にしても、出力はバイト単位で同じ。
 *  (1) 前の値の表（golden）: 実装の前の main の build() の出力の FNV ハッシュ。実装のあとも全部同じ。
 *      表の作り直し（ふだんはしない）: GOLDEN_WRITE=1 npx vitest run src/world/render/voxel/sectionMesher.slice.test.ts
 *      作り直しの記録: #293（間欠泉の つち の 絵 2 まいで アトラスが 21 → 22 行に ふえ、extras の UV の 縦の 目盛りが かわった。
 *      2 まいを 外すと 表は そのまま 通る = 地形の 形・ライトは かわって いない ことを 確かめて 作り直した）。
 *  (2) start → resume（偽物の時計で 止める所を変える）が build() と同じ。
 *  (3) 途中の cancel → 別のセクションが build() と同じ（前の仕事の残りがまざらない）。
 */

const GOLDEN_PATH = fileURLToPath(new URL('./sectionMesher.slice.golden.json', import.meta.url));
const SEEDS = [20261012, 7, 31415];

// ------------------------------------------------------------ 中身の FNV-1a

class Fnv {
  private a = 0x811c9dc5;
  private b = 0x01000193 ^ 0x9e3779b9; // 2 本目（ちがう出だしの値）で 衝突を さらに 減らす
  bytes(u8: Uint8Array): void {
    let a = this.a;
    let b = this.b;
    for (let i = 0; i < u8.length; i++) {
      a = Math.imul(a ^ u8[i], 0x01000193);
      b = Math.imul(b ^ u8[i], 0x01000193);
      b = (b + i) | 0;
    }
    this.a = a;
    this.b = b;
    this.num(u8.length);
  }
  num(n: number): void {
    const t = new Uint8Array(new Float64Array([n]).buffer);
    let a = this.a;
    for (let i = 0; i < 8; i++) a = Math.imul(a ^ t[i], 0x01000193);
    this.a = a;
  }
  hex(): string {
    return (this.a >>> 0).toString(16).padStart(8, '0') + (this.b >>> 0).toString(16).padStart(8, '0');
  }
}

function addMesh(h: Fnv, m: MeshData): void {
  for (const arr of [m.positions, m.uvs, m.colors, m.lights, m.darks, m.indices]) {
    h.bytes(new Uint8Array(new Float64Array(arr).buffer));
  }
  h.num(m.faceCount);
}

/** build() / resume() の出力ぜんぶ（pieces の 4 配列＋indices・extras・water・faces・triangles・occupancy）の ハッシュ */
function digest(d: SectionMeshData): string {
  const h = new Fnv();
  h.num(d.pieces.length);
  for (const p of d.pieces) {
    h.bytes(new Uint8Array(p.positions.buffer, p.positions.byteOffset, p.positions.byteLength));
    h.bytes(p.data);
    h.bytes(p.light);
    h.bytes(new Uint8Array(p.indices.buffer, p.indices.byteOffset, p.indices.byteLength));
    h.num(p.indices.BYTES_PER_ELEMENT);
    h.num(p.vertexCount);
  }
  h.num(d.faces);
  addMesh(h, d.extras);
  addMesh(h, d.water);
  h.num(d.triangles);
  if (d.occupancy === null) h.num(-1);
  else h.bytes(d.occupancy);
  return h.hex();
}

// ------------------------------------------------------------ いつもの島 + 足したもの

type Feature = 'ground' | 'tree' | 'water' | 'torch' | 'crop' | 'cave' | 'cliff' | 'top';

interface Scene {
  world: ArrayVoxelWorld;
  light: WorldLight;
  crops: CropStageSource;
  cases: { cx: number; sy: number; cz: number; feature: Feature }[];
}

const LEAVES = new Set([BLOCK_INDEX.leaves, BLOCK_INDEX.momiji_leaves, BLOCK_INDEX.matsu_leaves]);
const CROPS = [BLOCK_INDEX.crop_onion, BLOCK_INDEX.crop_tomato, BLOCK_INDEX.crop_pumpkin, BLOCK_INDEX.crop_eggplant];
const CROP_IDS = new Set(CROPS);
const PER_FEATURE = 4;

function pick<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(xs[Math.floor(((i + 0.5) * xs.length) / n)]);
  return out;
}

function topOf(w: ArrayVoxelWorld, x: number, z: number): number {
  for (let y = w.size.y - 1; y >= 0; y--) if (w.getIndex(x, y, z) > 0) return y;
  return -1;
}

function makeScene(seed: number): Scene {
  const w = new ArrayVoxelWorld({ x: 0, z: 0 });
  populateWorld(w, seed);
  const R = regionRect(seed);
  // 水: 島の中に 池を 2 つほる（5×5 の 2 段ぶんを 水に。まわりは 地面）。島に水の無い seed があるため
  for (const [fx, fz] of [[0.3, 0.4], [0.62, 0.7]]) {
    const px = Math.floor(R.x0 + (R.x1 - R.x0) * fx);
    const pz = Math.floor(R.z0 + (R.z1 - R.z0) * fz);
    for (let dz = 0; dz < 5; dz++) {
      for (let dx = 0; dx < 5; dx++) {
        const t = topOf(w, px + dx, pz + dz);
        if (t < 3) continue;
        w.setBlock(px + dx, t, pz + dz, 'water');
        w.setBlock(px + dx, t - 1, pz + dz, 'water');
      }
    }
  }
  // たいまつ・作物を 地面の上に足す（決まった間隔。地面は 空気の上が 開いている所だけ）
  let torches = 0;
  let crops = 0;
  for (let z = R.z0 + 8; z < R.z1 - 8 && (torches < 6 || crops < 12); z += 5) {
    for (let x = R.x0 + 8; x < R.x1 - 8 && (torches < 6 || crops < 12); x += 7) {
      const t = topOf(w, x, z);
      if (t < 0 || t + 2 >= w.size.y) continue;
      const b = w.getIndex(x, t, z);
      if (b === WATER || !isOpaqueIndex(b) || LEAVES.has(b)) continue;
      if (w.getIndex(x, t + 1, z) !== AIR) continue;
      if ((x + z) % 2 === 0 && torches < 6) {
        w.setBlock(x, t + 1, z, 'torch');
        torches++;
      } else if (crops < 12) {
        w.setBlock(x, t + 1, z, (['crop_onion', 'crop_tomato', 'crop_pumpkin', 'crop_eggplant'] as const)[crops % 4]);
        crops++;
      }
    }
  }
  const light = new WorldLight(w, new SkyDarkness());
  light.flush();
  const cropSrc: CropStageSource = {
    stageAt: (x, y, z) => (CROP_IDS.has(w.getIndex(x, y, z)) ? ((((x + z) >> 1) & 3) as CropStage) : null),
  };

  const by = new Map<Feature, { cx: number; sy: number; cz: number }[]>();
  const seen = new Set<string>();
  const note = (f: Feature, x: number, y: number, z: number) => {
    const cx = x >> 4;
    const sy = y >> 4;
    const cz = z >> 4;
    const k = `${f}:${cx},${sy},${cz}`;
    if (seen.has(k)) return;
    seen.add(k);
    let a = by.get(f);
    if (!a) by.set(f, (a = []));
    a.push({ cx, sy, cz });
  };
  const nSec = Math.ceil(w.size.y / 16);
  for (let z = R.z0; z < R.z1; z++) {
    for (let x = R.x0; x < R.x1; x++) {
      const t = topOf(w, x, z);
      if (t < 0) continue;
      note('ground', x, t, z);
      const tx = topOf(w, x + 1, z);
      const tz = topOf(w, x, z + 1);
      if (Math.abs(t - tx) >= 3 && x + 1 < R.x1) note('cliff', x, Math.max(t, tx), z);
      if (Math.abs(t - tz) >= 3 && z + 1 < R.z1) note('cliff', x, Math.max(t, tz), z);
      let covered = false;
      for (let y = t; y >= 1; y--) {
        const b = w.getIndex(x, y, z);
        if (b === AIR) {
          if (covered) note('cave', x, y, z);
        } else if (b === WATER) note('water', x, y, z);
        else if (LEAVES.has(b)) note('tree', x, y, z);
        else if (b === BLOCK_INDEX.torch) note('torch', x, y, z);
        else if (CROP_IDS.has(b)) note('crop', x, y, z);
        else if (isOpaqueIndex(b) && y < t - 1) covered = true;
      }
    }
  }
  const cases: Scene['cases'] = [];
  for (const f of ['ground', 'tree', 'water', 'torch', 'crop', 'cave', 'cliff'] as const) {
    for (const c of pick(by.get(f) ?? [], PER_FEATURE)) cases.push({ ...c, feature: f });
  }
  // 世界の上のはし（ほぼ空気。いちばん上のセクション）
  for (const [dx, dz] of [[0.5, 0.5], [0.25, 0.75]]) cases.push({ cx: Math.floor(((R.x0 + R.x1) / 2 / 16) * 2 * dx) >> 1, sy: nSec - 1, cz: Math.floor(((R.z0 + R.z1) / 2 / 16) * 2 * dz) >> 1, feature: 'top' });
  return { world: w, light, crops: cropSrc, cases };
}

const scenes = new Map<number, Scene>();
const sceneOf = (seed: number): Scene => {
  let s = scenes.get(seed);
  if (!s) scenes.set(seed, (s = makeScene(seed)));
  return s;
};

const keyOf = (seed: number, c: { cx: number; sy: number; cz: number }, tier: MeshTier) => `${seed}:${c.cx},${c.sy},${c.cz}:${tier}`;

// ------------------------------------------------------------ (1) 前の値の表

describe('PERF-2 前の値の表（golden）', () => {
  it('build() の出力のハッシュが、実装の前の main で作った表と全部同じ（セクション 40 以上、micro と box の両方、地面・木・水・たいまつ・作物・洞くつ・崖・世界の上のはし）', { timeout: 600_000 }, () => {
    const got: Record<string, string> = {};
    const features = new Set<Feature>();
    let sections = 0;
    for (const seed of SEEDS) {
      const s = sceneOf(seed);
      const m = new SectionMesher(s.world, s.light);
      for (const c of s.cases) {
        sections++;
        features.add(c.feature);
        for (const tier of ['micro', 'box'] as const) got[keyOf(seed, c, tier)] = digest(m.build(c.cx, c.sy, c.cz, tier, { crops: s.crops }));
      }
    }
    if (process.env.GOLDEN_WRITE === '1') {
      const sorted = Object.fromEntries(Object.entries(got).sort(([a], [b]) => (a < b ? -1 : 1)));
      writeFileSync(GOLDEN_PATH, JSON.stringify(sorted, null, 1) + '\n');
    }
    expect(sections, '調べるセクション').toBeGreaterThanOrEqual(40);
    expect([...features].sort(), 'ふくむ種類').toEqual(['cave', 'cliff', 'crop', 'ground', 'top', 'torch', 'tree', 'water']);
    const want = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<string, string>;
    expect(Object.keys(got).sort(), '表のセクションの一覧').toEqual(Object.keys(want).sort());
    const bad = Object.keys(want).filter((k) => got[k] !== want[k]);
    expect(bad, 'ハッシュがちがうセクション').toEqual([]);
  });
});

// ------------------------------------------------------------ (2)(3) 再開しても同じ

/** 呼ぶたびに 1 進む偽物の時計 */
function fakeClock() {
  let t = 0;
  return { now: () => t++, peek: () => t };
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sliceCases(): { seed: number; c: Scene['cases'][number] }[] {
  const seed = SEEDS[0];
  const s = sceneOf(seed);
  const wanted: Feature[] = ['ground', 'tree', 'water', 'torch', 'crop', 'cave', 'cliff'];
  const out: { seed: number; c: Scene['cases'][number] }[] = [];
  for (const f of wanted) {
    const c = s.cases.find((x) => x.feature === f);
    if (c) out.push({ seed, c });
  }
  return out;
}

/** start → 締め切りまで resume をくり返して、最後のデータを返す。step(i) = i 回目の resume の 締め切りまでの時計の数 */
function runSliced(m: SectionMesher, c: { cx: number; sy: number; cz: number }, tier: MeshTier, crops: CropStageSource, step: (i: number) => number): { data: SectionMeshData; calls: number } {
  const clk = fakeClock();
  m.start(c.cx, c.sy, c.cz, tier, { crops });
  for (let i = 0; i < 2_000_000; i++) {
    const r = m.resume(clk.peek() + step(i), clk.now);
    if (r !== null) return { data: r, calls: i + 1 };
  }
  throw new Error('resume が おわらない');
}

describe('PERF-2 start / resume / cancel', () => {
  it('止める所を 1 単位ずつ・3 単位ずつ・乱数（seed 固定）で 50 とおり変えても、毎回 build() と同じ。どの回も 実際に 2 回以上に分かれる', { timeout: 600_000 }, () => {
    const cases = sliceCases();
    expect(cases.length, '種類の違うセクション').toBeGreaterThanOrEqual(5);
    const s = sceneOf(SEEDS[0]);
    const m = new SectionMesher(s.world, s.light);
    const want = new Map<number, string>();
    cases.forEach(({ c }, i) => want.set(i, digest(m.build(c.cx, c.sy, c.cz, 'micro', { crops: s.crops }))));
    const rand = rng(20260601);
    const bad: string[] = [];
    let minCalls = Infinity;
    for (let n = 0; n < 50; n++) {
      const i = n % cases.length;
      const c = cases[i].c;
      const mode = n % 3;
      const r = rng(1000 + n);
      const step = mode === 0 ? () => 0 : mode === 1 ? () => 3 : () => Math.floor(rand() * 8 * r());
      const { data, calls } = runSliced(m, c, 'micro', s.crops, step);
      minCalls = Math.min(minCalls, calls);
      if (digest(data) !== want.get(i)) bad.push(`#${n} ${c.feature} ${c.cx},${c.sy},${c.cz} mode${mode}`);
      expect(m.busy, '終わったら busy でない').toBe(false);
    }
    expect(bad, 'build() とちがう出力').toEqual([]);
    expect(minCalls, '1 単位ずつなら 何回にも分かれる').toBeGreaterThan(1);
  });

  it('box の段は 分けない: start のあと resume 1 回で build() と同じものができる', () => {
    const s = sceneOf(SEEDS[0]);
    const m = new SectionMesher(s.world, s.light);
    const c = s.cases[0];
    const want = digest(m.build(c.cx, c.sy, c.cz, 'box', { crops: s.crops }));
    const { data, calls } = runSliced(m, c, 'box', s.crops, () => 0);
    expect(calls).toBe(1);
    expect(digest(data)).toBe(want);
  });

  it('途中で cancel → 別のセクションを start → 最後まで: build() と同じ（前の仕事の残りがまざらない）', { timeout: 300_000 }, () => {
    const cases = sliceCases();
    const s = sceneOf(SEEDS[0]);
    const m = new SectionMesher(s.world, s.light);
    const want = cases.map(({ c }) => digest(m.build(c.cx, c.sy, c.cz, 'micro', { crops: s.crops })));
    const clk = fakeClock();
    for (let i = 0; i < cases.length; i++) {
      const a = cases[i].c;
      const j = (i + 1) % cases.length;
      const b = cases[j].c;
      m.start(a.cx, a.sy, a.cz, 'micro', { crops: s.crops });
      // 途中まで（1 回では終わらない）
      for (let k = 0; k < 3; k++) {
        const r = m.resume(clk.peek(), clk.now);
        if (r !== null) break;
      }
      expect(m.busy, '途中のはず').toBe(true);
      m.cancel();
      expect(m.busy, 'cancel のあと').toBe(false);
      const { data } = runSliced(m, b, 'micro', s.crops, () => 5);
      expect(digest(data), `${cases[i].c.feature} の途中で捨てたあとの ${cases[j].c.feature}`).toBe(want[j]);
      // 前の仕事を start しただけ（resume 前）で別を start しても 捨てられる
      m.start(a.cx, a.sy, a.cz, 'micro', { crops: s.crops });
      const { data: d2 } = runSliced(m, b, 'micro', s.crops, () => 2);
      expect(digest(d2), 'start の上書き').toBe(want[j]);
    }
  });
});
