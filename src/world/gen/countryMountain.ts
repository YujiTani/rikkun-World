import { groundAt, MOUNTAIN_TUNE, rnd, range, site, standingSpot, summitOf, cheb, flatness, type Ctx, type FeatureSite, type PlacedBlock, type Summit } from './countryKit';
import { kaidan } from './countryKaidan';
import { momijiStructures, STRUCTURES_ON, tenguStructures } from './countryStructures';

/**
 * 山の物（VOX-I-4b #187。docs/design/VOX-I.md §2.3）。国ごとに 1 つの 関数: いわやま = すいしょう、てんぐの やま = とうろう・かいだん、
 * もみじやま = おおもみじ（と まわりの おちば）、ゆきやま = ゆきだるま。場所は (シード, 升目) の 乱数と 地形だけで 決まる。
 */

const M = MOUNTAIN_TUNE;

/** すいしょう: 山の点から 40 以内の いしの 上（海から +40 以上）。くぼみ（4 方向の となりの 2 つ 以上が 1 段 以上 高い）を 先に、たりなければ いしの 上で 2 こまで うめる */
export function iwayama(c: Ctx): FeatureSite[] {
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
  return out;
}

/** てんぐの やま: 頂上に とうろう、そばから すそへ かいだん */
export function tengu(c: Ctx): FeatureSite[] {
  const s = summitOf(c);
  if (s === null) return [];
  if (STRUCTURES_ON) return tenguStructures(c, s); // ?structures=1: お堂・石段・とりい（とうろう・かいだんの かわり）
  const out: FeatureSite[] = [];
  const t = standingSpot(c, s, 1, M.fallback.touro);
  if (t !== null) out.push(site(c, 'touro', t.x, t.h + 1, t.z, [{ x: t.x, y: t.h + 1, z: t.z, id: 'touro' }], [t.x, t.z, t.x, t.z]));
  out.push(...kaidan(c, s));
  return out;
}

/** 2×2（北西 = x, z）の みきを たてられる 所の 地面の 高さ（4 列とも 置ける・平ら 1 以下）。だめなら null */
function trunkGround(c: Ctx, x: number, z: number): number[] | null {
  const hs = [groundAt(c, x, z, null), groundAt(c, x + 1, z, null), groundAt(c, x, z + 1, null), groundAt(c, x + 1, z + 1, null)];
  return hs.every((h) => h >= 0) && flatness(c.T, x, z, 2) <= M.oomomiji.flat ? hs : null;
}

/** もみじやま: 頂上に おおもみじ（みき 2×2・高さ 10〜12 の もみじの 木）。頂上に たてられなければ、まわり 6 以内を 近い 順に さがす。みきの まわり 3 は おちば */
export function momiji(c: Ctx): FeatureSite[] {
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
  return STRUCTURES_ON ? [tree, ...momijiStructures(c, s)] : [tree]; // ?structures=1: あずまや・とりいも
}

/** ゆきやま: 頂上に ゆきだるま（高さ 3。下から 大きい まる・ふつう・あたま。あたまの 手前に 目の いし 2 こ） */
export function yuki(c: Ctx): FeatureSite[] {
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
  return [site(c, 'yukidaruma', s.x, y0, s.z, blocks, [s.x - 1, s.z - 1, s.x + 1, s.z + 1])];
}
