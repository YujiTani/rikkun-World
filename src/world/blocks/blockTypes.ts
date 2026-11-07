import type { BlockId, BlockType } from '../../contracts';
import { KATAME_TSUCHI, SCAFFOLD_IDS } from './buildBlocks';
import { CHALK_MARK_IDS, isChalkMarkId } from './chalkMark';
import { CHEST_BLOCK_IDS, chestBlockInfo, chestBlockName } from './chestBlock';
import { FURNITURE } from '../../house/editor/furniture';
import { FLAT_FURN_KINDS, HOUSE_DOOR_PART_IDS, NEW_FURN_BLOCK_IDS, furnInfo } from './houseBlocks';
import { isLiquidIndex } from './liquids';
import { isFloorDeco } from './mineBoken';
import { MAGMA_IDS, MAGMA_M0, MAGMA_RESERVED_IDS } from './magma';
import { BLOCKS_BEFORE_WATER, RESERVED_AFTER_ID, RESERVED_BEFORE_IDS, WATER_FULL_INDEX, WATER_PARTIAL_IDS, WATER_W0 } from './water';

/** M1-01 4-2 のブロック 11 種 + M4 の 3 種。配列の順番が内部の番号（air = 0） */
export const BLOCK_TYPES: readonly BlockType[] = [
  { id: 'air', name: 'くうき', solid: false, breakable: false },
  { id: 'grass', name: 'くさ', solid: true, breakable: true },
  { id: 'dirt', name: 'つち', solid: true, breakable: true },
  { id: 'stone', name: 'いし', solid: true, breakable: true },
  { id: 'sand', name: 'すな', solid: true, breakable: true },
  { id: 'log', name: 'き', solid: true, breakable: true },
  { id: 'leaves', name: 'はっぱ', solid: true, breakable: true },
  { id: 'coal_ore', name: 'せきたん', solid: true, breakable: true },
  { id: 'iron_ore', name: 'てつ', solid: true, breakable: true },
  { id: 'water', name: 'みず', solid: false, breakable: false },
  { id: 'bedrock', name: 'そこいし', solid: true, breakable: false },
  // M4（番号は後ろに足す。保存データの番号を変えないため）
  { id: 'furnace', name: 'かまど', solid: true, breakable: true },
  { id: 'kawara', name: 'かわら', solid: true, breakable: true },
  { id: 'brick', name: 'レンガ', solid: true, breakable: true },
  // M4 光
  { id: 'torch', name: 'たいまつ', solid: false, breakable: true },
  { id: 'start_torch', name: 'こわれない たいまつ', solid: false, breakable: false },
  // M6
  { id: 'tansu', name: 'たんす', solid: true, breakable: true },
  // M7（番号は後ろに足す。作物の段階は id に入れない）
  { id: 'farmland', name: 'はたけ', solid: true, breakable: true },
  { id: 'farmland_wet', name: 'はたけ', solid: true, breakable: true },
  { id: 'crop_onion', name: 'たまねぎ', solid: false, breakable: false },
  { id: 'crop_tomato', name: 'トマト', solid: false, breakable: false },
  { id: 'crop_pumpkin', name: 'かぼちゃ', solid: false, breakable: false },
  { id: 'crop_eggplant', name: 'なす', solid: false, breakable: false },
  { id: 'wild_onion', name: 'やせいの たまねぎ', solid: false, breakable: false },
  { id: 'wild_tomato', name: 'やせいの トマト', solid: false, breakable: false },
  { id: 'wild_pumpkin', name: 'やせいの かぼちゃ', solid: false, breakable: false },
  { id: 'wild_eggplant', name: 'やせいの なす', solid: false, breakable: false },
  { id: 'kakashi', name: 'かかし', solid: false, breakable: false },
  { id: 'kakashi_head', name: 'かかし', solid: false, breakable: false },
  { id: 'saku', name: 'さく', solid: false, breakable: true },
  { id: 'sprinkler', name: 'スプリンクラー', solid: true, breakable: true },
  // VOX-I-1（12 の国。番号は後ろに足す）
  { id: 'snow', name: 'ゆき', solid: true, breakable: true },
  { id: 'momiji_leaves', name: 'もみじの はっぱ', solid: true, breakable: true },
  { id: 'matsu_leaves', name: 'まつの はっぱ', solid: true, breakable: true },
  { id: 'flower_y', name: 'はな', solid: false, breakable: true },
  { id: 'flower_o', name: 'はな', solid: false, breakable: true },
  { id: 'flower_p', name: 'はな', solid: false, breakable: true },
  { id: 'bamboo', name: 'たけ', solid: true, breakable: true },
  { id: 'susuki', name: 'すすき', solid: false, breakable: true },
  { id: 'kusa', name: 'くさ', solid: false, breakable: true },
  { id: 'nobana', name: 'のばな', solid: false, breakable: true },
  // LIVE-2（名前 は 画面 の 呼び名。こたつ は ブロック と アイテム の id が `nukunuku`。小屋 の 4 ブロック は 持ち物 に 入らない）
  { id: 'nukunuku', name: 'こたつ', solid: true, breakable: true },
  { id: 'toriya_fence', name: 'とりごや', solid: true, breakable: true },
  { id: 'toriya_gate', name: 'とりごや', solid: false, breakable: true },
  { id: 'toriya_nest', name: 'とりごや', solid: true, breakable: true },
  { id: 'toriya_box', name: 'とりごや', solid: true, breakable: true },
  // こたつ 2×2 の のこり 3 マス（本体 は かど の `nukunuku`）
  { id: 'nukunuku_e', name: 'こたつ', solid: true, breakable: true },
  { id: 'nukunuku_s', name: 'こたつ', solid: true, breakable: true },
  { id: 'nukunuku_se', name: 'こたつ', solid: true, breakable: true },
  // #293 試作（番号は後ろに足す）
  { id: 'geyser_dirt', name: 'かんけつせんの つち', solid: true, breakable: true },
  // ITEM-FX-1（#342。番号は後ろに足す）。固くない置き物（箱の組み合わせで描く）
  { id: 'lantern', name: 'ちょうちん', solid: false, breakable: true },
  { id: 'futon', name: 'ふとん', solid: false, breakable: true },
  { id: 'haniwa', name: 'はにわ', solid: false, breakable: true },
  // ふとん 2 マスの のこり 7 つ（番号は後ろに足す）
  { id: 'futon_s', name: 'ふとん', solid: false, breakable: true },
  { id: 'futon_w', name: 'ふとん', solid: false, breakable: true },
  { id: 'futon_n', name: 'ふとん', solid: false, breakable: true },
  { id: 'futon_foot_e', name: 'ふとん', solid: false, breakable: true },
  { id: 'futon_foot_s', name: 'ふとん', solid: false, breakable: true },
  { id: 'futon_foot_w', name: 'ふとん', solid: false, breakable: true },
  { id: 'futon_foot_n', name: 'ふとん', solid: false, breakable: true },
  // MINE-1B（#349。番号は後ろに足す）
  { id: 'nendo', name: 'ねんど', solid: true, breakable: true },
  { id: 'sekkaiseki', name: 'せっかいせき', solid: true, breakable: true },
  { id: 'shikkui', name: 'しっくい', solid: true, breakable: true },
  { id: 'hotaruishi', name: 'ほたるいし', solid: true, breakable: true },
  { id: 'kin_ore', name: 'きんの いし', solid: true, breakable: true },
  { id: 'suisho_ore', name: 'すいしょうの いし', solid: true, breakable: true },
  { id: 'diamond_ore', name: 'ダイヤの いし', solid: true, breakable: true },
  // チョークの しるし 12 こ（面 × 向き。固くない。名前は ぜんぶ 同じ。`chalkMark.ts`）
  ...CHALK_MARK_IDS.map((id): BlockType => ({ id, name: 'チョークの しるし', solid: false, breakable: true })),
  // HOUSE-1C PR-1（#340。番号は 後ろに 足す）: 家の ブロック 5 つ（ゆか・かべ・やね・しょうじは 固い。戸は しまって いる ときだけ 固い〔`solid` は しまった 形。あけた 戸は 世界側で 通す〕）
  { id: 'house_floor', name: 'いえの ゆか', solid: true, breakable: true },
  { id: 'house_wall', name: 'いえの かべ', solid: true, breakable: true },
  { id: 'house_roof', name: 'いえの やね', solid: true, breakable: true },
  { id: 'shoji', name: 'しょうじ', solid: true, breakable: true },
  { id: 'house_door', name: 'いえの と', solid: true, breakable: true },
  // 戸の のこり 3 マス（上の 半分・あけた 下・あけた 上）。あけた 戸は 通れる
  ...HOUSE_DOOR_PART_IDS.map((id): BlockType => ({ id, name: 'いえの と', solid: !id.includes('open'), breakable: true })),
  // 向きの ある 家具（向き × マス。今の `tansu`・`furnace` は 向き 0 の ひとつ め）。動かない 机・いす・たなは 固い。あんどん・まるいすも 固い（ぶつかる）
  ...NEW_FURN_BLOCK_IDS.map((id): BlockType => ({ id, name: FURNITURE[furnInfo(id)!.kind].name, solid: true, breakable: true })),
  // HOUSE-1C PR-2（#340。番号は 後ろに 足す）: かためた つち（ふつうに ほれる）と 足場 5 つ（建築中の 場所だけ。固い・ほれない・アイテムに ならない）
  { id: KATAME_TSUCHI, name: 'かためた つち', solid: true, breakable: true },
  ...SCAFFOLD_IDS.map((id): BlockType => ({ id, name: 'あしば', solid: true, breakable: false })),
  // WATER-1（#376。番号は 後ろに 足す）: 空きの 予約 → 量 1〜7 の 水（W0 = 152 から）→ W0 + 7 の 予約。次の ブロックは W0 + 8 から
  ...RESERVED_BEFORE_IDS.map((id): BlockType => ({ id, name: 'くうき', solid: false, breakable: false })),
  ...WATER_PARTIAL_IDS.map((id): BlockType => ({ id, name: 'みず', solid: false, breakable: false })),
  { id: RESERVED_AFTER_ID, name: 'くうき', solid: false, breakable: false },
  // ROPE-1（番号は 後ろに 足す。W0 + 8）: ロープ。固くない・十字の 板で 描く・つかまって のぼれる（player/climb.ts）
  { id: 'rope', name: 'ロープ', solid: false, breakable: true },
  { id: 'rope_coil', name: 'ロープだまり', solid: false, breakable: true },
  { id: 'rope_stake', name: 'ロープの くい', solid: false, breakable: true }, // ROPE-1 版 3（番号は 後ろに 足す）
  { id: 'rope_fence', name: 'ロープの さく', solid: true, breakable: true }, // ROPE-1 版 3: 当たりは 1 マスの ブロック（とりごやの さくと 同じ）。版 5: くいの 間の よこに はった なわ
  { id: 'rope_fence_post', name: 'ロープの さくの くい', solid: true, breakable: true }, // ROPE-1 版 5: さくの はし・かど（くいと 同じ 絵）
  // WATERFALL-1（番号は 後ろに 足す。165〜168）: わきどころ・たきつぼ・こくようせき・マグマの わきどころ
  { id: 'wakimizu', name: 'わきどころ', solid: true, breakable: true },
  { id: 'takitsubo', name: 'たきつぼ', solid: true, breakable: true },
  { id: 'kokuyouseki', name: 'こくようせき', solid: true, breakable: true },
  { id: 'magma_wakimizu', name: 'マグマの わきどころ', solid: true, breakable: true },
  // WATERFALL-1: 予約（169〜175。M0 を 8 の 倍数に そろえる）→ 量 1〜8 の マグマ（M0 = 176 から。固くない・こわれない）
  ...MAGMA_RESERVED_IDS.map((id): BlockType => ({ id, name: 'くうき', solid: false, breakable: false })),
  ...MAGMA_IDS.map((id): BlockType => ({ id, name: 'マグマ', solid: false, breakable: false })),
  // WATERFALL-1 版 2（番号は 後ろに 足す。184）: マグマに 焼かれた ブロック
  { id: 'kogeta', name: 'こげた ブロック', solid: true, breakable: true },
  // WAKIDOKORO（番号は 後ろに 足す。185）: マグマの たきつぼ
  { id: 'magma_takitsubo', name: 'マグマの たきつぼ', solid: true, breakable: true },
  // MINE-1C（#350。番号は 後ろに 足す。186〜）: 坑道の わく（ほれる）・宝箱 16 こ（固い・ほっても こわれない。2 マス。`chestBlock.ts`）
  { id: 'kodo_waku', name: 'こうどうの わく', solid: true, breakable: true },
  ...CHEST_BLOCK_IDS.map((id): BlockType => ({ id, name: chestBlockName(chestBlockInfo(id)!.tier, chestBlockInfo(id)!.open), solid: true, breakable: false })),
  // MINE-1D（#351。番号は 後ろに 足す。203）: つらら。固くない（体が 通る）・光を 通す・十字の 板で 描く（絵は tsuraraTexture.ts）
  { id: 'tsurara', name: 'つらら', solid: false, breakable: true },
  // MINE-1E（番号は 後ろに 足す。204〜211）: 坑道の 冒険。ひびの いし・くずれた いし・こわれた わくは 固い。レール・はしご・たきびの あとは 固くない（体が 通る）
  { id: 'hibi_ishi', name: 'ひびの いし', solid: true, breakable: true },
  { id: 'kuzure_ishi', name: 'くずれた いし', solid: true, breakable: true },
  { id: 'furui_rail_x', name: 'ふるい レール', solid: false, breakable: true },
  { id: 'furui_rail_z', name: 'ふるい レール', solid: false, breakable: true },
  { id: 'kowareta_waku', name: 'こわれた わく', solid: true, breakable: true },
  { id: 'taoreta_hashigo_x', name: 'たおれた はしご', solid: false, breakable: true },
  { id: 'taoreta_hashigo_z', name: 'たおれた はしご', solid: false, breakable: true },
  { id: 'takibi_ato', name: 'たきびの あと', solid: false, breakable: true },
];

