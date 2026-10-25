import type { ArmorSlot, BladeTrailStyle, BlockId, DamageKind, ItemId, LegendaryDef, Rarity } from '../../contracts';
import type { InfoRow } from '../../craft/info/table';
import type { ToolFamily } from '../../dig/toolFamily';
import type { ItemCategory } from '../../ui/itemCategory';

/**
 * アイテム 1 つの「全部の値」を 1 か所に書くための型（#306・ルール #304）。
 * 型だけを import する（実行時の import は 作らない = import の輪を 作らない）。
 * 書くのは シリーズごとのファイル（gold.ts など）。古い表（ITEM_TYPES・ITEM_INFO・TOOL_DEFAULTS…）は
 * registry.ts の「見せ方」から 作った分を 合わせて 読む。
 */
export interface ItemDef {
  /** 画面に出す名前（ひらがな。漢字は ［漢字｜よみ］。今の ITEM_TYPES の name） */
  name: string;
  /** 1 マスに 重ねられる数 */
  maxStack: number;
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
  /** 防具: 入る 部位・ふせぐ量（ダメージの種類ごと）・説明に出す 種類 */
  armor?: { slot: ArmorSlot; value: Readonly<Record<DamageKind, number>>; kind: DamageKind };
}
