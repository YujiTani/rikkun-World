import { SEA_Y } from '../../contracts';
import { Walk, CAVE_RULES, CAVE_SPEC, type Cave, type HiroiTable, type MineHook1D } from './mineCaveKit';
import { GenCols, isBodyIndex, isSolidIndex, ptKey, standable, stepTo, type Layer, type Pt } from './mineShaftKit';
import { isWaterIndex } from '../blocks/water';
import { heightAt, spawnOf } from './terrain';

/** 部屋 1 つを ブロックで しらべる 道具〔D2〜D5・D14。`mineCaveKit.ts` から 分けた。約束は kit の 冒頭〕 */

type CaveBox = Cave['box'];
type CaveStats = ReturnType<MineHook1D['caveStats']>;
const around = (b: CaveBox, margin = 14): CaveBox => ({ x0: b.x0 - margin, y0: b.y0 - 8, z0: b.z0 - margin, x1: b.x1 + margin, y1: b.y1 + 8, z1: b.z1 + margin });

// ------------------------------------------------------------------ 部屋を ブロックで しらべる

const FOUR: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SIX: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export interface RoomReport {
  seed: number;
  cave: Cave;
  stats: CaveStats;
  /** 空気の マス・水の マス・立てる マスの 数 */
  counts: { air: number; water: number; floor: number };
  /** 部屋の 空気〔水〕の y の はんい */
  yRange: { lo: number; hi: number };
  /** 見える 鉱物〔空気か 水に ふれた 石。同じ ブロックは 1 回〕の 数 */
  exposed: Record<string, number>;
  /** かべ・天井〔空気の 横と 上〕の 石の 数と、せっかいせきの 数 */
  shell: { total: number; sekkaiseki: number };
  tsurara: number;
  /** 池: 水の あるく 列の ふかさの いちばん 大きい 数・水の はんい */
  pond: { depth: number; w: number; d: number; columns: number };
  /** 出口〔外へ 歩いて 出られる〕か */
  exit: { has: boolean; floorAllConnected: boolean; floorOut: number; outside: boolean };
  /** 直した ほうが よい 所を 文で〔空なら 合格〕 */
  problems: { layer: string[]; size: string[]; under: string[]; roof: string[]; step: string[]; hole: string[]; bank: string[] };
}

/** 部屋の 空気〔と 水〕を ブロックと caveAt から 集める */
function collect(g: GenCols, h: MineHook1D, c: Cave): { air: Pt[]; water: Pt[]; keys: Set<string> } {
  const air: Pt[] = [];
  const water: Pt[] = [];
  const keys = new Set<string>();
  const b = c.box;
  for (let x = b.x0; x <= b.x1; x++) {
    for (let z = b.z0; z <= b.z1; z++) {
      for (let y = b.y0; y <= b.y1; y++) {
        const id = g.at(x, y, z);
        const isAir = isBodyIndex(id);
        if (!isAir && !isWaterIndex(id)) continue;
        if (h.caveAt(x, y, z) !== c.kind) continue;
        (isAir ? air : water).push({ x, y, z });
        keys.add(ptKey({ x, y, z }));
      }
    }
  }
  return { air, water, keys };
}

function hiroiLayerHeight(h: MineHook1D, layer: 'asai' | 'nakahodo'): readonly [number, number] {
  const layers = h.hiroiTable().layers as HiroiTable['layers'] | undefined;
  if (!layers) throw new Error('hiroiTable().layers〔層ごとの 高さ・minCeil〕が まだ ない');
  return layers[layer].height;
}

const sizeProblems = (c: Cave, h: MineHook1D): string[] => {
  const bad: string[] = [];
  const spec = CAVE_SPEC[c.kind];
  const w = c.box.x1 - c.box.x0 + 1;
  const d = c.box.z1 - c.box.z0 + 1;
  const t = c.box.y1 - c.box.y0 + 1;
  if (c.size.x !== w || c.size.z !== d || c.size.y !== t) bad.push(`size ${c.size.x}×${c.size.z}×${c.size.y} が box ${w}×${d}×${t} と ちがう`);
  if (w < spec.x[0] || w > spec.x[1]) bad.push(`横 ${w}（${spec.x.join('〜')}）`);
  if (d < spec.z[0] || d > spec.z[1]) bad.push(`たて ${d}（${spec.z.join('〜')}）`);
  // ひろい ほらあなの 高さは その 層の 表〔`hiroiTable().layers`〕
  const hy = c.kind === 'hiroi' && (c.layer === 'asai' || c.layer === 'nakahodo') ? hiroiLayerHeight(h, c.layer) : spec.y;
  if (t < hy[0] || t > hy[1]) bad.push(`高さ ${t}（${hy.join('〜')}）`);
  if (!spec.layers.includes(c.layer)) bad.push(`層 ${c.layer}（${spec.layers.join('・')}）`);
  return bad;
};

