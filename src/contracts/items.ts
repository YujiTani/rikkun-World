/**
 * アイテム・持ち物・耐久・よろいの型。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { ArmorItemId, BowId, FarmBucketId, FarmToolId, GadgetId, GoldId, HouseToolId, IngotId, KongoId, LegendId, LiveItemId, MaterialId, NinjaId, OrbId, SamuraiId, SeedItemId, SwordId, ToolItemId, VegItemId } from '../content/items/ids';
import type { BlockId } from './world';

// ================================================================ M2（掘る・置く・持ち物）
// 担当の割り振り: docs/tickets/M2-dev-split.md。仕様: docs/design/M2-dig-inventory.md

/**
 * アイテムだけのもの（置けない）。M3 で妖怪のドロップを足した（オーナー決定）。M4 で道具を足す。
 * yokai_orb は M3 第 1 版の名残り（使わなくなったが、型を壊さないため残す）
 */
export type ItemOnlyId =
  // ようかいだま（M3 第 1 版の 名残り）・ざいりょう 6（かみ・あぶら・いと・ぬの・ねんど・すいしょう）・てつの かたまり・小物 6（ちょうちん・たこ・ふとん・おまもり・わらじ・はにわ）の id は content/items/ids.ts の 1 か所（#306）
  | OrbId
  | MaterialId
  // M4（docs/design/M4-craft.md §4.4）
  // 道具（つるはし 3・おの 3）・刀 4・ゆみ・や・防具 4 の id は content/items/ids.ts の 1 か所（#306）
  | ToolItemId
  | SwordId
  | BowId
  | ArmorItemId
  | IngotId
  // NINJA-1（#299）・SAMURAI-1（#300）: 忍者装備 4 つ・侍装備 4 つの id は content/items/ids.ts の 1 か所（#306）
  | NinjaId
  | SamuraiId
  | 'torch'
  | GadgetId
  // M7・M7-2・BUCKET-1: たね 4・やさい 4・くわ・じょうろ 2・バケツ 2 の id は content/items/ids.ts の 1 か所（#306）。スプリンクラーは ブロック
  | SeedItemId
  | VegItemId
  | FarmToolId
  | FarmBucketId
  // LIVE-1〜3: たまご・むし・むしとりあみ・とりごや・きんの たまご・もも にく 2 つの id は content/items/ids.ts の 1 か所（#306）。こたつ（nukunuku）は ブロック
  | LiveItemId
  // WEAPON-7/8/9（うしろに足す）: レジェンダリー 3 つ（雷神剣・風神剣・虹）の id は content/items/ids.ts の 1 か所（#306）
  | LegendId
  // GOLD-1（#222）: 金シリーズの id は content/items/ids.ts の 1 か所（#306）
  | GoldId
  // HOUSE-1A（#338）: みずもり・どうづき の id は content/items/ids.ts の 1 か所（#306）
  | HouseToolId
  // KONGO-1: こんごうシリーズ（ダイヤ・こんごうの そうび 8 こ）の id は content/items/ids.ts の 1 か所
  | KongoId;

/** アイテムの種類。ブロックとアイテムだけのもの */
export type ItemId = BlockId | ItemOnlyId;

export interface ItemStack {
  item: ItemId;
  count: number;
  /** WEAPON-2: へった たいきゅう（0 か なし = 新品）。たいきゅうで へる 道具だけが 持つ（上限 1）。前の保存には 無い = 新品 */
  wear?: number;
  /** M7-2: じょうろ の みず の 量（1〜入る回数。なし・0 = からっぽ）。じょうろ 2 しゅるい だけが 持つ */
  water?: number;
  /** WEAPON-9: 虹の 強さ（4〜10。1 本ごとに 保存）。虹だけが 持つ。なし = 7 */
  power?: number;
}

export interface ItemType {
  id: ItemId;
  /** ひらがな */
  name: string;
  maxStack: number;
  /** 置くと何のブロックになるか。置けないものは null */
  placeBlock: BlockId | null;
}

