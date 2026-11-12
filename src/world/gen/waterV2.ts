import { cheb, plainAt, site, type Ctx, type FeatureSite } from './countryKit';
import { groundFn } from './countryStructureKit';
import { hashInts } from './random';
import { v2RockBlock } from './mountainV2Surface';
import { buildCascade, buildSupports, planCascade, type Cascade } from './waterV2Cascade';
import { buildFall, fallKeepOut, footOf, planFalls } from './waterV2Fall';
import type { BlockId } from '../../contracts';
import type { FallPlan } from './waterV2Types';
import { clearRects, Edit, snowCap, waterLeaks, type Ground, type Rect } from './waterV2Kit';
import { buildPond } from './waterV2Pond';
import { findPlateaus, plateauPonds } from './waterV2Flat';
import { highSpots, sourceSpots, type SourceSpot } from './waterV2Source';
import { flowField } from './waterV2Flow';
import { buildRiverChecked, planRiver } from './waterV2River';
import { basinNorm } from './waterV2Kit';
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
const CAS = T.cascade;

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

/** 列の 高さを 1 回の 生成の 間だけ 覚える（同じ 列を 何度も 読む ので） */
function memo(f: Ground): Ground {
  const m = new Map<number, number>();
  return (x, z) => {
    const k = (x + 100000) * 200003 + (z + 100000);
    let v = m.get(k);
    if (v === undefined) m.set(k, (v = f(x, z)));
    return v;
  };
}

const inside = (r: Rect, x: number, z: number): boolean => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];

