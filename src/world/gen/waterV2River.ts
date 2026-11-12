import { SEA_Y } from '../../contracts';
import { hash01 } from './random';
import { basinFits, buildBasin, inCircle, pick, rimColumn, waterColumn, type Basin, type Dir, type Edit, type Ground } from './waterV2Kit';
import { WATER_BLOCKS as B, WATER_TUNE as T } from './waterV2Table';

/**
 * 川: 滝つぼから、地面の 高さを ならして（ぼかして）いちばん 下る 向きへ すそまで。はば 2〜3・ふかさ 1〜2。
 * 水面は 区間ごとに 平ら。段差は 「わきどころの 列（へりの 上）→ 落ちる 列の 底に たきつぼ」の 小さな 滝（まっすぐな 所だけ）。
 * 行きどまりに なったら 終わりの 池。川の ぞこは すな・あらいし、岸は あらいし・こけの あらいし・草・花。
 */

const R = T.river;

interface RiverCell {
  x: number;
  z: number;
  /** 入って きた 向き・出ていく 向き（さいごは 同じ） */
  din: Dir;
  dout: Dir;
  /** 水の いちばん 上の マス。sill では わきどころの 高さ（上の 区間の 水面） */
  level: number;
  kind: 'pool' | 'water' | 'sill';
  /** 段差の すぐ 下の 列（底に たきつぼ） */
  afterSill: boolean;
}

interface RiverPlan {
  cells: RiverCell[];
  width: number;
  depth: number;
  /** 終わりの 池（なければ null） */
  mouth: Basin | null;
  /** 止まった わけ: sea = 海に ついた、long = 長さの 上限、stuck = 先が 行けない（行きどまり） */
  stop: 'sea' | 'long' | 'stuck';
}

/** 川の まっすぐ 向きに 直角な 列（はば width。まん中から ずらして ならべる） */
function crossOf(x: number, z: number, dir: Dir, width: number): [number, number][] {
  const px = -dir[1];
  const pz = dir[0];
  const lo = width === 3 ? -1 : 0;
  const out: [number, number][] = [];
  for (let k = lo; k < lo + width; k++) out.push([x + k * px, z + k * pz]);
  return out;
}