export const BLOCK_INDEX: Readonly<Record<BlockId, number>> = Object.fromEntries(
  BLOCK_TYPES.map((t, i) => [t.id, i]),
) as Record<BlockId, number>;

export const AIR = BLOCK_INDEX.air;
export const WATER = BLOCK_INDEX.water;
// 水の 番号の 約束（water.ts）が 並びと ずれて いないか 起動時に 確かめる
if (BLOCK_INDEX.water !== WATER_FULL_INDEX || BLOCK_INDEX.water_1 !== WATER_W0 || BLOCK_INDEX.reserved_147 !== BLOCKS_BEFORE_WATER) {
  throw new Error('water block index mismatch (WATER-1 §4.6)');
}
// マグマの 番号の 約束（magma.ts）も 同じく 確かめる
if (BLOCK_INDEX.magma_1 !== MAGMA_M0 || BLOCK_INDEX.magma !== MAGMA_M0 + 7 || BLOCK_TYPES.length < MAGMA_M0 + 8) {
  throw new Error('magma block index mismatch (WATERFALL-1 §4)');
}
export const TORCH = BLOCK_INDEX.torch;
export const START_TORCH = BLOCK_INDEX.start_torch;
export const SPRINKLER = BLOCK_INDEX.sprinkler;
export const LANTERN = BLOCK_INDEX.lantern;
export const HOTARUISHI = BLOCK_INDEX.hotaruishi;
export const SHOJI = BLOCK_INDEX.shoji;

