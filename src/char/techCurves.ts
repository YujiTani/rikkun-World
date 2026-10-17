// わざの絵・弓の絵の 時間割（public/models/char/atlas.json の ticks・advance・step・phases の写し）。
// 絵が読めなくても コマを決められるように コードにも持つ。atlas.json と同じことは techCurves.test.ts で確かめる。
import type { BladeAdvanceCurve, BladeTech, BladeTechFrames } from '../contracts';

export const TECH_CURVES: Record<BladeTech, BladeAdvanceCurve> = {
  thrust: {
    ticks: [2, 2, 1, 1, 3, 11, 4, 4, 4, 4, 5],
    advance: [0, 0.08, 0.255, 0.26, 0.29, 0.32, 0.285, 0.241, 0.16, 0.073, 0.002],
    step: 0,
  },
  kesa: {
    ticks: [8, 7, 4, 4, 5, 2, 2, 2, 5, 28, 8, 8, 8, 8, 7],
    advance: [0, 0.019, 0.088, 0.22, 0.351, 0.543, 0.62, 0.639, 0.691, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
    step: 0.8,
  },
  kiriage: {
    ticks: [5, 5, 5, 5, 5, 5, 4, 4, 2, 1, 2, 8, 27, 6, 6, 6, 4, 4],
    advance: [0, 0.13, 0.26, 0.39, 0.52, 0.65, 0.78, 0.91, 1.016, 1.04, 1.059, 1.05, 1.04, 1.04, 1.04, 1.04, 1.04, 1.04],
    step: 1.04,
  },
};

/** 絵の 出だし / 当たり / もどり（tick） */
export const TECH_PHASES: Record<BladeTech, BladeTechFrames> = {
  thrust: { startup: 4, active: 2, recovery: 35 },
  kesa: { startup: 28, active: 6, recovery: 72 },
  kiriage: { startup: 38, active: 5, recovery: 61 },
};

/** `bow_shot`（12 コマ）: 引く 0〜7、はなす 8〜11 */
export const BOW_SHOT_TICKS = [6, 6, 6, 6, 6, 5, 5, 12, 4, 6, 6, 6];
/** `bow_rapid`（11 コマ）: 引く 0〜6、はなす 7〜10 */
export const BOW_RAPID_TICKS = [4, 4, 4, 4, 4, 4, 5, 3, 4, 4, 4];
