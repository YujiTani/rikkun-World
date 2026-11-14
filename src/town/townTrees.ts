import { hash01 } from '../world/gen/random';
import { shapedTreeCells, type ShapedTree } from '../world/gen/treeShapes';
import { trunkOf, type TreeForm, type TreeSize } from '../world/gen/treeV2';
import { townBuildingColumns } from './townBuildings';
import { CANAL, SURF, at, inLocal, type Layout } from './townLayout';
import { TOWN } from './townTuning';

/**
 * TOWN-1 1B-2: 街の 木（§2.2 の 10・§4.5）。形は 今の ゲームの 木（treeV2。1 本ずつ ちがう）を そのまま つかい、
 * さくらは はっぱの ブロックだけ 花の 色（town_sakura）に する。置き場所は シードと 街の 位置で 決まり、毎回 同じ。
 * 建物・道・橋・門・用水路・あきち・石どうろうに かからない（みきも はっぱも）。計算だけ（世界の ブロックは 読まない）。
 */

/** 街の 木 1 本。world の x・z・y は ShapedTree の とおり（y ＝ 地面の ブロックの 高さ） */
export interface TownTree extends ShapedTree {
  /** さくら（花の 色の はっぱ）か */
  sakura: boolean;
}

/** 世界への うつし（townPlan から 渡す。import の わを 作らない ため 形だけ） */
export interface TownFrame {
  groundY: number;
  toWorld(u: number, v: number): { x: number; z: number };
  toLocal(x: number, z: number): { u: number; v: number } | null;
}

/** 街の ふちから この マス 以内には 植えない（石どうろうの 列・はっぱの はみ出し よけ） */
const EDGE_KEEP = 3;
/** 石段の 口・石どうろう・あきちの くいを よける 半径（マス） */
const KEEP_AROUND = { stair: 2, toro: 1, lot: 1 } as const;
/** 大きさ ごとの 木の わりあい（中が この 値 より 小さい 乱数なら 中） */
const MEDIUM_CHANCE = { plaza: 0.5, canal: 0.1, plain: 0.4 } as const;
/** ふつうの 木の うち まつの わりあい */
const PINE_CHANCE = 0.2;

interface Static {
  /** 木を 植えて よい マス（みき・はっぱ） */
  free: Uint8Array;
  /** みきを 植えて よい マス（まわりに あきが ある） */
  trunk: Uint8Array;
  /** 乱数で ならべた 候補（trunk が 1 の マス） */
  order: { u: number; v: number; k: number }[];
}

let cache: { layout: Layout; s: Static } | null = null;

/** 向き・高さに よらない 「植えられる マス」の 表（1 回 だけ 作る） */
function staticOf(layout: Layout): Static {
  if (cache !== null && cache.layout === layout) return cache.s;
  const N = TOWN.size;
  const cols = townBuildingColumns();
  const free = new Uint8Array(N * N);
  for (let v = 0; v < N; v++) {
    for (let u = 0; u < N; u++) {
      const k = at(u, v);
      const onSurf = layout.surf[k] === SURF.ground || layout.surf[k] === SURF.terrace;
      const clear = layout.canal[k] === CANAL.none && layout.rail[k] + layout.notch[k] + layout.wall[k] + layout.bridge[k] === 0 && !cols.has(k);
      const inside = u >= EDGE_KEEP && v >= EDGE_KEEP && u < N - EDGE_KEEP && v < N - EDGE_KEEP;
      free[k] = onSurf && clear && inside ? 1 : 0;
    }
  }
  const block = (cu: number, cv: number, r: number): void => {
    for (let v = cv - r; v <= cv + r; v++) for (let u = cu - r; u <= cu + r; u++) if (inLocal(u, v)) free[at(u, v)] = 0;
  };
  for (const t of layout.toro) block(t.u, t.v, KEEP_AROUND.toro);
  for (const st of layout.stairs) block(st.top.u, st.top.v, KEEP_AROUND.stair);
  for (const r of layout.lots) for (let v = r.v0 - KEEP_AROUND.lot; v <= r.v1 + KEEP_AROUND.lot; v++) for (let u = r.u0 - KEEP_AROUND.lot; u <= r.u1 + KEEP_AROUND.lot; u++) if (inLocal(u, v)) free[at(u, v)] = 0;
  const m = TOWN.trees.trunkMargin;
  const trunk = new Uint8Array(N * N);
  const order: Static['order'] = [];
  for (let v = 0; v < N; v++) {
    for (let u = 0; u < N; u++) {
      let ok = true;
      for (let dv = -m; dv <= m && ok; dv++) for (let du = -m; du <= m; du++) if (!inLocal(u + du, v + dv) || free[at(u + du, v + dv)] === 0) { ok = false; break; }
      if (!ok || v > TOWN.trees.vMax) continue;
      trunk[at(u, v)] = 1;
      order.push({ u, v, k: at(u, v) });
    }
  }
  order.sort((a, b) => hash01(TOWN.trees.seed, a.u, a.v) - hash01(TOWN.trees.seed, b.u, b.v));
  cache = { layout, s: { free, trunk, order } };
  return cache.s;
}