/** たいまつの なかまか（細い棒＋炎の形で描く。光る） */
export function isTorchIndex(index: number): boolean {
  return index === TORCH || index === START_TORCH;
}

/** 小物の置き物（ITEM-FX-1: ちょうちん・ふとん・はにわ）。固くない・光を通す・箱の組み合わせで描く（絵は meshChunk の pushProp） */
const PROP_IDS: ReadonlySet<string> = new Set([
  'lantern', 'futon', 'futon_s', 'futon_w', 'futon_n', 'futon_foot_e', 'futon_foot_s', 'futon_foot_w', 'futon_foot_n', 'haniwa',
  // HOUSE-1C: しょうじ・戸（あけしめ 4 つ）・新しい 家具 8 しゅるい。固いが 光を 通す（箱の 形で 描く）。かべ・ゆか・やね・たんす・かまどは 平らな 箱
  'shoji', 'house_door', ...HOUSE_DOOR_PART_IDS,
  ...NEW_FURN_BLOCK_IDS.filter((id) => !FLAT_FURN_KINDS.has(furnInfo(id)!.kind)),
  // HOUSE-1C PR-2: 足場（固いが 光を 通す。細い 箱で 描く）
  ...SCAFFOLD_IDS,
]);
const PROP = BLOCK_TYPES.map((t) => PROP_IDS.has(t.id));
export function isPropIndex(index: number): boolean {
  return PROP[index] === true;
}