/** 水の 景色の 置く 物。others = 同じ 山の 目じるし（先に 置く 方を よける）。フラグが なければ 空 */
export function waterSites(c: Ctx, others: readonly FeatureSite[]): FeatureSite[] {
  if (!WATER_V2) return [];
  const g0 = groundFn(c);
  // 山の 点から はなれすぎた 所は 置けない（-1）
  const gb: Ground = (x, z) => (cheb(x, z, c.px, c.pz) > LIMIT ? -1 : g0(x, z));
  // 計画用: まわり 1 マスも 置ける 列だけ（岸・ふちを 書く 列も 置ける 列に なる）
  const g: Ground = memo((x, z) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (gb(x + dx, z + dz) < 0) return -1;
    return gb(x, z);
  });
  // 川用: 山の まわりの 自分の 国の そとも 地形の 高さ（heightAt）で 読む（山の ふちで 切れない ように）。start 近くなど 置けない 所は -1 のまま
  const gh: Ground = memo((x, z) => {
    const v = gb(x, z);
    return v >= 0 || cheb(x, z, c.px, c.pz) > LIMIT || !plainAt(c, x, z) ? v : c.T.height(x, z);
  });
  const gr: Ground = memo((x, z) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (gh(x + dx, z + dz) < 0) return -1;
    return gh(x, z);
  });
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
  /** 受け皿の 段々の 滝（先に ぜんぶ 計画）。水源の 場所 sp から。成り立てば 置いて true */
  const runCascade = (sp: SourceSpot, minFalls: number): boolean => {
    const free = (x: number, z: number): boolean => !hit(x, z) && !wetKey(x, z);
    const footBase = (b: { cx: number; cz: number; level: number }): boolean => b.level - c.T.map.baseHeight(Math.floor(b.cx), Math.floor(b.cz)) <= CAS.footAbove;
    // すそに 着く 前に おわった 計画は、最後の 受け皿から 川が すそに とどくか で きまる。同じ 受け皿・向きは 1 回しか しらべない（川の 計画は 重い）
    const noRiver = new Set<string>();
    return planCascade(g, free, seed, sp, footBase, minFalls, (plan: Cascade, ended: boolean) => {
      const lastPond = plan.ponds[plan.ponds.length - 1]!;
      const lastKey = `${lastPond.cx},${lastPond.cz},${lastPond.level},${plan.stages[plan.stages.length - 1]!.d}`;
      if (!ended && noRiver.has(lastKey)) return false;
      const ed = new Edit();
      const rock = (x: number, y: number, z: number): BlockId => v2RockBlock(c.T.seed, x, y, z);
      buildCascade(ed, gb, seed, plan, rock);
      const ground: Ground = (x, z) => (gh(x, z) >= 0 ? gh(x, z) : c.T.height(x, z));
      const blocks = ed.blocks();
      const pre = out.flatMap((q) => q.blocks);
      if (waterLeaks(pre.concat(blocks), ground).length > 0) return false;
      let river: Edit | null = null;
      {
        // 最後の 受け皿から 川で すそ・海まで（すそに 着く 前に 終わった ときは 必ず。着いた ときは 出せれば）
        const last = plan.ponds[plan.ponds.length - 1]!;
        const lastD = plan.stages[plan.stages.length - 1]!.d;
        const near = (x: number, z: number): boolean => basinNorm(last, x, z) <= 1 + 2 / last.r;
        const own = new Set<number>();
        for (const b of blocks) if (!near(b.x, b.z)) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) own.add((b.x + dx) * 100003 + b.z + dz);
        const rp = planRiver(gr, seed + 1, { x: Math.floor(last.cx), z: Math.floor(last.cz), d: lastD, pool: last }, (x, z) => wetHit(x, z) || own.has(x * 100003 + z), atFoot, field);
        // すそに ほんとうに 着いたか（水面が すその 高さ + footAbove いか）。海・終わりの 池も 同じ
        const end = rp.cells[rp.cells.length - 1]!;
        const reach = rp.stop === 'sea' || (rp.mouth !== null ? rp.mouth.level - c.T.map.baseHeight(Math.floor(rp.mouth.cx), Math.floor(rp.mouth.cz)) <= CAS.footAbove : end.level - c.T.map.baseHeight(end.x, end.z) <= CAS.footAbove);
        const walks = rp.cells.some((q) => q.kind !== 'pool');
        if (!ended && !(reach && walks)) {
          noRiver.add(lastKey);
          return false;
        }
        if (reach && walks) {
          const rb = buildRiverChecked(gh, seed + 2, rp, last, grassAt);
          const ok = rb.plan.cells.length === rp.cells.length && waterLeaks(pre.concat(blocks, rb.ed.blocks()), ground).length === 0;
          if (ok) river = rb.ed;
          else if (!ended) return false;
        }
      }
      // ささえの 岩（川を 決めた あと。川の 列と そのまわりは さける）
      const riverCols = new Set<number>();
      for (const b of river?.blocks() ?? []) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) riverCols.add((b.x + dx) * 100003 + b.z + dz);
      buildSupports(ed, gb, seed, plan, rock, free, (x, z) => riverCols.has(x * 100003 + z));
      snowCap(ed, (x, z) => c.T.topBlock(x, z, c.T.height(x, z)) === B.snow); // 雪山なら 雪の きまりと 同じに 雪を のせる
      const all = ed.blocks();
      // 滝ごとの 場所（列を いちばん 近い 落ち口の 滝に ふりわける）
      const mids = plan.stages.map((st) => st.lip[Math.floor(st.lip.length / 2)]!);
      const eds = mids.map(() => new Edit());
      for (const b of all) {
        let bi = 0;
        let bd = Infinity;
        mids.forEach(([mx, mz], i) => {
          const dd = (b.x - mx) ** 2 + (b.z - mz) ** 2;
          if (dd < bd) {
            bd = dd;
            bi = i;
          }
        });
        eds[bi]!.set(b.x, b.y, b.z, b.id);
      }
      eds.forEach((e, i) => {
        const s = blocksSite(c, 'taki', e, mids[i]![0], plan.ponds[i]!.level, mids[i]![1]);
        out.push(s);
        used.push(s.foot);
      });
      if (river !== null) {
        const rb = river.blocks();
        const f0 = rb.find((b) => b.id === B.water) ?? rb[0]!;
        out.push(blocksSite(c, 'kawa', river, f0.x, f0.y, f0.z));
      }
      for (const b of all.concat(river?.blocks() ?? [])) wet.add(b.x * 100003 + b.z);
      return true;
    });
  };
  const spots = sourceSpots(g, c.px, c.pz, LIMIT, base0, (x, z) => !hit(x, z), field, seed);
    // 上の 帯の 池から 作れない 山は、中腹・どこかの がけ（山の まん中から）へ 下げる
  const cspots = [...spots, ...highSpots(g, c.px, c.pz, LIMIT, base0, (x, z) => !hit(x, z), seed, CAS.spotCount)];
  const cascaded = [2, 1].some((m) => cspots.some((sp) => runCascade(sp, m)));
  if (!cascaded && !spots.some((sp) => runChain(sp, SRC.near))) runChain({ x: c.px, z: c.pz, score: 0 }, Infinity);
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
