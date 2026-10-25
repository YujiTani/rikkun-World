# アイテムの登録表（#306a 設計メモ）

ルール #304「1 つのデータは 1 か所」をアイテムで実現するしくみ。段階 2 でしくみと金シリーズ、段階 3 で のこりのシリーズを 1 本ずつ移し、**全部うまった（#306 しあげ・2026-10-25）**。このメモの「形」以降は、全部うまった後の形で書いてある。

## 今の問題（2026-10-25 の調べ）

- アイテム 1 つの値が 15 か所以上に散らばる: `ITEM_TYPES`（名前・重ね数）、`ITEM_ONLY_RARITY`、`CATEGORY_ITEMS`、`ITEM_INFO`、`ARMOR_KIND`、`armorValue`、`ARMOR_SLOT_OF`、`toolDurability`・`PERMANENT`、`bladeReach`・`bladeTrail`・`bowDamageByItem`、`TOOL_DEFAULTS`、`TOOL_FAMILY`、`BLADE_ITEMS`、レシピ、絵（2D・手に持つ 3D）。
- id 全体を強制する表が 1 つもない（全部 `Partial`・`Set`・配列・`switch`）。足し忘れると「石の絵」「ふつう」「そざい」「説明なし」に黙って落ちる。

## 形

```
src/content/items/
  ids.ts       葉。シリーズごとの id の配列だけ（import なし）。id を文字で書くのはここ 1 回
  types.ts     ItemDef と部品の型
  gold.ts      金シリーズ: { kin_katana: {...}, ... } satisfies Record<GoldId, ItemDef>
  registry.ts  シリーズを並べる。ITEM_DEFS・itemDef(id)・部品を持つ id の集まり
```

### ids.ts

```ts
export const GOLD_IDS = ['kin', 'kin_katana', /* … */ 'harapan_mimizu'] as const;
export type GoldId = (typeof GOLD_IDS)[number];
```

- `contracts.ts` の `ItemOnlyId` から金の文字列を消し、`| GoldId` にする（`import type`）。`ItemId` の名前と意味は変えない（約 250 ファイルが使う）。
- `ui/itemArtGold.ts` の `GOLD_ITEMS`・`GoldItemId` はここから作る（同じ名前で再輸出してよい）。
- ブロック（`BlockId`）は段階 2 では動かさない。セーブは `BLOCK_IDS_V1` で守られている。

### ItemDef（共通の項目＋機能ごとの部品）

```ts
interface ItemDef {
  name: string;               // 今の ITEM_TYPES の name そのまま（ルビ記法も）
  maxStack: number;
  placeBlock?: BlockId;       // なし = 置けない（今の null）
  rarity: Rarity;
  category: ItemCategory;
  info?: InfoRow;             // 今の ITEM_INFO の行
  wear?: number | 'permanent';// toolDurability の値 / PERMANENT に入る
  recipe?: { count: number; inputs: readonly [ItemId, number][]; station?: 'craft' | 'furnace'; works?: boolean };
  // 部品（あるものだけ書く）
  blade?: { reach: number; trail: BladeTrailStyle; combo?: true };
  bow?: { damage: readonly [number, number, number] };
  tool?: { power?: number; level?: number; damage?: number; family?: ToolFamily };
  armor?: { slot: ArmorSlot; value: Record<DamageKind, number>; kind: 'normal' | 'ball' | 'fall' };
}
```

- 型の名前・項目名は実装で今のコードに合わせてよい。**値は今の表からそのまま写す**（丸めない・直さない）。
- `blade` を持つ id の集まりから `BLADE_ITEMS` を作る（なぎなたのように「刃の軌跡だけ」の物は `blade` の中の印で分ける。今の `BLADE_ITEMS`・`BLADE_LIKE_ITEMS`・`bladeTrail` の 3 つの中身が 1 つも変わらないこと）。
- 戦闘の数（強さ・届く長さ・耐久）は、そのアイテムの行に日本語の単位つきコメントで書く。これが「その武器の数の 1 か所」になる（yuzu「値を変えるだけで調整」）。武器どうしを横に並べて見たいときは写し JSON（`src/content/__snapshots__/content.json`）を見る。

### registry.ts と「見せ方」

- `ITEM_DEFS: Readonly<Record<ItemDefId, ItemDef>>`（**全件を型で強制**）と `itemDef(id)`（文字列で引く窓口。ないものは undefined）。
  - `ItemDefId` = `ItemId` から「アイテムにならないブロック」（`BLOCK_ONLY_IDS`: みず・そこいし・作物・小屋の部品など 26 個。`content/items/types.ts`）を除いたもの。`ItemId` は `BlockId | ItemOnlyId` なので、**新しい `BlockId` を足すと「`ItemDef` を書く」か「`BLOCK_ONLY_IDS` に足す」かを型エラーが決めさせる**。新しい `ItemOnlyId`（ids.ts）も `ItemDef` がないと型エラー。
  - シリーズ（`gold.ts` など）は `satisfies Record<…Id, ItemDef>` で書き（置けるブロックでもある物＝`blocks.ts`・スプリンクラー・こたつは `Partial<Record<BlockId, ItemDef>>`。抜けは `ITEM_DEFS` の型が捕まえる）、`ITEM_DEFS` はそれを並べる（並びは `BLADE_ITEMS` などの順になるので変えない）。同じ id が 2 つのシリーズにあると後の物が勝つので、`registry.test.ts` が「シリーズの数の合計 = `ITEM_DEFS` の数」で落とす。
