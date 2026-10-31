# アイテム・妖怪の足し方（1 画面の手引き）

ルール #304「1 つのデータは 1 か所」。設計は `docs/design/ITEM-REGISTRY.md`（アイテム）・`docs/design/YOKAI-REGISTRY.md`（妖怪）。足し方が変わる PR は、この手引きも同じ PR で直す。

## アイテム

**ぜんぶ 登録表に 入っている**（`src/content/items/`）。シリーズ: 金・忍者・侍・伝説の武器・ふつうの道具／武器／防具 17 個（`tools.ts`・`weapons.ts`・`armor.ts`。ふで = TAKO-1。2D の 絵は `ui/itemArtTako.ts`）・畑 14 個（`farm.ts`。じょうろの水の数は `can` 部品）・ざいりょう 9 個（`materials.ts`。すみ = TAKO-1）・小物 7 個（`misc.ts`。ちょうちん・たこ・ふとん・おまもり・やぶれた おまもり・わらじ・はにわ。働きの数 = 光・半径・高さ・時間・持てる数は `gadgetTuning.ts` の 1 つの表 `GADGET_TUNING`。ちょうちん・ふとん・はにわは 置けるブロックでもある = `BLOCK_TYPES` にも入っていて、`placeBlock` で つながる）・生き物 8 個（`live.ts`。たべた ときの 回復量は `food` 部品）・家づくりの道具 2 個（`house.ts`。みずもり・どうづき。建築士さんが はじめて 話した ときに くれる 物で、作れない ので レシピは なし。`wear: 'permanent'`〔こわれない〕。id は `ids.ts` の `HOUSE_TOOL_IDS`、働きは HOUSE-1C〔#340〕で 入る）・置けるブロック 22 個（`blocks.ts`）。`ITEM_DEFS` は `Record<ItemDefId, ItemDef>`（全件を型で強制）。`ItemDefId` は `ItemId` から「アイテムにならないブロック」（`types.ts` の `BLOCK_ONLY_IDS`。みず・そこいし・作物・小屋の部品など）を除いたもの。窓口の表・関数（`ITEM_TYPES`・`itemRarity`・`itemCategory`・`ITEM_INFO`・`TOOL_DEFAULTS`・`toolDurability`・`CRAFT_RECIPES` …）は登録表だけから作る。古い表は無い。

**置けるブロックのアイテムは `blocks.ts`。ブロックとしての性質（固さ・見た目・id の番号）は `BLOCK_TYPES`（`world/blocks/blockTypes.ts`）と `DIG_DEFAULTS`（`dig/config.ts`。ほる固さ・道具・ブロックのレア度）に残る。** アイテムの名前の出どころが BLOCK_TYPES の物と、レア度の出どころが DIG_DEFAULTS の物は、`blocks.ts` からそこを読む（2 か所に書かない）。ブロック id の型は `contracts.ts` の `BlockId`。

アイテム 1 つを足すとき（足し忘れは型エラーかテストが落とす）:

1. `content/items/ids.ts` — id を書くのはここ 1 回（シリーズの配列に足す）。置けるブロックなら `BlockId`（`contracts.ts`）に足し、持ち物に入らないブロックなら `types.ts` の `BLOCK_ONLY_IDS` に足す（新しい `BlockId` は、`ItemDef` を書くか `BLOCK_ONLY_IDS` に足すかを型エラーが決めさせる）。
2. `content/items/<シリーズ>.ts` — 名前・**ずかんの 読み物の 文 `zukan`（必須。本の「どんな もの」に 出る。できる ことを 楽しく・内部の 数は 書かない。漢字は 小 1・小 2 の 漢字だけ ＋ ［漢字｜よみ］。足し忘れは 型エラー、漢字の きまりは `ui/book/zukan.test.ts` が 落とす）**・重ね数・レア度・分類・説明・耐久・レシピ・部品（`blade`／`bow`／`tool`／`armor`）を 1 行に。戦闘の数は日本語の単位つきコメントで。`satisfies Record<…Id, ItemDef>` なので書き忘れは型エラー（置けるブロックでもある物は `Partial<Record<BlockId, ItemDef>>` だが、抜けは `ITEM_DEFS` の型が捕まえる）。新しいシリーズのファイルなら `registry.ts` の `ITEM_DEFS` に 1 行（`Record<ItemDefId, …>` なので入れ忘れも型エラー）。作り方（レシピ）・妖怪のドロップ・ほる の どれでも 手に入らない 物（建築士さんが くれる 道具 など）は、任意の 項目 `source`（ずかんの「てにいれかた」の 文。ひらがな・漢字は ルビ記法）を 1 行 書く（`craft/info/build.ts` の `sourceText` が 最初に 使う。書かないと レシピ・ドロップ・ほる から 自動で 文が できる。`house.ts` が 例）。
3. 並び: 持ち物の順は `inventory/items.ts` の `ITEM_TYPES`、作業台のカードの順は `craft/recipes.ts`、色分けの順は `ui/itemCategory.ts`（`registry.test.ts`・`itemCategory.test.ts` が全アイテムが 1 回ずつ入っているか確かめる。順番は画面の順なので変えない）。
4. 絵: `ui/itemArt<シリーズ>.ts`（`Record<…Id>` なので書き忘れは型エラー）。手に持つ形がある物だけ `camera/held<シリーズ>.ts`。2D の絵が無くて石の絵に落ちると `registry.test.ts` が落とす。

