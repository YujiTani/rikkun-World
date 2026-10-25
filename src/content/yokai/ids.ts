/**
 * 妖怪の種類の「ひとつだけの出どころ」（#307・ルール #304）。
 * 種類の名前を文字で書くのは、ここ 1 回だけ。ほかのファイルは ここから型を作る
 * （contracts.ts の YokaiKind・yokai/index.ts の YokaiId・yokai/variants.ts の YokaiKindId は 別名）。
 * 葉のファイル（何も import しない）。scripts/content-ids.mjs も ここを 読む。
 * 並びは 昔からの 見本ページの 順（抽選の順 YOKAI_DRAW_ORDER とは 別もの）。
 */
export const YOKAI_IDS = ['karakasa', 'chochin', 'nurikabe', 'rokurokubi'] as const;
export type YokaiKind = (typeof YOKAI_IDS)[number];
