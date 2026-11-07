import { beforeAll, describe, expect, it, vi } from 'vitest';
import { COMBAT_DEFAULTS } from '../../combat/config';
import {
  CAVE_RULES,
  CAVE_SPEC,
  SEEDS_3,
  areaAround,
  hookCave,
  lotteryCaves,
  needCaveHook,
  type Cave,
  type HiroiPlan,
  type HiroiTable,
  type HiroiTry,
  type HiroiTryRow,
  type MineHook1D,
} from './mineCaveKit';
import { plainRate } from './mineCaveReport';
import { GenCols, isBodyIndex, isSolidIndex, ptKey, standable, stepTo, type Pt } from './mineShaftKit';

/**
 * MINE-1D【4 版】（docs/design/MINE-1.md §4.7.2 の B「いしの 木」の きまり・§6.1 `hiroiTable`・`hiroiPlan`・`hiroiTries`・`hiroiTry`・受け入れ基準 D15 ①〜⑨）。
 *
 *   シード 3 つの ひろい ほらあな〔抽選の 部屋と 坑道の へや。時間の ため 1 シードの 数に 上の 限りを つける: `MAX_LOTTERY`・`MAX_HEYA`〕を、
 *   **生成した ブロック**と `hiroiPlan` の 両方で しらべる。数は ぜんぶ `hiroiTable()`〔と 戦いの 設定の `safeFallHeight`〕から 読む〔#311〕。ms は 見ない〔#255〕。
 *   ・① たまご 2 つ・ceilSpread・ふかい こぶ　② 天井の こぶ　③ 床の こぶ　④ 柱〔本数・段ごとの はば・ふとすぎない・すそ・1 周〕
 *   ・⑤ 鉱石の ばしょ・床の 下は 鉱石 なし・D3 の 2 倍　⑥ たいまつ　⑦ 同じ シードは 同じ 形　⑧ ためす 回数　⑨ すその 見こみ〔部屋の 乱数 200 こ〕
 *
 * 【自分で 決めた 見かた】 developer は これに 合わせる〔ちがう ときは ここ 1 か所を 直す〕:
 *   ・座標は 仕様 §6.1 の「計画の 座標の きまり」〔試作 aaba44be と 同じ〕: 計画の 数は 部屋の 中の 座標・世界 ＝ `plan.origin` ＋ それ。マス〔x, z〕の まん中は〔x ＋ 0.5, z ＋ 0.5〕。
 *       たまご ＝ 〔(x ＋ 0.5 − cx) / rx〕² ＋ 〔(z ＋ 0.5 − cz) / rz〕² ＜ 1〔空気の 列の 見かたは ふちを 1 マス ゆるす〕・こぶの 〔x, z〕は マスの かど〔下の マス ＝ まん中との きょり ＜ r〕・柱の 〔x, z〕は 中心の マスの 番号・
 *       内がわ ＝ 7×7 の 49 マス〔こぶが 内がわ ＝ かどを 北西に もつ マスが 内がわ〕・段 ＝ y − `plan.origin.y`〔＝ `Cave.box.y0`〕・円 ＝ 中心の マスの まん中から の きょり ＜ はば ÷ 2・わ ＝ 円の すぐ 外で 円と 8 方向で となる マス
 *   ・`Cave.box` ＝ 計画の 箱〔どの 種類も。空気は ぜんぶ その 中。空気だけの 箱では ない。仕様 §4.7.2〕
 *   ・空気の 数は 計画の 箱の 中の「その 部屋の 空気」〔`caveAt` が その 種類〕。出口の 前 4 マスの 数え方 ＝ 外がわの 体の 通る マスが 口の むきに 4 マス いじょう つづく 口だけ
 *   ・`findCave` の「いちばん 近い」＝ 中心の 横〔x, z〕の ユークリッド きょり
 *   ・出口 ＝ 部屋の 空気に 東西南北で となりあう 部屋の 外の 体の 通る マス。その 前 4 マス ＝ 部屋の 中へ むかって 4 マス〔出口の はばの ぶん〕
 *   ・天井の 高さ ＝ 立てる マスの 足から 上へ 体の 通る マスが 切れる 所〔最初の 固い マス〕の y − y0
 *   ・床の ひろさ N ＝ 空気の ある 列の 数 ＋ 柱の 根もとの まるに ある 空気の 無い 列。本数の 上の 見かたは 四捨五入の ふちを ±2 マス ゆるす
 *   ・部屋の いちばん 高い 天井 ＝ 空気の 列の 上の はしの y ＋ 1 − y0〔天井がわ ＝ 段が その `ceilFrom` 倍の 切りすての 数 以上〕
 *   ・窓口 `hiroiTries(x0, z0, x1, z1)`・`hiroiTry(seed)` は 仕様 §6.1 の とおり。部屋と 行の ひも付けは `cave`〔Cave.id〕
 *
 * 赤の 確かめ: 1D の 前は 窓口〔caves・hiroiPlan・hiroiTable など〕が なく「窓口が まだ ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 360_000 });

const REGIONS = 12;
/** 1 シードで しらべる 部屋の 数の 上の 限り〔時間の ため。ブロックを 1 マスずつ 見る〕 */
const MAX_LOTTERY = 6;
const MAX_HEYA = 6;
/** ⑨ の 部屋の 乱数〔i × 13 ＋ 1。i ＝ 0〜199。仕様と 同じ 200 こ〕 */
const LAYERS = ['asai', 'nakahodo'] as const;
const AIM_SEEDS = Array.from({ length: 200 }, (_, i) => i * 13 + 1);

