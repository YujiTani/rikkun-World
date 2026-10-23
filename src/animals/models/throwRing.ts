/**
 * 着地点 の 丸（LIVE-2.1 §2.2・§3.2）。だっこ 中 ずっと、なげる 先 の 地面 に うすい 丸 の かげ（直径 0.8）。
 * 光らない・点滅 しない。とりごや の 子 に なる 所 は 丸 の 中 に いえ の しるし。
 * つなぎ込み: 毎フレーム `AnimalRenderer.setThrowSpot(animals.throwSpot())`（だっこ 中 以外 は null）。
 */

/** `animals.throwSpot()` の 答え（仕様 §6.2） */
export interface ThrowSpotLike {
  x: number;
  y: number;
  z: number;
  ok: boolean;
  home: number | null;
  toss: boolean;
}

export const RING_DIAMETER = 0.8;
/** 地面 から うかせる 高さ（重なり の ちらつき よけ） */
export const RING_LIFT = 0.03;
export const RING_TEX = 32;

export interface RingState {
  x: number;
  y: number;
  z: number;
  diameter: number;
  /** 丸 の 中 に いえ の しるし を 出す か */
  home: boolean;
}

/** 出す 丸 の 状態。なげられない 所（ok false）・だっこ して いない（null）は 出さない */
export function ringState(s: ThrowSpotLike | null): RingState | null {
  if (!s || !s.ok) return null;
  return { x: s.x, y: s.y + RING_LIFT, z: s.z, diameter: RING_DIAMETER, home: s.home !== null };
}

/** 丸 の 絵（RGBA、`RING_TEX` 四方）。まん中 ほど うすく、ふち が 少し 濃い 輪。`home` なら 中 に いえ の しるし（白 の 家） */
export function rasterRing(home: boolean): Uint8Array {
  const N = RING_TEX;
  const px = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const r = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2);
      if (r > 1) continue;
      const i = (y * N + x) * 4;
      // 中 = 48、ふち（0.82〜1）= 120 の 暗い 色 の かげ
      const a = r > 0.82 ? 120 : 48;
      px[i] = 20;
      px[i + 1] = 24;
      px[i + 2] = 30;
      px[i + 3] = a;
    }
  }
  if (home) {
    // いえ の しるし: 三角 の やね と 四角 の かべ（白）。まん中 に 10 点 ほど
    const put = (x: number, y: number): void => {
      const i = (y * N + x) * 4;
      px[i] = 255;
      px[i + 1] = 250;
      px[i + 2] = 235;
      px[i + 3] = 128;
    };
    const cx = N / 2;
    for (let row = 0; row < 5; row++) for (let x = cx - row - 1; x <= cx + row; x++) put(x, 9 + row); // やね
    for (let y = 14; y < 21; y++) for (let x = cx - 4; x < cx + 4; x++) put(x, y); // かべ
  }
  return px;
}
