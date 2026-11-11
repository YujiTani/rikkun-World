import { describe, expect, it } from 'vitest';
import { WILD_BLOCK, WORLD_HEIGHT } from '../../contracts';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { SECTION_VOLUME, sectionToArray } from '../sections';
import { clearCountryCache, countryAt, countryCell, takePath, type CountryKind } from './biome';
import { generateChunk } from './chunk';
import { GEN_CONFIG as C } from './config';
import { clearTerrainCache } from './terrain';

/**
 * #187 VOX-I-4a「国だけの物 その 1」（docs/design/VOX-I.md §2.3・§8.3、タスク票 docs/tickets/VOX-I-4a.md）。
 * AC1（数）・AC2（国の外に 0 こ）・AC3（作る順）・生成とのずれ。
 * 窓口: `src/world/gen/countryFeatures.ts` の `featuresInRect(seed, x0, z0, x1, z1)` → { type, cx, cz, x, y, z }[]
 *   （window.__rikkun.biome.features の 中身。cx, cz は 国の升目の番号。まだ無いので ここは赤になる）。
 */

interface Feature {
  type: string;
  cx: number;
  cz: number;
  x: number;
  y: number;
  z: number;
}
type FeaturesFn = (seed: number, x0: number, z0: number, x1: number, z1: number) => Feature[];

const loaders = import.meta.glob('./countryFeatures.ts');
async function load(): Promise<FeaturesFn> {
  const l = loaders['./countryFeatures.ts'];
  expect(l, 'src/world/gen/countryFeatures.ts が まだ無い').toBeDefined();
  const m = (await l!()) as { featuresInRect?: FeaturesFn };
  expect(typeof m.featuresInRect, 'featuresInRect が まだ無い').toBe('function');
  return m.featuresInRect!;
}

const SEEDS = [20261012, 1, 777];
const BLEND = C.biome.blend;
const OWNER: Record<string, CountryKind> = {
  hatakeato: 'harappa',
  kinokoNoWa: 'mori',
  himawari: 'hana',
  kaigara: 'sunahama',
  takenoko: 'take',
  tsukimiIwa: 'susuki',
};
const TYPES = Object.keys(OWNER);

/** その国の升目（山でない）を 20 こ。番号の小さい順に 間をあけて ひろう */
function cellsOf(seed: number, kind: CountryKind): { i: number; j: number; px: number; pz: number }[] {
  const all: { i: number; j: number; px: number; pz: number }[] = [];
  for (let j = -36; j <= 36; j++) {
    for (let i = -36; i <= 36; i++) {
      const c = countryCell(seed, i, j);
      if (c.kind === kind && !c.startForced) all.push({ i, j, px: c.px, pz: c.pz });
    }
  }
  expect(all.length, `${kind} の升目が 20 こ以上`).toBeGreaterThanOrEqual(20);
  const step = all.length / 20;
  return Array.from({ length: 20 }, (_, k) => all[Math.floor(k * step)]!);
}
/** 升目 (i, j) の 点が 入る まわりの 四角（点から 48 まで見る） */
const rectOf = (c: { px: number; pz: number }): [number, number, number, number] => [c.px - 56, c.pz - 56, c.px + 56, c.pz + 56];
const cheb = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));

function perCell(fn: FeaturesFn, seed: number, kind: CountryKind, type: string) {
  return cellsOf(seed, kind).map((c) => {
    const list = fn(seed, ...rectOf(c)).filter((f) => f.type === type && f.cx === c.i && f.cz === c.j);
    return { c, list };
  });
}