/** 川を 作る 前の 計画（ブロックは まだ 書かない）。blocked = ほかの 物・ほかの 川の 列 */
export function planRiver(g: Ground, seed: number, start: { x: number; z: number; d: Dir; pool: Basin }, blocked: (x: number, z: number) => boolean): RiverPlan {
  const width = R.width[0] + Math.floor(hash01(seed, start.x, start.z, 60) * (R.width[1] - R.width[0] + 1));
  const depth = R.depth[0] + Math.floor(hash01(seed, start.x, start.z, 61) * (R.depth[1] - R.depth[0] + 1));
  const pool = start.pool;
  const cells: RiverCell[] = [];
  const seen = new Set<number>();
  const key = (x: number, z: number): number => x * 100003 + z;
  const blur = new Map<number, number>();
  const bh = (x: number, z: number): number => {
    const k = key(x, z);
    let v = blur.get(k);
    if (v === undefined) {
      let sum = 0;
      let n = 0;
      for (let dz = -R.blur; dz <= R.blur; dz++) {
        for (let dx = -R.blur; dx <= R.blur; dx++) {
          const h = g(x + dx, z + dz);
          sum += h < 0 ? g(x, z) + 20 : h; // 置けない 列は 高い あつかい（避ける）
          n++;
        }
      }
      blur.set(k, (v = sum / n));
    }
    return v;
  };
  /** (x, z) から dir の 向きの 列の 地面の 高さ（さいしょう・さいだい）。置けない 列が あれば null */
  const span = (x: number, z: number, dir: Dir): { lo: number; hi: number } | null => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [cx, cz] of crossOf(x, z, dir, width)) {
      const h = g(cx, cz);
      if (h < 0 || blocked(cx, cz) || seen.has(key(cx, cz))) return null;
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    return { lo, hi };
  };
  let x = Math.floor(pool.cx);
  let z = Math.floor(pool.cz);
  let dc = start.d;
  let level = pool.level;
  let leg = 0;
  let stop: RiverPlan['stop'] = 'long';
  let last: RiverCell = { x, z, din: dc, dout: dc, level, kind: 'pool', afterSill: false };
  cells.push(last);
  while (cells.length < R.maxLen) {
    const inPool = inCircle(x, z, pool.cx, pool.cz, pool.r);
    // 池の 中では まっすぐ。外では まず 前、曲がるのは minLeg 進んでから（前に 進めない ときは いつでも）
    const left: Dir = [-dc[1], dc[0]];
    const right: Dir = [dc[1], -dc[0]];
    let best: { dir: Dir; score: number; sill: { lv: number } | null } | null = null;
    for (const dirs of inPool ? [[dc]] : [leg < R.minLeg ? [dc] : [dc, left, right], [dc, left, right]]) {
      for (const dir of dirs) {
        const nx = x + dir[0];
        const nz = z + dir[1];
        if (inCircle(nx, nz, pool.cx, pool.cz, pool.r)) {
          if (g(nx, nz) < 0) continue;
          best = { dir, score: -1e9, sill: null };
          break;
        }
        const sp = span(nx, nz, dir);
        if (sp === null) continue;
        const lv = Math.min(level, sp.lo);
        if (level - lv > R.maxDrop || sp.hi - lv > R.maxCut) continue;
        let sill: { lv: number } | null = null;
        if (lv < level) {
          // 段差は まっすぐな 所だけ。次の 列も 同じ 向きに 進める こと（落ちる 列）
          if (dir !== dc || leg < R.minSillLeg) continue;
          const sp2 = span(nx + dir[0], nz + dir[1], dir);
          if (sp2 === null) continue;
          const lv2 = Math.min(level - 1, sp.lo, sp2.lo);
          if (level - lv2 > R.maxDrop || sp2.hi - lv2 > R.maxCut) continue;
          sill = { lv: lv2 };
        }
        const score = bh(nx, nz) + (dir !== dc ? R.turnCost : 0);
        if (best === null || score < best.score) best = { dir, score, sill };
      }
      if (best !== null) break;
    }
    if (best === null) {
      stop = 'stuck';
      break;
    }
    const { dir } = best;
    if (dir !== dc) {
      last.dout = dir;
      leg = 0;
    }
    dc = dir;
    x += dir[0];
    z += dir[1];
    const inP = inCircle(x, z, pool.cx, pool.cz, pool.r);
    if (inP) {
      last = { x, z, din: dir, dout: dir, level, kind: 'pool', afterSill: false };
      cells.push(last);
      continue;
    }
    for (const [cx, cz] of crossOf(x, z, dir, width)) seen.add(key(cx, cz));
    if (best.sill !== null) {
      last = { x, z, din: dir, dout: dir, level, kind: 'sill', afterSill: false };
      cells.push(last);
      x += dir[0];
      z += dir[1];
      for (const [cx, cz] of crossOf(x, z, dir, width)) seen.add(key(cx, cz));
      level = best.sill.lv;
      last = { x, z, din: dir, dout: dir, level, kind: 'water', afterSill: true };
      cells.push(last);
      leg = 0; // 段差の すぐ あとは 曲がらない
    } else {
      last = { x, z, din: dir, dout: dir, level, kind: 'water', afterSill: false };
      cells.push(last);
      leg++;
    }
    if (g(x, z) <= SEA_Y + 1) {
      stop = 'sea';
      break; // 海に ついた
    }
  }
  // 終わりの 池: さいごの 列の さき（入るなら）
  let mouth: Basin | null = null;
  const water = cells.filter((c) => c.kind !== 'pool');
  const e = water[water.length - 1];
  if (e !== undefined && water.length >= 3) {
    const m = crossOf(e.x, e.z, e.dout, width);
    const mx = m.reduce((s, c) => s + c[0] + 0.5, 0) / m.length;
    const mz = m.reduce((s, c) => s + c[1] + 0.5, 0) / m.length;
    for (const r of R.mouthRadius) {
      const b: Basin = { cx: mx + e.dout[0] * (r - 1), cz: mz + e.dout[1] * (r - 1), r, level: e.level, depth: Math.max(depth, 2) };
      if (basinFits(g, b, R.maxCut, R.mouthFill, (px, pz) => !blocked(px, pz))) {
        mouth = b;
        break;
      }
    }
  }
  return { cells, width, depth, mouth, stop };
}

