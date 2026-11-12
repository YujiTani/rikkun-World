import { describe, expect, it, vi } from 'vitest';
import { SEA_Y, WORLD_HEIGHT } from '../../contracts';
import { BLOCK_INDEX, BLOCK_TYPES } from '../blocks/blockTypes';
import { SECTION_VOLUME, sectionToArray } from '../sections';
import { clearCountryCache, countryAt, mountainFrame, type CountryKind } from './biome';
import { generateChunk } from './chunk';
import { GEN_CONFIG as C } from './config';
import { plantsInRect } from './placement';
import { clearTerrainCache, terrainFor } from './terrain';

/**
 * #187 VOX-I-4b「国だけの物 その 2（山の物）」（docs/design/VOX-I.md §2.3・§8.3、タスク票 docs/tickets/VOX-I-4b.md）。
 * AC1（山ごとの数）・AC2（山の外に 0 こ）・AC3（作る順）・AC4（かいだん）・生成とのずれ。4a の countryFeatures.test.ts と 同じ 書き方。
 * 窓口: `featuresInRect`（4a と 同じ。type が 5 つ ふえる）と、かいだんの 道 `kaidanPath(seed, feature)`（どちらも src/world/gen/countryFeatures.ts）。
 * 名前の 前提は タスク票の 末尾「テストが 前提にした 名前」。まだ 無いので ここは 赤になる。
 */

vi.setConfig({ testTimeout: 600_000 });

interface Feature {
  type: string;
  cx: number;
  cz: number;
  x: number;
  y: number;
  z: number;
}
interface Cell {
  x: number;
  y: number;
  z: number;
}
type FeaturesFn = (seed: number, x0: number, z0: number, x1: number, z1: number) => Feature[];
type PathFn = (seed: number, f: Feature) => Cell[];

const loaders = import.meta.glob('./countryFeatures.ts');
async function mod(): Promise<{ featuresInRect?: FeaturesFn; kaidanPath?: PathFn }> {
  const l = loaders['./countryFeatures.ts'];
  expect(l, 'src/world/gen/countryFeatures.ts が まだ無い').toBeDefined();
  return (await l!()) as { featuresInRect?: FeaturesFn; kaidanPath?: PathFn };
}
async function load(): Promise<FeaturesFn> {
  const m = await mod();
  expect(typeof m.featuresInRect, 'featuresInRect が まだ無い').toBe('function');
  return m.featuresInRect!;
}
async function loadPath(): Promise<PathFn> {
  const m = await mod();
  expect(typeof m.kaidanPath, 'kaidanPath が まだ無い').toBe('function');
  return m.kaidanPath!;
}

const SEEDS = [20261012, 1, 777];
const BLEND = C.biome.blend;
const FR = 9;
const frameRange = Array.from({ length: 2 * FR + 1 }, (_, k) => k - FR);
/** 山の まわり ±R の 四角（山の点どうしは 320 以上 はなれている ので ほかの 山の 物は 入らない） */
const R = 150;
/** type → その物が ある 山の 国 */
const OWNER: Record<string, CountryKind> = { suisho: 'iwayama', touro: 'tengu', kaidan: 'tengu', oomomiji: 'momiji', yukidaruma: 'yuki' };
const TYPES = Object.keys(OWNER);

interface Mtn {
  kind: CountryKind;
  px: number;
  pz: number;
}
const mtnCache = new Map<string, Mtn[]>();
/** その 国の 山（点が 陸 = 海面より上 の ものだけ。頂上は 陸の 上）を 20 こまで */
function mountainsOf(seed: number, kind: CountryKind): Mtn[] {
  const key = `${seed},${kind}`;
  let v = mtnCache.get(key);
  if (v) return v;
  v = [];
  const T = terrainFor(seed);
  for (const fz of frameRange) {
    for (const fx of frameRange) {
      const m = mountainFrame(seed, fx, fz).mountain;
      if (m && m.kind === kind && T.height(m.px, m.pz) >= SEA_Y) v.push({ kind, px: m.px, pz: m.pz });
    }
  }
  v = v.slice(0, 20);
  mtnCache.set(key, v);
  return v;
}
const rectOf = (m: Mtn): [number, number, number, number] => [m.px - R, m.pz - R, m.px + R, m.pz + R];
const cheb = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
const ofType = (fn: FeaturesFn, seed: number, m: Mtn, type: string): Feature[] => fn(seed, ...rectOf(m)).filter((f) => f.type === type);

