import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CAVE_SPEC,
  SEEDS_3,
  Walk,
  areaAround,
  hookCave,
  needCaveHook,
  type Cave,
  type CaveKind,
  type MineHook1D,
} from './mineCaveKit';
import { contentProblems, plainRate, reportRoom, safetyProblems } from './mineCaveReport';
import { GenCols, SEEDS_20, ptKey, standable, type Layer, type Pt, type Shaft } from './mineShaftKit';
import { spawnOf } from './terrain';

/**
 * MINE-1D（docs/design/MINE-1.md §4.7.1・§4.7.5・受け入れ基準 D8・D14）: 坑道の へや〔横穴の 先の ふしぎな ほらあな〕。
 *
 *   D8: はじまりの 坑道〔20 シード〕: なかほどの いちばん 上の 横穴の 先が ほたるの ほらあな〔`heyaHit` が その 1 本 だけ・`end: 'cave'`〕。
 *       出口と 部屋の 床の 段差 0・部屋の 床の どこからも 坑道の 入口へ 行き来 できる〔道さがし〕。
 *   D14【4 版】: はじまりの 坑道を のぞく 坑道〔シード いくつか。数は `heyaLinkTable()` から 読む。はばは ゆれの 約 3 倍〕:
 *       ・層ごとの `heyaHit` の わりあいが 表から あさい・なかほど ± 0.04〔層ごとに 横穴 1,200 本 いじょう〕・ふかい ± 0.03〔600 本 いじょう〕
 *       ・当たりの 8 割 いじょうが `end: 'heya'`・'heya' の 種類の わりあいが 当たりの 中で 表から ± 0.09〔あさい・なかほど の 層ごとに 当たり 300 こ いじょう。ふかいは すいしょうだけ〕
 *       ・'heya' の 横穴 ぜんぶ: `cave` の 部屋が `caves()` に あり `shaft` が その 坑道の id・大きさと 中身と 安全が D2・D3・D4 を みたす・
 *         部屋が 坑道の `box` の 中・出口と 部屋の 床の 段差 0・出口の 両がわに たいまつ・部屋の 床の どのマスとも 坑道の 入口が 行き来 できる
 *       ・抽選の 部屋が 坑道の へやの まわり 4 マスに ない
 *
 * 数は 窓口の 表〔`heyaLinkTable()`〕から 読む〔#311〕。ブロックを 作って しらべる 重い 部分〔D2〜D4 の 安全・中身・行き来〕は
 * シード 3 つの 'heya' ぜんぶ。ひろさ・本数の 数えは 計画だけで 答える ので 速い〔シード 数十〕。ms で 合否を 決めない。
 * 赤の 確かめ: 1D の 前は `heyaHit`・`cave`・`heyaLinkTable` が なく「窓口が まだ ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 280_000 });

const FOUR_BOX = 4;
/** ブロックまで しらべる 坑道の 数〔シードごと。重い ので 上限。坑道の へやの ある 坑道を 近い 順ではなく 一覧の 順に〕 */
const SHAFTS_PER_SEED = 10;
/** 数える 範囲〔スタートの まわり 横 ± 2,048 マス〕 */
const HALF = 2048;
const THRESH = { asai: 1200, nakahodo: 1200, fukai: 600 } as const satisfies Record<Layer, number>;
const HIT_MIN_FOR_KINDS = 300;
const TOL_HIT = { asai: 0.04, nakahodo: 0.04, fukai: 0.03 } as const satisfies Record<Layer, number>;
const TOL_KIND = 0.09;
const LAYERS: readonly Layer[] = ['asai', 'nakahodo', 'fukai'];

/** シードの 並び〔20 シードの あと もっと 足す。必要な 本数に なるまで つかう〕 */
const SEED_POOL: readonly number[] = [...SEEDS_20, ...Array.from({ length: 120 }, (_, i) => 50_000 + i * 7919)];