// ------------------------------------------------------------------ 形の 道具

const inDisc = (x: number, z: number, px: number, pz: number, w: number): boolean => (x - px) ** 2 + (z - pz) ** 2 < (w / 2) ** 2;
const FOUR: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SIX: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const colKey = (x: number, z: number): string => `${x},${z}`;

function discCells(px: number, pz: number, w: number): [number, number][] {
  const out: [number, number][] = [];
  const r = Math.ceil(w / 2);
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (inDisc(px + dx, pz + dz, px, pz, w)) out.push([px + dx, pz + dz]);
  return out;
}
/** わ ＝ 円の すぐ 外で、円の マスと 8 方向で となる マス */
function ringCells(px: number, pz: number, w: number): [number, number][] {
  const out: [number, number][] = [];
  const r = Math.ceil(w / 2) + 1;
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const x = px + dx;
      const z = pz + dz;
      if (inDisc(x, z, px, pz, w)) continue;
      let near = false;
      for (let ax = -1; ax <= 1 && !near; ax++) for (let az = -1; az <= 1 && !near; az++) if (inDisc(x + ax, z + az, px, pz, w)) near = true;
      if (near) out.push([x, z]);
    }
  }
  return out;
}

/** 立てる マスの 集まりが 4 方向の 道さがし〔stepTo〕で ぜんぶ 行き来 できる〔1 周〕 */
function loops(g: GenCols, nodes: Pt[]): boolean {
  if (nodes.length === 0) return false;
  const keys = new Set(nodes.map(ptKey));
  const fwd = new Map<string, string[]>();
  const rev = new Map<string, string[]>();
  for (const a of nodes) {
    for (const [dx, dz] of FOUR) {
      const q = stepTo(g, a, dx, dz);
      if (!q || !keys.has(ptKey(q))) continue;
      (fwd.get(ptKey(a)) ?? fwd.set(ptKey(a), []).get(ptKey(a))!).push(ptKey(q));
      (rev.get(ptKey(q)) ?? rev.set(ptKey(q), []).get(ptKey(q))!).push(ptKey(a));
    }
  }
  const all = (adj: Map<string, string[]>): number => {
    const seen = new Set<string>([ptKey(nodes[0]!)]);
    const stack = [ptKey(nodes[0]!)];
    while (stack.length > 0) for (const n of adj.get(stack.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), stack.push(n));
    return seen.size;
  };
  return all(fwd) === nodes.length && all(rev) === nodes.length;
}

const ORE_SEEN = new Set(['coal_ore', 'iron_ore']);
const TORCH = new Set(['torch', 'start_torch']);

// ------------------------------------------------------------------ 部屋 1 つの しらべ

/** 計画の 数は 部屋の 中の 座標〔仕様 §6.1〕→ 世界の ブロック座標〔origin を たす〕。マス・かどの きまりは そのまま */
function toWorld(p: HiroiPlan): HiroiPlan {
  const { x: ox, y: oy, z: oz } = p.origin;
  void oy;
  return {
    ...p,
    eggs: p.eggs.map((e) => ({ ...e, cx: e.cx + ox, cz: e.cz + oz })),
    pillars: p.pillars.map((q) => ({ ...q, x: q.x + ox, z: q.z + oz })),
    knobs: p.knobs.map((k) => ({ ...k, x: k.x + ox, z: k.z + oz })),
    bumps: p.bumps.map((q) => ({ x: q.x + ox, z: q.z + oz })),
  };
}

interface Items {
  egg: string[];
  knob: string[];
  bump: string[];
  pillar: string[];
  ore: string[];
  torch: string[];
}
interface RoomRow {
  seed: number;
  cave: Cave;
  heya: boolean;
  plan: HiroiPlan;
  tries: HiroiTryRow | null;
  items: Items;
}