/**
 * 部屋 1 つを ブロックで しらべる〔D2〜D5〕。重いので 1 回だけ 呼んで 結果を ためる。
 * `walkMargin` は 道さがしの 範囲〔部屋の まわり〕。
 */
export function reportRoom(seed: number, g: GenCols, h: MineHook1D, c: Cave, layerDefs: { id: Layer; minY: number; maxY: number | null }[]): RoomReport {
  const { air, water, keys } = collect(g, h, c);
  const problems: RoomReport['problems'] = { layer: [], size: sizeProblems(c, h), under: [], roof: [], step: [], hole: [], bank: [] };
  // 空気〔水を ふくむ〕は ぜんぶ 計画の 箱の 中〔箱の すぐ 外がわ 1 マスに その 部屋の 空気が ない〕
  {
    const b = c.box;
    let out = 0;
    const isRoom = (x: number, y: number, z: number): boolean => {
      const id = g.at(x, y, z);
      return (isBodyIndex(id) || isWaterIndex(id)) && h.caveAt(x, y, z) === c.kind;
    };
    for (let y = b.y0 - 1; y <= b.y1 + 1; y++) {
      for (let x = b.x0 - 1; x <= b.x1 + 1; x++) for (const z of [b.z0 - 1, b.z1 + 1]) if (isRoom(x, y, z)) out++;
      for (let z = b.z0; z <= b.z1; z++) for (const x of [b.x0 - 1, b.x1 + 1]) if (isRoom(x, y, z)) out++;
    }
    for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) for (const y of [b.y0 - 1, b.y1 + 1]) if (isRoom(x, y, z)) out++;
    if (out > 0) problems.size.push(`部屋の 空気が 計画の 箱の 外に ${out} マス`);
  }
  const def = layerDefs.find((l) => l.id === c.layer);
  const all = [...air, ...water];
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of all) {
    lo = Math.min(lo, p.y);
    hi = Math.max(hi, p.y);
  }
  if (all.length === 0) problems.layer.push('部屋の 空気が 1 マスも ない');
  if (def && all.length > 0) {
    if (lo < def.minY) problems.layer.push(`いちばん 下の 空気 y ${lo} が 層 ${c.layer} の 下 ${def.minY} より 下`);
    if (def.maxY !== null && hi > def.maxY) problems.layer.push(`いちばん 上の 空気 y ${hi} が 層 ${c.layer} の 上 ${def.maxY} より 上`);
  }
  // 立てる マス〔部屋の 中〕
  const floor = air.filter((p) => standable(g, p.x, p.y, p.z));
  const floorSet = new Set(floor.map(ptKey));
  // D4-1 床の 下 2 マスは 固い
  for (const p of floor) for (const d of [1, 2]) if (!isSolidIndex(g.at(p.x, p.y - d, p.z))) problems.under.push(`床 (${p.x}, ${p.y}, ${p.z}) の 下 ${d} マスが 固くない: ${g.id(p.x, p.y - d, p.z)}`);
  const byColumn = new Map<string, Pt[]>();
  for (const p of all) (byColumn.get(`${p.x},${p.z}`) ?? byColumn.set(`${p.x},${p.z}`, []).get(`${p.x},${p.z}`)!).push(p);
  // 池の 底の 下 2 マス・池の ふかさ
  let pondDepth = 0;
  let wx0 = Infinity;
  let wx1 = -Infinity;
  let wz0 = Infinity;
  let wz1 = -Infinity;
  const wcols = new Map<string, number[]>();
  for (const p of water) (wcols.get(`${p.x},${p.z}`) ?? wcols.set(`${p.x},${p.z}`, []).get(`${p.x},${p.z}`)!).push(p.y);
  for (const [k, ys] of wcols) {
    const [x, z] = k.split(',').map(Number) as [number, number];
    pondDepth = Math.max(pondDepth, ys.length);
    wx0 = Math.min(wx0, x);
    wx1 = Math.max(wx1, x);
    wz0 = Math.min(wz0, z);
    wz1 = Math.max(wz1, z);
    const bottom = Math.min(...ys);
    for (const d of [1, 2]) if (!isSolidIndex(g.at(x, bottom - d, z))) problems.under.push(`池の 底 (${x}, ${bottom}, ${z}) の 下 ${d} マスが 固くない: ${g.id(x, bottom - d, z)}`);
  }
  // D4-3 天井から 地面〔海の 下は 海の 底〕まで
  const rc = CAVE_RULES.roof;
  for (const [k, ps] of byColumn) {
    const [x, z] = k.split(',').map(Number) as [number, number];
    const roof = Math.max(...ps.map((p) => p.y)) + 1;
    const ground = heightAt(seed, x, z);
    const sea = ground <= SEA_Y - 1;
    const need = sea ? rc.sea : rc.ground;
    if (ground - roof < need) problems.roof.push(`列 (${x}, ${z}): 天井 y ${roof} の 上 ${ground - roof} マス〔${sea ? '海の 底' : '地面'}まで ${need} 以上〕`);
  }
  // D4-6 床の 段差 1 まで〔部屋の 立てる マスの 4 方向の となり。池の 岸〜水は 立てる マスでない ので 入らない〕
  const floorByCol = new Map<string, number[]>();
  for (const p of floor) (floorByCol.get(`${p.x},${p.z}`) ?? floorByCol.set(`${p.x},${p.z}`, []).get(`${p.x},${p.z}`)!).push(p.y);
  for (const p of floor) {
    for (const [dx, dz] of FOUR) {
      const ys = floorByCol.get(`${p.x + dx},${p.z + dz}`);
      if (!ys) continue;
      const near = Math.min(...ys.map((y) => Math.abs(y - p.y)));
      if (near > 1) problems.step.push(`床 (${p.x}, ${p.y}, ${p.z}) の ${dx},${dz} どなりと 段差 ${near}`);
    }
  }
  // 池の 岸から 水へは 1 段〔岸の 床の y ＝ となりの 水の いちばん 上の y ＋ 1〕
  for (const p of floor) {
    for (const [dx, dz] of FOUR) {
      const ys = wcols.get(`${p.x + dx},${p.z + dz}`);
      if (ys && p.y - Math.max(...ys) !== 1) problems.bank.push(`岸 (${p.x}, ${p.y}, ${p.z}) → 水の 上 y ${Math.max(...ys)}（1 段の はず）`);
    }
  }
  // 見える 鉱物・かべ・つらら
  const exposed: Record<string, Set<string>> = {};
  const shell = new Set<string>();
  let sekkai = 0;
  let tsurara = 0;
  for (const p of all) {
    if (g.id(p.x, p.y, p.z) === 'tsurara') tsurara++;
    for (const [dx, dy, dz] of SIX) {
      const q = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
      const k = ptKey(q);
      if (keys.has(k)) continue;
      const id = g.id(q.x, q.y, q.z);
      if (!isSolidIndex(g.at(q.x, q.y, q.z))) continue;
      (exposed[id] ??= new Set()).add(k);
      if (dy >= 0 && !shell.has(k)) {
        shell.add(k);
        if (Object.is(id, 'sekkaiseki')) sekkai++;
      }
    }
  }
  // D4-2・D5 歩いて 出られる / かべの 穴
  const walk = new Walk(g, around(c.box));
  let exitInfo: RoomReport['exit'] = { has: false, floorAllConnected: false, floorOut: 0, outside: false };
  if (floor.length > 0) {
    const s0 = floor[0]!;
    const f = walk.reach(s0);
    const r = walk.reach(s0, true);
    const mutual = new Set([...f.keys()].filter((k) => r.has(k)));
    const notIn = floor.filter((p) => !mutual.has(ptKey(p)));
    // 部屋の 外の 立てる マス〔部屋の 立てる マスの となりから、部屋の 外だけ たどって 数える〕
    const outside = [...mutual].filter((k) => !floorSet.has(k) && !keys.has(k));
    const entry: string[] = [];
    for (const k of outside) {
      const p = walk.nodes.get(k)!;
      const touches = FOUR.some(([dx, dz]) => {
        const q = stepTo(g, p, dx, dz);
        return q !== null && floorSet.has(ptKey(q));
      });
      if (touches) entry.push(k);
    }
    // 外の 道を たどった 歩数
    const outDist = new Map<string, number>(entry.map((k) => [k, 0]));
    const outSet = new Set(outside);
    let frontier = entry;
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const k of frontier) {
        const p = walk.nodes.get(k)!;
        for (const [dx, dz] of FOUR) {
          const q = stepTo(g, p, dx, dz);
          if (!q) continue;
          const kq = ptKey(q);
          if (!outSet.has(kq) || outDist.has(kq)) continue;
          outDist.set(kq, outDist.get(k)! + 1);
          next.push(kq);
        }
      }
      frontier = next;
    }
    const far = [...outDist.values()].some((d) => d >= CAVE_RULES.exitOutside);
    exitInfo = { has: entry.length > 0, floorAllConnected: notIn.length === 0, floorOut: notIn.length, outside: far };
    // かべの 穴: 部屋の 空気に ふれた 部屋の 外の 体の 通る マス
    const holes = new Map<string, Pt>();
    for (const p of all) {
      for (const [dx, dy, dz] of SIX) {
        const q = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
        const k = ptKey(q);
        if (keys.has(k) || !isBodyIndex(g.at(q.x, q.y, q.z))) continue;
        holes.set(k, q);
      }
    }
    // 穴は つながった 空気ごとに 見る〔床と 同じ 高さの 高い 穴は そのまま。上の マスを まちがいに しない〕
    const seenHole = new Set<string>();
    for (const [hk, hq] of holes) {
      if (seenHole.has(hk)) continue;
      const comp: Pt[] = [];
      const stack = [hq];
      seenHole.add(hk);
      while (stack.length > 0) {
        const p = stack.pop()!;
        comp.push(p);
        for (const [dx, dy, dz] of SIX) {
          const q = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
          const k = ptKey(q);
          if (!holes.has(k) || seenHole.has(k)) continue;
          seenHole.add(k);
          stack.push(q);
        }
      }
      const reach = comp.some((p) => walk.nodes.has(ptKey(p)) && mutual.has(ptKey(p)));
      // 歩いて 行き来 できない 穴は ふさがれて いる はず〔床から 4 以上 上・下の 穴も。のこって いれば まちがい。§4.7.3 の 2〕
      if (!reach) problems.hole.push(`穴 (${hq.x}, ${hq.y}, ${hq.z}) の つながり ${comp.length} マスが 歩いて 行き来 できず、ふさがれても いない`);
    }
  } else {
    problems.hole.push('立てる マスが ない');
  }
  const stats = h.caveStats(c.id);
  const shellTotal = shell.size;
  return {
    seed,
    cave: c,
    stats,
    counts: { air: air.length, water: water.length, floor: floor.length },
    yRange: { lo, hi },
    exposed: Object.fromEntries(Object.entries(exposed).map(([k, v]) => [k, v.size])),
    shell: { total: shellTotal, sekkaiseki: sekkai },
    tsurara,
    pond: { depth: pondDepth, w: wx1 - wx0 + 1, d: wz1 - wz0 + 1, columns: wcols.size },
    exit: exitInfo,
    problems,
  };
}

