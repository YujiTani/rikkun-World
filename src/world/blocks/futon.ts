import type { BlockId } from '../../contracts';

/**
 * ふとん 2 マス（ITEM-FX-1・yuzu の 直し）。ベッドのように、置くと 向いている 方向に 2 ブロック ぶんの 長さ。
 * まくら側の マス（頭）= `futon` 系、足の側の マス = `futon_foot_*`。向きは 頭から 足へ（e = +x・s = +z・w = -x・n = -z）。
 * 頭の `futon` は アイテムの id と おなじ。ほかの 7 つは 持ち物に 入らない（こわすと `futon` 1 つ）。
 * まわりに 相手の マスが 無い 1 マス だけの ふとん（古い 保存・テスト）は、そのまま 1 マスの ふとんとして 動く。
 */
export type FutonDir = 0 | 1 | 2 | 3;

/** 向きごとの ずれ（x, z）。e・s・w・n */
const FUTON_STEP: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** 頭の マスの id（向きごと） */
export const FUTON_HEAD: readonly BlockId[] = ['futon', 'futon_s', 'futon_w', 'futon_n'];
/** 足の マスの id（向きごと） */
export const FUTON_FOOT: readonly BlockId[] = ['futon_foot_e', 'futon_foot_s', 'futon_foot_w', 'futon_foot_n'];
const INFO = new Map<string, { role: 'head' | 'foot'; dir: FutonDir }>();
FUTON_HEAD.forEach((id, i) => INFO.set(id, { role: 'head', dir: i as FutonDir }));
FUTON_FOOT.forEach((id, i) => INFO.set(id, { role: 'foot', dir: i as FutonDir }));

/** ふとんの どれかの マスか（頭でも 足でも） */
export function isFutonId(id: BlockId | string): boolean {
  return INFO.has(id);
}

/** 頭か 足か・向き（ふとんでなければ null） */
export function futonInfo(id: BlockId | string): { role: 'head' | 'foot'; dir: FutonDir } | null {
  return INFO.get(id) ?? null;
}

/** 向き（プレイヤーの yaw。0 = 北 -z・90 = 東 +x）を 4 つに まるめる */
export function futonDirFromYaw(yawDeg: number): FutonDir {
  const k = ((Math.round(yawDeg / 90) % 4) + 4) % 4; // 0 = 北, 1 = 東, 2 = 南, 3 = 西
  return ((k + 3) % 4) as FutonDir;
}

/** (x, z) の ふとんの マスから 見た 相手の マスの 場所と そこに ある はずの id（ふとんでなければ null） */
export function futonPartner(id: BlockId | string, x: number, z: number): { x: number; z: number; id: BlockId } | null {
  const f = INFO.get(id);
  if (!f) return null;
  const [dx, dz] = FUTON_STEP[f.dir]!;
  return f.role === 'head' ? { x: x + dx, z: z + dz, id: FUTON_FOOT[f.dir]! } : { x: x - dx, z: z - dz, id: FUTON_HEAD[f.dir]! };
}
