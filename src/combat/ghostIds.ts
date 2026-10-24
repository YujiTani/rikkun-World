/**
 * 妖怪の 一覧(list)には 出ないで、線の 当たり(raycast)にだけ 出る「仮の id」の 決まり(1 か所)。
 * ダメージは YokaiWorld.damage への 割りこみで 受ける。向き決め(decideAttack)・パンチは GHOST_ID_MIN 以上を 仮の 妖怪として あつかう。
 */
/** 仮の id の 下限(これ以上は 本物の 妖怪の id では ない) */
export const GHOST_ID_MIN = 900_000_000;
/** がしゃどくろの 体の 箱: GHOST_BIG_BASE + 箱の 番号(gashaBigHit.ts) */
export const GHOST_BIG_BASE = GHOST_ID_MIN;
/** 噴火の 燃えかす: GHOST_EMBER_BASE + 燃えかすの 番号(gashaBig.ts) */
export const GHOST_EMBER_BASE = GHOST_ID_MIN + 10_000_000;
/** それぞれの 種類が 使う id の 幅 */
export const GHOST_ID_SPAN = 1_000_000;
