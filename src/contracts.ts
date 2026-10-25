/**
 * つなぎ目の約束（M1）。PO が決める。型だけで、処理は書かない。
 * 並列で作業する開発者どうしは、このファイルの形だけを頼りにつながる。
 * 変えたいときは PO に相談する（勝手に変えない）。
 * 担当の割り振り: docs/tickets/M1-dev-split.md
 *
 * 中身は係ごとのファイルに分けてある（型は src/contracts/*.ts、実行時の値・関数は各係の場所）。
 * このファイルは再輸出だけを持つ。import 先はここのままでよい。
 */

export * from './contracts/world';
export * from './contracts/player';
export * from './contracts/items';
export * from './contracts/dig';
export * from './contracts/yokai';
export * from './contracts/craft';
export * from './contracts/storage';
export * from './contracts/achievements';
export * from './contracts/farm';
export * from './contracts/weapons';
export * from './contracts/animals';
export * from './contracts/animalsApi';

// WORLD_CENTER は どこからも import されていない（knip の「使われない export」が 二重に ならないよう、再輸出しない。本体は src/world/constants.ts）
export { SEA_Y, WORLD_HEIGHT, WORLD_SIZE, WORLD_LIMIT, CHUNK_SIZE, SECTION_SIZE } from './world/constants';
export { M6_SETTING_DEFAULTS, createM6Settings } from './achievements/m6Settings';
export { CROP_KINDS, CROP_BLOCK, WILD_BLOCK, SEED_ITEM, VEG_ITEM, cropKindOfBlock, seedKindOfItem, vegKindOfItem } from './farm/crops';
export { M7_SETTING_DEFAULTS, createM7Settings } from './farm/m7Settings';
export { LEGENDARY_DEFAULTS, cloneLegendary } from './combat/legendaryDefaults';
export { W2_SETTING_DEFAULTS, createW2Settings } from './combat/w2Settings';
export { CRAFT2_SETTING_DEFAULTS, createCraft2Settings } from './craft/craft2Settings';
export { LIVE_SETTING_DEFAULTS, createLiveSettings } from './animals/liveSettings';