/** 山ごとの 数（その 山に 出る type だけ） */
function perMountain(fn: FeaturesFn, type: string): { seed: number; m: Mtn; list: Feature[] }[] {
  const out: { seed: number; m: Mtn; list: Feature[] }[] = [];
  for (const seed of SEEDS) {
    const ms = mountainsOf(seed, OWNER[type]!);
    expect(ms.length, `seed ${seed} ${OWNER[type]} の 陸の 山`).toBeGreaterThan(0);
    for (const m of ms) out.push({ seed, m, list: ofType(fn, seed, m, type) });
  }
  return out;
}

describe('#187-AC1: 山ごとの 数（§2.3 の表）', () => {
  for (const [type, lo, hi] of [['touro', 1, 1], ['oomomiji', 1, 1], ['yukidaruma', 1, 1], ['suisho', 2, 4], ['kaidan', 0, 1]] as const) {
    it(`${type}: 1 山に ${lo}〜${hi} こ`, async () => {
      const fn = await load();
      const rows = perMountain(fn, type);
      for (const { seed, m, list } of rows) expect(list.length, `${type} seed ${seed} 山 (${m.px},${m.pz})`).toBeGreaterThanOrEqual(lo);
      for (const { seed, m, list } of rows) expect(list.length, `${type} seed ${seed} 山 (${m.px},${m.pz})`).toBeLessThanOrEqual(hi);
      if (type === 'kaidan') expect(rows.filter((r) => r.list.length === 1).length, 'かいだんの ある 山').toBeGreaterThan(0);
    });
  }

  it('suisho: 山の点から 40 以内・海から +40 以上・すいしょうどうし 4 以上はなす', async () => {
    const fn = await load();
    let n = 0;
    for (const { seed, m, list } of perMountain(fn, 'suisho')) {
      n += list.length;
      for (const f of list) {
        expect(cheb(f, { x: m.px, z: m.pz }), `(${f.x},${f.z}) 山の点から`).toBeLessThanOrEqual(40);
        expect(f.y - SEA_Y, `seed ${seed} (${f.x},${f.z}) 海から`).toBeGreaterThanOrEqual(40);
      }
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) expect(cheb(list[a]!, list[b]!)).toBeGreaterThanOrEqual(4);
    }
    expect(n, 'suisho が まだ 出ない').toBeGreaterThan(0);
  });

  it('touro・yukidaruma・oomomiji: 頂上（山の点から 6 以内）か、その まわり（とうろう・ゆきだるま 3 以内・おおもみじ 6 以内）', async () => {
    const fn = await load();
    for (const [type, reach] of [['touro', 9], ['yukidaruma', 9], ['oomomiji', 12]] as const) {
      let n = 0;
      for (const { seed, m, list } of perMountain(fn, type)) {
        n += list.length;
        for (const f of list) expect(cheb(f, { x: m.px, z: m.pz }), `${type} seed ${seed}`).toBeLessThanOrEqual(reach);
      }
      expect(n, `${type} が まだ 出ない`).toBeGreaterThan(0);
    }
  });
});

