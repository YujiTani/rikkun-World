import type { ItemId } from '../../contracts';

/**
 * 小物 6 つ（ITEM-FX-1・issue #342）の 数。戦闘・調整の数は この 1 つの表に（ルール #304）。
 * テストは 数字を 書かず、ここを 読む。約束は docs/tickets/ITEM-FX-1-contract.md。
 */
export const GADGET_TUNING = {
  lantern: {
    /** ブロックの 光の 強さ（0〜15）。たいまつ（14）より 強い。1 マス はなれる ごとに 1 弱まる */
    light: 15,
    /** マス。ちょうちんから この 中（水平も 上下も）は 妖怪が 湧かない（たいまつは 8 マス） */
    noSpawnRadius: 16,
  },
  kite: {
    /** マス。プレイヤーの 足もとから 上空の 高さ */
    height: 20,
    /** マス。たこが ゆらゆら 揺れる 大きさ（高さ・よこ。±） */
    sway: 0.5,
    /** ステップ（1/60 秒）。0 から 上空まで のぼる のに かかる 長さ（約 1.7 秒） */
    riseSteps: 100,
    /** ステップ。ゆらゆら 1 周の 長さ（約 2.6 秒） */
    swayPeriodSteps: 160,
    /** 度。たこが あがる 角度（地面から。プレイヤーの 向いている 前方へ ななめに。90 = 真上）。まえへの 水平の きょりは height ÷ tan(角度) */
    angleDeg: 55,
    /** 0〜1。プレイヤーが 動いた とき、1 ステップで たこが ついてくる 割合 */
    follow: 0.06,
  },
  futon: {
    /** ステップ（1/60 秒）。ねている 間の 長さ（約 5 秒 = ねる ジングルの 長さ）。この 間は 画面が 暗いまま 動けない。曲の おわりで 明るくなって ひるに なる */
    sleepSteps: 300,
    /** 倍。ねる ジングルの 音の 大きさ（もとの gain に かける。「ひろう」より 少し 大きい 程度） */
    jingleGainMul: 3.2,
    /** ステップ。真っ暗に なるまで（約 0.5 秒） */
    fadeInSteps: 30,
    /** ステップ。曲の おわりに 明るく なるまで（約 0.8 秒）。まんなかは 真っ暗のまま */
    fadeOutSteps: 48,
    /** ステップ。起きる 時刻（1 日の 中。0 = ひるの はじまり。空が しっかり 明るい）。あさ（ひので）まででは なく ひるまで すすむ = ねる ことの デメリット */
    wakeDayTick: 0,
    /** 秒。「よる に ねようね」が 出ている 長さ */
    noticeSeconds: 2,
  },
  omamori: {
    /** こ。持ち物 全体で 持てる 数 */
    maxOwned: 1,
  },
  waraji: {
    /** マス。はいている 間の ジャンプの 高さ（ふだんは 1.25）。1 段は こえられ、2 段は とどかない */
    jumpHeight: 1.5,
  },
} as const;

/** 小物の id（比べる側は ここを 読む。id の 文字を あちこちに 書かない。ルール #304） */
export const GADGET_ID = {
  lantern: 'lantern',
  kite: 'kite',
  futon: 'futon',
  /** おまもり（まもると omamoriTorn に かわる） */
  omamori: 'omamori',
  omamoriTorn: 'omamori_torn',
  waraji: 'waraji',
} as const satisfies Record<string, ItemId>;

/** はいている 足の 防具（なければ null）から ジャンプの 高さを きめる。waraji なら 表の 高さ、ほかは base */
export function jumpHeightWith(legs: ItemId | null, base: number): number {
  return legs === GADGET_ID.waraji ? GADGET_TUNING.waraji.jumpHeight : base;
}
