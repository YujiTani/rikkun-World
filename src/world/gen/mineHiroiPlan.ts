import { createRng, randInt, shuffle, type Rng } from './random';
import { hiroiRanges, inDisc, knobDropAt, smoothTips, type HiroiKnob, type HiroiPillar } from './mineHiroiRanges';
import { HIROI_SHAPE, HIROI_SIZE, hiroiTable, type HiroiWork } from './mineHiroiTable';

/**
 * 炭鉱 1D ひろい ほらあな B「いしの 木」の 計画（docs/design/MINE-1.md §4.7.2 の B の きまり・§6.1 `hiroiPlan`）。
 * 純粋な 関数。同じ シードは 同じ 形。座標は 部屋の 中の マス（x・z は 0 から、高さは 段）。
 * 部屋は 出口（+z がわの 南の かべ）から 入る。ゲームの 世界に ほる のは `mineHiroiCarve.ts`。
 */


export interface HiroiEgg {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
}
export interface HiroiPlan {
  size: { x: number; z: number; h: number };
  eggs: HiroiEgg[];
  pillars: HiroiPillar[];
  knobs: HiroiKnob[];
  /** 1 段 たかい 床の マス */
  bumps: { x: number; z: number }[];
  /** たまごだけで きまる 天井の 高さ（床から。段）。部屋の 外は 0。index ＝ z * size.x + x */
  ceil: Int8Array;
  /** 出口: 中心の x と、出口の 列が 部屋の 中で 終わる z。横穴は z + 1 から 外へ */
  exit: { xc: number; z: number };
  /** 柱の すそが skirtSmall の 柱が あるか */
  hasSmallSkirt: boolean;
  /** 小さい 部屋か（まるめた 本数が pillars の 下の 限り 以下。柱の 下の 限りは smallMin） */
  small: boolean;
  /** この 計画で ためした 回数 */
  work: HiroiWork;
  /** 列ごとの 空気の 下（柱の すそ・床の こぶで 上がる）と 上（こぶ・柱の かんむり・とがりを ならした あと）の 段。lo ＜ hi の 列だけ 空気。index ＝ z * size.x + x */
  lo: Int8Array;
  hi: Int8Array;
}

/** 出口の 前 4 マス（出口の 両がわの たいまつの 列も ふくむ）の マスか */
function inExitFront(plan: Pick<HiroiPlan, 'exit'>, x: number, z: number): boolean {
  return Math.abs(x - plan.exit.xc) <= 2 && z > plan.exit.z - HIROI_SHAPE.exitFront && z <= plan.exit.z + 1;
}

function makeEggs(rng: Rng, sx: number, sz: number): HiroiEgg[] {
  const j = (v: number): number => (rng() - 0.5) * v;
  const eggs: HiroiEgg[] = [
    { cx: sx * (0.42 + j(0.05)), cz: sz * (0.41 + j(0.05)), rx: sx * (0.375 + j(0.03)), rz: sz * (0.36 + j(0.03)) },
    { cx: sx * (0.56 + j(0.05)), cz: sz * (0.53 + j(0.05)), rx: sx * (0.345 + j(0.03)), rz: sz * (0.33 + j(0.03)) },
  ];
  if (rng() < 0.5) for (const e of eggs) e.cx = sx - e.cx; // 左右を ひっくりかえす
  return eggs;
}

function makeCeil(eggs: HiroiEgg[], sx: number, sz: number, h: number): Int8Array {
  const ceil = new Int8Array(sx * sz);
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      let best = 0;
      for (const e of eggs) {
        const inside = 1 - ((x + 0.5 - e.cx) / e.rx) ** 2 - ((z + 0.5 - e.cz) / e.rz) ** 2;
        if (inside <= 0) continue;
        best = Math.max(best, Math.round(h * (0.42 + 0.58 * Math.min(1, inside * 1.7) ** 0.6)));
      }
      ceil[z * sx + x] = best >= HIROI_SHAPE.edgeCeil ? best : 0;
    }
  }
  return ceil;
}

