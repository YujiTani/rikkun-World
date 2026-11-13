import { groundAt, MOUNTAIN_TUNE, rnd, range, site, standingSpot, summitOf, cheb, flatness, type Ctx, type FeatureSite, type PlacedBlock, type Summit } from './countryKit';
import { kaidan } from './countryKaidan';
import { iwayamaStructures, momijiStructures, STRUCTURES_ON, tenguStructures } from './countryStructures';
import { MOUNTAIN_V2, warmMountainPath } from './mountainV2';
import { waterSitesSteps } from './waterV2';
import { runSteps, type Steps } from './waterV2Steps';

/**
 * 山の物（VOX-I-4b #187。docs/design/VOX-I.md §2.3）。国ごとに 1 つの 関数: いわやま = すいしょう、てんぐの やま = とうろう・かいだん、
 * もみじやま = おおもみじ（と まわりの おちば）、ゆきやま = ゆきだるま。場所は (シード, 升目) の 乱数と 地形だけで 決まる。
 */

const M = MOUNTAIN_TUNE;

/** `?water=v2`: 水の 景色（滝・川・池）を 先に 書く（あとから 書く 石段が とび石に なる）。目じるしの 足もとは よける。フラグが なければ そのまま */
function* withWater(c: Ctx, sites: FeatureSite[]): Steps<FeatureSite[]> {
  const w = yield* waterSitesSteps(c, sites);
  return w.length === 0 ? sites : [...w, ...sites];
}

/** 山の 物の 小分けに 進める 形（水の 計画の ところで yield。先に 少しずつ 計算して おく ために 使う。#187）。`iwayama` など 1 回で 返す 形は これを 最後まで 進める だけ */
export type MountainSteps = (c: Ctx) => Steps<FeatureSite[]>;

/** 山の 物を 作る 前に 済ませる 仕事: 山 v2 の 道えらび（頂上の 高さを 聞く 目じるしの 計算で 初めて 走る いちばん 重い 仕事）を 小分けに 先に 済ませる。結果は かわらない */
function* prelude(c: Ctx): Steps<void> {
  if (MOUNTAIN_V2) yield* warmMountainPath(c.T.seed, c.kind, c.px, c.pz);
}

/** すいしょう: 山の点から 40 以内の いしの 上（海から +40 以上）。くぼみ（4 方向の となりの 2 つ 以上が 1 段 以上 高い）を 先に、たりなければ いしの 上で 2 こまで うめる */
export const iwayama = (c: Ctx): FeatureSite[] => runSteps(iwayamaSteps(c));
export function* iwayamaSteps(c: Ctx): Steps<FeatureSite[]> {
  yield* prelude(c);
  const K = M.suisho;
  const out: FeatureSite[] = [];
  const want = range(rnd(c, 'suisho', 999), K.count[0], K.count[1]);
  const hollow = (x: number, z: number, h: number): boolean => {
    let n = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (c.T.height(x + dx, z + dz) >= h + K.hollowDrop) n++;
    return n >= K.hollowSides;
  };
  const tryAt = (k: number, need: number, onlyHollow: boolean): void => {
    const x = c.px + range(rnd(c, 'suisho', 2 * k), -K.reach, K.reach);
    const z = c.pz + range(rnd(c, 'suisho', 2 * k + 1), -K.reach, K.reach);
    if (out.length >= need || out.some((s) => cheb(s.x, s.z, x, z) < K.gap)) return;
    const h = groundAt(c, x, z, 'stone', K.above);
    if (h < 0 || (onlyHollow && !hollow(x, z, h))) return;
    out.push(site(c, 'suisho', x, h + 1, z, [{ x, y: h + 1, z, id: 'suisho' }], [x, z, x, z], { margin: K.treeMargin }));
  };
  for (let k = 0; k < K.tries; k++) tryAt(k, want, true);
  for (let k = 0; k < K.fillTries; k++) tryAt(K.tries + k, K.count[0], false);
  return yield* withWater(c, STRUCTURES_ON ? [...out, ...iwayamaStructures(c)] : out); // 目じるし: 大きな 石ぞう・いしの とりいも
}

/** てんぐの やま: 頂上に とうろう、そばから すそへ かいだん */
export const tengu = (c: Ctx): FeatureSite[] => runSteps(tenguSteps(c));
export function* tenguSteps(c: Ctx): Steps<FeatureSite[]> {
  yield* prelude(c);
  const s = summitOf(c);
  if (s === null) return [];
  if (STRUCTURES_ON) {
    // お堂が 置ける 山は お堂・石段・とりい・石どうろう（とうろう・かいだんの かわり）。置けない 山（頂上が 急）だけ 下の とうろう・かいだん
    const st = tenguStructures(c, s);
    if (st.some((f) => f.type === 'odou')) return yield* withWater(c, st);
  }
  const out: FeatureSite[] = [];
  const t = standingSpot(c, s, 1, M.fallback.touro);
  if (t !== null) out.push(site(c, 'touro', t.x, t.h + 1, t.z, [{ x: t.x, y: t.h + 1, z: t.z, id: 'touro' }], [t.x, t.z, t.x, t.z]));
  out.push(...kaidan(c, s));
  return yield* withWater(c, out);
}