- 窓口の関数・表（`itemRarity`・`itemCategory`・`ITEM_TYPES`・`TOOL_DEFAULTS`・`W2` の初期値・`armorValue`・`ITEM_INFO`・`CRAFT_RECIPES`…）は **名前も使い方も変えず**、中身を登録表だけから作る（古い表は無い。`withRegistry`・`noteDuplicates`・`REGISTRY_OVERLAPS` は外した）。読む側のファイルは触らない。
- 設定フック（`ITEM_RARITY_SETTINGS`・`toolConfig`・`craftConfig`・`w2`）の上書きは今どおり効く。登録表は「初期値の出どころ」で、初期値は登録表から**複製**して作る（同じ物を共有しない）。上書きはその後。
- 並びは変えない: `ITEM_TYPES`（`inventory/items.ts`）・`CRAFT_RECIPES`／`BAKE_RECIPES`（`craft/recipes.ts`）・色分け（`ui/itemCategory.ts` の `ORDER_ITEMS`）は、シリーズ単位の `*_DEFS` をどの順に入れるかをそのファイルが書く（作業台のカードの順・画面の順がここで決まる）。
- 黙って落ちる所の守り（残してある所。理由つき）:
  - `drops/rarity.ts` の `itemRarity` の `?? DIG_DEFAULTS.rarity[…] ?? 'common'`: アイテムにならないブロック（みず など）はほる設定の値、セーブや外から来た知らない id は `'common'`。
  - `ui/itemCategory.ts` の `itemCategory` の `?? 'material'`: 同じ理由（アイテムの全 id は `ItemDef` の `category` が型で必須）。
  - `ui/itemIcon.ts` の石の絵: 同じ理由。アイテムが石の絵に落ちないことは `registry.test.ts` が確かめる。
- import の輪を作らない: `ids.ts` は何も import しない。`types.ts` と各シリーズは型だけ import（`types.ts` の `BLOCK_ONLY_IDS` は実行時の値だが何も import しない）。`registry.ts` は `contracts.ts` を実行時に import しない（`check:ratchet` の cycles が増えたら NG）。

## アイテム 1 つを足すときに触るファイル（全部うまった後の形）

1. `content/items/ids.ts`（id を 1 回。置けるブロックのアイテムは `BlockId`（contracts.ts）に足す。持ち物に入らないブロックなら `types.ts` の `BLOCK_ONLY_IDS` に足す）
2. `content/items/<シリーズ>.ts`（名前・重ね数・レア度・分類・説明・耐久・レシピ・部品。書き忘れは型エラー）。新しいシリーズのファイルなら `registry.ts` の `ITEM_DEFS` に 1 行と、並びを決める `*_DEFS` を 1 つ
3. 並びを決める所（作業台に出す物は `craft/recipes.ts`、持ち物の順は `inventory/items.ts`、色分けは `ui/itemCategory.ts`）。ここも `registry.test.ts`・`itemCategory.test.ts` が「全アイテムが 1 回ずつ入っているか」を落とす
4. `ui/itemArt<シリーズ>.ts`（2D の絵。`Record<…Id>` なので書き忘れは型エラー）。手に持つ形がある物だけ `camera/held<シリーズ>.ts`

**試し（#306 しあげ）**: 仮の `kin_yari` を `GOLD_IDS` に 1 行足すと、`registry.ts` の `ITEM_DEFS`（`Record<ItemDefId, …>` に `kin_yari` がない）、`ui/itemArtGold.ts`（`Record<GoldId, …>`）、`content/items/gold.ts`（`satisfies Record<GoldId, ItemDef>`）が型エラーで知らせる。足し忘れが黙って「ふつう」「そざい」「石の絵」に落ちることはない。

## 合格の条件（#306a の PR）

- 写し JSON が 1 文字も変わらない（`npm test` の `snapshot.test.ts`）。
- 既存テストの期待を 1 つも変えない。`npm run check:fast` 緑。
- `npm run check:ratchet` の数が増えない（#306a では読む側を触らないので `idCompare`・`idCase` は同じ数のまま。読む側の id 直書きを部品で置きかえる段階 3 で減らし、減った分は `ratchet.json` を下げる）。
- 画面・音・遊びは変わらない → CI 緑で自動マージ。
- 1 ファイル 800 行まで。

## 段階 3 の記録（完了）

忍者・侍 → 雷神剣・風神剣・虹など伝説 → 道具（M4）→ 畑（M7・M72・バケツ）→ 生き物（LIVE）→ 置けるブロック（最後）の順に 1 本ずつ移し、最後に `ITEM_DEFS` を `Record<ItemDefId, ItemDef>`（全件強制）にして、古い表（`ITEM_ONLY_RARITY`・`OLD_ITEM_INFO`・`OLD_PERMANENT`・`OLD_CATEGORY_ITEMS` など）と移しかえ中だけの `withRegistry`・`noteDuplicates`・`REGISTRY_OVERLAPS` を消した。たんすの「こわれない」も `blocks.ts` の `wear: 'permanent'` に入れた。