function analyse(seed: number, g: GenCols, h: MineHook1D, c: Cave, table: HiroiTable, local: HiroiPlan, row: HiroiTryRow | null, rate: ReturnType<typeof plainRate>): Items {
  const plan = toWorld(local);
  const bad: Items = { egg: [], knob: [], bump: [], pillar: [], ore: [], torch: [] };
  const small = row?.small === true;
  const b = c.box;
  const y0 = plan.origin.y;
  const pt = table.pillar;
  // 空気の マス・列
  const air = new Set<string>();
  const airCols = new Map<string, number[]>();
  for (let x = b.x0; x <= b.x1; x++) {
    for (let z = b.z0; z <= b.z1; z++) {
      for (let y = b.y0; y <= b.y1; y++) {
        if (!isBodyIndex(g.at(x, y, z)) || h.caveAt(x, y, z) !== 'hiroi') continue;
        air.add(ptKey({ x, y, z }));
        (airCols.get(colKey(x, z)) ?? airCols.set(colKey(x, z), []).get(colKey(x, z))!).push(y);
      }
    }
  }
  // 空気は 計画の 四角〔Cave.box〕の 中だけ〔外がわ 1 マスに ひろい ほらあなの 空気が ない〕
  let outside = 0;
  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0 - 1; x <= b.x1 + 1; x++) for (const z of [b.z0 - 1, b.z1 + 1]) if (isBodyIndex(g.at(x, y, z)) && h.caveAt(x, y, z) === 'hiroi') outside++;
    for (let z = b.z0; z <= b.z1; z++) for (const x of [b.x0 - 1, b.x1 + 1]) if (isBodyIndex(g.at(x, y, z)) && h.caveAt(x, y, z) === 'hiroi') outside++;
  }
  if (outside > 0) bad.egg.push(`空気が 計画の 四角の 外に ${outside} マス`);
  const floor = new Map<string, Pt>();
  for (const [k, ys] of airCols) {
    const [x, z] = k.split(',').map(Number) as [number, number];
    for (const y of ys) {
      if (standable(g, x, y, z)) {
        floor.set(k, { x, y, z });
        break;
      }
    }
  }
  const ceilOf = (p: Pt): number => {
    let y = p.y;
    while (isBodyIndex(g.at(p.x, y + 1, p.z)) && y < b.y1 + 4) y++;
    return y + 1;
  };
  const topOf = (k: string): number => Math.max(...airCols.get(k)!) + 1;
  const crownMax = Math.max(...pt.crown);
  const inRoot = (x: number, z: number): boolean => plan.pillars.some((p) => inDisc(x, z, p.x, p.z, p.widths[0]!));
  // たまごの 中心は マスの かど の 座標〔マス x の まん中は x ＋ 0.5〕
  const inEgg = (x: number, z: number, tol: number): boolean => plan.eggs.some((e) => ((x + 0.5 - e.cx) / (e.rx + tol)) ** 2 + ((z + 0.5 - e.cz) / (e.rz + tol)) ** 2 < 1);

  // 出口〔部屋の 空気に となりあう 外の 体の 通る マス〕と その 前 4 マスの 列
  const front = new Set<string>();
  const nearHole = new Set<string>(); // 口の まわり 4 マス〔まがった 穴も。口の むきは 問わない〕
  for (const k of air) {
    const [x, y, z] = k.split(',').map(Number) as [number, number, number];
    for (const [dx, dz] of FOUR) {
      const q = ptKey({ x: x + dx, y, z: z + dz });
      if (air.has(q) || !isBodyIndex(g.at(x + dx, y, z + dz))) continue;
      // 横穴の むき: 外がわの 体の 通る マスが その むきに 4 マス いじょう つづく 口だけ〔口の はばの 横を 向いた となりは 出口でない〕
      for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) nearHole.add(colKey(x + i, z + j));
      let run = 0;
      while (run < 4 && isBodyIndex(g.at(x + dx * (run + 1), y, z + dz * (run + 1))) && !air.has(ptKey({ x: x + dx * (run + 1), y, z: z + dz * (run + 1) }))) run++;
      if (run < 4) continue;
      for (let i = 0; i < 4; i++) front.add(colKey(x - dx * i, z - dz * i));
    }
  }

  // ① たまご 2 つ・ceilSpread・ふかい こぶ
  if (plan.eggs.length !== table.eggs) bad.egg.push(`たまご ${plan.eggs.length}〔${table.eggs}〕`);
  for (const k of airCols.keys()) {
    const [x, z] = k.split(',').map(Number) as [number, number];
    if (!inEgg(x, z, 1)) bad.egg.push(`空気の 列 (${x}, ${z}) が どちらの たまごにも 入らない`);
  }
  const inner = (x: number, z: number): boolean => {
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (!inEgg(x + dx, z + dz, 0)) return false;
    return true;
  };
  const heights: number[] = [];
  for (const [k, p] of floor) {
    if (!inner(p.x, p.z) || plan.pillars.some((q) => inDisc(p.x, p.z, q.x, q.z, crownMax))) continue;
    void k;
    heights.push(ceilOf(p) - y0);
  }
  if (heights.length === 0) bad.egg.push('内がわの 床が 1 マスも ない');
  else if (Math.max(...heights) - Math.min(...heights) < table.ceilSpread) bad.egg.push(`内がわの 天井の 高さの 差 ${Math.max(...heights) - Math.min(...heights)} < ${table.ceilSpread}`);
  if (!plan.knobs.some((k) => k.drop >= table.knobDeepMin && 2 * k.r >= table.knobDeepMin && inner(k.x, k.z))) bad.egg.push(`内がわに さがる 量・はば ${table.knobDeepMin} 以上の こぶが ない`);

  // ② 天井の こぶ
  const knobLo = small ? table.knobMinSmall : table.knobs[0];
  if (plan.knobs.length < knobLo || plan.knobs.length > table.knobs[1]) bad.knob.push(`こぶ ${plan.knobs.length} こ〔${knobLo}〜${table.knobs[1]}${small ? '・小さい 部屋' : ''}〕`);
  // こぶの 中心も マスの かど の 座標 → マスの 番号の 空間へは −0.5
  for (const k of plan.knobs.map((q) => ({ ...q, x: q.x - 0.5, z: q.z - 0.5 }))) {
    const tag = `こぶ (${k.x + 0.5}, ${k.z + 0.5})`;
    if (k.drop > 2 * k.r + 1e-6) bad.knob.push(`${tag}: さがる 量 ${k.drop} > はば ${2 * k.r}`);
    for (const [ck, p] of floor) {
      if ((p.x - k.x) ** 2 + (p.z - k.z) ** 2 > k.r ** 2) continue;
      if (ceilOf(p) - p.y < 4) bad.knob.push(`${tag}: 下の 立てる マス ${ck} の 足から 上の 空気が ${ceilOf(p) - p.y} マス〔4 マス いる〕`);
    }
    for (const p of plan.pillars) {
      const crown = p.widths[p.widths.length - 1]!;
      if (Math.hypot(k.x - p.x, k.z - p.z) < k.r + crown / 2 - 1e-6) bad.knob.push(`${tag}: 柱 (${p.x}, ${p.z}) の かんむりと かさなる`);
    }
  }
  // とがらない: 天井の どの マスも 4 方向の となり ぜんぶより ひくい ことが ない〔PO の 決め。となりが 石の かべの 列は 数えない〕
  for (const ck of airCols.keys()) {
    const [x, z] = ck.split(',').map(Number) as [number, number];
    if (plan.pillars.some((q) => inDisc(x, z, q.x, q.z, crownMax))) continue; // 柱の 列は のぞく
    const v = topOf(ck);
    if (FOUR.every(([dx, dz]) => airCols.has(colKey(x + dx, z + dz)) && topOf(colKey(x + dx, z + dz)) > v)) {
      bad.knob.push(`天井の マス (${x}, ${z}) が 4 方向の となり ぜんぶより ひくい〔とがり〕`);
      break;
    }
  }
  let tsurara = 0;
  for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) for (let y = b.y0; y <= b.y1; y++) if (Object.is(g.id(x, y, z), 'tsurara')) tsurara++;
  if (tsurara !== 0) bad.knob.push(`つらら ${tsurara}〔0〕`);

  // ③ 床の こぶ
  const rest = [...floor.values()].filter((p) => !inRoot(p.x, p.z));
  const bumpCells = rest.filter((p) => p.y === y0 + 1);
  const off = rest.filter((p) => p.y !== y0 && p.y !== y0 + 1 && !nearHole.has(colKey(p.x, p.z))); // 口の まわり〔まがった 穴も〕の だんは §4.7.3 の 2 で ゆるす
  if (off.length > 0) bad.bump.push(`床が 平らでない 所 ${off.length}〔(${off[0]!.x}, ${off[0]!.y}, ${off[0]!.z}) など。ひくい 床 ${y0} か 1 段 たかい〕`);
  const share = rest.length > 0 ? bumpCells.length / rest.length : 0;
  if (share < table.bumpShare[0] - 0.01 || share > table.bumpShare[1] + 0.01) bad.bump.push(`こぶの わりあい ${share.toFixed(3)}〔${table.bumpShare.join('〜')}・${bumpCells.length} / ${rest.length}〕`);
  for (const q of plan.bumps) {
    const f = floor.get(colKey(q.x, q.z));
    if (!f || f.y !== y0 + 1) bad.bump.push(`計画の こぶ (${q.x}, ${q.z}) が ブロックでは 1 段 たかく ない`);
    if (inRoot(q.x, q.z)) bad.bump.push(`こぶ (${q.x}, ${q.z}) が 柱の 根もとの まるの 中`);
    if (front.has(colKey(q.x, q.z))) bad.bump.push(`こぶ (${q.x}, ${q.z}) が 出口の 前 4 マス`);
  }

  // ④ 柱
  let n = 0;
  const cols = new Set<string>(airCols.keys());
  for (const p of plan.pillars) for (const [x, z] of discCells(p.x, p.z, p.widths[0]!)) cols.add(colKey(x, z));
  n = cols.size;
  const clampPillars = (v: number): number => Math.min(table.pillars[1], Math.max(table.pillars[0], v));
  const upper = clampPillars(Math.round((n + 2) / table.floorPerPillar));
  const lower = clampPillars(Math.round((n - 2) / table.floorPerPillar));
  const lowest = small ? pt.smallMin : table.pillars[0];
  if (plan.pillars.length < lowest || plan.pillars.length > table.pillars[1] || plan.pillars.length > upper) bad.pillar.push(`柱 ${plan.pillars.length} 本〔床 ${n} マス ÷ ${table.floorPerPillar} → 上 ${upper}・下の 限り ${lowest}・上 ${table.pillars[1]}〕`);
  if (row && lower > table.pillars[0] && row.small) bad.pillar.push(`小さい 部屋と 言うが 本数の 見こみ ${lower} が ${table.pillars[0]} より 大きい`);
  const kind = plan.pillars[0] ? (plan.pillars[0].widths[0] === pt.skirt[0] ? pt.skirt : plan.pillars[0].widths[0] === pt.skirtSmall[0] ? pt.skirtSmall : null) : null;
  if (!kind) bad.pillar.push(`すその 0 段目の はば ${plan.pillars[0]?.widths[0]} が 表〔${pt.skirt[0]}・${pt.skirtSmall[0]}〕に ない`);
  const bumpSet = new Set(plan.bumps.map((q) => colKey(q.x, q.z)));
  const rings = (p: HiroiPlan['pillars'][number], s: number): [number, number][] => ringCells(p.x, p.z, p.widths[s]!);
  for (const p of plan.pillars) {
    const tag = `柱 (${p.x}, ${p.z})`;
    const minCeil = table.layers[c.layer as 'asai' | 'nakahodo'].minCeil; // 柱の 立つ 天井は 層ごとの 表
    if (p.ceil < minCeil) bad.pillar.push(`${tag}: ceil ${p.ceil} < ${minCeil}〔${c.layer}〕`);
    if (p.widths.length !== p.ceil) bad.pillar.push(`${tag}: widths の 数 ${p.widths.length} ≠ ceil ${p.ceil}`);
    if (kind) {
      const want = Array.from({ length: p.ceil }, (_, s) => (s < kind.length ? kind[s]! : s >= p.ceil - 2 ? pt.crown[s - (p.ceil - 2)]! : pt.mid));
      if (p.widths.join() !== want.join()) bad.pillar.push(`${tag}: はば ${p.widths.join(',')}〔表の とおりは ${want.join(',')}〕`);
    }
    // どの 段も 円の 中は ぜんぶ 固い・ふとすぎない
    for (let s = 0; s < p.ceil && s < p.widths.length; s++) {
      for (const [x, z] of discCells(p.x, p.z, p.widths[s]!)) {
        if (!isSolidIndex(g.at(x, y0 + s, z))) {
          bad.pillar.push(`${tag}: ${s} 段目の 円の マス (${x}, ${z}) が 固くない`);
          break;
        }
      }
      if (s > p.ceil - 3) continue;
      for (const [x, z] of rings(p, s)) {
        if (s === 0 && bumpSet.has(colKey(x, z))) continue;
        if (plan.pillars.some((q) => q !== p && inDisc(x, z, q.x, q.z, q.widths[s] ?? 0))) continue;
        const ys = airCols.get(colKey(x, z));
        if (!ys || Math.max(...ys) <= y0 + s) continue; // 天井の 石の 列〔その 段より 上に 空気が ない〕は 柱でない
        if (!isBodyIndex(g.at(x, y0 + s, z))) {
          bad.pillar.push(`${tag}: ${s} 段目の わの マス (${x}, ${z}) が 空気でない〔ふとすぎる〕`);
          break;
        }
      }
    }
    // かんむりの 列は 天井まで 固い
    for (const s of [p.ceil - 2, p.ceil - 1]) {
      const w = p.widths[s];
      if (w === undefined) continue;
      for (const [x, z] of discCells(p.x, p.z, w)) {
        const ys = airCols.get(colKey(x, z));
        if (ys && Math.max(...ys) >= y0 + s) {
          bad.pillar.push(`${tag}: かんむりの 列 (${x}, ${z}) に ${s} 段目 いじょうの 空気が ある`);
          break;
        }
      }
    }
    // すそ
    const root = p.widths[0]!;
    const near = [...discCells(p.x, p.z, crownMax), ...ringCells(p.x, p.z, crownMax)];
    for (const [x, z] of near) {
      const f = floor.get(colKey(x, z));
      if (!f) continue;
      if (f.y - y0 > pt.skirtMax) bad.pillar.push(`${tag}: まわりの 立てる マス (${x}, ${z}) が ${f.y - y0} 段〔すそは ${pt.skirtMax} まで〕`);
      if (inDisc(x, z, p.x, p.z, root) && f.y - y0 < 1) bad.pillar.push(`${tag}: 根もとの まるの 立てる マス (${x}, ${z}) が 0 段`);
      for (const [dx, dz] of FOUR) {
        const q = floor.get(colKey(x + dx, z + dz));
        if (q && Math.abs(q.y - f.y) > 1) bad.pillar.push(`${tag}: (${x}, ${z}) と (${x + dx}, ${z + dz}) の 段差 ${Math.abs(q.y - f.y)}`);
      }
    }
    const ring = ringCells(p.x, p.z, root);
    const nodes = ring.map(([x, z]) => floor.get(colKey(x, z))).filter((v): v is Pt => v !== undefined);
    if (nodes.length !== ring.length) bad.pillar.push(`${tag}: 根もとの わ ${ring.length} マスの うち 立てる マス ${nodes.length}`);
    else if (!loops(g, nodes)) bad.pillar.push(`${tag}: 根もとの わが 4 方向の 道さがしで 1 周 できない`);
    for (const [x, z] of discCells(p.x, p.z, root)) if (front.has(colKey(x, z))) bad.pillar.push(`${tag}: 根もとの まるが 出口の 前 4 マスに かかる`);
  }

  // ⑤ 鉱石
  const seen = new Set<string>();
  const ores: Pt[] = [];
  for (const k of air) {
    const [x, y, z] = k.split(',').map(Number) as [number, number, number];
    for (const [dx, dy, dz] of SIX) {
      const q = { x: x + dx, y: y + dy, z: z + dz };
      const qk = ptKey(q);
      if (air.has(qk) || seen.has(qk)) continue;
      if (ORE_SEEN.has(g.id(q.x, q.y, q.z))) (seen.add(qk), ores.push(q));
    }
  }
  const maxCeil = Math.max(...[...airCols.keys()].map(topOf)) - y0;
  const ceilFrom = Math.floor(maxCeil * table.oreZone.ceilFrom);
  const slen = kind?.length ?? 0;
  const inZone = ores.filter((o) => {
    const s = o.y - y0;
    if (s >= ceilFrom) return true;
    return plan.pillars.some((p) => s >= slen && s < slen + table.oreZone.baseRows && inDisc(o.x, o.z, p.x, p.z, pt.mid));
  }).length;
  if (ores.length === 0 || inZone / ores.length < table.oreZone.share) bad.ore.push(`見える せきたん＋てつ ${ores.length} こ の うち 根もと・天井がわ ${inZone}〔${table.oreZone.share} 以上〕`);
  const iron = ores.filter((o) => Object.is(g.id(o.x, o.y, o.z), 'iron_ore')).length;
  if (iron < CAVE_RULES.hiroi.ironMin) bad.ore.push(`てつ ${iron}〔${CAVE_RULES.hiroi.ironMin} 以上〕`);
  const base = rate[c.layer];
  const wall = h.caveStats(c.id).wall;
  if (base.wall > 0 && wall > 0 && ores.length / wall < (base.ore / base.wall) * CAVE_RULES.hiroi.wallOreTimes) bad.ore.push(`かべの わりあい ${(ores.length / wall).toFixed(4)} が ふつうの ${CAVE_RULES.hiroi.wallOreTimes} 倍 ${((base.ore / base.wall) * CAVE_RULES.hiroi.wallOreTimes).toFixed(4)} より 下`);
  let floorOre = 0;
  for (const p of floor.values()) if (g.id(p.x, p.y - 1, p.z).endsWith('_ore')) floorOre++;
  if (floorOre !== 0) bad.ore.push(`立てる マスの 足の 下の 鉱石 ${floorOre}〔0〕`);
  if (h.caveStats(c.id).floorOre !== 0) bad.ore.push(`caveStats.floorOre ${h.caveStats(c.id).floorOre}〔0〕`);

  // ⑥ たいまつ
  const stats = h.caveStats(c.id);
  const wantTorches = c.shaft !== null ? 2 : 0;
  if (stats.torches !== wantTorches) bad.torch.push(`torches ${stats.torches}〔${c.shaft !== null ? '坑道の へや' : '抽選の 部屋'}は ${wantTorches}〕`);
  for (let x = b.x0; x <= b.x1; x++) {
    for (let z = b.z0; z <= b.z1; z++) {
      for (let y = b.y0; y <= b.y1; y++) {
        if (!TORCH.has(g.id(x, y, z))) continue;
        if (plan.pillars.some((p) => inDisc(x, z, p.x, p.z, p.widths[0]! + 2))) bad.torch.push(`たいまつ (${x}, ${y}, ${z}) が 柱の 根もと〔まわり 1 マス〕に ある`);
      }
    }
  }
  void seed;
  return bad;
}

