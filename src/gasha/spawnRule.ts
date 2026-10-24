/**
 * #293 リリース: がしゃどくろが 出る 日・場所・消える 距離の 判定（ゲームの 係に 頼らない 計算だけ）。数は releaseTuning.ts の spawn。
 *  ・ゲームの 1 日（あさ）ごとに くじを 1 回 引く。同じ（世界の シード, 何日目）なら いつも 同じ 結果（乱数は シード付き）。
 *  ・出る 場所は プレイヤーから minDistance〜maxDistance ブロックの 輪の どこか。海・水の 上は さける。
 *  ・たおすか、プレイヤーが despawnDistance より 遠く はなれると 消える。
 */
import { createRng, type Rng } from '../world/gen/random';
import { RELEASE } from './releaseTuning';

export type SpawnTune = (typeof RELEASE)['spawn'];

/** 何日目かで きまる 乱数（世界の シード・日・調整表の saltSeed を まぜる） */
export function dayRng(worldSeed: number, day: number, salt: number = RELEASE.spawn.saltSeed): Rng {
  let h = Math.imul(worldSeed | 0, 0x9e3779b1) ^ Math.imul(day | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return createRng((h ^ (h >>> 15)) >>> 0);
}

/** あさの くじ。出る なら appear = true（場所は このあと 同じ 乱数で pickSpawnSpot） */
export function rollMorning(worldSeed: number, day: number, tune: SpawnTune = RELEASE.spawn): { appear: boolean; rng: Rng } {
  const rng = dayRng(worldSeed, day, tune.saltSeed);
  return { appear: rng() < tune.chancePerMorning, rng };
}

export interface SpawnSpot {
  /** 出る 場所（世界の 座標） */
  x: number;
  z: number;
  /** プレイヤーから 見た 向き（長さ 1。x は 東、z は 南） */
  dx: number;
  dz: number;
  /** プレイヤーからの 水平の 距離（ブロック） */
  distance: number;
  /** 向きの 角度（度。0 = +x、90 = +z） */
  angleDeg: number;
}

export const horizontalDistance = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

/** 出る 場所を えらぶ。isLand(x, z) が false（海・水）の 向きは さけて、tune.landTries 回 まで ひきなおす。だめなら null */
export function pickSpawnSpot(
  rng: Rng,
  player: { x: number; z: number },
  isLand: (x: number, z: number) => boolean,
  tune: SpawnTune = RELEASE.spawn,
): SpawnSpot | null {
  const r = tune.landProbeRadius;
  for (let i = 0; i < Math.max(1, tune.landTries); i++) {
    const angle = rng() * Math.PI * 2;
    const distance = tune.minDistance + rng() * Math.max(0, tune.maxDistance - tune.minDistance);
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const x = player.x + dx * distance, z = player.z + dz * distance;
    if (isLand(x, z) && isLand(x + r, z) && isLand(x - r, z) && isLand(x, z + r) && isLand(x, z - r)) {
      return { x, z, dx, dz, distance, angleDeg: (angle * 180) / Math.PI };
    }
  }
  return null;
}

/** プレイヤーが dx, dz の 向きを 向く ときの yawDeg（gashaBig.ts の fwdOf = (sin yaw, -cos yaw) の 逆） */
export function faceYawDeg(dx: number, dz: number): number {
  return (Math.atan2(dx, -dz) * 180) / Math.PI;
}

/** from から to の 方を 向く とき の 体の 向き（度。gashaBig.ts の place({ yawDeg }) と おなじ。atan2(to.x - from.x, to.z - from.z)）。offsetDeg は 調整表 place.faceYawOffsetDeg */
export function faceTowardYawDeg(from: { x: number; z: number }, to: { x: number; z: number }, offsetDeg = 0): number {
  return (Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI + offsetDeg;
}

/** プレイヤーとの 距離が 遠すぎて 消す 時か */
export function shouldDespawn(distance: number, tune: SpawnTune = RELEASE.spawn): boolean {
  return distance > tune.despawnDistance;
}

/**
 * ふだんの ゲームで がしゃどくろを 出して よいか。
 *  ・`?gasha=off` は 出さない、`?gasha=on` は いつも 出す。
 *  ・自動テスト（ブラウザの webdriver）では 出さない（描画の 数や 時間が ゆれる ため。出したい テストは `?gasha=on` か `__rikkun.gasha.spawn()`）。
 *  ・`?proto=` の 試作ページは 試作の 置き方が ある ので 出さない。
 */
export function gashaEnabled(search: string, webdriver: boolean): boolean {
  const q = new URLSearchParams(search);
  const flag = q.get('gasha');
  if (flag === 'off') return false;
  if (flag === 'on') return true;
  if (q.get('proto')) return false;
  return !webdriver;
}
