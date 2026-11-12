import { cheb, plainAt, site, type Ctx, type FeatureSite } from './countryKit';
import { groundFn } from './countryStructureKit';
import { hashInts } from './random';
import { buildFall, fallKeepOut, footOf, planFalls } from './waterV2Fall';
import type { FallPlan } from './waterV2Types';
import { clearRects, Edit, waterLeaks, type Ground, type Rect } from './waterV2Kit';
import { buildPond } from './waterV2Pond';
import { findPlateaus, plateauPonds } from './waterV2Flat';
import { sourceSpots, type SourceSpot } from './waterV2Source';
import { flowField } from './waterV2Flow';
import { buildRiverChecked, planRiver } from './waterV2River';
import { WATER_BLOCKS as B, WATER_TUNE as T, WATER_V2 } from './waterV2Table';

/**
 * 水の 景色 v2（`?water=v2`。滝・川・池）。山 1 つごとに、滝（0〜2 本。シードで 決まる）と その 川、段の 広場の 池。
 * 場所は (シード, 升目) の 乱数と 地形だけで 決まる（国だけの 物と 同じ。作る 順に 関係ない）。目じるし（お堂・とりい など）の 足もとには 置かない。
 * 石段だけは 川が またいでよい（石段の ブロックが あとから 上に 書かれて とび石に なる）。
 */