// ------------------------------------------------------------------ 部屋を あつめて しらべる

const hooks = new Map<number, MineHook1D>();
const grids = new Map<number, GenCols>();
const rooms: RoomRow[] = [];
const triesBySeed = new Map<number, HiroiTryRow[]>();
let table!: HiroiTable;

function hiroiRooms(h: MineHook1D, seed: number): { cave: Cave; heya: boolean }[] {
  const out: { cave: Cave; heya: boolean }[] = [];
  const area = areaAround(seed, REGIONS);
  for (const c of lotteryCaves(h, area)) if (c.kind === 'hiroi' && out.length < MAX_LOTTERY) out.push({ cave: c, heya: false });
  let heya = 0;
  for (const shaft of h.shafts(area.x0, area.z0, area.x1, area.z1)) {
    if (shaft.start || heya >= MAX_HEYA) continue;
    const inShaft = h.caves(shaft.box.x0, shaft.box.z0, shaft.box.x1, shaft.box.z1).filter((c) => c.shaft === shaft.id && c.kind === 'hiroi');
    for (const c of inShaft) {
      if (heya >= MAX_HEYA) break;
      out.push({ cave: c, heya: true });
      heya++;
    }
  }
  return out;
}

beforeAll(() => {
  for (const seed of SEEDS_3) {
    const h = hookCave(seed);
    needCaveHook(h, ['caves', 'caveStats', 'caveAt', 'shafts', 'hiroiPlan', 'hiroiTable', 'hiroiTries', 'columnOres', 'caveSpec']);
    hooks.set(seed, h);
    table = h.hiroiTable();
    if (!table.layers) throw new Error('hiroiTable().layers〔層ごとの 高さ・minCeil〕が まだ ない');
    const g = new GenCols(seed);
    grids.set(seed, g);
    const rate = plainRate(h, seed, ['asai', 'nakahodo']);
    const area = areaAround(seed, REGIONS);
    triesBySeed.set(seed, h.hiroiTries(area.x0, area.z0, area.x1, area.z1));
    for (const { cave, heya } of hiroiRooms(h, seed)) {
      const plan = h.hiroiPlan(cave.id);
      if (!plan) {
        rooms.push({ seed, cave, heya, plan: null as never, tries: null, items: { egg: [`hiroiPlan(${cave.id}) が null`], knob: [], bump: [], pillar: [], ore: [], torch: [] } });
        continue;
      }
      const row = triesBySeed.get(seed)!.find((r) => r.cave === cave.id) ?? null;
      rooms.push({ seed, cave, heya, plan, tries: row, items: analyse(seed, g, h, cave, table, plan, row, rate) });
    }
  }
}, 870_000);

