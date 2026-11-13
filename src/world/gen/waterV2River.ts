import { SEA_Y } from '../../contracts';
import { hash01 } from './random';
import type { FlowField } from './waterV2Flow';
import { basinFits, basinNorm, buildBasin, DIR4, makeBasin, pick, rimColumn, waterColumn, Edit, type Basin, type Dir, type Ground } from './waterV2Kit';
import { WATER_BLOCKS as B, WATER_TUNE as T } from './waterV2Table';

/**
 * 川: 滝つぼから、地面の 高さを ならして（ぼかして）いちばん 下る 向きへ すその 平地・海まで。ゆるく 曲がり、下流ほど はばが 広い（2 → 5）。
 * 水面は 区間ごとに 平ら。段差は 「わきどころの 列（へりの 上）→ 落ちる 列の 底に たきつぼ」の 小さな 滝（まっすぐな 所だけ）。
 * 終わりは 海、または すその 大きな 池（直径 13〜21）。川の ぞこは すな・あらいし、岸は わくに せず すな・草・花・ところどころ 岩。
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
  /** この 列の はば */
  width: number;
}

interface RiverPlan {
  cells: RiverCell[];
  depth: number;
  /** 終わりの 池（なければ null） */
  mouth: Basin | null;
  /** 止まった わけ: sea = 海、foot = すその 平地、long = 長さの 上限、stuck = 先が 行けない */
  stop: 'sea' | 'foot' | 'long' | 'stuck';
}

/** 川の まっすぐ 向きに 直角な 列（はば width。まん中から ずらして ならべる） */
function crossOf(x: number, z: number, dir: Dir, width: number): [number, number][] {
  const px = -dir[1];
  const pz = dir[0];
  const lo = -Math.floor((width - 1) / 2);
  const out: [number, number][] = [];
  for (let k = lo; k < lo + width; k++) out.push([x + k * px, z + k * pz]);
  return out;
}

/** 川の はば（水の 列を いくつ すすんだか から。下流ほど 広い） */
const widthAt = (n: number): number => Math.min(R.maxWidth, R.width + Math.floor(n / R.widen));