/** 6 方向の どれかが 空気か 水の 石の 数え方〔`columnOres` の wall の ように〕を ふくむ ふつうの 列の 比 〔見える せきたん＋てつ ÷ かべ〕 */
interface OreRate {
  layer: Layer;
  ore: number;
  wall: number;
}

/** ふつうの 列〔坑道・部屋が かからない〕を n こ ならべて、層ごとの 見える せきたん＋てつ と かべの 数を たす */
export function plainRate(h: MineHook1D, seed: number, layers: readonly Layer[], n = 24): Record<Layer, OreRate> {
  const out = Object.fromEntries(layers.map((l) => [l, { layer: l, ore: 0, wall: 0 }])) as Record<Layer, OreRate>;
  const sp = spawnOf(seed);
  let used = 0;
  for (let k = 0; used < n && k < n * 6; k++) {
    const cx = (sp.x >> 4) + 8 + (k % 12);
    const cz = (sp.z >> 4) + 8 + Math.floor(k / 12);
    const col = h.columnOres(cx, cz);
    if (!col.normal) continue;
    used++;
    for (const l of layers) {
      const L = col.layers[l];
      out[l].wall += L.wall;
      out[l].ore += (L.ores['coal_ore']?.visible ?? 0) + (L.ores['iron_ore']?.visible ?? 0);
    }
  }
  return out;
}

