import type { BlockId, Vec3, VoxelWorld, YokaiInfo, YokaiWorld } from '../contracts';
import { boxOf, wallBetween } from '../combat/attackFacing';

/**
 * WEAPON-7 §3.2: 雷の ねらう 点 T・落ちる 点 S・空が 見えるか。判定は ブロックの 列だけで 決める
 * （光の 値 `skyLight` は 列を 読みこんだ 直後に 15 を 返す ことが あるので 使わない。contracts.ts の VOX-C の 注意）。
 */

/** 雷が 当たる ブロックか: 固い ブロック・はっぱ（固い）・水。十字の 草花・たいまつ（固くない）は とおりぬける */
export function thunderBlock(world: VoxelWorld, x: number, y: number, z: number): boolean {
  const id: BlockId | 'outside' = world.getBlock(x, y, z);
  if (id === 'air' || id === 'outside') return false;
  return id === 'water' || world.isSolid(x, y, z);
}

export interface ThunderAim {
  /** ねらう 点 */
  T: Vec3;
  /** 落ちる 点（なければ null = 列に 1 つも ブロックが ない・読みこんでいない） */
  S: Vec3 | null;
  skyVisible: boolean;
}

/** その 列を 世界の いちばん 上から 見て 最初の 雷が 当たる ブロックの 上の面の y。なければ null */
export function thunderTop(world: VoxelWorld, x: number, z: number): number | null {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  if (!world.isLoaded(ix, iz)) return null;
  for (let y = world.size.y - 1; y >= 0; y--) if (thunderBlock(world, ix, y, iz)) return y + 1;
  return null;
}

interface Hit {
  dist: number;
  /** この 点の 上に 雷を さえぎる ものが なければ 空が 見える と する 高さ（これ 以下の S なら 見える） */
  limitY: number;
  /** 列（T の 真上）。ブロックの 横の 面に 当たった ときも その ブロックの 列 */
  col: { x: number; z: number };
}

/** 目から 向きへ 線を のばし、range 以内で 最初の 雷が 当たる ブロック（ボクセルを たどる）。なければ null */
function firstBlock(world: VoxelWorld, o: Vec3, d: Vec3, range: number): (Hit & { block: Vec3 }) | null {
  let x = Math.floor(o.x);
  let y = Math.floor(o.y);
  let z = Math.floor(o.z);
  const hitHere = (): boolean => thunderBlock(world, x, y, z);
  if (hitHere()) return { dist: 0, limitY: y + 1, col: { x, z }, block: { x, y, z } };
  const sx = d.x > 0 ? 1 : -1;
  const sy = d.y > 0 ? 1 : -1;
  const sz = d.z > 0 ? 1 : -1;
  const tdx = d.x === 0 ? Infinity : Math.abs(1 / d.x);
  const tdy = d.y === 0 ? Infinity : Math.abs(1 / d.y);
  const tdz = d.z === 0 ? Infinity : Math.abs(1 / d.z);
  let tx = d.x === 0 ? Infinity : (d.x > 0 ? x + 1 - o.x : o.x - x) * tdx;
  let ty = d.y === 0 ? Infinity : (d.y > 0 ? y + 1 - o.y : o.y - y) * tdy;
  let tz = d.z === 0 ? Infinity : (d.z > 0 ? z + 1 - o.z : o.z - z) * tdz;
  for (;;) {
    let t: number;
    if (tx <= ty && tx <= tz) {
      t = tx;
      x += sx;
      tx += tdx;
    } else if (ty <= tz) {
      t = ty;
      y += sy;
      ty += tdy;
    } else {
      t = tz;
      z += sz;
      tz += tdz;
    }
    if (t > range) return null;
    if (hitHere()) return { dist: t, limitY: y + 1, col: { x, z }, block: { x, y, z } };
  }
}

/**
 * ねらう 点 T と 落ちる 点 S（§3.2）。
 * T = 線が range 以内で 当たった ブロックの 面 か 妖怪の 箱の 点。何にも 当たらなければ 線の range 先の 点。
 * S = T の 真上の 列を いちばん 上から 下へ 見て 最初の 雷が 当たる ブロックの 上の面。
 * 空が 見える = S が 「T の ブロックの 上の面」（T が 妖怪なら 足もとの 地面、空中なら T の 高さ）より 上に ない。
 */
export function aimThunder(world: VoxelWorld, yokai: Pick<YokaiWorld, 'raycast' | 'list'> | null, eye: Vec3, dir: Vec3, range: number): ThunderAim {
  const b = firstBlock(world, eye, dir, range);
  const yh = yokai?.raycast(eye, dir, range) ?? null;
  let T: Vec3;
  let hit: Hit;
  if (yh && (!b || yh.distance < b.dist)) {
    T = { x: eye.x + dir.x * yh.distance, y: eye.y + dir.y * yh.distance, z: eye.z + dir.z * yh.distance };
    const info = yokai!.list().find((y: YokaiInfo) => y.id === yh.id);
    const feet = info ? info.position.y : T.y;
    // 足もとの 地面（足もとから 0.6 までの ずれは 同じ 地面）
    hit = { dist: yh.distance, limitY: feet + 0.6, col: { x: Math.floor(T.x), z: Math.floor(T.z) } };
  } else if (b) {
    // ブロックの 中へ すこし すすめた 点（横の 面でも その ブロックの 列に 入る）
    const e = b.dist + 1e-4;
    T = { x: eye.x + dir.x * e, y: eye.y + dir.y * e, z: eye.z + dir.z * e };
    hit = b;
  } else {
    T = { x: eye.x + dir.x * range, y: eye.y + dir.y * range, z: eye.z + dir.z * range };
    hit = { dist: range, limitY: T.y, col: { x: Math.floor(T.x), z: Math.floor(T.z) } };
  }
  const top = thunderTop(world, hit.col.x, hit.col.z);
  if (top === null) return { T, S: null, skyVisible: false };
  const S = { x: T.x, y: top, z: T.z };
  return { T, S, skyVisible: top <= hit.limitY + 1e-6 };
}

/** F8 に 当たる 妖怪（§3.4）: 箱の 中心が S から 半径 radius の 球の 中で、S の 0.5 上から 中心への 線が 固い ブロックに さえぎられない */
export function thunderTargets(world: VoxelWorld, list: readonly YokaiInfo[], S: Vec3, radius: number): number[] {
  const out: number[] = [];
  const from = { x: S.x, y: S.y + 0.5, z: S.z };
  for (const y of list) {
    if (y.state === 'dying' || y.state === 'leaving') continue;
    const { h } = boxOf(y);
    const cx = y.position.x;
    const cy = y.position.y + h / 2;
    const cz = y.position.z;
    if (Math.hypot(cx - S.x, cy - S.y, cz - S.z) > radius) continue;
    if (wallBetween(world, from, cx, cy, cz)) continue;
    out.push(y.id);
  }
  return out;
}