/** 川を 作る 前の 計画（ブロックは まだ 書かない）。blocked = ほかの 物・ほかの 川の 列、atFoot = 山の すその 平地か */
export function planRiver(g: Ground, seed: number, start: { x: number; z: number; d: Dir; pool: Basin }, blocked: (x: number, z: number) => boolean, atFoot: (x: number, z: number) => boolean, field: FlowField): RiverPlan {
  const depth = R.depth[0] + Math.floor(hash01(seed, start.x, start.z, 61) * (R.depth[1] - R.depth[0] + 1));
  const pool = start.pool;
  const inPool = (x: number, z: number): boolean => basinNorm(pool, x, z) <= 1;
  const cells: RiverCell[] = [];
  const seen = new Set<number>();
  // 少し 前までの 川の 列は 「いま」、それより 古い 列の となりへは 近づかない（折りかえして 水面が ちがう 川が となりあうと 水が ぬける）
  const recent: number[][] = [];
  const old = new Set<number>();
  const mark = (cells: [number, number][]): void => {
    const ks = cells.map(([a, b]) => a * 100003 + b);
    for (const k of ks) seen.add(k);
    recent.push(ks);
    if (recent.length > R.recentSteps) for (const k of recent.shift()!) old.add(k);
  };
  const key = (x: number, z: number): number => x * 100003 + z;
  const bh = field; // 川の みちしるべ（小さい 方へ すすむ。waterV2Flow）
  /** (x, z) から dir の 向きの 列の 地面の 高さ（さいしょう・さいだい）。置けない 列が あれば null */
  const span = (x: number, z: number, dir: Dir, w: number): { lo: number; hi: number } | null => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [cx, cz] of crossOf(x, z, dir, w)) {
      const h = g(cx, cz);
      if (h < 0 || blocked(cx, cz) || seen.has(key(cx, cz))) return null;
      if (old.has(key(cx + 1, cz)) || old.has(key(cx - 1, cz)) || old.has(key(cx, cz + 1)) || old.has(key(cx, cz - 1))) return null;
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    return { lo, hi };
  };
  /** 出る 向き: 滝の 向きを ふつうに、くぼ地で 行けない/高い とき は 池の ふちを こえた 先が いちばん 低い 向き */
  function exitDir(prefer: Dir): Dir {
    let best = prefer;
    let bestScore = Infinity;
    for (const d of DIR4) {
      if (d[0] === -prefer[0] && d[1] === -prefer[1]) continue; // かべの ほう（水源の 池・わきどころ）へは 行かない
      let ex = Math.floor(pool.cx);
      let ez = Math.floor(pool.cz);
      let n = 0;
      while (inPool(ex, ez) && n++ < 30) {
        ex += d[0];
        ez += d[1];
      }
      const fx = ex + d[0] * 3;
      const fz = ez + d[1] * 3;
      if (g(ex, ez) < 0 || g(fx, fz) < 0 || blocked(ex, ez) || !Number.isFinite(bh(fx, fz))) continue;
      const score = bh(fx, fz) + Math.max(0, g(ex, ez) - pool.level) * 2 + Math.max(0, pool.level - g(ex, ez)) * 4 - (d === prefer ? 2 : 0); // 出口は 水面と 同じ くらいの 高さ（すぐ 下がる 所は さける）
      if (score < bestScore) {
        bestScore = score;
        best = d;
      }
    }
    return best;
  }
  let x = Math.floor(pool.cx);
  let z = Math.floor(pool.cz);
  let dc = exitDir(start.d);
  let level = pool.level;
  let leg = 0;
  let wet = 0; // 水の 列の 数
  let stop: RiverPlan['stop'] = 'long';
  let last: RiverCell = { x, z, din: dc, dout: dc, level, kind: 'pool', afterSill: false, width: 0 };
  cells.push(last);
  let desperate = false; // 行き先が ないとき、1 回だけ 深く ほる ことを ゆるす
  while (cells.length < R.maxLen) {
    const here = inPool(x, z);
    const w = widthAt(wet);
    // 池の 中では まっすぐ。外では まず 前、曲がるのは minLeg 進んでから（前に 進めない ときは いつでも）
    const left: Dir = [-dc[1], dc[0]];
    const right: Dir = [dc[1], -dc[0]];
    let best: { dir: Dir; score: number; sill: { lv: number } | null } | null = null;
    for (const dirs of here ? [[dc]] : [leg < R.minLeg ? [dc] : [dc, left, right], [dc, left, right]]) {
      for (const dir of dirs) {
        const nx = x + dir[0];
        const nz = z + dir[1];
        if (inPool(nx, nz)) {
          if (g(nx, nz) < 0) continue;
          best = { dir, score: -1e9, sill: null };
          break;
        }
        const sp = span(nx, nz, dir, w);
        if (sp === null || !Number.isFinite(bh(nx, nz))) continue;
        // 池の すぐ 外が 少し 低いだけなら、水面を 池と 同じに して 土手で ささえる（出口の 段差を 作らない）
        const lv = wet === 0 && sp.lo < level && level - sp.lo <= R.exitHold ? level : Math.min(level, sp.lo);
        const cutMax = wet < R.exitSteps || desperate ? R.exitCut : R.maxCut; // 滝つぼの くぼ地から 出る ところは 深く ほる
        if (level - lv > R.maxDrop || sp.hi - lv > cutMax) continue;
        let sill: { lv: number } | null = null;
        if (lv < level) {
          // 段差は まっすぐな 所だけ。次の 列も 同じ 向きに 進める こと（落ちる 列）
          if (dir !== dc || leg < R.minSillLeg) continue;
          const sp2 = span(nx + dir[0], nz + dir[1], dir, w);
          if (sp2 === null) continue;
          const lv2 = Math.min(level - 1, sp.lo, sp2.lo);
          if (level - lv2 > R.maxDrop || sp2.hi - lv2 > cutMax) continue;
          sill = { lv: lv2 };
        }
        const score = bh(nx, nz) + (dir !== dc ? R.turnCost : 0) - R.outward * Math.hypot(nx - start.x, nz - start.z); // たいらな 所では 滝から とおざかる
        if (best === null || score < best.score) best = { dir, score, sill };
      }
      if (best !== null) break;
    }
    if (best === null && !desperate) {
      desperate = true;
      continue;
    }
    if (best === null) {
      stop = bh(x, z) <= R.arrive ? 'foot' : 'stuck'; // みちしるべの ゴールの すぐ そばなら すそに ついた ことに する
      break;
    }
    desperate = false;
    const { dir } = best;
    if (dir !== dc) {
      last.dout = dir;
      leg = 0;
    }
    dc = dir;
    x += dir[0];
    z += dir[1];
    if (inPool(x, z)) {
      last = { x, z, din: dir, dout: dir, level, kind: 'pool', afterSill: false, width: 0 };
      cells.push(last);
      continue;
    }
    mark(crossOf(x, z, dir, w));
    if (best.sill !== null) {
      last = { x, z, din: dir, dout: dir, level, kind: 'sill', afterSill: false, width: w };
      cells.push(last);
      x += dir[0];
      z += dir[1];
      mark(crossOf(x, z, dir, w));
      level = best.sill.lv;
      last = { x, z, din: dir, dout: dir, level, kind: 'water', afterSill: true, width: w };
      cells.push(last);
      wet += 2;
      leg = 0; // 段差の すぐ あとは 曲がらない
    } else {
      last = { x, z, din: dir, dout: dir, level, kind: 'water', afterSill: false, width: w };
      cells.push(last);
      wet++;
      leg++;
    }
    if (g(x, z) <= SEA_Y + 1) {
      stop = 'sea';
      break; // 海に ついた
    }
    if (cells.length >= R.footMinLen && atFoot(x, z)) {
      stop = 'foot';
      break; // すその 平地に ついた
    }
  }
  // 終わりの 池: 海なら いらない。さいごの 列の さきに 大きい 方から ためす（行きどまりの 水路に しない）
  let mouth: Basin | null = null;
  const e = cells.filter((c) => c.kind !== 'pool').slice(-1)[0];
  if (e !== undefined && stop !== 'sea') {
    const m = crossOf(e.x, e.z, e.dout, e.width);
    const mx = m.reduce((s, c) => s + c[0] + 0.5, 0) / m.length;
    const mz = m.reduce((s, c) => s + c[1] + 0.5, 0) / m.length;
    for (const r of R.mouthRadius) {
      const b = makeBasin(seed + 3, mx + e.dout[0] * (r - 1), mz + e.dout[1] * (r - 1), r, e.level, 3);
      if (basinFits(g, b, R.maxCut, R.mouthFill, (px, pz) => !blocked(px, pz))) {
        mouth = b;
        break;
      }
    }
  }
  return { cells, depth, mouth, stop };
}