const tag = (r: RoomRow): string => `seed ${r.seed} ${r.cave.id}${r.heya ? '〔坑道の へや〕' : '〔抽選〕'}`;
const report = (name: keyof Items): void => {
  for (const r of rooms) expect(r.items[name].slice(0, 3), tag(r)).toEqual([]);
};

describe('D15: ひろい ほらあな B「いしの 木」', () => {
  it('部屋が 集まる〔シード 3 つで 抽選の 部屋と 坑道の へやの りょうほう〕・hiroiTries に 行が ある', () => {
    expect(rooms.length).toBeGreaterThanOrEqual(6);
    expect(rooms.some((r) => !r.heya), '抽選の ひろい ほらあな').toBe(true);
    expect(rooms.some((r) => r.heya), '坑道の へやの ひろい ほらあな').toBe(true);
    for (const r of rooms) {
      expect(r.tries, `${tag(r)} の hiroiTries の 行`).not.toBeNull();
      expect(r.tries?.placed, tag(r)).toBe(true);
      expect(r.tries?.shaft ?? null, tag(r)).toBe(r.cave.shaft);
    }
  });

  it('表: すその 段の 数は skirtMax まで・skirtMax は safeFallHeight より 小さい・1 段ごとに 2 以上 へる・まん中より 太い', () => {
    const pt = table.pillar;
    expect(pt.skirtMax).toBeLessThan(COMBAT_DEFAULTS.safeFallHeight);
    for (const s of [pt.skirt, pt.skirtSmall]) {
      expect(s.length).toBeGreaterThanOrEqual(1);
      expect(s.length).toBeLessThanOrEqual(pt.skirtMax);
      for (let i = 1; i < s.length; i++) expect(s[i - 1]! - s[i]!).toBeGreaterThanOrEqual(2);
      expect(s[s.length - 1]!).toBeGreaterThan(pt.mid);
      for (const w of s) expect(w % 2).toBe(1);
    }
    expect(pt.skirtSmall.length).toBeLessThanOrEqual(pt.skirt.length);
    expect(pt.crown.every((w) => w > pt.mid && w % 2 === 1)).toBe(true);
    expect(pt.smallMin).toBeLessThan(table.pillars[0]);
    expect(table.knobMinSmall).toBeLessThan(table.knobs[0]);
    expect(table.eggs).toBe(2);
  });

  it('① たまご 2 つ・空気の 列は どちらかの たまごの 中・内がわの 天井の 高さの 差・ふかい こぶ', () => report('egg'));
  it('② 天井の こぶ: 数〔小さい 部屋は knobMinSmall から〕・2×2・さがる 量 ≤ はば・下の 空気 4・かんむりと かさならない・つらら 0', () => report('knob'));
  it('③ 床の こぶ: 柱の 根もとの まるを のぞく 床の bumpShare・根もとの まると 出口の 前 4 マスに ない', () => report('bump'));
  it('④ 柱: 本数・表の はば・固い 円・ふとすぎない・すそ〔skirtMax 段・段差 1〕・根もとの わが 1 周', () => report('pillar'));
  it('⑤ 鉱石: 根もと・天井がわに share 以上・床の 下は 鉱石 なし・てつ 10 こ・かべの 2 倍', () => report('ore'));
  it('⑥ たいまつ: 坑道の へやは 2・抽選の 部屋は 0・柱の 根もとに ない', () => report('torch'));

  it('⑦ 同じ シードは 同じ 形: hiroiPlan と 部屋の ブロックの ハッシュ', () => {
    for (const seed of SEEDS_3) {
      const mine = rooms.filter((r) => r.seed === seed);
      const pick = [mine.find((r) => !r.heya), mine.find((r) => r.heya)].filter((r): r is RoomRow => r !== undefined);
      expect(pick.length, `seed ${seed}`).toBeGreaterThan(0);
      const h2 = hookCave(seed);
      const g2 = new GenCols(seed);
      const hash = (g: GenCols, c: Cave): number => {
        let v = 0x811c9dc5;
        for (let x = c.box.x0 - 2; x <= c.box.x1 + 2; x++) for (let z = c.box.z0 - 2; z <= c.box.z1 + 2; z++) for (let y = c.box.y0 - 2; y <= c.box.y1 + 2; y++) v = Math.imul(v ^ g.at(x, y, z), 0x01000193) >>> 0;
        return v;
      };
      for (const r of pick) {
        expect(h2.hiroiPlan(r.cave.id), tag(r)).toEqual(r.plan);
        expect(hash(g2, r.cave), tag(r)).toBe(hash(grids.get(seed)!, r.cave));
      }
    }
    const h = hooks.get(SEEDS_3[0]!)!;
    for (const s of AIM_SEEDS.slice(0, 20)) expect(hookCave(SEEDS_3[0]!).hiroiTry(s), `部屋の 乱数 ${s}`).toEqual(h.hiroiTry(s));
  });

  it('⑧ ためす 回数: hiroiTries の 行 ぜんぶ〔置けなかった 部屋も〕で work の 4 つが 表の 数 以下・置けた 部屋は hiroiPlan の work と 同じ', () => {
    let rows = 0;
    for (const seed of SEEDS_3) {
      const h = hooks.get(seed)!;
      for (const row of triesBySeed.get(seed)!) {
        rows++;
        for (const k of ['pillarCells', 'pillarPacks', 'knobTries', 'layouts', 'tips'] as const) expect(row.work[k], `seed ${seed} ${row.rx},${row.rz} ${k}`).toBeLessThanOrEqual(table.work[k]);
        if (row.placed && row.cave) expect(h.hiroiPlan(row.cave)?.work, `seed ${seed} ${row.cave}`).toEqual(row.work);
        if (!row.placed) expect(row.cave, `seed ${seed} 置けなかった 部屋は cave なし`).toBeNull();
      }
    }
    expect(rows, 'hiroiTries の 行').toBeGreaterThan(0);
  });
});

