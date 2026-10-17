/** 昼と夜の数値（M3 §4.1）。`settings.*` に同じ名前で出す（つなぎ込み担当） */
export interface TimeSettings {
  /** ひる・ゆうがた・よる・あさ の長さ（ステップ。合計 91,800 = 25 分 30 秒） */
  dayTicks: number;
  duskTicks: number;
  nightTicks: number;
  dawnTicks: number;
  /** よる のブロックの明るさ・妖怪と人形の明るさ */
  nightBrightness: number;
  nightDollBrightness: number;
  /** あさ の始めから、妖怪が全員帰るまで（担当 B が読む） */
  yokaiLeaveTicks: number;
}

/** ゲームを開いた直後の 1 日の中の時刻（ステップ）。朝の長い影をさけて、影の向きが分かる 2.5 分め（SHADOW-1、オーナーの決定） */
export const START_DAY_TICK = 9000;

export function createTimeSettings(): TimeSettings {
  return {
    dayTicks: 54000,
    duskTicks: 5400,
    nightTicks: 27000,
    dawnTicks: 5400,
    nightBrightness: 0.25,
    nightDollBrightness: 0.75,
    yokaiLeaveTicks: 600,
  };
}

/** 空とかすみの色（M3 §3.2） */
export const SKY_COLORS = {
  day: 0x8fd3ff,
  dusk: 0xff9e6b,
  night: 0x1b2350,
  dawn: 0xffc48a,
} as const;