interface Side {
  seed: number;
  shaft: Shaft;
  layer: Layer;
  end: string;
  hit: boolean;
  caveId: string | null;
  to: Pt;
}
interface Tally {
  sides: number;
  hits: number;
  heya: number;
  kinds: Map<CaveKind, number>;
}
const tally: Record<Layer, Tally> = {
  asai: { sides: 0, hits: 0, heya: 0, kinds: new Map() },
  nakahodo: { sides: 0, hits: 0, heya: 0, kinds: new Map() },
  fukai: { sides: 0, hits: 0, heya: 0, kinds: new Map() },
};
const heyaSides: Side[] = [];
const allSides: Side[] = [];
const caveOf = new Map<string, Cave>();
let usedSeeds = 0;

const enough = (): boolean => LAYERS.every((l) => tally[l].sides >= THRESH[l] && (l === 'fukai' || tally[l].hits >= HIT_MIN_FOR_KINDS));

beforeAll(() => {
  for (const seed of SEED_POOL) {
    if (enough()) break;
    usedSeeds++;
    const h = hookCave(seed);
    needCaveHook(h, ['shafts', 'caves', 'heyaLinkTable', 'shaftPath', 'caveSpec']);
    const sp = spawnOf(seed);
    const [x0, z0, x1, z1] = [sp.x - HALF, sp.z - HALF, sp.x + HALF - 1, sp.z + HALF - 1];
    for (const shaft of h.shafts(x0, z0, x1, z1)) {
      if (shaft.start) continue;
      const cs = new Map(h.caves(shaft.box.x0, shaft.box.z0, shaft.box.x1, shaft.box.z1).filter((c) => c.shaft === shaft.id).map((c) => [c.id, c] as const));
      for (const d of shaft.sides) {
        const hit = d.heyaHit === true;
        const side: Side = { seed, shaft, layer: d.layer, end: d.end, hit, caveId: d.cave ?? null, to: d.to };
        allSides.push(side);
        const t = tally[d.layer];
        t.sides++;
        if (hit) t.hits++;
        if (d.end === 'heya') {
          t.heya++;
          heyaSides.push(side);
          const c = d.cave ? cs.get(d.cave) : undefined;
          if (c) {
            caveOf.set(`${seed}:${c.id}`, c);
            t.kinds.set(c.kind, (t.kinds.get(c.kind) ?? 0) + 1);
          }
        }
      }
    }
  }
}, 280_000);

