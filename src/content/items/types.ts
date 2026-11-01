import type { ArmorSlot, BladeTrailStyle, BlockId, DamageKind, ItemId, LegendaryDef, Rarity } from '../../contracts';
import type { InfoRow } from '../../craft/info/table';
import type { ToolFamily } from '../../dig/toolFamily';
import type { ItemCategory } from '../../ui/itemCategory';
import { CHALK_MARK_IDS } from '../../world/blocks/chalkMark';
import { KATAME_TSUCHI, SCAFFOLD_IDS } from '../../world/blocks/buildBlocks';
import { FURN_VARIANT_IDS, HOUSE_DOOR_PART_IDS } from '../../world/blocks/houseBlocks';
import { WATER_EXTRA_IDS } from '../../world/blocks/water';

/**
 * アイテムに ならない ブロック（持ち物に 入らない。みず・そこいし・作物・小屋の 部品 …）。
 * ItemId = BlockId | ItemOnlyId の うち、これ以外は ぜんぶ ItemDef が 必要（ITEM_DEFS は Record<ItemDefId, ItemDef>）。
 * 新しい BlockId を 足すと、ItemDef を 書くか ここに 足すか を 型エラーが 決めさせる。
 */
export const BLOCK_ONLY_IDS = [
  'air', 'water', 'bedrock', 'start_torch',
  'farmland', 'farmland_wet',
  'crop_onion', 'crop_tomato', 'crop_pumpkin', 'crop_eggplant',
  'wild_onion', 'wild_tomato', 'wild_pumpkin', 'wild_eggplant',
  'kakashi', 'kakashi_head', 'saku', 'susuki', 'kusa',
  'toriya_fence', 'toriya_gate', 'toriya_nest', 'toriya_box',
  'nukunuku_e', 'nukunuku_s', 'nukunuku_se',
  'futon_s', 'futon_w', 'futon_n', 'futon_foot_e', 'futon_foot_s', 'futon_foot_w', 'futon_foot_n',
  // MINE-1B（#349）: 持てない ブロック。ねんど（ほると ねんど `clay`）・すいしょうの いし（ほると `crystal`）・ダイヤの いし（ほると `diamond`）・チョークの しるし 12 こ
  'nendo', 'suisho_ore', 'diamond_ore',
  ...CHALK_MARK_IDS,
  // HOUSE-1C PR-1（#340）: 戸の のこり 3 マス・向きの ある 家具の 向き ちがい／2 つ目 いこうの マス（ほると 元の アイテム〔`tansu`・`table` …〕 1 こ）。向き 0 の 1 つ目〔`tansu`・`table` …〕は アイテムの id と 同じ ので ここには 入れない
  ...HOUSE_DOOR_PART_IDS,
  ...FURN_VARIANT_IDS,
  // HOUSE-1C PR-2（#340）: かためた つち（ほると つち `dirt` 1 こ。FARM_BREAK_DROP）・足場 5 つ（ほれない・置けない）
  KATAME_TSUCHI,
  ...SCAFFOLD_IDS,
  // WATER-1（#376）: 量 1〜7 の 水と 予約の 番号（アイテムに ならない）
  ...WATER_EXTRA_IDS,
] as const satisfies readonly BlockId[];
type BlockOnlyId = (typeof BLOCK_ONLY_IDS)[number];

/** ItemDef が 必要な id（= アイテム）。ITEM_TYPES の 全 id と 同じ 集まり */
export type ItemDefId = Exclude<ItemId, BlockOnlyId>;

/**
 * アイテム 1 つの「全部の値」を 1 か所に書くための型（#306・ルール #304）。
 * 型だけを import する（実行時の import は 作らない = import の輪を 作らない）。
 * 書くのは シリーズごとのファイル（gold.ts など）。窓口の 表（ITEM_TYPES・ITEM_INFO・TOOL_DEFAULTS…）は
 * registry.ts の「見せ方」が 登録表だけから 作る。
 */