export function blockIdFromIndex(index: number): BlockId {
  return BLOCK_TYPES[index].id;
}

/** 知らない id なら -1 */
export function blockIndexOf(id: string): number {
  const i = (BLOCK_INDEX as Record<string, number | undefined>)[id];
  return i === undefined ? -1 : i;
}

const CROSS_IDS: ReadonlySet<string> = new Set([
  'crop_onion', 'crop_tomato', 'crop_pumpkin', 'crop_eggplant',
  'wild_onion', 'wild_tomato', 'wild_pumpkin', 'wild_eggplant',
  'kakashi', 'kakashi_head', 'saku',
  'toriya_fence', 'toriya_gate', // LIVE-2.1: とりごや の さく・もん（当たり は 今 の まま ブロック）
  'flower_y', 'flower_o', 'flower_p', 'susuki', 'kusa', 'nobana',
  'rope', 'rope_coil', 'rope_stake', 'rope_fence', 'rope_fence_post', // ROPE-1: ロープ（たてに たれる なわ）・ロープだまり（下の まき）
  'tsurara', // MINE-1D: つらら（天井の 下に さがる 十字の 板。ゆれない = swayDriver が のぞく）
]);
const CROSS = BLOCK_TYPES.map((t) => CROSS_IDS.has(t.id));
/** 十字の板で描くブロックか（作物・やせいの やさい・かかし・さく）。固くない・光を通す・まわりの面を隠さない */
export function isCrossIndex(index: number): boolean {
  return CROSS[index] === true;
}
/** みのった作物・やせいの やさい（少し光る。明るさの下限） */
const WILD_IDS: ReadonlySet<string> = new Set(['wild_onion', 'wild_tomato', 'wild_pumpkin', 'wild_eggplant']);
export function isWildIndex(index: number): boolean {
  return WILD_IDS.has(BLOCK_TYPES[index]?.id);
}