describe('#187-AC2: 山の外・境目には 0 こ', () => {
  it('5 種は どれも その山の 国の 中で e >= blend', async () => {
    const fn = await load();
    for (const type of TYPES) {
      let n = 0;
      for (const { seed, list } of perMountain(fn, type)) {
        for (const f of list) {
          const a = countryAt(seed, f.x, f.z);
          expect(a.kind, `${type} (${f.x},${f.z}) の国`).toBe(OWNER[type]);
          expect(a.e, `${type} (${f.x},${f.z}) は 境目の外`).toBeGreaterThanOrEqual(BLEND);
          n++;
        }
      }
      expect(n, `${type} が 出る`).toBeGreaterThan(0);
    }
  });

  it('ほかの 山には その 物が 出ない（とうろうは てんぐの 山だけ、など）', async () => {
    const fn = await load();
    let own = 0;
    for (const seed of SEEDS) {
      for (const kind of ['iwayama', 'tengu', 'momiji', 'yuki'] as const) {
        for (const m of mountainsOf(seed, kind).slice(0, 5)) {
          own += fn(seed, ...rectOf(m)).filter((f) => OWNER[f.type] === kind).length;
          const wrong = fn(seed, ...rectOf(m)).filter((f) => TYPES.includes(f.type) && OWNER[f.type] !== kind);
          expect(wrong, `${kind} (${m.px},${m.pz})`).toEqual([]);
        }
      }
    }
    expect(own, '自分の 山には 出る（まだ 出ない）').toBeGreaterThan(0);
  });
});

describe('#187-AC3: 作る順に関係なく 同じ', () => {
  it('覚えを 捨てて 逆順に 聞いても 同じ（5 種と かいだんの 道）', async () => {
    const fn = await load();
    const path = await loadPath();
    const seed = 20261012;
    const rects: [number, number, number, number][] = [];
    for (const kind of ['iwayama', 'tengu', 'momiji', 'yuki'] as const) for (const m of mountainsOf(seed, kind).slice(0, 3)) rects.push(rectOf(m));
    const key = (l: Feature[]): string => JSON.stringify([...l].sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y || a.type.localeCompare(b.type)));
    const all = (): string[] =>
      rects.map((r) => {
        const l = fn(seed, ...r).filter((f) => TYPES.includes(f.type));
        return key(l) + JSON.stringify(l.filter((f) => f.type === 'kaidan').map((f) => path(seed, f)));
      });
    clearTerrainCache();
    clearCountryCache();
    const fwd = all();
    clearTerrainCache();
    clearCountryCache();
    const rev = [...rects].reverse();
    const back = rev.map((r) => {
      const l = fn(seed, ...r).filter((f) => TYPES.includes(f.type));
      return key(l) + JSON.stringify(l.filter((f) => f.type === 'kaidan').map((f) => path(seed, f)));
    }).reverse();
    expect(back).toEqual(fwd);
    expect(fwd.some((k) => k.startsWith('[{'))).toBe(true);
  });
});

/** チャンクは 1 回だけ 作って 覚える（作るのは 1 回 約 100ms） */
const chunks = new Map<string, Uint16Array>();
const blockAt = (seed: number, x: number, y: number, z: number): number => {
  const key = `${seed},${x >> 4},${z >> 4}`;
  let arr = chunks.get(key);
  if (!arr) {
    const a = new Uint16Array(WORLD_HEIGHT * 256);
    generateChunk(seed, x >> 4, z >> 4).sections.forEach((s, sy) => a.set(sectionToArray(s), sy * SECTION_VOLUME));
    chunks.set(key, (arr = a));
  }
  return arr[(y * 16 + (z & 15)) * 16 + (x & 15)]!;
};
const id = (name: string): number => {
  const v = (BLOCK_INDEX as Record<string, number>)[name];
  expect(v, `ブロック ${name} が まだ無い`).toBeDefined();
  return v!;
};
const AIR = BLOCK_INDEX.air;
const solid = (b: number): boolean => BLOCK_TYPES[b]?.solid === true;