/** 出口: 南の かべの まん中ちかく。出口の 両がわ（x ± 2）まで 部屋が ある いちばん 北寄りの z を 使う */
function makeExit(ceil: Int8Array, sx: number, sz: number): { xc: number; z: number } | null {
  const zmax = (x: number): number => {
    for (let z = sz - 1; z >= 0; z--) if (ceil[z * sx + x]! > 0) return z;
    return -1;
  };
  let best: { xc: number; z: number } | null = null;
  for (let xc = Math.round(sx * 0.3); xc <= Math.round(sx * 0.7); xc++) {
    let z = sz;
    for (let x = xc - 2; x <= xc + 2; x++) z = Math.min(z, zmax(x));
    if (z >= HIROI_SHAPE.exitFront + 4 && (!best || z > best.z || (z === best.z && Math.abs(xc - sx / 2) < Math.abs(best.xc - sx / 2)))) best = { xc, z };
  }
  return best;
}

/** 円・わの ずれの 表（はば ごとに 1 回 作って つかい まわす）。わ ＝ 円の すぐ 外で、円の マスと ななめも ふくむ 8 方向で となる マス */
const OFFSETS = new Map<number, { disc: [number, number][]; ring: [number, number][] }>();
function offsets(w: number): { disc: [number, number][]; ring: [number, number][] } {
  let o = OFFSETS.get(w);
  if (o) return o;
  o = { disc: [], ring: [] };
  const r = Math.ceil(w / 2) + 1;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (inDisc(dx, dz, 0, 0, w)) o.disc.push([dx, dz]);
      else if ([-1, 0, 1].some((a) => [-1, 0, 1].some((b) => (a || b) && inDisc(dx + a, dz + b, 0, 0, w)))) o.ring.push([dx, dz]);
    }
  }
  OFFSETS.set(w, o);
  return o;
}

/** 円の マスの キー（z * sx + x。部屋の 外は -1） */
function cellKeys(list: [number, number][], px: number, pz: number, sx: number, sz: number): number[] {
  return list.map(([dx, dz]) => {
    const x = px + dx;
    const z = pz + dz;
    return x < 0 || z < 0 || x >= sx || z >= sz ? -1 : z * sx + x;
  });
}
const discKeys = (px: number, pz: number, w: number, sx: number, sz: number): number[] => cellKeys(offsets(w).disc, px, pz, sx, sz);
const ringKeys = (px: number, pz: number, w: number, sx: number, sz: number): number[] => cellKeys(offsets(w).ring, px, pz, sx, sz);

function pillarWidths(ceil: number, skirt: readonly number[]): number[] {
  const { mid, crown } = hiroiTable().pillar;
  const w: number[] = [];
  for (let k = 0; k < ceil; k++) {
    if (k < skirt.length) w.push(skirt[k]!);
    else if (k >= ceil - crown.length) w.push(crown[k - (ceil - crown.length)]!);
    else w.push(mid);
  }
  return w;
}

type Head = Pick<HiroiPlan, 'size' | 'ceil' | 'exit'>;
interface Spot {
  x: number;
  z: number;
  disc: number[];
  ring: number[];
}

/** ためす 回数の 見はり。上の 限りに とどいたら hit（その 部屋は 置けない） */
interface Budget {
  work: HiroiWork;
  hit: boolean;
}
function spend(b: Budget, key: keyof HiroiWork, n: number): boolean {
  const cap = hiroiTable().work[key];
  if (b.work[key] + n >= cap) {
    b.work[key] = cap;
    b.hit = true;
    return false;
  }
  b.work[key] += n;
  return true;
}

/** 柱の 中心に できる マス（天井が minCeil 以上・円と わが ぜんぶ 部屋・出口の 前に かからない・深い こぶの かんむりと かさならない） */
function pillarSpots(plan: Head, deep: HiroiKnob, w0: number): { spots: Spot[]; cells: number } {
  const { x: sx, z: sz } = plan.size;
  const out: Spot[] = [];
  let cells = 0;
  for (let pz = 3; pz < sz - 3; pz++) {
    for (let px = 3; px < sx - 3; px++) {
      if (plan.ceil[pz * sx + px]! < hiroiTable().pillar.minCeil) continue;
      cells++;
      if (Math.hypot(deep.x - 0.5 - px, deep.z - 0.5 - pz) < deep.r + HIROI_SHAPE.crownHalf) continue; // かんむりが 深い こぶに かからない
      const disc = discKeys(px, pz, w0, sx, sz);
      const ring = ringKeys(px, pz, w0, sx, sz);
      if ([...disc, ...ring].some((k) => k < 0 || plan.ceil[k]! === 0 || inExitFront(plan, k % sx, Math.floor(k / sx)))) continue;
      out.push({ x: px, z: pz, disc, ring });
    }
  }
  return { spots: out, cells };
}