describe('#187-AC1: 数（§2.3 の表）', () => {
  for (const [type, near] of [['hatakeato', 32], ['kinokoNoWa', 32], ['tsukimiIwa', 32]] as const) {
    it(`${type}: 1 升目に 1 こ まで。置けない升目は 2 割まで。点から ${near} 以内`, async () => {
      const fn = await load();
      for (const seed of SEEDS) {
        const rows = perCell(fn, seed, OWNER[type]!, type);
        for (const { c, list } of rows) {
          expect(list.length, `${type} seed ${seed} (${c.i},${c.j})`).toBeLessThanOrEqual(1);
          for (const f of list) expect(cheb(f, { x: c.px, z: c.pz }), `${type} 点からの きょり`).toBeLessThanOrEqual(near);
        }
        expect(rows.filter((r) => r.list.length === 0).length, `${type} seed ${seed} 置けない升目`).toBeLessThanOrEqual(4);
      }
    });
  }

  it('himawari: 1 升目に 5 こ まで・ひまわりどうし 4 以上はなす・点から 40 以内。8 割の升目で 3 以上', async () => {
    const fn = await load();
    for (const seed of SEEDS) {
      const rows = perCell(fn, seed, 'hana', 'himawari');
      for (const { c, list } of rows) {
        expect(list.length, `seed ${seed} (${c.i},${c.j})`).toBeLessThanOrEqual(5);
        for (const f of list) expect(cheb(f, { x: c.px, z: c.pz })).toBeLessThanOrEqual(40);
        for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) expect(cheb(list[a]!, list[b]!)).toBeGreaterThanOrEqual(4);
      }
      expect(rows.filter((r) => r.list.length >= 3).length, `seed ${seed} 3 以上の升目`).toBeGreaterThanOrEqual(16);
    }
  });

  it('kaigara: 1 列（16×16）に 4 こ まで。すなはま に ある', async () => {
    const fn = await load();
    for (const seed of SEEDS) {
      const cols = new Map<string, number>();
      for (const c of cellsOf(seed, 'sunahama')) {
        for (const f of fn(seed, ...rectOf(c)).filter((g) => g.type === 'kaigara' && g.cx === c.i && g.cz === c.j)) {
          const k = `${f.x >> 4},${f.z >> 4}`;
          cols.set(k, (cols.get(k) ?? 0) + 1);
        }
      }
      expect(cols.size, `seed ${seed} かいがらの ある列`).toBeGreaterThan(0);
      for (const [k, n] of cols) expect(n, `列 ${k}`).toBeLessThanOrEqual(4);
      expect([...cols.values()].filter((n) => n >= 2).length, `seed ${seed} 2 こ以上ある列`).toBeGreaterThan(0);
    }
  });

  it('takenoko: 1 升目に 3 こ まで。たけやぶの 道の上。たけのこ どうし 8 以上はなす。7 割の升目に 1 こ以上', async () => {
    const fn = await load();
    for (const seed of SEEDS) {
      const rows = perCell(fn, seed, 'take', 'takenoko');
      for (const { c, list } of rows) {
        expect(list.length, `seed ${seed} (${c.i},${c.j})`).toBeLessThanOrEqual(3);
        const path = new Set(takePath(seed, c.i, c.j).map((p) => `${p.x},${p.z}`));
        for (const f of list) expect(path.has(`${f.x},${f.z}`), `道の上 (${f.x},${f.z})`).toBe(true);
        for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) expect(cheb(list[a]!, list[b]!)).toBeGreaterThanOrEqual(8);
      }
      expect(rows.filter((r) => r.list.length >= 1).length, `seed ${seed} 1 こ以上の升目`).toBeGreaterThanOrEqual(14);
    }
  });
});

describe('#187-AC2: 国の外・境目には 0 こ', () => {
  it('6 種は どれも その国の升目の中で e >= blend', async () => {
    const fn = await load();
    for (const seed of SEEDS) {
      let n = 0;
      for (const type of TYPES) {
        for (const c of cellsOf(seed, OWNER[type]!)) {
          for (const f of fn(seed, ...rectOf(c)).filter((g) => g.type === type)) {
            const a = countryAt(seed, f.x, f.z);
            expect(a.kind, `${type} (${f.x},${f.z}) の国`).toBe(OWNER[type]);
            expect([a.cx, a.cz], `${type} の升目`).toEqual([f.cx, f.cz]);
            expect(a.e, `${type} (${f.x},${f.z}) は 境目の外`).toBeGreaterThanOrEqual(BLEND);
            n++;
          }
        }
      }
      expect(n, `seed ${seed} 6 種が 出る`).toBeGreaterThan(0);
    }
  });

  it('ほかの国の升目からは 6 種が 出ない', async () => {
    const fn = await load();
    for (const seed of SEEDS) {
      for (const kind of ['harappa', 'ookina', 'kappa'] as const) {
        for (const c of cellsOf(seed, kind).slice(0, 5)) {
          const own = fn(seed, c.px - 20, c.pz - 20, c.px + 20, c.pz + 20).filter((f) => TYPES.includes(f.type) && countryAt(seed, f.x, f.z).kind !== OWNER[f.type]);
          expect(own, `${kind} (${c.i},${c.j})`).toEqual([]);
        }
      }
    }
  });
});

describe('#187-AC3: 作る順に関係なく 同じ', () => {
  it('覚えを 捨てて 逆順に 聞いても 同じ', async () => {
    const fn = await load();
    const seed = 20261012;
    const rects: [number, number, number, number][] = [];
    for (const type of TYPES) for (const c of cellsOf(seed, OWNER[type]!).slice(0, 4)) rects.push(rectOf(c));
    const key = (l: Feature[]): string => JSON.stringify([...l].sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y || a.type.localeCompare(b.type)));
    clearTerrainCache();
    clearCountryCache();
    const fwd = rects.map((r) => key(fn(seed, ...r)));
    clearTerrainCache();
    clearCountryCache();
    const rev = [...rects].reverse().map((r) => key(fn(seed, ...r))).reverse();
    expect(rev).toEqual(fwd);
    expect(fwd.some((k) => k !== '[]')).toBe(true);
  });
});