describe('D14: 坑道の へやの くじ〔計画〕', () => {
  it('数える 横穴が 集まる〔あさい・なかほど 1,200 本・ふかい 600 本 いじょう〕', () => {
    for (const l of LAYERS) expect(tally[l].sides, `${l} の 横穴〔${usedSeeds} シード〕`).toBeGreaterThanOrEqual(THRESH[l]);
  });

  it('層ごとの heyaHit の わりあいが 表の とおり〔あさい・なかほど ± 0.04・ふかい ± 0.03〕', () => {
    const table = hookCave(SEEDS_3[0]!).heyaLinkTable();
    expect(table.length, 'つなぐ 表').toBeGreaterThan(0);
    for (const row of table) {
      const t = tally[row.layer];
      expect(t.sides, row.layer).toBeGreaterThan(0);
      const got = t.hits / t.sides;
      expect(Math.abs(got - row.chance), `${row.layer}: 表 ${row.chance} / ${got.toFixed(4)}〔${t.hits} / ${t.sides}〕`).toBeLessThanOrEqual(TOL_HIT[row.layer]);
    }
  });

  it('当たりの 8 割 いじょうが end が heya〔のこりは 部屋が 入らず はずれに した 横穴〕・heyaHit が false の 横穴は heya でも cave でも ない', () => {
    for (const l of LAYERS) {
      const t = tally[l];
      expect(t.hits, `${l} の 当たり`).toBeGreaterThan(0);
      expect(t.heya / t.hits, `${l}: heya ${t.heya} / 当たり ${t.hits}`).toBeGreaterThanOrEqual(0.8);
    }
    for (const s of allSides) {
      if (s.end === 'heya') {
        expect(s.hit, `seed ${s.seed} ${s.shaft.id}: heya は 当たり`).toBe(true);
        expect(s.caveId, `seed ${s.seed} ${s.shaft.id}: heya の cave`).not.toBeNull();
      } else if (!s.hit) {
        expect(s.caveId, `seed ${s.seed} ${s.shaft.id}: 当たりでない 横穴に 部屋は ない`).toBeNull();
      }
    }
  });

  it("'heya' の 種類の わりあい: あさい・なかほどの 層ごとに 当たりの 中で 表から ± 0.09・ふかい は すいしょうの ほらあな だけ", () => {
    const table = hookCave(SEEDS_3[0]!).heyaLinkTable();
    for (const row of table) {
      const t = tally[row.layer];
      if (row.layer === 'fukai') {
        for (const [k, n] of t.kinds) expect(k, `ふかい 層の 種類 ${k}〔${n} こ〕`).toBe('suisho');
        continue;
      }
      expect(t.hits, `${row.layer} の 当たり`).toBeGreaterThanOrEqual(HIT_MIN_FOR_KINDS);
      const total = [...t.kinds.values()].reduce((a, b) => a + b, 0);
      expect(total, `${row.layer} の heya の 部屋`).toBeGreaterThan(0);
      const sum = Object.values(row.kinds).reduce((a, b) => a + b, 0);
      for (const kind of Object.keys(CAVE_SPEC) as CaveKind[]) {
        const want = (row.kinds[kind] ?? 0) / sum;
        const got = (t.kinds.get(kind) ?? 0) / total;
        expect(Math.abs(got - want), `${row.layer} ${kind}: 表 ${want.toFixed(3)} / ${got.toFixed(3)}`).toBeLessThanOrEqual(TOL_KIND);
      }
    }
  });

  it("'heya' ぜんぶ: cave の 部屋が caves() に あり shaft が その 坑道の id・層が 横穴の 層・種類の 層・部屋が 坑道の box の 中", () => {
    expect(heyaSides.length, "'heya' の 横穴").toBeGreaterThan(100);
    for (const s of heyaSides) {
      const c = caveOf.get(`${s.seed}:${s.caveId}`);
      expect(c, `seed ${s.seed} ${s.shaft.id} の cave ${s.caveId}`).toBeDefined();
      expect(c!.shaft, `${c!.id} の shaft`).toBe(s.shaft.id);
      expect(c!.layer, `${c!.id} の 層`).toBe(s.layer);
      expect(CAVE_SPEC[c!.kind].layers, `${c!.id} の 種類 ${c!.kind}`).toContain(s.layer);
      expect(c!.linked, `${c!.id} は 横穴で つながって いる`).toBe(true);
      const b = c!.box;
      const sb = s.shaft.box;
      expect(b.x0 >= sb.x0 && b.x1 <= sb.x1 && b.z0 >= sb.z0 && b.z1 <= sb.z1, `${c!.id} が 坑道の box の 中`).toBe(true);
    }
  });

  it('抽選の 部屋が 坑道の へやの まわり 4 マスに ない〔シード 3 つ〕', () => {
    for (const seed of SEEDS_3) {
      const h = hookCave(seed);
      const a = areaAround(seed, 24);
      const all = h.caves(a.x0, a.z0, a.x1, a.z1);
      const heya = all.filter((c) => c.shaft !== null);
      const lot = all.filter((c) => c.shaft === null);
      expect(heya.length, `seed ${seed} の 坑道の へや`).toBeGreaterThan(0);
      const E = FOUR_BOX;
      for (const c of heya) {
        for (const l of lot) {
          const hit =
            c.box.x0 - E <= l.box.x1 && l.box.x0 <= c.box.x1 + E && c.box.z0 - E <= l.box.z1 && l.box.z0 <= c.box.z1 + E && c.box.y0 - E <= l.box.y1 && l.box.y0 <= c.box.y1 + E;
          expect(hit, `seed ${seed}: 坑道の へや ${c.id} と 抽選の 部屋 ${l.id} が まわり 4 マスで かさなる`).toBe(false);
        }
      }
    }
  });
});

