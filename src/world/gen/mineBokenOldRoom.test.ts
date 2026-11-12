import { describe, expect, it, vi } from 'vitest';
import { colKey } from '../stream/ring';
import { hookE, needBokenHook } from './mineBokenKit';
import { hookCave, type Cave } from './mineCaveKit';
import { legacyOld } from './mineLegacyKit';
import { spawnOf } from './terrain';

/**
 * MINE-1E（docs/design/MINE-1E.md §4.13・受け入れ基準 E16 の 足し）: 1D の 部屋と 1E の 坑道の かさなり。
 *   ・1E の 一覧の 列に かかる 部屋は 版 6 の 作り方 ＝ 1E の 前の 世界〔legacy〕と 同じ 場所・同じ 種類
 *   ・1E の 坑道は 古い 列と、古い 列に かかる 部屋〔まわり 4 マス〕に かからない
 * 古い 一覧は、legacy の 世界の 部屋の うち スタートに 近い 数こと の まん中の 列 1 つずつ〔部屋の ほかの 列は 保存して いない〕。
 */

vi.setConfig({ testTimeout: 900_000 });

const SEED = 20261012;
const HALF = 1536;
const ROOMS = 8;
const MARGIN = 4;

const colsOf = (b: { x0: number; z0: number; x1: number; z1: number }, m: number): number[] => {
  const out: number[] = [];
  for (let cz = (b.z0 - m) >> 4; cz <= (b.z1 + m) >> 4; cz++) for (let cx = (b.x0 - m) >> 4; cx <= (b.x1 + m) >> 4; cx++) out.push(colKey(cx, cz));
  return out;
};
const sig = (c: Cave): string => `${c.id}|${c.kind}|${c.layer}|${c.box.x0},${c.box.y0},${c.box.z0},${c.box.x1},${c.box.y1},${c.box.z1}`;

function setup(): { legacyRooms: Cave[]; old: Set<number>; mixed: ReturnType<typeof hookCave>; mixedE: ReturnType<typeof hookE> } {
  const sp = spawnOf(SEED);
  const ref = hookCave(SEED, { oldCols: legacyOld(SEED) });
  const rooms = ref
    .caves(sp.x - HALF, sp.z - HALF, sp.x + HALF - 1, sp.z + HALF - 1)
    .filter((c) => c.shaft === null)
    .sort((a, b) => Math.hypot(a.center.x - sp.x, a.center.z - sp.z) - Math.hypot(b.center.x - sp.x, b.center.z - sp.z))
    .slice(0, ROOMS);
  const old = new Set<number>();
  for (const r of rooms) old.add(colKey(r.center.x >> 4, r.center.z >> 4));
  // 版 6 の 保存: 坑道・部屋の 一覧は 空〔1D が 書いた 列は 1E の 一覧にだけ 入る〕
  const oldCols = { kodo: new Set<number>(), heya: new Set<number>(), boken: old };
  return { legacyRooms: rooms, old, mixed: hookCave(SEED, { oldCols }), mixedE: hookE(SEED, { oldCols }) };
}

describe('E16: 1E の 一覧の 列に かかる 1D の 部屋', () => {
  it('古い 列に かかる 部屋は 1E の 前の 世界と 同じ 場所・同じ 種類〔版 6 の 作り方〕', () => {
    const { legacyRooms, old, mixed } = setup();
    expect(legacyRooms.length, '標本の 部屋').toBe(ROOMS);
    const sp = spawnOf(SEED);
    const ref = hookCave(SEED, { oldCols: legacyOld(SEED) });
    const win: [number, number, number, number] = [sp.x - HALF, sp.z - HALF, sp.x + HALF - 1, sp.z + HALF - 1];
    const want = new Map(ref.caves(...win).map((c) => [c.id, sig(c)] as const));
    const got = new Map(mixed.caves(...win).map((c) => [c.id, c] as const));
    const bad: string[] = [];
    for (const r of legacyRooms) {
      const c = got.get(r.id);
      if (!c) bad.push(`${r.id}: 部屋が ない`);
      else if (sig(c) !== want.get(r.id)) bad.push(`${r.id}: 版 6 と ちがう`);
    }
    // かかる 部屋ぜんぶ〔標本の ほかの 部屋が 古い 列に かかっても 同じ〕
    for (const [id, c] of got) {
      if (c.shaft !== null || !colsOf(c.box, 0).some((k) => old.has(k))) continue;
      if (want.get(id) !== sig(c)) bad.push(`${id}: 古い 列に かかる のに 版 6 と ちがう`);
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('1E の 坑道は 古い 列と、古い 列に かかる 部屋〔まわり 4 マス〕に かからない', () => {
    const { legacyRooms, old, mixedE } = setup();
    needBokenHook(mixedE, ['shafts', 'shaftPath']);
    const sp = spawnOf(SEED);
    const es = mixedE.shafts(sp.x - HALF, sp.z - HALF, sp.x + HALF - 1, sp.z + HALF - 1).filter((s) => s.gen === 'e');
    expect(es.length, '1E の 坑道').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const s of es) {
      for (const c of mixedE.shaftPath(s.id).filter((c) => (c.part as string) !== 'yakata')) {
        const near = legacyRooms.find((r) => c.x >= r.box.x0 - MARGIN && c.x <= r.box.x1 + MARGIN && c.z >= r.box.z0 - MARGIN && c.z <= r.box.z1 + MARGIN && c.y >= r.box.y0 - MARGIN && c.y <= r.box.y1 + MARGIN);
        if (near || old.has(colKey(c.x >> 4, c.z >> 4))) {
          bad.push(`${s.id}: ${c.x},${c.y},${c.z}${near ? ` が 部屋 ${near.id} の まわり ${MARGIN} マスに かかる` : ' が 古い 列'}`);
          break;
        }
      }
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });
});