// ------------------------------------------------------------------ 部屋ごとの まとめ〔坑道の へやの D14 が 使う。抽選の 部屋の D3・D4・D5 は mineCaveContent.test.ts が くわしく 見る〕

/** D2・D4・D5 の まとめ〔空なら 合格〕。ひみつの 部屋〔穴 0〕は 出口を 求めない */
export function safetyProblems(r: RoomReport): string[] {
  const bad: string[] = [];
  for (const [name, list] of Object.entries(r.problems)) {
    if (name === 'bank') continue;
    for (const p of list.slice(0, 2)) bad.push(`${name}: ${p}`);
  }
  if (r.stats.holesUnder !== 0) bad.push(`holesUnder ${r.stats.holesUnder}`);
  if (r.stats.floorStep > 1) bad.push(`floorStep ${r.stats.floorStep}`);
  if (r.stats.roofToGround < CAVE_RULES.roof.ground) bad.push(`roofToGround ${r.stats.roofToGround}`);
  if (r.stats.pondDepth > CAVE_RULES.chiteiko.pondDepth[1]) bad.push(`pondDepth ${r.stats.pondDepth}`);
  if (r.exit.floorOut > 0) bad.push(`行き来 できない 床 ${r.exit.floorOut} マス`);
  if (r.stats.openings > 0 && !(r.exit.has && r.exit.outside)) bad.push('穴が あるのに 歩いて 出られない');
  return bad;
}