/** 川を 書く（終わりの 池 → 川の 水 → 岸 の 順。あとから 書いた 方が かつ） */
function buildRiver(ed: Edit, g: Ground, seed: number, p: RiverPlan, pool: Basin, grassAt: (x: number, z: number) => boolean): void {
  if (p.mouth !== null) buildBasin(ed, g, seed + 11, p.mouth, B.rim, false);
  const wet = new Set<number>();
  const key = (x: number, z: number): number => x * 100003 + z;
  const cols: { x: number; z: number; level: number }[] = [];
  // 水の 列（曲がる 角は 出ていく 向きの 列も 足す）
  for (const c of p.cells) {
    if (c.kind === 'pool') continue;
    const list = crossOf(c.x, c.z, c.din, c.width);
    if (c.dout !== c.din) list.push(...crossOf(c.x, c.z, c.dout, c.width));
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
  const isWet = (x: number, z: number): boolean => wet.has(key(x, z)) || basinNorm(pool, x, z) <= 1 || (p.mouth !== null && basinNorm(p.mouth, x, z) <= 1);
  // 岸（わくに しない）: 水面より 低ければ 水面まで うめる。ふちは 岩・すな・そのままの 地面を くじで まぜる
  for (const c of cols) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = c.x + dx;
      const z = c.z + dz;
      if (isWet(x, z) || ed.get(x, c.level, z) === B.water) continue;
      const h = g(x, z);
      if (h < 0 || h > c.level + 1) continue;
      rimColumn(ed, seed + 5, x, z, h, c.level, B.rim, false);
    }
  }
  // 岸の 草・花（自然の 地面の 草の 上。水に となりあう 列だけ）
  for (const c of cols) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = c.x + dx;
      const z = c.z + dz;
      if (isWet(x, z) || ed.has(x, z) || !grassAt(x, z)) continue;
      if (hash01(seed, x, z, 70) >= R.plant) continue;
      const h = g(x, z);
      if (h <= c.level) continue;
      ed.set(x, h + 1, z, hash01(seed, x, z, 71) < R.flower ? pick(seed, B.flowers, x, z, 72) : B.grass);
    }
  }
}