/** 川を 書く（終わりの 池 → 川の 水 → 岸 の 順。あとから 書いた 方が かつ） */
export function buildRiver(ed: Edit, g: Ground, seed: number, p: RiverPlan, pool: Basin, grassAt: (x: number, z: number) => boolean): void {
  if (p.mouth !== null) buildBasin(ed, g, seed + 11, p.mouth, B.pondRim, false);
  const wet = new Set<number>();
  const key = (x: number, z: number): number => x * 100003 + z;
  const cols: { x: number; z: number; level: number }[] = [];
  // 水の 列（曲がる 角は 出ていく 向きの 列も 足す）
  for (const c of p.cells) {
    if (c.kind === 'pool') continue;
    const list = crossOf(c.x, c.z, c.din, p.width);
    if (c.dout !== c.din) list.push(...crossOf(c.x, c.z, c.dout, p.width));
    for (const [x, z] of list) {
      if (wet.has(key(x, z))) continue;
      wet.add(key(x, z));
      cols.push({ x, z, level: c.level });
      if (c.kind === 'sill') {
        for (let y = g(x, z) + 1; y < c.level; y++) ed.set(x, y, z, B.fill);
        ed.set(x, c.level, z, B.spring);
        for (let y = c.level + 1; y <= Math.max(g(x, z), ed.topOf(x, z)); y++) ed.set(x, y, z, B.air);
      } else {
        waterColumn(ed, seed, x, z, g(x, z), c.level, p.depth);
        if (c.afterSill) ed.set(x, c.level - p.depth, z, B.pit);
      }
    }
  }
  // 池の まん中の まわりの 列も 川の 水と して あつかう（岸を 作らない）
  const isWet = (x: number, z: number): boolean => wet.has(key(x, z)) || inCircle(x, z, pool.cx, pool.cz, pool.r) || (p.mouth !== null && inCircle(x, z, p.mouth.cx, p.mouth.cz, p.mouth.r));
  // 岸: 水の 列の となりで 水で ない 列。水面より 低ければ 水面まで うめて ふちの いし。同じくらいの 高さなら ときどき ふちの いしに（のこりは 草・花）
  for (const c of cols) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = c.x + dx;
      const z = c.z + dz;
      if (isWet(x, z) || ed.get(x, c.level, z) === B.water) continue;
      const h = g(x, z);
      if (h < 0 || h > c.level + 1) continue;
      if (h < c.level || hash01(seed, x, z, 73) < R.rimShare) rimColumn(ed, seed + 5, x, z, h, c.level, B.rim, false);
    }
  }
  // 岸の 草・花（自然の 地面の 草の 上。水に となりあう 列だけ）
  for (const c of cols) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = c.x + dx;
      const z = c.z + dz;
      if (isWet(x, z) || ed.has(x, z) || !grassAt(x, z)) continue;
      const roll = hash01(seed, x, z, 70);
      if (roll >= R.plant) continue;
      const h = g(x, z);
      if (h <= c.level) continue;
      ed.set(x, h + 1, z, hash01(seed, x, z, 71) < R.flower ? pick(seed, B.flowers, x, z, 72) : B.grass);
    }
  }
}