/** はっぱの なかま（はっぱ・もみじの はっぱ・まつの はっぱ。光を 1 弱める・屋根にならない・上に乗れない 床にならない） */
const LEAF_IDS: ReadonlySet<string> = new Set(['leaves', 'momiji_leaves', 'matsu_leaves']);
export function isLeafId(id: string): boolean {
  return LEAF_IDS.has(id);
}
export function isLeafIndex(index: number): boolean {
  return LEAF_IDS.has(BLOCK_TYPES[index]?.id);
}

/** チョークの しるし（MINE-1B）か。面に はる 薄い 板で 描く（絵は sectionExtras の pushChalk）。固くない・光を通す・まわりの面を隠さない */
const CHALK = BLOCK_TYPES.map((t) => isChalkMarkId(t.id));
export function isChalkIndex(index: number): boolean {
  return CHALK[index] === true;
}

/** つらら（MINE-1D）か。十字の 板の なかま（isCrossIndex も true）で、ゆれない 所だけ これで 分ける */
const TSURARA = BLOCK_TYPES.map((t) => t.id === 'tsurara');
export function isTsuraraIndex(index: number): boolean {
  return TSURARA[index] === true;
}

/** 床の 飾り（MINE-1E。ふるい レール・たおれた はしご・たきびの あと）か。ひくい 小ブロックの 形で 描く。固くない・光を通す・まわりの面を隠さない・遠くでは 描かない */
const FLOOR_DECO = BLOCK_TYPES.map((t) => isFloorDeco(t.id));
export function isFloorDecoIndex(index: number): boolean {
  return FLOOR_DECO[index] === true;
}

/** 色のついた不透明ブロックか（面を描く・隠す判定に使う）。水・空気・十字の板・しるし・床の 飾りはちがう */
export function isOpaqueIndex(index: number): boolean {
  return index !== AIR && !isLiquidIndex(index) && !isTorchIndex(index) && !isCrossIndex(index) && !isPropIndex(index) && !isChalkIndex(index) && !isFloorDecoIndex(index);
}

/** 固いブロックか（番号で） */
export function isSolidIndex(index: number): boolean {
  return BLOCK_TYPES[index].solid;
}
