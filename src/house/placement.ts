import { SEA_Y } from '../contracts';
import { hash01, subSeed } from '../world/gen/random';
import { heightAt, rawHeightAt } from '../world/gen/terrain';
import { cellInWall } from '../world/wall';

/**
 * 建築士さんを どこに 出すか（HOUSE-1A。docs/design/HOUSE-1.md §2.2・AC1・AC2）。
 * どれも (seed, 座標) だけで 決まる 純粋な 計算（ブロックは 読まない）。同じ シードなら いつも 同じ 場所。
 * 「立てるか」は 呼ぶ 側が 決める（地形だけなら `landColumn`、読みこんだ 世界では 実際の ブロックも 見る）。
 * 候補は 順番つきで 返す。先頭から ためして、立てる 最初の 1 つを 使う。
 */

/** 区画の 大きさ（マス）。世界を この 大きさの 四角に 分け、区画ごとに くじを ひく */
export const REGION_SIZE = 192;
/** 何区画に 1 区画に 建築士さんが 出るか（3 つに 1 つ） */
const REGION_ONE_IN = 3;
/** 区画の ふちから この マス数 は 内がわに 置く（ふちで 区画が 切れない ように） */
const REGION_MARGIN = 8;
/** 1 区画で ためす 候補の 数（ぜんぶ 水の 上なら その 区画は 0 人） */
const SPOT_COUNT = 16;
/** 水の 上に ならない 高さ（海面から の 高さ）。なぎさの 砂も さける */
const MIN_ABOVE_SEA = 2;
/** 最初の 1 人の きょり（スタートから の XZ の 直線きょり。マスの まん中どうし）。仕様は 6〜10、はしは さけて 内がわに */
const FIRST_NEAR = 6.5;
const FIRST_FAR = 9.5;

// 乱数の 用途ごとの 札（subSeed の tag）
const TAG_ROLL = 5101;
const TAG_SPOT = 5102;
const TAG_FIRST = 5103;

/** 整数の 列（ブロックの 番号） */
export interface Column {
  x: number;
  z: number;
}

/** 区画の 番号（192 ごと。負の 座標は 切りさげ） */
export const regionIndex = (v: number): number => Math.floor(v / REGION_SIZE);

/** 区画 (rx, rz) の くじ。3 つに 1 つ 当たる（スタートの 区画の 例外は regionHasArchitect） */
export function regionRoll(seed: number, rx: number, rz: number): boolean {
  return hash01(subSeed(seed, TAG_ROLL), rx, rz) < 1 / REGION_ONE_IN;
}

/** その 区画に 最初の 1 人 いがいの 建築士さんが 出るか。スタートの 区画には 出ない（最初の 1 人だけ） */
export function regionHasArchitect(seed: number, rx: number, rz: number, start: Column): boolean {
  if (rx === regionIndex(start.x) && rz === regionIndex(start.z)) return false;
  return regionRoll(seed, rx, rz);
}

/** 区画 (rx, rz) の 中の 候補（ためす 順）。区画の ふちから REGION_MARGIN 内がわ */
export function spotCandidates(seed: number, rx: number, rz: number, count = SPOT_COUNT): Column[] {
  const s = subSeed(seed, TAG_SPOT);
  const span = REGION_SIZE - REGION_MARGIN * 2 + 1;
  const out: Column[] = [];
  for (let k = 0; k < count; k++) {
    out.push({
      x: rx * REGION_SIZE + REGION_MARGIN + Math.floor(hash01(s, rx, rz, 2 * k) * span),
      z: rz * REGION_SIZE + REGION_MARGIN + Math.floor(hash01(s, rx, rz, 2 * k + 1) * span),
    });
  }
  return out;
}

/**
 * 最初の 1 人の 候補（ためす 順）。スタートから 横 6〜10 マス（XZ の 直線きょり）の 列ぜんぶ。
 * スタートの 画面（向き facingDeg。0 = 北 = −z）から 見える ように、向きに 近い 順に ならべる（シードで 少し ばらつく）。
 */
export function firstCandidates(seed: number, spawn: Column, facingDeg = 0): Column[] {
  const s = subSeed(seed, TAG_FIRST);
  const R = Math.ceil(FIRST_FAR);
  const keyed: Array<{ x: number; z: number; key: number }> = [];
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dz);
      if (d < FIRST_NEAR || d > FIRST_FAR) continue;
      let off = ((Math.atan2(dx, -dz) * 180) / Math.PI - facingDeg) % 360;
      if (off > 180) off -= 360;
      else if (off < -180) off += 360;
      keyed.push({ x: spawn.x + dx, z: spawn.z + dz, key: Math.abs(off) / 180 + hash01(s, dx, dz) * 0.2 });
    }
  }
  keyed.sort((a, b) => a.key - b.key);
  return keyed.map(({ x, z }) => ({ x, z }));
}

/** 最初の 1 人: 立てる 最初の 候補（1 つも なければ null） */
export function placeFirst(seed: number, spawn: Column, standable: (x: number, z: number) => boolean, facingDeg = 0): Column | null {
  for (const c of firstCandidates(seed, spawn, facingDeg)) if (standable(c.x, c.z)) return c;
  return null;
}

/** 区画 (rx, rz) の 建築士さん: 立てる 最初の 候補（1 つも なければ null = その 区画は 0 人） */
export function placeInRegion(seed: number, rx: number, rz: number, standable: (x: number, z: number) => boolean): Column | null {
  for (const c of spotCandidates(seed, rx, rz)) if (standable(c.x, c.z)) return c;
  return null;
}

/**
 * 地形だけで 見た「水でない 地面」: まわり 3×3 が ぜんぶ 海面より MIN_ABOVE_SEA 以上 高い（池・なぎさも さける）。見えない壁の 中。
 * 木・岩・ブロックの 置き換えは 見ない（読みこんだ あとで 実際の ブロックを 見る）
 */
export function landColumn(seed: number, x: number, z: number): boolean {
  if (!cellInWall(x, z)) return false;
  // 中心が だめなら すぐ やめる（海の 区画で 何千回も 聞かれる）
  if (rawHeightAt(seed, x, z) < SEA_Y + MIN_ABOVE_SEA) return false;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (rawHeightAt(seed, x + dx, z + dz) < SEA_Y + MIN_ABOVE_SEA) return false;
      if (heightAt(seed, x + dx, z + dz) < SEA_Y + MIN_ABOVE_SEA) return false;
    }
  }
  return true;
}