/** 柱 n 本を ならべる（ならべ方を pillar.tries 回 まで ためす）。円は ほかの 柱の 円・わと かさならない */
function tryPillars(plan: Head, b: Budget, spots: Spot[], rng: Rng, n: number, skirt: readonly number[]): HiroiPillar[] | null {
  const { x: sx, z: sz } = plan.size;
  for (let attempt = 0; attempt < hiroiTable().pillar.tries; attempt++) {
    if (!spend(b, 'pillarPacks', 1)) return null;
    const grid = new Uint8Array(sx * sz); // 1 ＝ 柱の 円・2 ＝ わ
    const out: HiroiPillar[] = [];
    for (const s of shuffle(rng, spots.slice())) {
      if (s.disc.some((k) => grid[k]) || s.ring.some((k) => grid[k] === 1)) continue;
      for (const k of s.ring) if (!grid[k]) grid[k] = 2;
      for (const k of s.disc) grid[k] = 1;
      const ceil = plan.ceil[s.z * sx + s.x]!;
      out.push({ x: s.x, z: s.z, ceil, widths: pillarWidths(ceil, skirt) });
      if (out.length === n) return out;
    }
  }
  return null;
}

/** 置けない ときの 順: ならべを ためす → すそ 7・5 の まま 本数を へらす（下の 限り まで）→ すそ 1 段で はじめの 本数から 下の 限り まで → なし */
function placePillars(plan: Head, b: Budget, deep: HiroiKnob, rng: Rng, want: number, low: number, cache: Map<number, { spots: Spot[]; cells: number }>): { pillars: HiroiPillar[]; small: boolean } | null {
  const T = hiroiTable().pillar;
  for (const [skirt, isSmall] of [[T.skirt, false], [T.skirtSmall, true]] as const) {
    const w0 = skirt[0]!;
    let found = cache.get(w0); // 候補は 部屋で 1 回 しらべれば よい（数は やりなおし ごとに 数える）
    if (!found) {
      found = pillarSpots(plan, deep, w0);
      cache.set(w0, found);
    }
    if (!spend(b, 'pillarCells', found.cells)) return null;
    const spots = found.spots;
    for (let n = want; n >= low; n--) {
      const pillars = tryPillars(plan, b, spots, rng, n, skirt);
      if (pillars) return { pillars, small: isSmall };
      if (b.hit) return null;
    }
  }
  return null;
}

/** こぶ k を 置いて よいか。さがる 所の 天井が 足から 上 4 マス 以上・出口の 前に かからない・内がわ（inner）・柱の かんむり・ほかの こぶと かさならない */
function knobFits(plan: Head, pillars: HiroiPillar[], knobs: HiroiKnob[], k: HiroiKnob, inner: boolean): boolean {
  const { x: sx, z: sz } = plan.size;
  const T = hiroiTable();
  const R = Math.ceil(k.r) + 1;
  for (let z = Math.floor(k.z) - R; z <= Math.floor(k.z) + R; z++) {
    for (let x = Math.floor(k.x) - R; x <= Math.floor(k.x) + R; x++) {
      const d = knobDropAt(k, x, z);
      if (d === 0) continue;
      if (x < 0 || z < 0 || x >= sx || z >= sz) return false;
      if (plan.ceil[z * sx + x]! - d < HIROI_SHAPE.knobAirMin) return false; // 足から 上 4 マス 以上（床の こぶの 所は あとで 見る）
      if (inExitFront(plan, x, z)) return false;
    }
  }
  if (inner) {
    // 内がわの まどは 北西の かどの マスを 中心に した 7×7。向きを まわしても 内がわに なる ように 9×9 を 見る
    for (let dz = -4; dz <= 4; dz++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = Math.floor(k.x) + dx;
        const z = Math.floor(k.z) + dz;
        if (x < 0 || z < 0 || x >= sx || z >= sz || plan.ceil[z * sx + x]! === 0) return false;
      }
    }
  }
  const crownW = T.pillar.crown[T.pillar.crown.length - 1]!;
  for (const p of pillars) if (Math.hypot(k.x - 0.5 - p.x, k.z - 0.5 - p.z) < k.r + crownW / 2) return false;
  for (const o of knobs) if (Math.hypot(k.x - o.x, k.z - o.z) < k.r + o.r + 1) return false;
  return true;
}

