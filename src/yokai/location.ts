/**
 * 場所の倍率 M と色の段階（BALANCE §2.3・§2.4）。
 * はじまりの場所・海面の高さは引数で受ける（数を書きこまない。世界の設定から読む）。
 */

/** §2.3 の数（設定の名前。§4.9） */
export const LOCATION_M = {
  /** はじまりから この距離までは M = 1 */
  nearFree: 64,
  /** 遠さ これだけで M が 1 ふえる */
  distPerOne: 1000,
  /** 海面から この深さまでは M = 1 */
  depthFree: 8,
  /** 深さ これだけで M が 1 ふえる */
  depthPerOne: 64,
  max: 3,
} as const;

/** 色の段階の区切り（M がこれ以上で 段階 2・3） */
export const COLOR_STAGE_M = { second: 1.5, third: 2.25 } as const;

/** 水平の遠さ d と 海面からの深さ k から M */
export function locationM(d: number, k: number): number {
  const c = LOCATION_M;
  return Math.min(c.max, 1 + Math.max(0, d - c.nearFree) / c.distPerOne + Math.max(0, k - c.depthFree) / c.depthPerOne);
}

/** 出た場所 (x, y, z) の M。origin = はじまりの場所（いちばん近い所から。複数なら配列）、seaY = 海面の高さ */
export function locationMAt(
  pos: { x: number; y: number; z: number },
  origin: { x: number; z: number } | readonly { x: number; z: number }[],
  seaY: number,
): number {
  const list = Array.isArray(origin) ? (origin as readonly { x: number; z: number }[]) : [origin as { x: number; z: number }];
  let d = Infinity;
  for (const o of list) d = Math.min(d, Math.hypot(pos.x - o.x, pos.z - o.z));
  if (!Number.isFinite(d)) d = 0;
  return locationM(d, Math.max(0, seaY - pos.y));
}

/** 色の段階 1 いつも・2 つよい・3 とても つよい */
export function colorStage(m: number): 1 | 2 | 3 {
  return m >= COLOR_STAGE_M.third - 1e-9 ? 3 : m >= COLOR_STAGE_M.second - 1e-9 ? 2 : 1;
}