export interface ItemDef {
  /** 画面に出す名前（ひらがな。漢字は ［漢字｜よみ］。今の ITEM_TYPES の name） */
  name: string;
  /** ずかんの「どんな もの」に 出す 読み物の 文。できる ことを 楽しく。内部の 数は 書かない。漢字は ［漢字｜よみ］ */
  zukan: string;
  /** 1 マスに 重ねられる数 */
  maxStack: number;
  /** 持ち物 全体で 持てる 数（なし = 制限なし。おまもり = 1。ITEM-FX-1） */
  maxOwned?: number;
  /** 置くと なるブロック（なし = 置けない） */
  placeBlock?: BlockId;
  /** めずらしさ（光の柱の色） */
  rarity: Rarity;
  /** マスの色分け */
  category: ItemCategory;
  /** 説明パネルの行（今の ITEM_INFO の行） */
  info?: InfoRow;
  /** ずかんの「てにいれかた」の 文（作り方・妖怪の ドロップ・ほる などの 自動の 文を 使わない 物だけ。例: 建築士さんが くれる） */
  source?: string;
  /**
   * ほると この アイテムが 出る「持てない ブロック」（MINE-1B。ねんど〔ブロック nendo〕→ clay・すいしょうの いし → crystal・ダイヤの いし → diamond）。
   * ずかんの「てにいれかた」に「〇〇〔ブロックの 名前〕 を ほる（△△ から）」を 足す。名前と 掘れる 段階は その ブロックから
   */
  dugFrom?: BlockId;
  /** たいきゅう: 数 = 新品の値（へる 道具） / 'permanent' = こわれない。なし = つかうと 1 こ へる */
  wear?: number | 'permanent';
  /** 作り方（作業台 'craft' / かまど 'furnace'）。count = 出来る数。works: false = 働きが あと */
  recipe?: {
    count: number;
    inputs: ReadonlyArray<readonly [ItemId, number]>;
    station?: 'craft' | 'furnace';
    works?: boolean;
  };
  /**
   * 刀（わざ・かまえ・刃の軌跡が ある 物）: 届く長さ・軌跡の 色。
   * `trailOnly: true` は 「軌跡だけ」の 物（なぎなた）: BLADE_ITEMS には 入らず BLADE_LIKE_ITEMS に 入る。届く長さ（reach）は 書かない（tool.reach を 使う）
   */
  blade?: { reach?: number; trail: Readonly<BladeTrailStyle>; trailOnly?: true };
  /** ゆみ: 段ごとの ダメージ [1 段, 2 段, 3 段] */
  bow?: { damage: readonly [number, number, number] };
  /**
   * 道具の数: ほる強さ・ほれるレベル・たたく強さ・とどく距離・当たるまでのステップ（書かない = 手と同じ）。
   * family = あう ブロックの なかま（おの = log・つるはし = stone。あわない ブロックは 強さが 半分）
   */
  tool?: { power?: number; level?: number; damage?: number; reach?: number; ticks?: number; family?: ToolFamily };
  /** レジェンダリー（ヌシが おとす 武器）: 強さ・ためわざ・こうげき時の 効果・ずっと 効く 力（LegendaryDef から item を 除いた もの） */
  legend?: Omit<LegendaryDef, 'item'>;
  /** じょうろ: 水の 入る 回数・いちどに まく はたけの マス数 */
  can?: { capacity: number; tiles: number };
  /** たべもの（やさい以外）: たべた ときに もどる 体力（2 = ハート 1 こ）。やさいの 回復量は 作物ごとの 設定 eatHeal */
  food?: { heal: number };
  /** 防具: 入る 部位・ふせぐ量（ダメージの種類ごと）・説明に出す 種類 */
  armor?: { slot: ArmorSlot; value: Readonly<Record<DamageKind, number>>; kind: DamageKind };
}