function randomKnob(rng: Rng, sx: number, sz: number, deep: boolean): HiroiKnob {
  const S = HIROI_SHAPE;
  const [lo, hi] = deep ? S.knobDeepRadius : S.knobRadius;
  const r = Math.round((lo + rng() * (hi - lo)) * 10) / 10;
  const drop = deep ? hiroiTable().knobDeepMin : randInt(rng, S.knobDrop[0], Math.min(S.knobDrop[1], Math.floor(r * 2)));
  return { x: randInt(rng, 3, sx - 3), z: randInt(rng, 3, sz - 3), r, drop };
}

/** 内がわに さがる 量・はば とも knobDeepMin の こぶを 1 つ（天井の 差 ceilSpread を かならず 作る）。柱より 先に 置く */
function placeDeepKnob(plan: Head, b: Budget, rng: Rng): HiroiKnob | null {
  for (;;) {
    if (!spend(b, 'knobTries', 1)) return null;
    const k = randomKnob(rng, plan.size.x, plan.size.z, true);
    if (knobFits(plan, [], [], k, true)) return k;
  }
}

/** のこりの こぶ（柱を 置いた あと）。場所は 部屋の 中で 柱の かんむりに かからない 所から えらぶ。つづけて 置けない 回数が knobGiveUp に なったら 打ちきる。下の 数に とどかないまま 回数が つきたら null */
function placeKnobs(plan: Head, b: Budget, pillars: HiroiPillar[], first: HiroiKnob, rng: Rng, minK: number): HiroiKnob[] | null {
  const T = hiroiTable();
  const { x: sx, z: sz } = plan.size;
  const S = HIROI_SHAPE;
  const crownW = T.pillar.crown[T.pillar.crown.length - 1]!;
  const spots: [number, number][] = [];
  for (let z = 3; z < sz - 2; z++) {
    for (let x = 3; x < sx - 2; x++) {
      if (plan.ceil[Math.min(z, sz - 1) * sx + Math.min(x, sx - 1)]! === 0) continue;
      if (pillars.some((p) => Math.hypot(x - 0.5 - p.x, z - 0.5 - p.z) < S.knobRadius[0] + crownW / 2)) continue;
      spots.push([x, z]);
    }
  }
  const knobs = [first];
  const n = randInt(rng, T.knobs[0], T.knobs[1]);
  let fails = 0;
  while (knobs.length < n && spots.length > 0 && fails < S.knobGiveUp) {
    if (!spend(b, 'knobTries', 1)) break;
    const [x, z] = spots[Math.floor(rng() * spots.length)]!;
    const k = randomKnob(rng, sx, sz, false);
    k.x = x;
    k.z = z;
    if (knobFits(plan, pillars, knobs, k, false)) {
      knobs.push(k);
      fails = 0;
    } else fails++;
  }
  b.hit = b.hit && knobs.length < minK; // 数が そろって いれば 回数が つきても 置けた
  return knobs.length >= minK ? knobs : null;
}