/** 水の 列（x, z）→ 水面（いちばん 上の 水の y）。川の 列だけ */
function surfaces(ed: Edit): Map<number, number> {
  const m = new Map<number, number>();
  for (const b of ed.blocks()) if (b.id === B.water) m.set(b.x * 100003 + b.z, Math.max(m.get(b.x * 100003 + b.z) ?? -1, b.y));
  return m;
}

/** となりあう 水の 列で 水面が ちがう 所（あれば その 列の 1 つ）。ちがうと ふちを こえて 流れる */
function stepMismatch(ed: Edit): [number, number][] | null {
  const m = surfaces(ed);
  for (const [k, y] of m) {
    const x = Math.round(k / 100003);
    const z = k - x * 100003;
    for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
      const n = m.get((x + dx) * 100003 + z + dz);
      if (n !== undefined && n !== y) return [[x, z], [x + dx, z + dz]];
    }
  }
  return null;
}

/**
 * 川を 書いて、となりあう 水面が ちがう 所が あれば そこの 手前で 川を 切って 書きなおす（折れ曲がりの すぐ あとに 段差が きた とき など）。
 * 書いた 結果（ブロックと 実際に 使った 計画）を 返す
 */
export function buildRiverChecked(g: Ground, seed: number, plan: RiverPlan, pool: Basin, grassAt: (x: number, z: number) => boolean): { ed: Edit; plan: RiverPlan } {
  let cur = plan;
  for (let t = 0; t < R.trimTries; t++) {
    const ed = new Edit();
    buildRiver(ed, g, seed, cur, pool, grassAt);
    const bad = stepMismatch(ed);
    if (bad === null) return { ed, plan: cur };
    let at = -1;
    cur.cells.forEach((c, i) => {
      if (c.kind === 'pool') return;
      const cols = crossOf(c.x, c.z, c.din, c.width);
      if (c.dout !== c.din) cols.push(...crossOf(c.x, c.z, c.dout, c.width));
      if (cols.some(([x, z]) => bad.some(([bx, bz]) => bx === x && bz === z))) at = Math.max(at, i);
    });
    if (at < 0) break;
    cur = { ...cur, cells: cur.cells.slice(0, at), mouth: null, stop: 'stuck' };
  }
  return { ed: new Edit(), plan: { ...cur, cells: cur.cells.filter((c) => c.kind === 'pool'), mouth: null, stop: 'stuck' } };
}