/** 2×2（北西 = x, z）の みきを たてられる 所の 地面の 高さ（4 列とも 置ける・平ら 1 以下）。だめなら null */
function trunkGround(c: Ctx, x: number, z: number): number[] | null {
  const hs = [groundAt(c, x, z, null), groundAt(c, x + 1, z, null), groundAt(c, x, z + 1, null), groundAt(c, x + 1, z + 1, null)];
  return hs.every((h) => h >= 0) && flatness(c.T, x, z, 2) <= M.oomomiji.flat ? hs : null;
}

/** もみじやま: 頂上に おおもみじ（みき 2×2・高さ 10〜12 の もみじの 木）。頂上に たてられなければ、まわり 6 以内を 近い 順に さがす。みきの まわり 3 は おちば */
export const momiji = (c: Ctx): FeatureSite[] => runSteps(momijiSteps(c));
export function* momijiSteps(c: Ctx): Steps<FeatureSite[]> {
  yield* prelude(c);
  const K = M.oomomiji;
  const s = summitOf(c);
  if (s === null) return [];
  let spot: { x: number; z: number; hs: number[] } | null = null;
  for (let d = 0; d <= M.fallback.oomomiji && spot === null; d++) {
    for (let dz = -d; dz <= d && spot === null; dz++) {
      for (let dx = -d; dx <= d && spot === null; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
        const hs = trunkGround(c, s.x + dx, s.z + dz);
        if (hs !== null) spot = { x: s.x + dx, z: s.z + dz, hs };
      }
    }
  }
  if (spot === null) return [];
  const { x, z } = spot;
  const y0 = Math.max(...spot.hs) + 1;
  const trunk = range(rnd(c, 'oomomiji', 0), K.trunk[0], K.trunk[1]);
  const top = y0 + trunk - 1;
  const blocks: PlacedBlock[] = [];
  const cols = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]] as const;
  cols.forEach(([bx, bz], n) => {
    for (let y = spot!.hs[n]! + 1; y <= top; y++) blocks.push({ x: bx, y, z: bz, id: 'log' });
  });
  // おちば: みきの まわり 3 の くさの 地面
  for (let dz = -K.ochiba; dz <= 1 + K.ochiba; dz++) {
    for (let dx = -K.ochiba; dx <= 1 + K.ochiba; dx++) {
      const h = groundAt(c, x + dx, z + dz, 'grass');
      if (h >= 0) blocks.push({ x: x + dx, y: h, z: z + dz, id: 'ochiba' });
    }
  }
  // はっぱ: まるい かたまり（地面の 中・みきの 上は かかない）
  for (const [rel, r] of K.crown) {
    for (let dz = -r; dz <= r + 1; dz++) {
      for (let dx = -r; dx <= r + 1; dx++) {
        const fx = dx - 0.5;
        const fz = dz - 0.5;
        if (fx * fx + fz * fz > (r + 0.4) * (r + 0.4)) continue;
        const bx = x + dx;
        const bz = z + dz;
        const y = top + rel;
        if (y <= c.T.height(bx, bz) || (bx - x >= 0 && bx - x <= 1 && bz - z >= 0 && bz - z <= 1 && y <= top)) continue;
        blocks.push({ x: bx, y, z: bz, id: 'momiji_leaves' });
      }
    }
  }
  const tree = site(c, 'oomomiji', x, y0, z, blocks, [x, z, x + 1, z + 1], { margin: K.treeMargin });
  return yield* withWater(c, STRUCTURES_ON ? [tree, ...momijiStructures(c, s)] : [tree]); // 目じるし: あずまや・とりいも
}

/** ゆきやま: 頂上に ゆきだるま（高さ 3。下から 大きい まる・ふつう・あたま。あたまの 手前に 目の いし 2 こ） */
export const yuki = (c: Ctx): FeatureSite[] => runSteps(yukiSteps(c));
export function* yukiSteps(c: Ctx): Steps<FeatureSite[]> {
  yield* prelude(c);
  const s0 = summitOf(c);
  if (s0 === null) return [];
  const s: Summit | null = standingSpot(c, s0, 3, M.fallback.yukidaruma);
  if (s === null) return [];
  const blocks: PlacedBlock[] = [];
  let y0 = s.h + 1;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) y0 = Math.max(y0, c.T.height(s.x + dx, s.z + dz) + 1);
  const snow = (x: number, y: number, z: number): void => void blocks.push({ x, y, z, id: 'snow' });
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) for (let y = c.T.height(s.x + dx, s.z + dz) + 1; y <= y0; y++) snow(s.x + dx, y, s.z + dz); // ふもとの まる（下の すきまは ゆきで うめる）
  }
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) snow(s.x + dx, y0 + 1, s.z + dz); // おなか（プラス形）
  for (const dx of [-1, 0, 1]) snow(s.x + dx, y0 + 2, s.z); // あたま
  for (const dx of [-1, 1]) blocks.push({ x: s.x + dx, y: y0 + 2, z: s.z - 1, id: 'stone' }); // 目（あたまの 手前 = 北がわ）
  return yield* withWater(c, [site(c, 'yukidaruma', s.x, y0, s.z, blocks, [s.x - 1, s.z - 1, s.x + 1, s.z + 1])]);
}
