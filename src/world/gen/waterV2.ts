import { cheb, site, type Ctx, type FeatureSite } from './countryKit';
import { groundFn } from './countryStructureKit';
import { hashInts } from './random';
import { buildFall, fallKeepOut, footOf, planFalls } from './waterV2Fall';
import type { FallPlan } from './waterV2Types';
import { clearRects, Edit, type Ground, type Rect } from './waterV2Kit';
import { planPonds, buildPond } from './waterV2Pond';
import { buildRiver, planRiver } from './waterV2River';
import { WATER_BLOCKS as B, WATER_TUNE as T, WATER_V2 } from './waterV2Table';

/**
 * 水の 景色 v2（`?water=v2`。滝・川・池）。山 1 つごとに、滝（0〜2 本。シードで 決まる）と その 川、段の 広場の 池。
 * 場所は (シード, 升目) の 乱数と 地形だけで 決まる（国だけの 物と 同じ。作る 順に 関係ない）。目じるし（お堂・とりい など）の 足もとには 置かない。
 * 石段だけは 川が またいでよい（石段の ブロックが あとから 上に 書かれて とび石に なる）。
 */

/** 山の 点から この きょり（チェビシェフ）を こえる 所には 水を 置かない（国だけの 物を さがす はんいの 内がわ） */
const LIMIT = T.reach - 6;

/** 目じるしの 足もと（石段は のぞく）を 四角の 一覧に する（まわり gap） */
function keepOut(others: readonly FeatureSite[]): Rect[] {
  const out: Rect[] = [];
  for (const s of others) {
    if (s.type === 'ishidan') continue;
    const [x0, z0, x1, z1] = s.foot;
    out.push([x0 - T.pond.gap, z0 - T.pond.gap, x1 + T.pond.gap, z1 + T.pond.gap]);
  }
  return out;
}

const inside = (r: Rect, x: number, z: number): boolean => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];

/** 水の 景色の 置く 物。others = 同じ 山の 目じるし（先に 置く 方を よける）。フラグが なければ 空 */
export function waterSites(c: Ctx, others: readonly FeatureSite[]): FeatureSite[] {
  if (!WATER_V2) return [];
  const g0 = groundFn(c);
  // 山の 点から はなれすぎた 所は 置けない（-1）
  const gb: Ground = (x, z) => (cheb(x, z, c.px, c.pz) > LIMIT ? -1 : g0(x, z));
  // 計画用: まわり 1 マスも 置ける 列だけ（岸・ふちを 書く 列も 置ける 列に なる）
  const g: Ground = (x, z) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (gb(x + dx, z + dz) < 0) return -1;
    return gb(x, z);
  };
  const seed = hashInts(c.T.seed ^ 0x5a7e2, c.i, c.j);
  const used: Rect[] = keepOut(others);
  const out: FeatureSite[] = [];
  const hit = (x: number, z: number): boolean => used.some((r) => inside(r, x, z));
  const grassAt = (x: number, z: number): boolean => c.T.topBlock(x, z, c.T.height(x, z)) === B.grassTop;
  // 滝の 数（0・1・2 本）
  const roll = (hashInts(seed, 1, 0) >>> 0) / 4294967296;
  const n = roll < T.fallCount[0] ? 0 : roll < T.fallCount[0] + T.fallCount[1] ? 1 : 2;
  const atFoot = (x: number, z: number): boolean => g(x, z) - c.T.map.baseHeight(x, z) <= T.river.footAbove;
  const riverOf = (p: FallPlan, blocked: (x: number, z: number) => boolean) => {
    const own = fallKeepOut(p);
    return planRiver(g, seed + 1, { x: Math.floor(p.pool.cx), z: Math.floor(p.pool.cz), d: p.d, pool: p.pool }, (x, z) => blocked(x, z) || own(x, z), atFoot);
  };
  const falls = planFalls(g, c.px, c.pz, seed, n, used, (p) => riverOf(p, hit).cells.length);
  const rivers: FeatureSite[] = [];
  const wet = new Set<number>();
  const footsOf = falls.map(footOf);
  falls.forEach((p, k) => {
    const ed = new Edit();
    buildFall(ed, gb, seed, p); // 組めたかの 確認（waterV2Tier）と 同じ 種で 作る
    out.push(blocksSite(c, 'taki', ed, p.lip[0]![0], p.top, p.lip[0]![1]));
    // 川: ほかの 滝・目じるし・ほかの 川は よける
    const others2 = footsOf.filter((_, j) => j !== k);
    const blocked = (x: number, z: number): boolean => hit(x, z) || wet.has(x * 100003 + z) || others2.some((r) => inside(r, x, z));
    const plan = riverOf(p, blocked);
    const re = new Edit();
    buildRiver(re, gb, seed + k, plan, p.pool, grassAt);
    for (const b of re.blocks()) wet.add(b.x * 100003 + b.z);
    if (plan.cells.some((cell) => cell.kind !== 'pool') || plan.mouth !== null) {
      const first = plan.cells.find((cell) => cell.kind !== 'pool')!;
      rivers.push(blocksSite(c, 'kawa', re, first.x, first.level, first.z));
    }
    used.push(footsOf[k]!);
  });
  out.push(...rivers);
  // 池: 段の 広場に 1〜2 こ
  const nPond = T.pond.count[0] + ((hashInts(seed, 2, 0) >>> 0) % (T.pond.count[1] - T.pond.count[0] + 1));
  const base = (x: number, z: number, h: number): number => h - c.T.map.baseHeight(x, z);
  const free = (x: number, z: number): boolean => !hit(x, z) && !wet.has(x * 100003 + z);
  const ochiba = c.kind === 'momiji';
  planPonds(g, c.px, c.pz, seed, nPond, base, free).forEach((b, k) => {
    const ed = new Edit();
    buildPond(ed, gb, seed + 100 + k, b, ochiba, free);
    out.push(blocksSite(c, 'ike', ed, Math.floor(b.cx), b.level, Math.floor(b.cz)));
  });
  return out;
}

function blocksSite(c: Ctx, type: 'taki' | 'kawa' | 'ike', ed: Edit, x: number, y: number, z: number): FeatureSite {
  const blocks = ed.blocks();
  const b = ed.bounds()!;
  return site(c, type, x, y, z, blocks, [b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1], { rects: clearRects(blocks), margin: 1 });
}
