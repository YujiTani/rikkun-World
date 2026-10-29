import type { ArmorSlot, BladeTrailStyle, BlockId, DamageKind, ItemId, LegendaryDef, Rarity } from '../../contracts';
import type { InfoRow } from '../../craft/info/table';
import type { ToolFamily } from '../../dig/toolFamily';
import type { ItemCategory } from '../../ui/itemCategory';

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