describe('生成とのずれ: features の場所に 本当に その物が ある', () => {
  /** チャンクは 1 回だけ作って 覚える（作るのは 1 回 約 100ms。同じ列を 何度も作りなおすと 時間切れになる） */
  const chunks = new Map<string, Uint8Array>();
  const blockAt = (seed: number, x: number, y: number, z: number): number => {
    const key = `${seed},${x >> 4},${z >> 4}`;
    let arr = chunks.get(key);
    if (!arr) {
      arr = new Uint8Array(WORLD_HEIGHT * 256);
      generateChunk(seed, x >> 4, z >> 4).sections.forEach((s, sy) => arr!.set(sectionToArray(s), sy * SECTION_VOLUME));
      chunks.set(key, arr);
    }
    return arr[(y * 16 + (z & 15)) * 16 + (x & 15)]!;
  };
  const pick = async (seed: number, type: string, n: number): Promise<Feature[]> => {
    const fn = await load();
    return cellsOf(seed, OWNER[type]!).flatMap((c) => fn(seed, ...rectOf(c)).filter((f) => f.type === type && f.cx === c.i && f.cz === c.j)).slice(0, n);
  };
  const seed = 20261012;
  const id = (name: string): number => {
    const v = (BLOCK_INDEX as Record<string, number>)[name];
    expect(v, `ブロック ${name} が まだ無い`).toBeDefined();
    return v!;
  };

  it('himawari: 根もとに himawari・その上に himawari_top', async () => {
    for (const f of await pick(seed, 'himawari', 4)) {
      expect(blockAt(seed, f.x, f.y, f.z)).toBe(id('himawari'));
      expect(blockAt(seed, f.x, f.y + 1, f.z)).toBe(id('himawari_top'));
    }
  });
  it('kaigara・takenoko: そのマスに ある', async () => {
    for (const [type, block] of [['kaigara', 'kaigara'], ['takenoko', 'takenoko']] as const) {
      const list = await pick(seed, type, 4);
      expect(list.length, type).toBeGreaterThan(0);
      for (const f of list) expect(blockAt(seed, f.x, f.y, f.z), `${type} (${f.x},${f.y},${f.z})`).toBe(id(block));
    }
  });
  it('kinokoNoWa: まん中から 半径 3 の 8 か所に きのこが 6 本以上', async () => {
    const list = await pick(seed, 'kinokoNoWa', 3);
    expect(list.length).toBeGreaterThan(0);
    const K = id('kinoko');
    for (const f of list) {
      let n = 0;
      for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [2, -2], [-2, 2], [-2, -2]] as const) {
        for (let dy = -3; dy <= 3; dy++) if (blockAt(seed, f.x + dx, f.y + dy, f.z + dz) === K) { n++; break; }
      }
      expect(n, `(${f.x},${f.z})`).toBeGreaterThanOrEqual(6);
    }
  });
  it('tsukimiIwa: まわりに いしの かたまり（15 こ以上）', async () => {
    const list = await pick(seed, 'tsukimiIwa', 3);
    expect(list.length).toBeGreaterThan(0);
    const S = id('stone');
    for (const f of list) {
      let n = 0;
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = 0; dy <= 4; dy++) if (blockAt(seed, f.x + dx, f.y + dy, f.z + dz) === S) n++;
      expect(n, `(${f.x},${f.z})`).toBeGreaterThanOrEqual(15);
      // 偶然の いしの がけ では 通らない: まん中の 列に いしが 3 つ以上 つながって 上に のびる（まるい山の 高さ 3〜4）
      let run = 0;
      let best = 0;
      for (let dy = 0; dy <= 5; dy++) {
        run = blockAt(seed, f.x, f.y + dy, f.z) === S ? run + 1 : 0;
        best = Math.max(best, run);
      }
      expect(best, `(${f.x},${f.z}) まん中の 列の いしの 高さ`).toBeGreaterThanOrEqual(3);
    }
  });
  it('hatakeato: まわり 4 以内に やせいの やさい が 3 本以上', async () => {
    const list = await pick(seed, 'hatakeato', 3);
    expect(list.length).toBeGreaterThan(0);
    const WILD = new Set(Object.values(WILD_BLOCK).map((b) => BLOCK_INDEX[b]));
    for (const f of list) {
      let n = 0;
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -1; dy <= 2; dy++) if (WILD.has(blockAt(seed, f.x + dx, f.y + dy, f.z + dz))) n++;
      expect(n, `(${f.x},${f.z})`).toBeGreaterThanOrEqual(3);
      // 自然の くさの 地面では 通らない: やさいの 下は つち（上を つちに そろえた はたけあと。§2.3）
      let onDirt = 0;
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -1; dy <= 2; dy++) {
        if (WILD.has(blockAt(seed, f.x + dx, f.y + dy, f.z + dz)) && blockAt(seed, f.x + dx, f.y + dy - 1, f.z + dz) === BLOCK_INDEX.dirt) onDirt++;
      }
      expect(onDirt, `(${f.x},${f.z}) つちの上の やさい`).toBeGreaterThanOrEqual(3);
    }
  });
});
