import { SEA_Y } from '../../contracts';
import { MOUNTAIN_TUNE, plainAt, rnd, site, type Ctx, type FeatureSite, type PlacedBlock, type Summit } from './countryKit';

/**
 * いしの かいだん（VOX-I-4b #187。docs/design/VOX-I.md §2.3 の kaidan の 行）。てんぐの やまの 頂上（とうろうの そば）から すそまで、はば 2 の 道。
 * 8 方位を シードの 順に ためし、はじめに 通れた 方位を つかう（どれも だめなら かいだんは なし）。
 * 1 歩 = 道に ならんだ 2 マス。床の 高さ y は 1 歩ごとに 1 以下しか かわらず、2 マスの 地面に 合わせて うめる（いし）／けずる。
 */

const K = MOUNTAIN_TUNE.kaidan;

/** 8 方位（dx, dz） */
const DIRS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

interface Step {
  /** 道の 2 マス（A = 道の 中心がわ、B = となり）と 地面の 高さ */
  a: { x: number; z: number; h: number };
  b: { x: number; z: number; h: number };
  /** 床の y */
  y: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** 頂上から (dx, dz) の 方へ のびる 道。通れない（うめる／けずるが 上限を こえる・短すぎる・長すぎる）時は null */
function walk(c: Ctx, sx: number, sz: number, dx: number, dz: number): Step[] | null {
  const T = c.T;
  const steps: Step[] = [];
  let y = 0;
  for (let k = 0; k <= K.maxSteps; k++) {
    const ax = sx + k * dx;
    const az = sz + k * dz;
    // 2 マス めは 道の よこ（東西 = 南へ、南北 = 東へ、ななめ = 進む 向きの 東西がわ）
    const bx = dx === 0 ? ax + 1 : dz === 0 ? ax : ax + dx;
    const bz = dx === 0 ? az : dz === 0 ? az + 1 : az;
    const ha = T.height(ax, az);
    const hb = T.height(bx, bz);
    y = k === 0 ? Math.max(ha, hb) : clamp(Math.max(ha, hb), y - K.stepMax, y + K.stepMax);
    if (Math.abs(y - ha) > K.cutFill || Math.abs(y - hb) > K.cutFill) return null;
    if (!plainAt(c, ax, az) || !plainAt(c, bx, bz)) return null; // いけ・洞くつの 口・岩山の 上は とおらない
    steps.push({ a: { x: ax, z: az, h: ha }, b: { x: bx, z: bz, h: hb }, y });
    // すそ = 山の 形が ふつうの 高さより ひくく なった 所（か 海に ついた 所）
    const shape = T.map.mountainShape(ax, az);
    if (shape === null || shape.m <= T.map.baseHeight(ax, az) || Math.min(ha, hb) < SEA_Y + K.shore) return steps.length >= K.minSteps ? steps : null;
  }
  return null;
}

/** かいだん（頂上 s の そばから はじめる）。道が 通る 方位が なければ [] */
export function kaidan(c: Ctx, s: Summit): FeatureSite[] {
  const order = DIRS.map((d, n) => ({ d, r: rnd(c, 'kaidan', n) })).sort((p, q) => p.r - q.r);
  for (const { d: [dx, dz] } of order) {
    const steps = walk(c, s.x + K.startGap * dx, s.z + K.startGap * dz, dx, dz);
    if (steps === null) continue;
    const blocks: PlacedBlock[] = [];
    const path: { x: number; y: number; z: number }[] = [];
    const rects: [number, number, number, number][] = [];
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const st of steps) {
      for (const p of [st.a, st.b]) {
        blocks.push({ x: p.x, y: st.y, z: p.z, id: 'stone' });
        for (let y = p.h + 1; y < st.y; y++) blocks.push({ x: p.x, y, z: p.z, id: 'stone' }); // 地面より 高い 所は 下まで いしで うめる
        for (let y = st.y + 1; y <= p.h; y++) blocks.push({ x: p.x, y, z: p.z, id: 'air' }); // 地面より ひくい 所は 上を けずる
        path.push({ x: p.x, y: st.y, z: p.z });
      }
      const r: [number, number, number, number] = [Math.min(st.a.x, st.b.x), Math.min(st.a.z, st.b.z), Math.max(st.a.x, st.b.x), Math.max(st.a.z, st.b.z)];
      rects.push(r);
      x0 = Math.min(x0, r[0]);
      z0 = Math.min(z0, r[1]);
      x1 = Math.max(x1, r[2]);
      z1 = Math.max(z1, r[3]);
    }
    const first = steps[0]!;
    return [site(c, 'kaidan', first.a.x, first.y + 1, first.a.z, blocks, [x0, z0, x1, z1], { rects, path })];
  }
  return [];
}