/** 山の 点から この きょり（チェビシェフ）を こえる 所には 水を 置かない（国だけの 物を さがす はんいの 内がわ） */
const LIMIT = T.reach - 6;
const PL = T.plateau;
const SRC = T.source;
const FALL = T.fall;

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
  // 川用: 山の まわりの 自分の 国の そとも 地形の 高さ（heightAt）で 読む（山の ふちで 切れない ように）。start 近くなど 置けない 所は -1 のまま
  const gh: Ground = (x, z) => {
    const v = gb(x, z);
    return v >= 0 || cheb(x, z, c.px, c.pz) > LIMIT || !plainAt(c, x, z) ? v : c.T.height(x, z);
  };
  const gr: Ground = (x, z) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (gh(x + dx, z + dz) < 0) return -1;
    return gh(x, z);
  };
  const seed = hashInts(c.T.seed ^ 0x5a7e2, c.i, c.j);
  const used: Rect[] = keepOut(others);
  const out: FeatureSite[] = [];
  const hit = (x: number, z: number): boolean => used.some((r) => inside(r, x, z));
  const grassAt = (x: number, z: number): boolean => c.T.topBlock(x, z, c.T.height(x, z)) === B.grassTop;
  const atFoot = (x: number, z: number): boolean => gr(x, z) - c.T.map.baseHeight(x, z) <= T.river.footAbove;
  // 川の みちしるべ（山 1 つに 1 回）: すその 平地・海から 地面を たどる。目じるしの 足もとは 通れない
  const field = flowField(gr, c.px, c.pz, LIMIT, atFoot, hit);
  const wet = new Set<number>();
  const wetHit = (x: number, z: number): boolean => hit(x, z) || wet.has(x * 100003 + z);
  const riverOf = (p: FallPlan, blocked: (x: number, z: number) => boolean) => {
    const own = fallKeepOut(p);
    return planRiver(gr, seed + 1, { x: Math.floor(p.pool.cx), z: Math.floor(p.pool.cz), d: p.d, pool: p.pool }, (x, z) => blocked(x, z) || own(x, z), atFoot, field);
  };
  // 平らな 段（高い 順）。池の ひろい 段を さがす（すその 池・川の おわりの 池に 使う）
  const plateaus = findPlateaus(g, c.px, c.pz, LIMIT, PL.minSize, (x, z) => !hit(x, z));
  const peak = plateaus.length > 0 ? plateaus[0]!.h : 0;
  const base0 = c.T.map.baseHeight(c.px, c.pz);
  const topMin = base0 + (peak - base0) * PL.topShare;
  const wetKey = (x: number, z: number): boolean => wet.has(x * 100003 + z);
  const rlen = (q: FallPlan): number => riverOf(q, wetHit).cells.length;

  /** 水源の 場所 sp から 1 本の 流れ: 池の ふちで 滝 → 川 → 川の とちゅうに 次の 池（= 次の 滝の 水源）→ …。いちばん はじめの 川が 出なければ やめる（false） */
  const runChain = (sp: SourceSpot, near: number): boolean => {
    const usedN = used.length;
    const outN = out.length;
    const wetSnap = new Set(wet);
    const foots: Rect[] = [];
    const rollback = (): false => {
      used.length = usedN;
      out.length = outN;
      wet.clear();
      wetSnap.forEach((v) => wet.add(v));
      return false;
    };
    let p: FallPlan | undefined = planFalls(g, sp.x, sp.z, seed, 1, used, rlen, { allow: (x, z) => Math.hypot(x - sp.x, z - sp.z) <= near, blocked: wetKey })[0];
    if (p === undefined) return rollback();
    for (let k = 0; p !== undefined; k++) {
      const cur: FallPlan = p;
      foots.push(footOf(cur));
      const others2 = foots.filter((_, j) => j !== k);
      const blocked = (x: number, z: number): boolean => wetHit(x, z) || others2.some((r) => inside(r, x, z));
      let plan0 = riverOf(cur, blocked);
      used.push(foots[k]!);
      // つぎの 滝: 川の とちゅうの 水面が 池の 水面と 同じ 高さの 所に 池（水源）が かさなる もの
      const cells = plan0.cells;
      const keepIdx = (q: FallPlan, at: number): boolean => {
        const keep = fallKeepOut(q);
        return !cells.slice(0, Math.max(0, at - 2)).some((cell) => keep(cell.x, cell.z));
      };
      const cutOf = (q: FallPlan): number => {
        const src = new Set(q.source.map(([x, z]) => x * 100003 + z));
        const at = cells.findIndex((cell, i) => i >= 2 && cell.level === q.top && src.has(cell.x * 100003 + cell.z));
        return at >= 0 && keepIdx(q, at) ? at : -1;
      };
      // 池の 水面を 川の 水面に そろえる（1 段の 滝だけ。池の 水面を 3 マス まで 下げて 落差 4 以上）
      const adjustTo = (q: FallPlan): FallPlan | null => {
        if (cutOf(q) >= 0) return q;
        if (q.stages.length !== 1) return null;
        const src = new Set(q.source.map(([x, z]) => x * 100003 + z));
        for (let i = 2; i < cells.length; i++) {
          const L = cells[i]!.level;
          if (!src.has(cells[i]!.x * 100003 + cells[i]!.z) || q.top - L < 0 || q.top - L > SRC.lower || L - q.level < FALL.drop[0]) continue;
          const q2: FallPlan = { ...q, top: L, stages: [{ ...q.stages[0]!, top: L }] };
          if (keepIdx(q2, i)) return q2;
        }
        return null;
      };
      let nxt: FallPlan | undefined;
      if (k + 1 < PL.chainMax && plan0.mouth === null && plan0.stop !== 'sea' && plan0.stop !== 'foot' && cells.length > 4) {
        const mid = cells[Math.floor(cells.length / 2)]!;
        const near = (x: number, z: number): boolean => cells.some((cell, i) => i >= 2 && Math.max(Math.abs(cell.x - x), Math.abs(cell.z - z)) <= PL.near);
        nxt = planFalls(g, mid.x, mid.z, seed + k + 1, 1, used, rlen, { allow: near, blocked: wetKey, adjust: adjustTo })[0];
      }
      if (nxt !== undefined) plan0 = { ...plan0, cells: cells.slice(0, cutOf(nxt) + 1), mouth: null, stop: 'stuck' };
      const ed = new Edit();
      buildFall(ed, gb, seed, cur); // 組めたかの 確認（waterV2Tier）と 同じ 種で 作る
      out.push(blocksSite(c, 'taki', ed, cur.lip[0]![0], cur.top, cur.lip[0]![1]));
      const { ed: re, plan } = buildRiverChecked(gh, seed + k, plan0, cur.pool, grassAt);
      // 滝つぼと つなげて 水が もれる 川は 作らない
      const ground: Ground = (x, z) => (gh(x, z) >= 0 ? gh(x, z) : c.T.height(x, z));
      const leaks = waterLeaks(out.flatMap((q) => q.blocks).concat(re.blocks()), ground).length > 0;
      const first = plan.cells.find((cell) => cell.kind !== 'pool');
      const has = !leaks && (first !== undefined || plan.mouth !== null);
        if (!has) return k > 0 ? true : rollback();
      for (const bl of re.blocks()) wet.add(bl.x * 100003 + bl.z);
      const f0 = first ?? plan.cells[0]!;
      out.push(blocksSite(c, 'kawa', re, f0.x, f0.level, f0.z));
      // 川を 切った とき は、つぎの 滝が 水が つながる ことを しめす（切って いなければ そのまま おわり）
      p = nxt;
      if (nxt !== undefined && plan.cells.length !== plan0.cells.length) p = undefined;
    }
    return true;
  };
  const spots = sourceSpots(g, c.px, c.pz, LIMIT, base0, (x, z) => !hit(x, z), field, seed);
    // 上の 帯の 池から 作れない 山は、中腹・どこかの がけ（山の まん中から）へ 下げる
  if (!spots.some((sp) => runChain(sp, SRC.near))) runChain({ x: c.px, z: c.pz, score: 0 }, Infinity);
  // 池: 平らな 段に 2〜5 こ（頂上の ほうに 必ず 1 つ）
  const ochiba = c.kind === 'momiji';
  const free = (x: number, z: number): boolean => !hit(x, z) && !wet.has(x * 100003 + z);
  plateauPonds(g, plateaus, seed, topMin, free).forEach((b, k) => {
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