// ------------------------------------------------------------------ D14 ブロックで しらべる〔シード 3 つの 'heya' ぜんぶ〕

interface BlockRow {
  seed: number;
  shaft: Shaft;
  side: Shaft['sides'][number];
  cave: Cave;
  safety: string[];
  content: string[];
  torches: string[];
  stepZero: string[];
  walk: string[];
}
const blockRows: BlockRow[] = [];
const hooks = new Map<number, MineHook1D>();

/** 出口の 両がわの たいまつ: 出口の まわり 3 マス いないの 足の 高さ〜+3 に ある たいまつを 数え、反対がわに 1 本ずつ あるか */
function torchProblems(g: GenCols, to: Pt): string[] {
  const found: { dx: number; dz: number }[] = [];
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      for (let y = to.y; y <= to.y + 3; y++) if (g.id(to.x + dx, y, to.z + dz) === 'torch') found.push({ dx, dz });
    }
  }
  if (found.length < 2) return [`出口 (${to.x}, ${to.y}, ${to.z}) の まわりの たいまつ ${found.length} 本`];
  const opposite = found.some((a, i) => found.some((b, j) => j > i && a.dx * b.dx + a.dz * b.dz < 0));
  return opposite ? [] : [`出口 (${to.x}, ${to.y}, ${to.z}) の たいまつが 片がわだけ`];
}