**家具のアイテムを足す（HOUSE-1B。`houseEditor.ts`）**: 登録表の外に、エディターの表が 2 つ ある。足し忘れは型で落ちる。
1. `ids.ts` の `HOUSE_FURNITURE_IDS` に id を足す → `houseEditor.ts` の `HOUSE_FURNITURE`（`satisfies Record<HouseFurnitureId, ItemDef>`）に名前・説明を 1 件。並びは `ITEM_TYPES`・色分けとも登録表から自動（`inventory/items.ts`・`ui/itemCategory.ts` は触らない）。
2. 2D の絵: `ui/itemArtHouseEditor.ts`（`Record<HouseFurnitureId, …>`）。
3. エディターに出す: `house/editor/furniture.ts` の `FURN_ORDER`（画面の並び = ボタンの並び。1 行の数は 自動で `⌈しゅるい ÷ 2⌉`）と `FURNITURE`（方眼の大きさ・材料の数。`Record<FurnKind, …>`）→ 見本の 3D の形は `world/blocks/furnitureArt.ts` の箱の表（これも `Record`。世界の ブロックも 同じ 表を 読む）。材料の id と外装の式は `house/editor/model.ts` の関数を 共有する（別の所に書かない）。
4. 置ける ブロックに する 家具（HOUSE-1C PR-1〔#340〕。ずかん・持ち物は 上と 同じ）: `world/blocks/houseBlocks.ts`（何も import しない 葉）の `FURN_LEN`（マスの 数）と `FURN_NAME` に 1 件 → 向き 4 つ × マスごとの id が 自動で できる（`FURN_BLOCK_IDS`。id は しゅるい ＋ `_2`・`_3`〔2 つ目 以降〕＋ `_w`・`_n`・`_e`〔向き 1〜3〕。`blockTypes.ts` の `BLOCK_TYPES` の さいごに `NEW_FURN_BLOCK_IDS` が 並ぶので 古い セーブの 番号は かわらない）。持ち物に 入るのは 向き 0 の 1 つ目（`houseEditor.ts` の `placeBlock`）、ほかの id は `BLOCK_ONLY_IDS`（`FURN_VARIANT_IDS`）。`dig/config.ts` の `forHouse` の 表に ほる 固さ・レア度を 1 件。見た目: 平らな 箱は `houseTextures.ts` の `FLAT_ART`、箱の 組み合わせは `furnitureArt.ts` の 箱の 表 → 面は `furnitureQuads.ts` が 作り、世界〔`render/houseProp.ts`〕と 見本〔`house/preview/mesh.ts`〕が 同じ 面を 読む。置き方（プレイヤーの ほうを 向く・全部の マスが あいて いる ときだけ）・ほり方（どの マスでも 全部 消えて もとの アイテム 1 こ）は `houseBlocks.ts` の `furnPlaceCells`・`furnSiblings`・`houseDropOf` を 通る（`dig/digPlace.ts`・`digBreak.ts`）。id を 文字で 比べず `isFurnKind(id, K_TANSU)` の ように 読む。
5. 家の ブロック（ゆか・かべ・やね・しょうじ・戸）: `houseBlocks.ts` の `HOUSE_BLOCK_IDS`（戸の 上・あけた 戸の 3 つは `HOUSE_DOOR_PART_IDS`）→ `content/items/houseBlocks.ts` の `HOUSE_BLOCKS`。絵の 色と 12 まいは `world/blocks/houseArt.ts`（1 か所）。建った 家の 形は `house/shape.ts`（`houseShape`。形の 式は `house/editor/model.ts`）、戸で おぼえる 記録は `house/book.ts`。

**`plan` を持つアイテム（せっけいず = `HOUSE_PLAN_IDS`）**: 1 まいずつ ちがう中身 = 番号 `ItemStack.plan`（`contracts/items.ts`）だけを 持ち物のマスに持ち、中身（形・名前）は 保存の `house`（`HouseState`）に番号でひもづく。`maxStack: 1`（重ならない）なので くら（`Kura`）には入らない。**マスをコピー・保存する所は `plan` を落とさないこと**: `tools/durability.ts` の `copyStack`・`readPlan`（`plan` が付けられるのは その id だけ）、`Inventory.addInto`／`add(…, { plan })`、`StorageSystem`（たんす）、`DropField`（`DropSave.plan`。落とす・拾う）。新しく「マスを作り直す」所を足したら、`plan` を引き継ぐ短いテストを 1 本（例 `inventory/plan.test.ts`・`storage/storage.test.ts`・`drops/DropField.test.ts`）。ツールチップの名前は `inventory/planName.ts`（`wireHouse` が番号から引く口をつなぐ）。`plan` を持つ アイテムを 増やすときは `ids.ts` の `HOUSE_PLAN_IDS` に足す（`readPlan` の対象は そこから 自動）。