/** D3 の まとめ〔空なら 合格〕。ひろい ほらあなの 「ふつうの 列の 2 倍」は rate〔`plainRate`〕を わたした ときだけ 見る */
export function contentProblems(r: RoomReport, rate: Record<Layer, OreRate> | null): string[] {
  const bad: string[] = [];
  const x = (id: string): number => r.exposed[id] ?? 0;
  switch (r.cave.kind) {
    case 'hiroi': {
      const iron = r.stats.visible['iron_ore'] ?? 0;
      if (iron < CAVE_RULES.hiroi.ironMin) bad.push(`てつ ${iron}`);
      const base = rate?.[r.cave.layer];
      if (base && base.wall > 0 && r.stats.wall > 0) {
        const want = (base.ore / base.wall) * CAVE_RULES.hiroi.wallOreTimes;
        const got = ((r.stats.visible['coal_ore'] ?? 0) + iron) / r.stats.wall;
        if (got < want) bad.push(`せきたん＋てつの わりあい ${got.toFixed(4)} < ふつうの ${CAVE_RULES.hiroi.wallOreTimes} 倍 ${want.toFixed(4)}`);
      }
      break;
    }
    case 'shonyudo':
      if (r.tsurara < CAVE_RULES.shonyudo.tsuraraMin) bad.push(`つらら ${r.tsurara}`);
      if (r.shell.total === 0 || r.shell.sekkaiseki / r.shell.total < CAVE_RULES.shonyudo.sekkaisekiShare) bad.push(`せっかいせき ${r.shell.sekkaiseki} / ${r.shell.total}`);
      break;
    case 'chiteiko': {
      const c = CAVE_RULES.chiteiko;
      if (r.pond.depth < c.pondDepth[0] || r.pond.depth > c.pondDepth[1]) bad.push(`池の ふかさ ${r.pond.depth}`);
      if (r.pond.w < c.pondWidth[0] || r.pond.w > c.pondWidth[1] || r.pond.d < c.pondWidth[0] || r.pond.d > c.pondWidth[1]) bad.push(`池の 大きさ ${r.pond.w}×${r.pond.d}`);
      if (x('nendo') < c.nendoMin) bad.push(`ねんど ${x('nendo')}`);
      if (r.problems.bank.length > 0) bad.push(`岸 ${r.problems.bank[0]}`);
      break;
    }
    case 'hotaru': {
      const [lo, hi] = CAVE_RULES.hotaru.visible;
      if (x('hotaruishi') < lo || x('hotaruishi') > hi) bad.push(`ほたるいし ${x('hotaruishi')}`);
      break;
    }
    case 'suisho': {
      const [lo, hi] = CAVE_RULES.suisho.visible;
      if (x('suisho_ore') < lo || x('suisho_ore') > hi) bad.push(`すいしょう ${x('suisho_ore')}`);
      break;
    }
    default: {
      const never: never = r.cave.kind;
      bad.push(`知らない 種類 ${String(never)}`);
    }
  }
  return bad;
}

