import { box, boxRun, hz, mar, sine, swish, wood } from './sfxVoices';
import type { Tone } from './sound';

/**
 * 宝箱が あく 音（MINE-1C #350。案 A「オルゴールの かいだん」）。ふたの 動き（0.46 秒）に 合わせた
 * 「かちっ（0 秒）→ ふわっ（0.12）→ ぱかっ（0.28）→ とん（0.46）」のあと、段が 上がるほど 長く・高く・和音が 厚い 階段。
 * 数の もとは `/mnt/project-files/mine-sound/chest/tools/render.py` の `A_tones()`。ド を 根音に する（BGM の 根音に 合わせて 動く。ゆらぎは sfxVary.ts）。
 * 部品の 数は 段 1〜3 が 30 まで、4 段目は 32 まで（鳴って いる 音の 合計 48 を こえない）。
 */
const LID = { click: 0, whoosh: 0.12, paka: 0.28, ton: 0.46 } as const;

const lid = (): Tone[] => [
  ...wood(1300, 1150, LID.click, 0.035, 0.3), // かちっ
  swish(700, 2400, LID.whoosh, 0.18, 0.04, 0.9), // ふわっ
  ...wood(400, 620, LID.paka - 0.01, 0.07, 0.4), // ぱかっ
  ...wood(200, 150, LID.ton, 0.08, 0.3), // とん
];
const b = (n: string, d: number, dur: number, g: number, rich = false): Tone[] => box(hz(n), hz(n) * 1.004, d, dur, g, rich);
const m = (n: string, d: number, dur: number, g: number): Tone[] => mar(hz(n), hz(n), d, dur, g);
const s = (n: string, d: number, dur: number, g: number): Tone => sine(hz(n), hz(n) * 1.004, d, dur, g, 0.002);
const run = (names: readonly string[], step: number, dur: number, g: number, start: number): Tone[] => boxRun(names.map(hz), step, dur, g, start, 1.004);

export const CHEST_SOUNDS = {
  /** 1 きの: ソ ラ → ド（3 だん） */
  chestOpen1: [...lid(), ...b('G5', 0.3, 0.12, 0.3), ...b('A5', 0.37, 0.12, 0.3), ...b('C6', 0.46, 0.75, 0.36, true), ...m('C5', 0.46, 0.6, 0.26), ...m('G4', 0.46, 0.5, 0.14)],
  /** 2 てつ: ミ ソ ラ ド レ → ミ（6 だん） */
  chestOpen2: [...lid(), ...run(['E5', 'G5', 'A5', 'C6', 'D6'], 0.065, 0.12, 0.28, 0.3), ...b('E6', 0.63, 0.85, 0.34, true), ...b('C6', 0.63, 0.8, 0.2), ...m('C5', 0.63, 0.7, 0.26)],
  /** 3 うるし: レ ミ ソ ラ ド レ → ソ（7 だん）＋ キラ キラ */
  chestOpen3: [
    ...lid(),
    ...run(['D5', 'E5', 'G5', 'A5', 'C6', 'D6'], 0.058, 0.12, 0.27, 0.3),
    ...b('G6', 0.68, 0.95, 0.32, true),
    ...b('E6', 0.68, 0.9, 0.22),
    ...m('C4', 0.68, 0.8, 0.26),
    ...run(['C7', 'E7'], 0.08, 0.14, 0.12, 1.0),
  ],
  /** 4 ミラクル: はやい 階段（10 だん）→「た（ソの 和音）・だーん（ドの 和音）」＋ キラ キラ */
  chestOpen4: [
    ...lid(),
    ...['G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6'].map((n, i) => s(n, 0.2 + 0.05 * i, 0.12, 0.3)),
    ...b('G6', 0.72, 0.16, 0.28),
    ...b('D6', 0.72, 0.16, 0.22),
    ...b('C7', 0.94, 1.2, 0.3, true),
    ...b('E6', 0.94, 1.1, 0.22),
    ...m('C5', 0.94, 1.0, 0.22),
    ...m('C4', 0.94, 1.0, 0.3),
    s('G7', 1.24, 0.16, 0.12),
    s('C8', 1.32, 0.3, 0.1),
  ],
} as const satisfies Record<string, readonly Tone[]>;

