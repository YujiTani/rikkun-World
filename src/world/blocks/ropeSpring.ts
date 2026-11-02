/**
 * ROPE-1 版 5: ゴムの ばね（ばね-ダンパー。質量 1・半陰 オイラー）。
 * x = 平衡点からの ずれ、v = 速さ。a = -k x - c v。v を 先に かえて から x を かえる。
 */
export interface SpringState {
  x: number;
  v: number;
}

export function springAccel(x: number, v: number, k: number, c: number): number {
  return -k * x - c * v;
}

/** 1 ステップ すすめる（state を かきかえる） */
export function springStep(s: SpringState, k: number, c: number, dt: number): void {
  s.v += springAccel(s.x, s.v, k, c) * dt;
  s.x += s.v * dt;
}

/** ほぼ とまった（ずれ も 速さ も 小さい） */
export function springSettled(s: SpringState, eps = 0.02): boolean {
  return Math.abs(s.x) < eps && Math.abs(s.v) < eps * 10;
}
