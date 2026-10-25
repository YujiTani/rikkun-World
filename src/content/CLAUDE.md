# アイテム・妖怪の足し方（1 画面の手引き）

ルール #304「1 つのデータは 1 か所」。設計は `docs/design/ITEM-REGISTRY.md`（アイテム）・`docs/design/YOKAI-REGISTRY.md`（妖怪）。足し方が変わる PR は、この手引きも同じ PR で直す。

## アイテム

**登録表に入ったシリーズ**（`src/content/items/`。今は金・忍者・侍・伝説の武器・ふつうの道具／武器／防具 16 個（`tools.ts`・`weapons.ts`・`armor.ts`）・畑 14 個（`farm.ts`。たね・やさい・くわ・じょうろ・スプリンクラー・バケツ。じょうろの水の数は `can` 部品）・ざいりょう 8 個（`materials.ts`。ようかいだま・かみ・あぶら・いと・ぬの・ねんど・すいしょう・てつの かたまり）・小物 6 個（`misc.ts`。ちょうちん・たこ・ふとん・おまもり・わらじ・はにわ）・生き物 8 個（`live.ts`。たまご・むし・むしとりあみ・こたつ・とりごや・きんの たまご・もも にく 2 つ。たべた ときの 回復量は `food` 部品）。置けるブロック 22 個（`blocks.ts`。くさ・つち・いし・すな・き・はっぱ・せきたん・てつ／かまど・かわら・レンガ・たいまつ・たんす／間欠泉の つち／12 の国の 8 つ）。これで ITEM_TYPES の全 id が登録表に入った）:

**置けるブロックのアイテムは `blocks.ts`。ブロックとしての性質（固さ・見た目・id の番号）は `BLOCK_TYPES`（`world/blocks/blockTypes.ts`）と `DIG_DEFAULTS`（`dig/config.ts`。ほる固さ・道具・ブロックのレア度）に残る。** アイテムの名前の出どころが BLOCK_TYPES の物と、レア度の出どころが DIG_DEFAULTS の物は、`blocks.ts` からそこを読む（2 か所に書かない）。ブロック id の型は `contracts.ts` の `BlockId`。

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

## 妖怪（登録表。`src/content/yokai/`。設計は `docs/design/YOKAI-REGISTRY.md`）

妖怪 1 種を足すとき、まず 触るのは この 4 か所（名前・強さ・動き・AI・感知・ドロップ・色ちがい・頭の印・国の土台・実績の名前は ぜんぶ `<kind>.ts` 1 つ）:

1. `content/yokai/ids.ts` — 種類を 書くのは ここ 1 回。`YokaiKind`（contracts.ts）・`YokaiId`・`YokaiKindId` は ここからの 別名。
2. `content/yokai/<kind>.ts` — 値を 1 種 1 ファイルで（`YokaiDef`。戦闘の数は 単位つきコメントで）→ `content/yokai/registry.ts` の `YOKAI_DEFS` に 1 行（`Record<YokaiKind, …>` なので 書き忘れは 型エラー）。古い表（`YOKAI_NAME`・`YOKAI_STATS`・`KIND_AI`・`SENSE.kinds`・`YOKAI_DROPS`・`YOKAI_VARIANT_COLORS`・`HEADS`・`BASE`）は ここから 作る ので 触らない。
3. 形: `yokai/models/<kind>.ts`（箱の組み合わせ、シルエットで分かる形）と、`createYokai`（`yokai/index.ts`）・`YokaiManager` の switch（`never` で 書き忘れは 型エラー）。
4. メダルの絵: `ui/medalArt.ts` の `build()`（switch が 型エラーで 教える）。

**手で足す所（乱数の 結果が 変わる ので 自動に しない）**: 国の 出やすさ `world/gen/countryTable.ts` の `emphasis()` を 強める 国、抽選の順 `yokai/countryPick.ts` の `YOKAI_DRAW_ORDER`（うしろに 足す）、見本の並び `yokai/index.ts` の `YOKAI_ORDER`、全体の 倍率 `yokai/ai/config.ts` の `yokaiWeights`（書かないと 1 倍）。足し忘れは `content/yokai/registry.test.ts`（全種類が 並びに 1 回ずつ・どこかの国で 重み > 0）が 落とす。音は共通（`fx/combatSounds.ts`）なので足さない。

## 文字のきまり

- 名前の漢字はルビ記法 `［忍｜しの］びの ［足袋｜たび］`（画面で `withRuby()`）。コードで作る文字は `ui/text.ts` の `ruby()`。漢字のない名前はかなだけ。

## たしかめ

- `npm run check:fast`（型＋ユニット）。`content/completeness.test.ts` が説明の書き忘れ・妖怪の型ずれを落とす。
- 値の写し `content/__snapshots__/content.json` が変わる。わざと変えたときだけ `npx vitest run -u src/content` で更新し、差分を読んでからコミット（意図しない差分が出たら書きまちがい）。
- `npm run check:ratchet`: `item === 'new_id'`・`case 'kind':` のような id の直書きを足すと数が増えて落ちる。部品（`blade` など）や表で分ける。
- 件数を数えるテスト（例 `drops/rarity7.test.ts`・`ui/itemCategory.test.ts` の全アイテム数）は 1 ふやす。
