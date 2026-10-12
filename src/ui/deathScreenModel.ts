import type { Rgba } from '../world/blocks/textures';

/** やられた画面・復活の数値（M3 §3.4） */
export const DEATH_VIEW = {
  /** 白が最大になるまで（秒）・最大の濃さ */
  fadeInSeconds: 1,
  maxWhite: 0.6,
  /** 復活したとき白が消えるまで（秒） */
  fadeOutSeconds: 0.5,
  /** `おうちに もどったよ` を出す秒 */
  homeNoticeSeconds: 2,
} as const;

export const DEATH_TEXT = 'やられちゃった…';
export const HOME_TEXT = 'おうちに もどったよ';

type Mode = 'off' | 'dead' | 'fadeOut';

/** 白い画面の濃さ（DOM なしでテストできる） */
export class DeathScreenModel {
  private mode: Mode = 'off';
  private t = 0;
  private fadeFrom = 0;

  /** やられた */
  start(): void {
    this.mode = 'dead';
    this.t = 0;
  }
  /** 復活した（白が 0.5 秒で消える） */
  end(): void {
    if (this.mode === 'off') return;
    this.fadeFrom = this.white();
    this.mode = 'fadeOut';
    this.t = 0;
  }
  /** すぐ消す */
  reset(): void {
    this.mode = 'off';
    this.t = 0;
  }

  update(dt: number): void {
    if (this.mode === 'off') return;
    this.t += dt;
    if (this.mode === 'fadeOut' && this.t >= DEATH_VIEW.fadeOutSeconds) this.reset();
  }

  /** 画面の白の濃さ 0〜0.6 */
  white(): number {
    const V = DEATH_VIEW;
    if (this.mode === 'off') return 0;
    if (this.mode === 'dead') return V.maxWhite * Math.min(1, this.t / V.fadeInSeconds);
    return this.fadeFrom * Math.max(0, 1 - this.t / V.fadeOutSeconds);
  }
  /** `やられちゃった…` を出すか */
  showText(): boolean {
    return this.mode === 'dead';
  }
  active(): boolean {
    return this.mode !== 'off';
  }
}

// ちょうちんおばけ の顔（16x16）
const FACE_ROWS = [
  '................',
  '.......KK.......',
  '.....KKKKKK.....',
  '....KRRRRRRK....',
  '...KRRRRRRRRK...',
  '..KRRWWRRWWRRK..',
  '..KRRWKRRWKRRK..',
  '..KRRRRRRRRRRK..',
  '..KRRRRRRRRRRK..',
  '..KRRRMMMMRRRK..',
  '..KRRRRMMRRRRK..',
  '...KRRRRRRRRK...',
  '....KRRRRRRK....',
  '.....KKKKKK.....',
  '......KKKK......',
  '................',
];

const FACE_COLORS: Record<string, Rgba> = {
  '.': [0, 0, 0, 0],
  K: [0x22, 0x22, 0x22, 255],
  R: [0xff, 0x8a, 0x3d, 255],
  W: [255, 255, 255, 255],
  M: [0x8a, 0x2a, 0x1a, 255],
};

export function lanternFacePixels(): Rgba[] {
  const out: Rgba[] = [];
  for (const row of FACE_ROWS) for (const ch of row) out.push(FACE_COLORS[ch] ?? FACE_COLORS['.']);
  return out;
}