/** 持ち物（36 マス。0〜8 がホットバー）。担当 AB が `src/inventory/` で実装する */
export interface Inventory {
  readonly size: number;
  slots(): ReadonlyArray<ItemStack | null>;
  selected(): number;
  select(index: number): void;
  /** ホットバーのとなりへ（ぐるっと回る） */
  selectNext(dir: 1 | -1): void;
  setSlot(index: number, stack: ItemStack | null): void;
  clear(): void;
  /** 入らなかった数を返す */
  add(item: ItemId, count: number, opts?: { power?: number }): number;
  count(item: ItemId): number;
  /** 取り出せた数を返す */
  remove(item: ItemId, count: number): number;
  /** 1 こでも入るか */
  canAdd(item: ItemId): boolean;
  /** 今えらんでいるマス（手に持っているもの） */
  held(): ItemStack | null;
  /** 手に持っているマスから 1 こ減らす。減らせたら true */
  consumeHeld(): boolean;
  /**
   * WEAPON-2: 手に持っている道具の たいきゅうを n へらす（n ≧ 1）。たいきゅうで へる 道具でなければ null（何もしない）。
   * 0 になったら そのステップで マスを 空にして `toolBreak` を出す（その 1 回は ふつうに 効く。呼ぶ側は 先に 効かせてから 呼ぶ）
   */
  wearHeld(n: number): WearResult | null;
  /** WEAPON-2: マス slot の たいきゅうを n へらす（`wearHeld` と 同じ） */
  wearSlot(slot: number, n: number): WearResult | null;
  /** WEAPON-2: マス slot の たいきゅう（たいきゅうで へる 道具でなければ null） */
  durability(slot: number): Durability | null;
  /** WEAPON-2: `wearLow` / `toolBreak`（呼ぶと空になる。画面と音用） */
  drainWearEvents(): WearEvent[];
  /** WEAPON-2: テストの窓口用（読んでも空にならない） */
  peekWearEvents(): WearEvent[];
  /** もちもの画面でのクリック（M2 §2.5） */
  click(index: number): void;
  cursor(): ItemStack | null;
  /** 閉じるとき、カーソルのものを「持ち上げたマス」へ戻す */
  returnCursor(): void;
  itemTypes(): ItemType[];
  serialize(): unknown;
  deserialize(data: unknown): void;
  /** 中身が変わったら呼ばれる。戻り値で解除 */
  onChange(fn: () => void): () => void;
}

/** ダメージの種類: normal（かみつき・ふみつけ・たいあたり・たおれこみ・首）・ball（玉）・fall（落下） */
export type DamageKind = 'normal' | 'ball' | 'fall';

/** そうびの部位: あたま（かぶと）・からだ（よろい）・うで（こて）・あし（すねあて） */
export type ArmorSlot = 'head' | 'body' | 'arms' | 'legs';

/** 防具。担当 A が `src/craft/`（または `src/armor/`）で実装する */
export interface ArmorSystem {
  equipped(slot: ArmorSlot): ItemId | null;
  /** 着られるアイテムなら着る（手に持っているものを着る・入れかえ）。着たら true */
  tryEquip(item: ItemId): boolean;
  /**
   * 妖怪の攻撃を受けた。カットする量（体力の単位。ハート半分 = 1）を返す。受けるダメージ = max(1, 元 − カット)。
   * WEAPON-2: `amount` = 元の ダメージ。カットを **先に** 決めて 返し、**その あと** その 種類を ふせぐ 防具の たいきゅうを
   * `max(1, 切り捨て(amount ÷ armorDiv))` へらす（`amount` が 無い 古い 呼び方は へらさない）
   */
  cut(kind?: DamageKind, amount?: number): number;
  /** WEAPON-2: 着ている 防具を へった 量つきで（なければ null） */
  equippedStack(slot: ArmorSlot): ItemStack | null;
  /** WEAPON-2: 着ている 防具の たいきゅう（なければ null） */
  durability(slot: ArmorSlot): Durability | null;
  /** WEAPON-2: `wearLow` / `toolBreak`（`slot` は ArmorSlot。呼ぶと空になる） */
  drainWearEvents(): WearEvent[];
  peekWearEvents(): WearEvent[];
}

// ---------------------------------------------------------------- たいきゅう（F）

/** 3 つの なかま（§4.6 (1)）: つかうと なくなる・たいきゅうで へる・ずっと へらない */
export type ItemClass = 'consumable' | 'durable' | 'permanent';

/** たいきゅう（max = 新品の 値、left = 今の のこり。left = max − wear） */
export interface Durability {
  max: number;
  left: number;
}

/** `wearHeld` / `wearSlot` の 答え（へらした あと の 様子） */
export interface WearResult extends Durability {
  /** このとき 本当に へった 量（のこりより 多く 頼まれても のこり まで） */
  worn: number;
  /** 0 になって こわれた（マスは 空になった） */
  broke: boolean;
  /** このとき はじめて のこり わずか（`wearLowRatio` 以下）に 入った */
  low: boolean;
}

/** たいきゅうの 出来事（持ち物と 防具が 出す。`slot` は 持ち物の マス番号 か 防具の 部位） */
export type WearEvent =
  | { type: 'wearLow'; tick: number; item: ItemId; slot: number | ArmorSlot }
  | { type: 'toolBreak'; tick: number; item: ItemId; slot: number | ArmorSlot };