describe('D15 ⑨: すその 見こみ〔部屋の 乱数 200 こ〕', () => {
  const tries = new Map<string, HiroiTry>();
  beforeAll(() => {
    const h = hookCave(SEEDS_3[0]!);
    needCaveHook(h, ['hiroiTry', 'hiroiTable', 'caveSpec']);
    table = h.hiroiTable();
    if (!table.layers) throw new Error('hiroiTable().layers〔層ごとの 高さ・minCeil〕が まだ ない');
    for (const layer of LAYERS) for (const s of AIM_SEEDS) tries.set(`${layer}:${s}`, h.hiroiTry(s, layer));
  }, 360_000);

  it('大きさは 表の とおり・work は 上の 限り 以下・置けた 計画の work と 同じ', () => {
    const spec = CAVE_SPEC.hiroi;
    for (const [s, t] of tries) {
      expect(t.size.x, `乱数 ${s}`).toBeGreaterThanOrEqual(spec.x[0]);
      expect(t.size.x, `乱数 ${s}`).toBeLessThanOrEqual(spec.x[1]);
      expect(t.size.z, `乱数 ${s}`).toBeGreaterThanOrEqual(spec.z[0]);
      expect(t.size.z, `乱数 ${s}`).toBeLessThanOrEqual(spec.z[1]);
      for (const k of ['pillarCells', 'pillarPacks', 'knobTries', 'layouts', 'tips'] as const) expect(t.work[k], `乱数 ${s} ${k}`).toBeLessThanOrEqual(table.work[k]);
      if (t.plan) expect(t.plan.work, `乱数 ${s}`).toEqual(t.work);
      if (t.plan) {
        const hy = table.layers[s.split(':')[0] as (typeof LAYERS)[number]].height;
        expect(t.plan.size.h, `${s} の 高さ〔層の 表 ${hy.join('〜')}〕`).toBeGreaterThanOrEqual(hy[0]);
        expect(t.plan.size.h, `${s} の 高さ`).toBeLessThanOrEqual(hy[1]);
      }
    }
  });

  it.each(LAYERS)('すそ 1 段の わりあい〔置けた 部屋の 中〕と 置けない わりあいが aim の はんい〔%s〕', (layer) => {
    const all = [...tries].filter(([k]) => k.startsWith(`${layer}:`)).map(([, t]) => t);
    const inRange = (label: string, v: number, r: [number, number]): void => {
      expect(v, `${label} ${v.toFixed(3)}〔${r.join('〜')}〕`).toBeGreaterThanOrEqual(r[0]);
      expect(v, `${label} ${v.toFixed(3)}〔${r.join('〜')}〕`).toBeLessThanOrEqual(r[1]);
    };
    for (const [name, group, aim] of [
      [`${layer} 小さい 部屋`, all.filter((t) => t.small), table.aim.small],
      [`${layer} ほかの 部屋`, all.filter((t) => !t.small), table.aim.large],
    ] as const) {
      expect(group.length, `${name} の 数`).toBeGreaterThan(0);
      const placed = group.filter((t) => t.plan !== null);
      expect(placed.length, `${name} で 置けた 数`).toBeGreaterThan(0);
      const skirt = placed.filter((t) => t.plan!.pillars.length > 0 && t.plan!.pillars[0]!.widths[0] === table.pillar.skirtSmall[0]).length;
      inRange(`${name} の すそ 1 段`, skirt / placed.length, aim.skirtSmall);
      inRange(`${name} の 置けない`, (group.length - placed.length) / group.length, aim.unplaced);
    }
    inRange(`${layer} ぜんぶの 置けない`, all.filter((t) => t.plan === null).length / all.length, table.aim.unplaced);
  });
});
