/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 §3.7 (g)・§12.0）: 2 人の とき 半分ごとに 出す 12 の 部品の 名前と 目印（data-testid）。
 * 葉の ファイル（何も import しない）。各部品の class（clock.ts・titleAnnounce.ts など）が `halfId` を 使う ので、
 * ui/duoHalves.ts〈その 部品たちを 作る 側〉から 離して ある（import の 輪を 作らない）。
 */

/** 半分に 出す 部品（洗い出し #13〜#22・#22a・#22b） */
export type HalfKey =
  | 'titleAnnounce' // #13 たいしょう・ヌシの 世界の おしらせ
  | 'homeNotice' // #14 復活の おしらせ
  | 'damageEdge' // #15 ダメージの ふち
  | 'death' // #16 倒れた 画面
  | 'clock' // #17 時計
  | 'band' // #18 実績の 帯・テロップ・家の 名前
  | 'banner' // #19 はじめて つくった 横断幕（1P の 半分だけ）
  | 'hudNotice' // #20 つくれる マーク
  | 'nameplate' // #21 妖怪の 名札
  | 'buffPlate' // #22 バフの 札
  | 'noticeName' // #22a えらんだ 名前
  | 'inkDim'; // #22b すみで 暗くなる 板

/** data-testid の もと。`halfId(key, who)` = `${DUO_HALF_ID[key]}-p${who}`（e2e/helpers/duoHalves.ts の 直書きと そろえる） */
export const DUO_HALF_ID = {
  titleAnnounce: 'duo-title-announce',
  homeNotice: 'duo-home-notice',
  damageEdge: 'duo-damage-edge',
  death: 'duo-death',
  clock: 'duo-clock',
  band: 'duo-cel-band',
  banner: 'duo-cel-banner',
  hudNotice: 'duo-hud-notice',
  nameplate: 'duo-yokai-plate',
  buffPlate: 'duo-buff-plate',
  noticeName: 'duo-notice-name',
  inkDim: 'duo-ink-dim',
} as const satisfies Record<HalfKey, string>;

/** その 半分の 部品の 目印（例 duo-clock-p2） */
export function halfId(key: HalfKey, who: 1 | 2): string {
  return `${DUO_HALF_ID[key]}-p${who}`;
}
