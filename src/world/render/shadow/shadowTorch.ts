// たいまつの影（段 2、SHADOW.md §5.2・§5.3）の 純粋な決まり。ShadowSystem から呼ぶ（ユニットテストは shadowTorch.test.ts）。

export interface TorchCandidate {
  x: number;
  y: number;
  z: number;
}

export interface TorchHit extends TorchCandidate {
  /** プレイヤー（足もと）からの 距離の 2 乗（光の中心まで） */
  d2: number;
}

/** 光の中心（棒の上 0.82）の高さ */
export const TORCH_LIGHT_Y = 0.82;

/** たいまつの ブロックの位置から 光の中心（ワールド座標） */
export function torchCenter(c: TorchCandidate): { x: number; y: number; z: number } {
  return { x: c.x + 0.5, y: c.y + TORCH_LIGHT_Y, z: c.z + 0.5 };
}

/** 同じ たいまつに 同じ数を返す（入れ物の 取りちがえを 防ぐ印） */
export function torchKey(c: TorchCandidate): number {
  return (c.x * 73856093) ^ (c.y * 19349663) ^ (c.z * 83492791);
}

/**
 * 候補から、プレイヤーに近い順に max 本（光の中心までの距離が reach 以内だけ）。
 * 同じ近さは 先に来た方。
 */
export function pickNearestTorches(cands: Iterable<TorchCandidate>, p: { x: number; y: number; z: number }, reach: number, max = 2): TorchHit[] {
  const hits: TorchHit[] = [];
  for (const c of cands) {
    const l = torchCenter(c);
    const d2 = (l.x - p.x) ** 2 + (l.y - p.y) ** 2 + (l.z - p.z) ** 2;
    if (d2 > reach * reach) continue;
    hits.push({ ...c, d2 });
  }
  hits.sort((a, b) => a.d2 - b.d2);
  return hits.slice(0, max);
}

/**
 * 地図を描き直すか: 半径 near 以内に動く物がいる／さっきまでいた（消すため 1 回）／たいまつが 変わった。
 */
export function shouldRedrawTorch(opt: { moverDistances: readonly number[]; near: number; hadMovers: boolean; needsDraw: boolean }): { redraw: boolean; hasMovers: boolean } {
  const hasMovers = opt.moverDistances.some((d) => d < opt.near);
  return { redraw: hasMovers || opt.hadMovers || opt.needsDraw, hasMovers };
}

/** 近さの重み: 光の中心に近いほど 1、半径 reach で 0 */
export function torchWeight(dist: number, reach: number): number {
  return Math.min(1, Math.max(0, 1 - dist / reach));
}

/**
 * 近い 2 本の影をまぜる（shadowGlsl.ts の shTorchOcc と同じ式）。occ[i] = 1 で まるごと影、0 で とどく。
 * 重みの合計が minDen より小さいときは 遠いぶんだけ うすくする。
 */
export function mixTorchOcclusion(items: readonly { weight: number; occ: number }[], minDen = 0.35): number {
  let num = 0;
  let den = 0;
  for (const it of items) {
    if (it.weight <= 0) continue;
    num += it.weight * it.occ;
    den += it.weight;
  }
  return num / Math.max(den, minDen);
}

export interface SlotState {
  key: number;
  active: boolean;
}

/**
 * 見つかった たいまつ（印 found）を 入れ物へ割り当てる。
 * 続けて見つかるものは 同じ入れ物のまま（fresh = false）。見つからなくなった入れ物は 印を捨てて 非 active（もどったときは 新しく割り当てる）。
 * あたらしく入るものは あいた入れ物へ（fresh = true。地図を 描き直す）。
 */
export function assignTorchSlots(prev: readonly SlotState[], found: readonly number[]): { key: number; active: boolean; fresh: boolean }[] {
  const out = prev.map((s) => (s.active && found.includes(s.key) ? { key: s.key, active: true, fresh: false } : { key: -1, active: false, fresh: false }));
  for (const k of found) {
    if (out.some((s) => s.active && s.key === k)) continue;
    const slot = out.find((s) => !s.active) ?? out[0]!;
    slot.key = k;
    slot.active = true;
    slot.fresh = true;
  }
  return out;
}

/** 動く物の 位置・絵のコマを まとめて 比べるための 数のまぜ方（0.001 より 小さいゆれは 同じ） */
export function hashStep(h: number, v: number): number {
  return Math.imul(h ^ Math.round(v * 1000), 16777619) | 0;
}