function placeBumps(plan: Omit<HiroiPlan, 'bumps' | 'lo' | 'hi'>, rng: Rng): { x: number; z: number }[] {
  const { x: sx, z: sz } = plan.size;
  const T = hiroiTable();
  const base = new Set<number>();
  for (const p of plan.pillars) for (const k of discKeys(p.x, p.z, p.widths[0]!, sx, sz)) base.add(k);
  const drop = (x: number, z: number): number => plan.knobs.reduce((m, k) => Math.max(m, knobDropAt(k, x, z)), 0);
  let floorCells = 0;
  for (const c of plan.ceil) if (c > 0) floorCells++;
  let share = T.bumpShare[0] + rng() * 0.08 + 0.03;
  let out: { x: number; z: number }[] = [];
  for (let pass = 0; pass < 6; pass++) {
    out = [];
    for (let bz = 0; bz < sz; bz += 2) {
      for (let bx = 0; bx < sx; bx += 2) {
        if (rng() >= share) continue;
        for (let z = bz; z < bz + 2; z++) {
          for (let x = bx; x < bx + 2; x++) {
            if (x >= sx || z >= sz) continue;
            const c = plan.ceil[z * sx + x]!;
            if (c === 0 || base.has(z * sx + x) || inExitFront(plan, x, z)) continue;
            if (c - drop(x, z) - 1 < HIROI_SHAPE.knobAirMin + 1) continue; // 足から 上 4 マス 以上
            out.push({ x, z });
          }
        }
      }
    }
    if (out.length >= floorCells * T.bumpShare[0] * 1.3) break; // 下の 限りに とどかない ときは わりあいを ふやして やりなおす
    share *= 1.6;
  }
  return out;
}

export interface HiroiTry {
  /** 計画の 箱の 大きさ（部屋の 中の 向き。出口は +z） */
  size: { x: number; z: number; h: number };
  plan: HiroiPlan | null;
  small: boolean;
  work: HiroiWork;
  /** 置けなかった わけ（置けた ときは null）。exit ＝ 出口 / deep ＝ 深い こぶ / pillars ＝ 柱 / knobs ＝ こぶ */
  why: 'exit' | 'deep' | 'pillars' | 'knobs' | 'tips' | null;
}

/** 計画を 作って、ためした 回数も 返す。置けない とき plan は null（抽選の 部屋は 抽選なし・坑道の へやは はずれ。§4.7.1・§4.7.5） */
export function tryHiroiPlan(seed: number, size?: { x: number; z: number; h: number }): HiroiTry {
  const rng = createRng((seed ^ 0x1d0b5e) >>> 0);
  const sz3 = size ?? { x: randInt(rng, ...HIROI_SIZE.x), z: randInt(rng, ...HIROI_SIZE.z), h: randInt(rng, ...HIROI_SIZE.h) };
  const eggs = makeEggs(rng, sz3.x, sz3.z);
  const ceil = makeCeil(eggs, sz3.x, sz3.z, sz3.h);
  const T = hiroiTable();
  let floorCells = 0;
  for (const c of ceil) if (c > 0) floorCells++;
  const rounded = Math.round(floorCells / T.floorPerPillar);
  const small = rounded <= T.pillars[0];
  const want = Math.max(T.pillars[0], Math.min(T.pillars[1], rounded));
  const low = small ? T.pillar.smallMin : T.pillars[0];
  const b: Budget = { work: { pillarCells: 0, pillarPacks: 0, knobTries: 0, layouts: 0, tips: 0 }, hit: false };
  const fail = (why: NonNullable<HiroiTry['why']>): HiroiTry => ({ size: sz3, plan: null, small, work: b.work, why });
  const exit = makeExit(ceil, sz3.x, sz3.z);
  if (!exit) return fail('exit');
  const head = { size: sz3, eggs, ceil, exit };
  const deep = placeDeepKnob(head, b, rng);
  if (!deep) return fail('deep');
  const cache = new Map<number, { spots: Spot[]; cells: number }>();
  for (let layout = 0; layout < T.work.layouts; layout++) {
    b.work.layouts++;
    const pl = placePillars(head, b, deep, rng, want, low, cache);
    if (!pl) return fail('pillars');
    const knobs = placeKnobs(head, b, pl.pillars, deep, rng, small ? T.knobMinSmall : T.knobs[0]);
    if (!knobs) {
      if (b.hit) return fail('knobs');
      continue; // こぶが 置けない ならべ方は やりなおす
    }
    const base = { ...head, pillars: pl.pillars, hasSmallSkirt: pl.small, small, work: b.work, knobs };
    const bumps = placeBumps(base, rng);
    const { lo, hi } = hiroiRanges(base, bumps);
    if (!smoothTips(sz3.x, sz3.z, lo, hi, pl.pillars, (n) => spend(b, 'tips', n))) return fail('tips');
    return { size: sz3, plan: { ...base, bumps, lo, hi }, small, work: b.work, why: null };
  }
  return fail('knobs');
}
