# アイテム・妖怪の足し方（1 画面の手引き）

ルール #304「1 つのデータは 1 か所」。設計は `docs/design/ITEM-REGISTRY.md`。足し方が変わる PR は、この手引きも同じ PR で直す。

## アイテム

**登録表に入ったシリーズ**（`src/content/items/`。今は金・忍者・侍・伝説の武器。のこりは #306 で 1 本ずつ移る）:

1. `content/items/ids.ts` — id を書くのはここ 1 回（シリーズの配列に足す）。
2. `content/items/<シリーズ>.ts` — 名前・重ね数・レア度・分類・説明・耐久・レシピ・部品（`blade`／`bow`／`tool`／`armor`）を 1 行に。戦闘の数は日本語の単位つきコメントで。
3. 絵: `ui/itemArt<シリーズ>.ts`（`Record<…Id>` なので書き忘れは型エラー）。手に持つ形がある物だけ `camera/held<シリーズ>.ts`。

**まだ古い表のシリーズ**（足し忘れは黙って「ふつう」「そざい」「石の絵」に落ちるので、全部に書く）:

| 何 | 場所 |
|---|---|
| id の型 | `contracts.ts` の `ItemOnlyId` |
| 名前・重ね数・置くブロック | `inventory/items.ts` の `ITEM_TYPES` |
| レア度 | `drops/rarity.ts` の `ITEM_ONLY_RARITY` |
| マスの色の分類 | `ui/itemCategory.ts` の `CATEGORY_ITEMS` |
| せつめい | `craft/info/table.ts` の `ITEM_INFO`（防具は `ARMOR_KIND` も） |
| 絵 | `ui/itemIcon.ts` の振り分け（シリーズの絵ファイル） |
| 耐久 | `contracts.ts` の `toolDurability` |
| レシピ | `craft/recipes.ts`（並び順＝作業台のカードの順） |
| 防具 | `craft/config.ts` の `armorValue`・`ARMOR_SLOT_OF` |
| 刀・武器 | `tools/config.ts` の強さ、`tools/bladeSets.ts` の `BLADE_ITEMS`、`contracts.ts` の `bladeTrail`、手に持つ形 `camera/heldTools.ts` |
| ヌシのドロップ | `contracts.ts` の `nushiDrops`（伝説の武器の強さ・ためわざは `content/items/legend.ts` の `legend` 部品。`LEGENDARY_DEFAULTS` はそこから作る） |
| 実績の名前 | `achievements/defs.ts` |

## 妖怪（#307 で登録表に移るまでの今の形）

- **型で落ちる所**（書き忘れは `npm run typecheck` が教える）: `contracts.ts` の `YokaiKind` を足すと、`yokai/stats.ts`（名前・強さ・動き）、`yokai/ai/config.ts`（ドロップ・AI・攻撃）、`yokai/ai/senseTuning.ts`、`level/config.ts`、`yokai/ai/YokaiManager.ts`、`yokai/index.ts` が求めてくる。形は `yokai/models/<名前>.ts` を新しく作る（箱の組み合わせ、シルエットで分かる形）。
- **黙って落ちる所**（手で足す）: `yokai/variants.ts` の `YokaiKindId`（`completeness.test.ts` が見張る）、出る国 `world/gen/countryTable.ts`、抽選の順 `yokai/countryPick.ts`、出やすさ `yokai/ai/config.ts` の `yokaiWeights`、二つ名の印 `yokai/nickMarks.ts`、メダル `ui/medalArt.ts`、討伐の実績 `achievements/defs.ts`。音は共通（`fx/combatSounds.ts`）なので足さない。

## 文字のきまり

- 名前の漢字はルビ記法 `［忍｜しの］びの ［足袋｜たび］`（画面で `withRuby()`）。コードで作る文字は `ui/text.ts` の `ruby()`。漢字のない名前はかなだけ。

## たしかめ

- `npm run check:fast`（型＋ユニット）。`content/completeness.test.ts` が説明の書き忘れ・妖怪の型ずれを落とす。
- 値の写し `content/__snapshots__/content.json` が変わる。わざと変えたときだけ `npx vitest run -u src/content` で更新し、差分を読んでからコミット（意図しない差分が出たら書きまちがい）。
- `npm run check:ratchet`: `item === 'new_id'` のような id の直書きを足すと数が増えて落ちる。部品（`blade` など）や表で分ける。
- 件数を数えるテスト（例 `drops/rarity7.test.ts`・`ui/itemCategory.test.ts` の全アイテム数）は 1 ふやす。