/** 四角（ふくむ）から マス (u, v) までの 距離（チェビシェフ。中は 0） */
const rectDist = (r: { u0: number; v0: number; u1: number; v1: number }, u: number, v: number): number => Math.max(r.u0 - u, u - r.u1, r.v0 - v, v - r.v1, 0);

/** 街の 木を 決める（同じ 街の 位置・向きなら いつも 同じ） */
export function planTownTrees(layout: Layout, frame: TownFrame): TownTree[] {
  const S = staticOf(layout);
  const C = TOWN.trees;
  const nearCanal = (u: number, v: number, min: number, max: number): boolean => {
    let best = Infinity;
    for (let dv = -max; dv <= max; dv++) {
      for (let du = -max; du <= max; du++) {
        const nu = u + du;
        const nv = v + dv;
        if (!inLocal(nu, nv) || layout.canal[at(nu, nv)] === CANAL.none) continue;
        best = Math.min(best, Math.max(Math.abs(du), Math.abs(dv)));
      }
    }
    return best >= min && best <= max;
  };
  const out: TownTree[] = [];
  const spots: { u: number; v: number; sakura: boolean }[] = [];
  const zones: { kind: 'plaza' | 'canal' | 'plain'; count: number }[] = [
    { kind: 'plaza', count: C.sakuraPlaza },
    { kind: 'canal', count: C.sakuraCanal },
    { kind: 'plain', count: C.plain },
  ];
  for (const z of zones) {
    let placed = 0;
    for (const c of S.order) {
      if (placed >= z.count || out.length >= C.max) break;
      if (z.kind === 'plaza') {
        const d = rectDist(layout.plaza, c.u, c.v);
        if (d < C.plazaNear.min || d > C.plazaNear.max) continue;
      } else if (z.kind === 'canal') {
        if (!nearCanal(c.u, c.v, C.canalNear.min, C.canalNear.max)) continue;
      } else if (rectDist(layout.plaza, c.u, c.v) <= C.plazaNear.max || nearCanal(c.u, c.v, 1, C.canalNear.max)) continue;
      const sakura = z.kind !== 'plain';
      const gap = sakura ? C.gapSakura : C.gapPlain;
      if (spots.some((s) => Math.hypot(s.u - c.u, s.v - c.v) < (s.sakura && sakura ? C.gapSakura : Math.max(gap, C.gapPlain)))) continue;
      const tree = makeTree(layout, frame, c.u, c.v, z.kind, sakura);
      if (!fits(S, frame, tree)) continue;
      spots.push({ u: c.u, v: c.v, sakura });
      out.push(tree);
      placed++;
    }
  }
  return out;
}

function makeTree(layout: Layout, frame: TownFrame, u: number, v: number, kind: 'plaza' | 'canal' | 'plain', sakura: boolean): TownTree {
  const w = frame.toWorld(u, v);
  const R = (k: number): number => hash01(TOWN.trees.seed + 1, u, v, k);
  const size: TreeSize = R(1) < MEDIUM_CHANCE[kind] ? 'm' : 's';
  const form: TreeForm = !sakura && R(2) < PINE_CHANCE ? 'pine' : 'round';
  const y = frame.groundY + (layout.surf[at(u, v)] === SURF.terrace ? TOWN.terrace.rise : 0);
  return { x: w.x, z: w.z, y, trunk: trunkOf(form, size, R(3)), size, form, leaves: form === 'pine' ? 'matsu_leaves' : 'leaves', sakura };
}

/** みきも はっぱも 植えて よい マスに おさまるか */
function fits(S: Static, frame: TownFrame, t: TownTree): boolean {
  for (const c of shapedTreeCells(t)) {
    const p = frame.toLocal(c.x, c.z);
    if (p === null || S.free[at(p.u, p.v)] === 0) return false;
  }
  return true;
}