**まだ 登録表の 外に 手で 書く 所**（登録表が出どころでない物）:

| 何 | 場所 |
|---|---|
| ヌシのドロップ | `contracts.ts` の `nushiDrops`（伝説の武器の強さ・ためわざは `content/items/legend.ts` の `legend` 部品。`LEGENDARY_DEFAULTS` はそこから作る） |
| 実績の名前 | `achievements/defs.ts` |
| 忍者・侍の装備の部位 | `craft/config.ts` の `NINJA_GEAR`・`SAMURAI_GEAR`（部位は登録表の `armor.slot` とそろう。`registry.test.ts` が確かめる） |
| たいまつの足した作り方 | `craft/recipes.ts` の `TORCH_COAL`・`TORCH_LOG`（カードは元の `torch` の 1 枚のまま） |

**黙って落ちる所の守りは、型で守れない id のために 3 か所だけ残してある**（`drops/rarity.ts` の `?? 'common'`、`ui/itemCategory.ts` の `?? 'material'`、`ui/itemIcon.ts` の石の絵）。アイテムにならないブロック（みず など）と、セーブや外から来た知らない id を受ける所。アイテムの id がここに落ちないことはテストが確かめる。

## 妖怪（登録表。`src/content/yokai/`。設計は `docs/design/YOKAI-REGISTRY.md`）

妖怪 1 種を足すとき、まず 触るのは この 4 か所（名前・強さ・動き・AI・感知・ドロップ・色ちがい・頭の印・国の土台・実績の名前は ぜんぶ `<kind>.ts` 1 つ）:

1. `content/yokai/ids.ts` — 種類を 書くのは ここ 1 回。`YokaiKind`（contracts.ts）・`YokaiId`・`YokaiKindId` は ここからの 別名。
2. `content/yokai/<kind>.ts` — 値を 1 種 1 ファイルで（`YokaiDef`。戦闘の数は 単位つきコメントで）→ `content/yokai/registry.ts` の `YOKAI_DEFS` に 1 行（`Record<YokaiKind, …>` なので 書き忘れは 型エラー）。古い表（`YOKAI_NAME`・`YOKAI_STATS`・`KIND_AI`・`SENSE.kinds`・`YOKAI_DROPS`・`YOKAI_VARIANT_COLORS`・`HEADS`・`BASE`）は ここから 作る ので 触らない。
3. 形: `yokai/models/<kind>.ts`（箱の組み合わせ、シルエットで分かる形）と、`createYokai`（`yokai/index.ts`）・`YokaiManager` の switch（`never` で 書き忘れは 型エラー）。
4. メダルの絵: `ui/medalArt.ts` の `build()`（switch が 型エラーで 教える）。

**およぐ 妖怪（TAKO-1。タコはちまき）**: `traits.swims` の 印と `swim`（およぐ・すみ・ぺちん・けむり・画面の 暗さの 数。ぜんぶ `<kind>.ts` 1 か所）を 書く。動きは `yokai/ai/swim.ts`・水の 見方は `yokai/ai/swimTerrain.ts`、水の 列の わき方の 上限は `yokai/ai/config.ts` の `takoHachimakiMax`（陸の くじには 入らない = `countryPick.ts`）。すなはまで 多めに するのは `countryTable.ts` の `emphasis(...)` に 種類を 足す。

**手で足す所（乱数の 結果が 変わる ので 自動に しない）**: 国の 出やすさ `world/gen/countryTable.ts` の `emphasis()` を 強める 国、抽選の順 `yokai/countryPick.ts` の `YOKAI_DRAW_ORDER`（うしろに 足す）、見本の並び `yokai/index.ts` の `YOKAI_ORDER`、全体の 倍率 `yokai/ai/config.ts` の `yokaiWeights`（書かないと 1 倍）。足し忘れは `content/yokai/registry.test.ts`（全種類が 並びに 1 回ずつ・どこかの国で 重み > 0）が 落とす。音は共通（`fx/combatSounds.ts`）なので足さない。

## 文字のきまり

- 名前の漢字はルビ記法 `［忍｜しの］びの ［足袋｜たび］`（画面で `withRuby()`）。コードで作る文字は `ui/text.ts` の `ruby()`。漢字のない名前はかなだけ。

## たしかめ

- `npm run check:fast`（型＋ユニット）。`content/completeness.test.ts` が説明の書き忘れ・妖怪の型ずれを落とす（説明を持たなくてよい 9 個の許可リストは `content/items/noInfoOk.ts` の 1 か所）。
- 値の写し `content/__snapshots__/content.json` が変わる。わざと変えたときだけ `npx vitest run -u src/content` で更新し、差分を読んでからコミット（意図しない差分が出たら書きまちがい）。
- `npm run check:ratchet`: `item === 'new_id'`・`case 'kind':` のような id の直書きを足すと数が増えて落ちる。部品（`blade` など）や表で分ける。
- 件数を数えるテスト（例 `drops/rarity7.test.ts`・`ui/itemCategory.test.ts` の全アイテム数）は 1 ふやす。
