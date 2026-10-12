import type { M6Settings } from '../../contracts';
import { M6_SETTING_DEFAULTS } from '../../contracts';

/** B が読む設定（settings の名前と同じ。つなぎ込みで settings とつなぐ） */
export type CelebrateSettings = Pick<
  M6Settings,
  'craftComboTicks' | 'craftComboMax' | 'bannerTicks' | 'bannerInTicks' | 'bannerOutTicks' | 'achieveCloseDelay' | 'achieveModalRows'
>;

export function defaultCelebrateSettings(): CelebrateSettings {
  const d = M6_SETTING_DEFAULTS;
  return {
    craftComboTicks: d.craftComboTicks,
    craftComboMax: d.craftComboMax,
    bannerTicks: d.bannerTicks,
    bannerInTicks: d.bannerInTicks,
    bannerOutTicks: d.bannerOutTicks,
    achieveCloseDelay: d.achieveCloseDelay,
    achieveModalRows: d.achieveModalRows,
  };
}

/** 画面ステップで決めた演出の数（仕様 §2.4。1 秒 = 60） */
export const CELEBRATE = {
  /** ぽよん: 0.3 秒 */
  poyonSteps: 18,
  /** 光のつぶ: 12 こ + コンボごとに 2 こ・0.5 秒 */
  sparkBase: 12,
  sparkPerCombo: 2,
  sparkSteps: 30,
  /** 光の輪: 0.4 秒 */
  ringSteps: 24,
  /** ×N の表示: 0.8 秒 */
  comboLabelSteps: 48,
  /** 横断幕: ぽよん（36〜48）・光る（48〜）・つやの間・星 */
  bannerPoyonEnd: 48,
  bannerGlowStart: 48,
  haloDegPerStep: 1.5,
  shinePeriod: 60,
  shinePassSteps: 30,
  wobbleDeg: 3,
  wobblePeriod: 90,
  starCount: 8,
  starGroups: 2,
  /** 星 1 組が光る間かく（1.2 秒）と 1 回の光（0.6 秒） */
  starPeriod: 72,
  starFlash: 36,
  confettiCount: 40,
  confettiSteps: 120,
  /** 横断幕の じゅんばん: いま出ているもの + 待ち 2 つ まで（4 こ目からは出さない） */
  bannerQueueMax: 2,
} as const;

/** 点滅のきまり用: 光の間（画面ステップ）。どれも 24 以上 */
export function flashPeriods(): number[] {
  return [CELEBRATE.shinePeriod, CELEBRATE.starPeriod];
}

/** 星の光が 画面全体で 1 秒に何回か */
export function flashPerSecond(): number {
  return (CELEBRATE.starGroups * 60) / CELEBRATE.starPeriod;
}
