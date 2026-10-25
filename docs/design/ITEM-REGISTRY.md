# アイテムの登録表（#306a 設計メモ）

ルール #304「1 つのデータは 1 か所」をアイテムで実現するしくみ。段階 2 では **しくみ＋金シリーズ** だけを移す。のこりのシリーズは段階 3 で 1 本ずつ。

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

### registry.ts と「見せ方」（今の表は残す）

- `ITEM_DEFS: Readonly<Partial<Record<ItemId, ItemDef>>>`（段階 3 が終わると全部うまる）と `itemDef(id)`。
- 今の関数・表（`itemRarity`・`itemCategory`・`ITEM_TYPES`・`TOOL_DEFAULTS`・`W2` の初期値・`armorValue`・`ITEM_INFO`・`CRAFT_RECIPES`…）は **名前も使い方も変えず**、中で「古い表＋登録表から作った分」を合わせるだけにする。読む側のファイルは触らない。
- 設定フック（`ITEM_RARITY_SETTINGS`・`toolConfig`・`craftConfig`・`w2`）の上書きは今どおり効くこと（e2e/rarity7 などが使う）。登録表は「初期値の出どころ」で、上書きはその後。
- レシピ: `CRAFT_RECIPES` の今の金の 8 行（recipes.ts 66〜73 行）の位置に `...recipesOf(GOLD)` を入れ、**並び順を変えない**（作業台のカードの順が変わると見た目が変わる）。`kin`（焼く）は `BAKE_RECIPES` の同じ位置に。
- import の輪を作らない: `ids.ts` は何も import しない。`gold.ts`・`types.ts` は型だけ import。`registry.ts` は `contracts.ts` を実行時に import しない（`check:ratchet` の cycles が増えたら NG）。

## 金を足すときに触るファイル（ふりかえりの物さし）

1. `content/items/ids.ts`（id を 1 回）
2. `content/items/gold.ts`（値・レシピ・説明）
3. `ui/itemArtGold.ts`（2D の絵。`Record<GoldId>` なので書き忘れは型エラー）
（手に持つ形がある物だけ `camera/heldGold.ts`）

**合格**: 仮の `kin_yari` を手元で足してみて、上の 3〜4 ファイルだけで「持ち物・レア度・分類・説明・作業台・耐久」が全部出ること（コミットしない）。足し忘れは型か `completeness.test.ts` が落とすこと。

## 合格の条件（#306a の PR）

- 写し JSON が 1 文字も変わらない（`npm test` の `snapshot.test.ts`）。
- 既存テストの期待を 1 つも変えない。`npm run check:fast` 緑。
- `npm run check:ratchet` の数が増えない（`idCompare`・`idCase` は減るはず。減った分は `ratchet.json` を下げる）。
- 画面・音・遊びは変わらない → CI 緑で自動マージ。
- 1 ファイル 800 行まで。

## 段階 3 のシリーズの順（1 本ずつ、古い表を触るので同時はしない）

忍者・侍（小さい・すでに `Record<…>` がある）→ 雷神剣・風神剣・虹など伝説 → 道具（M4）→ 畑（M7・M72・バケツ）→ 生き物（LIVE）→ 置けるブロック（最後。`BlockId` と `BLOCK_IDS_V1` に注意）。全部うまったら `ITEM_DEFS` を `Record<ItemId, ItemDef>`（全件強制）にして、古い表と `?? 'common'` などの黙って落ちる所を消す。
