/**
 * 保存の版 1 / ids なしの保険 / VOX-F より前の localStorage の保存が使っていた、ブロックの番号 → id の表（SAVE-30）。
 * 当時の BLOCK_TYPES の並びを文字で書き写して凍らせた物。BLOCK_TYPES から作らない（作ると並びかえで保存が化ける）。
 * 変えてはいけない。ブロックをゲームから消すときも、ここは消さない（読むとき「知らない id」になる）。
 */
export const BLOCK_IDS_V1: readonly string[] = [
  'air',
  'grass',
  'dirt',
  'stone',
  'sand',
  'log',
  'leaves',
  'coal_ore',
  'iron_ore',
  'water',
  'bedrock',
  'furnace',
  'kawara',
  'brick',
  'torch',
  'start_torch',
  'tansu',
  'farmland',
  'farmland_wet',
  'crop_onion',
  'crop_tomato',
  'crop_pumpkin',
  'crop_eggplant',
  'wild_onion',
  'wild_tomato',
  'wild_pumpkin',
  'wild_eggplant',
  'kakashi',
  'kakashi_head',
  'saku',
  'sprinkler',
];