describe('#187-AC4: かいだん', () => {
  it('となりあう 2 マスの 高さの差 1 以下・上に 空気 3・うめる／けずるは 4 まで・頂上から すそ まで つながる', async () => {
    const fn = await load();
    const path = await loadPath();
    let checked = 0;
    for (const seed of SEEDS) {
      const T = terrainFor(seed);
      for (const m of mountainsOf(seed, 'tengu')) {
        for (const f of ofType(fn, seed, m, 'kaidan')) {
          // 道 = 床の ブロックの 場所（y = 床。立つのは y + 1）。頂上がわから すそへ 1 歩ずつ ならび、1 歩に 2 マス（はば 2）
          const p = path(seed, f);
          expect(p.length, 'かいだんの 道').toBeGreaterThan(0);
          const steps = new Map<string, Cell>();
          for (const c of p) steps.set(`${c.x},${c.z}`, c);
          for (const c of p) {
            expect(solid(blockAt(seed, c.x, c.y, c.z)), `床 (${c.x},${c.y},${c.z})`).toBe(true);
            for (let k = 1; k <= 3; k++) expect(blockAt(seed, c.x, c.y + k, c.z), `空気 (${c.x},${c.y + k},${c.z})`).toBe(AIR);
            expect(Math.abs(c.y - T.height(c.x, c.z)), `うめる・けずる (${c.x},${c.z})`).toBeLessThanOrEqual(4);
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
              const n = steps.get(`${c.x + dx},${c.z + dz}`);
              if (n) expect(Math.abs(n.y - c.y), `となり (${c.x},${c.z})→(${n.x},${n.z})`).toBeLessThanOrEqual(1);
            }
          }
          // つながる: 頂上がわの はしから 出て、道の マスを たどって すそまで 行ける（4 方向。高さ差 1 以下）
          const seen = new Set<string>([`${p[0]!.x},${p[0]!.z}`]);
          const queue = [p[0]!];
          while (queue.length > 0) {
            const c = queue.pop()!;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
              const n = steps.get(`${c.x + dx},${c.z + dz}`);
              if (n && !seen.has(`${n.x},${n.z}`) && Math.abs(n.y - c.y) <= 1) {
                seen.add(`${n.x},${n.z}`);
                queue.push(n);
              }
            }
          }
          expect(seen.size, 'つながって いない マスが ある').toBe(steps.size);
          expect(cheb(p[0]!, f), '頂上がわの はしは 基準の マスの そば').toBeLessThanOrEqual(1);
          checked++;
        }
      }
    }
    expect(checked, 'かいだんの ある 山').toBeGreaterThan(0);
  });
});

describe('生成とのずれ: features の場所に 本当に その物が ある', () => {
  const pick = async (type: string, n: number): Promise<{ seed: number; f: Feature }[]> => {
    const fn = await load();
    const out: { seed: number; f: Feature }[] = [];
    for (const seed of SEEDS) for (const m of mountainsOf(seed, OWNER[type]!)) for (const f of ofType(fn, seed, m, type)) out.push({ seed, f });
    expect(out.length, `${type} が まだ 出ない`).toBeGreaterThan(0);
    return out.slice(0, n);
  };

  it('touro・suisho: そのマスに ブロックが ある', async () => {
    for (const type of ['touro', 'suisho'] as const) for (const { seed, f } of await pick(type, 6)) expect(blockAt(seed, f.x, f.y, f.z), `${type} (${f.x},${f.y},${f.z})`).toBe(id(type));
  });
  it('oomomiji: 基準（みきの 北西の 根もと）から 2×2 の みきが 10 こ以上 のび、まわりに もみじの はっぱ', async () => {
    const LOG = id('log');
    const LEAF = id('momiji_leaves');
    for (const { seed, f } of await pick('oomomiji', 3)) {
      for (let h = 0; h < 10; h++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) expect(blockAt(seed, f.x + dx, f.y + h, f.z + dz), `みき h=${h}`).toBe(LOG);
      let leaves = 0;
      for (let dx = -6; dx <= 7; dx++) for (let dz = -6; dz <= 7; dz++) for (let dy = 6; dy <= 14; dy++) if (blockAt(seed, f.x + dx, f.y + dy, f.z + dz) === LEAF) leaves++;
      expect(leaves, `(${f.x},${f.z}) もみじの はっぱ`).toBeGreaterThanOrEqual(20);
    }
  });
  it('yukidaruma: 基準（いちばん 下の マス）から 高さ 3 が ゆき・その上は 空気・目の いしが ある', async () => {
    const SNOW = id('snow');
    const STONE = id('stone');
    for (const { seed, f } of await pick('yukidaruma', 3)) {
      for (let h = 0; h < 3; h++) expect(blockAt(seed, f.x, f.y + h, f.z), `ゆき h=${h}`).toBe(SNOW);
      expect(blockAt(seed, f.x, f.y + 3, f.z), '上は 空気').toBe(AIR);
      let eyes = 0;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 1; dy < 3; dy++) if ((dx !== 0 || dz !== 0) && blockAt(seed, f.x + dx, f.y + dy, f.z + dz) === STONE) eyes++; // ゆきの 列の となり・地面より 上
      expect(eyes, '目の いし').toBeGreaterThanOrEqual(1);
    }
  });
});

