import { YOKAI_DEFS } from '../../content/yokai/registry';
import { CAMP_TABLE, DEAD_END_TABLE, SHAPE_TABLE, STYLE_TABLE, type Depth } from './mineBokenConfig';
import { keyOf } from './mineShaftBuild';
import type { ShaftWorld } from './mineShafts';
import { createRng, hashInts, subSeed } from './random';

/**
 * 坑道の 冒険（MINE-1E §6.1）の 窓口: 表・キャンプの たんすの くじ・場所の 窓口。`createShaftHook` が 取りこむ。
 * 表は 実装の 表 1 か所〔mineBokenConfig.ts〕から 複製を 返す。
 */

export type Area = 'kakushi' | 'mukashi' | 'meiro' | 'camp';
export interface CampItem {
  item: string;
  count: number;
  wear?: number;
  row: 'pan' | 'pickaxe' | 'drop' | 'ore' | 'torch';
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 妖怪の ふつうの 落とし物の 種類〔ヌシ・レジェンダリー・ようかいだまは 妖怪の 表に 無い〕 */
const dropItems = (): string[] => [...new Set(Object.values(YOKAI_DEFS).flatMap((d) => d.drops.map((r) => r.item as string)))].sort();

function campTable() {
  const t = clone(CAMP_TABLE);
  return { ...t, rows: t.rows.map((r) => (r.kind === 'drop' ? { ...r, items: dropItems() } : r)) };
}

const between = (rng: () => number, span: readonly [number, number]): number => span[0] + Math.floor(rng() * (span[1] - span[0] + 1));

type CampRow = (typeof CAMP_TABLE.rows)[number];
/** 行ごとの 中身の 引き方〔行を 足したら ここも 足す。足し忘れは 型で 落ちる〕 */
const ROLL = {
  pan: (rng, row) => ({ item: 'kabita_pan', count: between(rng, row.count), row: 'pan' }),
  pickaxe: (rng, _row, depth) => ({ item: CAMP_TABLE.pickaxe[depth], count: 1, wear: CAMP_TABLE.wear[0] + rng() * (CAMP_TABLE.wear[1] - CAMP_TABLE.wear[0]), row: 'pickaxe' }),
  drop: (rng, row) => {
    const list = dropItems();
    return { item: list[Math.floor(rng() * list.length)]!, count: between(rng, row.count), row: 'drop' };
  },
  ore: (rng, _row, depth) => {
    const o = CAMP_TABLE.ores[depth][Math.floor(rng() * CAMP_TABLE.ores[depth].length)]!;
    return { item: o.item, count: between(rng, o.count), row: 'ore' };
  },
  torch: (rng, row) => ({ item: 'torch', count: between(rng, row.count), row: 'torch' }),
} satisfies Record<CampRow['kind'], (rng: () => number, row: CampRow, depth: Depth) => CampItem>;

/** たんすの 中身の くじ〔安い くじ。坑道は 作らない〕 */
function campRoll(depth: Depth, seed: number): CampItem[] {
  const rng = createRng(hashInts(seed, 9101, 1));
  const out: CampItem[] = [];
  for (const row of CAMP_TABLE.rows) {
    const hit = rng() < row.chance;
    if (!hit) continue;
    out.push(ROLL[row.kind](rng, row, depth));
  }
  return out;
}

/** (x, y, z) は どの 場所か〔かくしべや・むかしの えだ道・迷路の いちばん おく・キャンプあと〕。足もとの 列の 計画を 見る〔まだ 計画して いない 区画は その 場で 計画する〕。実績の つなぎ込みも これを 使う */
export function areaIn(world: ShaftWorld, x: number, y: number, z: number): Area | null {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const k = keyOf(bx, Math.floor(y), bz);
  for (const p of world.plansNear(bx >> 4, bz >> 4)) {
    const a = p.areas?.get(k);
    if (a) return a;
  }
  return null;
}

export function createBokenHook(o: { seed: number; world: () => ShaftWorld; tansuHas?: (x: number, y: number, z: number) => boolean }) {
  const campSeed = (x: number, y: number, z: number): number => hashInts(subSeed(o.seed, 823), x, y, z);
  return {
    shaftStyleTable: () => clone(STYLE_TABLE),
    shaftShapeTable: () => clone(SHAPE_TABLE),
    deadEndTable: () => clone(DEAD_END_TABLE),
    campTable,
    campRoll,
    campSeed,
    /** そのマスが キャンプの たんすで、まだ 記録が ない とき だけ 中身の 予告 */
    campPreview(x: number, y: number, z: number): CampItem[] | null {
      const bx = Math.floor(x);
      const by = Math.floor(y);
      const bz = Math.floor(z);
      for (const s of o.world().shafts(bx, bz, bx, bz)) {
        const t = s.camp?.tansu;
        if (!t || t.x !== bx || t.y !== by || t.z !== bz) continue;
        if (o.tansuHas?.(bx, by, bz)) return null;
        return campRoll(s.style!.depth, campSeed(bx, by, bz));
      }
      return null;
    },
    areaAt: (x: number, y: number, z: number): Area | null => areaIn(o.world(), x, y, z),
  };
}