describe('D14: 坑道の へや〔シード 3 つ ぜんぶ。ブロックで しらべる〕', () => {
  beforeAll(() => {
    for (const seed of SEEDS_3) {
      const h = hookCave(seed);
      hooks.set(seed, h);
      const sp = spawnOf(seed);
      const g = new GenCols(seed);
      const layers = h.layers();
      const rate = plainRate(h, seed, ['asai', 'nakahodo']);
      let shaftsDone = 0;
      for (const shaft of h.shafts(sp.x - HALF, sp.z - HALF, sp.x + HALF - 1, sp.z + HALF - 1)) {
        if (shaft.start) continue;
        const cs = new Map(h.caves(shaft.box.x0, shaft.box.z0, shaft.box.x1, shaft.box.z1).filter((c) => c.shaft === shaft.id).map((c) => [c.id, c] as const));
        const heyas = shaft.sides.filter((d) => d.end === 'heya');
        if (heyas.length === 0) continue;
        if (shaftsDone++ >= SHAFTS_PER_SEED) break;
        // 坑道の 入口から 歩いて 行ける マス〔行き・帰り〕は 坑道 1 つに つき 1 回
        const walkBox = { x0: shaft.box.x0 - 12, x1: shaft.box.x1 + 12, z0: shaft.box.z0 - 12, z1: shaft.box.z1 + 12, ...yBand(h, shaft.id) };
        let walk: Walk | null = null;
        let mutual: Set<string> | null = null;
        for (const d of heyas) {
          const cave = cs.get(d.cave ?? '');
          if (!cave) continue;
          const r = reportRoom(seed, g, h, cave, layers);
          if (!walk) {
            walk = new Walk(g, walkBox);
            const from = { x: shaft.entrance.x, y: shaft.entrance.y, z: shaft.entrance.z };
            const f = walk.reach(from);
            const rv = walk.reach(from, true);
            mutual = new Set([...f.keys()].filter((k) => rv.has(k)));
          }
          // 部屋の 床の どのマスとも 坑道の 入口が 行き来 できる
          const wk: string[] = [];
          const floor: Pt[] = [];
          for (let x = cave.box.x0; x <= cave.box.x1; x++) for (let z = cave.box.z0; z <= cave.box.z1; z++) for (let y = cave.box.y0; y <= cave.box.y1; y++) if (standable(g, x, y, z) && h.caveAt(x, y, z) === cave.kind) floor.push({ x, y, z });
          const lost = floor.filter((p) => !mutual!.has(ptKey(p)));
          if (floor.length === 0) wk.push('立てる 床が ない');
          if (lost.length > 0) wk.push(`入口と 行き来 できない 床 ${lost.length} / ${floor.length} マス〔例 (${lost[0]!.x}, ${lost[0]!.y}, ${lost[0]!.z})〕`);
          // 出口と 部屋の 床の 段差 0: 出口の まわり 4 マス いないに 同じ 高さの 部屋の 床が ある
          const zero = floor.some((p) => p.y === d.to.y && Math.max(Math.abs(p.x - d.to.x), Math.abs(p.z - d.to.z)) <= 4);
          blockRows.push({
            seed,
            shaft,
            side: d,
            cave,
            safety: safetyProblems(r),
            content: contentProblems(r, rate),
            torches: torchProblems(g, d.to),
            stepZero: zero ? [] : [`出口 y ${d.to.y} と 同じ 高さの 部屋の 床が 出口の まわり 4 マスに ない`],
            walk: wk,
          });
        }
      }
    }
  }, 280_000);

  const tag = (r: BlockRow): string => `seed ${r.seed} ${r.shaft.id} → ${r.cave.id}(${r.cave.kind})`;

  it("'heya' の 部屋が 集まる〔シード 3 つ〕・種類が 2 しゅるい いじょう", () => {
    expect(blockRows.length).toBeGreaterThanOrEqual(10);
    expect(new Set(blockRows.map((r) => r.cave.kind)).size).toBeGreaterThanOrEqual(2);
  });

  it('大きさ・層・安全〔D2・D4・D5〕を みたす', () => {
    for (const r of blockRows) expect(r.safety, tag(r)).toEqual([]);
  });

  it('中身〔D3〕を みたす', () => {
    for (const r of blockRows) expect(r.content, tag(r)).toEqual([]);
  });

  it('出口と 部屋の 床の 段差 0', () => {
    for (const r of blockRows) expect(r.stepZero, tag(r)).toEqual([]);
  });

  it('出口の 両がわに たいまつ', () => {
    for (const r of blockRows) expect(r.torches, tag(r)).toEqual([]);
  });

  it('部屋の 床の どの マスとも 坑道の 入口が 行き来 できる〔道さがし〕', () => {
    for (const r of blockRows) expect(r.walk, tag(r)).toEqual([]);
  });

  it('同じ シードは 同じ 横穴・同じ 部屋〔2 回 よんでも 同じ〕', () => {
    const seed = SEEDS_3[0]!;
    const sp = spawnOf(seed);
    const q = [sp.x - 1024, sp.z - 1024, sp.x + 1023, sp.z + 1023] as const;
    const a = hookCave(seed).shafts(...q).map((s) => s.sides.map((d) => [d.end, d.heyaHit, d.cave, d.to]));
    const b = hookCave(seed).shafts(...q).map((s) => s.sides.map((d) => [d.end, d.heyaHit, d.cave, d.to]));
    expect(b).toEqual(a);
  });
});

/** 道さがしの 高さの はば: 坑道の 道の いちばん 低い 足〜いちばん 高い 足 ±8〔y の 決め打ちを しない・グラフを 小さく する〕 */
function yBand(h: MineHook1D, id: string): { y0: number; y1: number } {
  const ys = h.shaftPath(id).map((c) => c.y);
  return { y0: Math.min(...ys) - 8, y1: Math.max(...ys) + 8 };
}

// ------------------------------------------------------------------ D8 はじまりの 坑道〔20 シード〕