describe('おちば（ブロック）', () => {
  /** 山の 中（点から 96 まで）と、外がわ（160〜240）の チャンクを 数える */
  const IN = 96;
  const OUT = [160, 240] as const;
  it('もみじやま の 外には 0 こ。もみじの木の みきから 2 以内の くさ は おちばに なる（くさ のこらない）', () => {
    const OCHIBA = id('ochiba');
    const GRASS = BLOCK_INDEX.grass;
    const seed = 20261012;
    const m = mountainsOf(seed, 'momiji')[0]!;
    expect(m, 'もみじやま').toBeDefined();
    let inside = 0;
    for (let cz = (m.pz - OUT[1]) >> 4; cz <= (m.pz + OUT[1]) >> 4; cz++) {
      for (let cx = (m.px - OUT[1]) >> 4; cx <= (m.px + OUT[1]) >> 4; cx++) {
        const d = Math.max(Math.abs(cx * 16 + 8 - m.px), Math.abs(cz * 16 + 8 - m.pz));
        if (d > IN && (d < OUT[0] || d > OUT[1])) continue;
        const x0 = cx * 16;
        const z0 = cz * 16;
        blockAt(seed, x0, 0, z0);
        const arr = chunks.get(`${seed},${cx},${cz}`)!;
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] !== OCHIBA) continue;
          const x = x0 + (i & 15);
          const z = z0 + ((i >> 4) & 15);
          expect(countryAt(seed, x, z).kind, `おちば (${x},${z}) は もみじやまの 中`).toBe('momiji');
          if (d <= IN) inside++;
        }
      }
    }
    expect(inside, 'もみじやまの おちば').toBeGreaterThan(0);
    const trees = plantsInRect(seed, m.px - 64, m.pz - 64, m.px + 64, m.pz + 64).filter((p) => p.type === 'momiji' && countryAt(seed, p.x, p.z).kind === 'momiji' && countryAt(seed, p.x, p.z).e >= BLEND && blockAt(seed, p.x, p.y, p.z) === id('log')); // おおもみじが まわり 6 の 木を どけるので、みきが 本当に ある 木だけ
    expect(trees.length, 'もみじの木').toBeGreaterThan(0);
    for (const t of trees.slice(0, 5)) {
      let o = 0;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dy = -3; dy <= 1; dy++) {
            const b = blockAt(seed, t.x + dx, t.y + dy, t.z + dz);
            if (b === OCHIBA) o++;
            // 地面の くさ（上が 空気）は のこらない
            if (b === GRASS && blockAt(seed, t.x + dx, t.y + dy + 1, t.z + dz) === AIR) expect.fail(`くさが のこった (${t.x + dx},${t.y + dy},${t.z + dz})`);
          }
        }
      }
      expect(o, `木 (${t.x},${t.z}) の まわりの おちば`).toBeGreaterThanOrEqual(10);
    }
  });
});