describe('D8: はじまりの 坑道の なかほどの いちばん 上の 横穴の 先は ほたるの ほらあな', () => {
  const rows: { seed: number; ok: string[] }[] = [];

  beforeAll(() => {
    for (const seed of SEEDS_20) {
      const h = hookCave(seed);
      needCaveHook(h, ['startShaft', 'caves', 'shaftPath']);
      const start = h.startShaft();
      const g = new GenCols(seed);
      const ok: string[] = [];
      const hits = start.sides.filter((d) => d.heyaHit === true);
      if (hits.length !== 1) ok.push(`heyaHit の 横穴 ${hits.length} 本〔1 本の はず。ほかの 横穴は つながない〕`);
      const heyaEnds = start.sides.filter((d) => d.end === 'heya');
      if (heyaEnds.length !== 0) ok.push(`end が heya の 横穴 ${heyaEnds.length} 本〔はじまりの 坑道は 0 本。つなぐのは heyaHit の 1 本〔end は 'cave'〕だけ〕`);
      const naka = start.sides.filter((d) => d.layer === 'nakahodo');
      const topY = Math.max(...naka.map((d) => d.from.y));
      const top = naka.filter((d) => d.from.y === topY);
      const hit = hits[0];
      if (!hit) {
        rows.push({ seed, ok });
        continue;
      }
      if (!top.includes(hit)) ok.push(`当たりの 横穴が なかほどの いちばん 上〔from.y ${topY}〕でない〔from.y ${hit.from.y}・層 ${hit.layer}〕`);
      if (hit.end !== 'cave') ok.push(`end ${hit.end}〔'cave' の はず。段差 0 の 1C の 形の 横穴〕`);
      const cave = h.caves(hit.to.x - 40, hit.to.z - 40, hit.to.x + 40, hit.to.z + 40).find((c) => c.id === hit.cave);
      if (!cave) {
        ok.push(`cave ${hit.cave} が caves() に ない`);
        rows.push({ seed, ok });
        continue;
      }
      if (cave.kind !== 'hotaru') ok.push(`種類 ${cave.kind}〔hotaru の はず〕`);
      if (cave.shaft !== null) ok.push(`shaft ${cave.shaft}〔抽選の 部屋なので null の はず。§4.7.5・§6.1〕`);
      // 出口と 部屋の 床の 段差 0
      const floor: Pt[] = [];
      const b = cave.box;
      for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) for (let y = b.y0; y <= b.y1; y++) if (standable(g, x, y, z) && h.caveAt(x, y, z) === cave.kind) floor.push({ x, y, z });
      if (floor.length === 0) ok.push('立てる 床が ない');
      if (!floor.some((p) => p.y === hit.to.y && Math.max(Math.abs(p.x - hit.to.x), Math.abs(p.z - hit.to.z)) <= 4)) ok.push(`出口 y ${hit.to.y} と 同じ 高さの 床が ない`);
      // 部屋の 床と 坑道の 入口が 行き来 できる
      const walk = new Walk(g, { x0: start.box.x0 - 12, x1: start.box.x1 + 12, z0: start.box.z0 - 12, z1: start.box.z1 + 12, ...yBand(h, start.id) });
      const from = { x: start.entrance.x, y: start.entrance.y, z: start.entrance.z };
      const f = walk.reach(from);
      const rv = walk.reach(from, true);
      const lost = floor.filter((p) => !(f.has(ptKey(p)) && rv.has(ptKey(p))));
      if (lost.length > 0) ok.push(`入口と 行き来 できない 床 ${lost.length} / ${floor.length}`);
      rows.push({ seed, ok });
    }
  }, 280_000);

  it('20 シードぜんぶ', () => {
    expect(rows).toHaveLength(SEEDS_20.length);
    for (const r of rows) expect(r.ok, `seed ${r.seed}`).toEqual([]);
  });
});
