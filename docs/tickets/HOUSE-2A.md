# HOUSE-2A / 2B: 家の レシピ（#364）

- issue: #364 / 仕様: `docs/design/HOUSE-2.md` **3 版**（yuzu 2026-11-10 21:50〜21:58: 見た目 A・B・C ぜんぶ・ポップアップ・レシピ 1 まいで 3 しゅるい・ふつうの「つくる」）。2 版（2026-10-31 03:07 要点 OK）の もと: `docs/decisions/2026-10-31-house-recipes.md`、3 版の もと: `docs/decisions/2026-11-10-house-recipes-look.md`。
- 前: HOUSE-1（1A〜1E）・MINE-1（1C〜1E）は ぜんぶ main。
- 台帳: `docs/loop-ledger/HOUSE-2.md`。
- 2026-11-10 yuzu「家のレシピ #364 このタスクの実装を進めましょう」。

## PR の 分け方（PO 決め 2026-11-10）

| PR | 中身 | 基準 |
|---|---|---|
| **2A レシピを 見つけて えらぶ** | レシピの 表（1 か所・20 レコード。1 まいで むら・おしろ・こうざんの 3 つ）・おぼえた 記録と しゅるいごとの「あたらしい！」・保存・坑道の 宝箱の レシピの わくと まきもの・おぼえた テロップと 音・ぜんぶの 紙ふぶき・エディター ① ばしょの ボタン ＋ **ポップアップ**・② あかり 3 と まねきねこ・③ 後ろの 文字 8・ひつような もの（材料）・もどす・見本の 光（`glow.parts`）・見本は 今 ある ブロックの 色で かわる（同じ 形の 3 案は 同じ 仮の 色で よい） | **AC1〜AC9**（3 版の 番号） |
| **2B 建てる 見た目** | アートの 3 案 → 家の 新しい ブロック・かざり・あかり・まねきねこ・ボタンの 絵・まきもの。家の 箱の 高さ（`houseBox`）・建てられる 場所・せっけいずどおりに 建つ・三角形 3,000・ブロックの 番号・見本の 描画回数 | AC10〜AC14 |
| **2C ほる・つくる** | 家の 物を ほると その 物（§2.5）・ふつうの「つくる」で 作る・置く（§2.6）。1 版の 物は 2A・2B を またず 先に 出せる | AC15〜AC21 |

2A は 遊びの 流れが ぜんぶ 通る（絵は 仮）。2B の テストの 準備は アートの 案が 決まって から。

## PO が 決めた こと（仕様に ない／あいまい だった 所）

1. **id**: えらぶ 物の 種類は ばしょごとの 型（`RoofKind`・`WallKind`・`WindowKind`・`DoorKind`・`DecoKind`・`LightKind`）で 分ける ので、まどの `suisho` と あかりの `suisho` は ぶつからない。名前は 仕様 §6.1 の とおり（`'flat'|'sankaku'|'kawara'|'wara'|'kin'` ほか）。レシピの id は §4.1 の `roof_kawara` など。
2. **材料の アイテム**: 今 ある アイテムを 使う。かわら＝`kawara`、レンガ＝`brick`（かべの 種類の 名前は `renga`）、しっくい＝`shikkui`、いし＝`stone`、すいしょう＝`crystal`、ほたるいし＝`hotaruishi`、きん＝`kin`、ねんど＝`clay`、てつの かたまり＝今の 鉄の インゴット、くさ＝`grass`、はな＝`flower_y`・`flower_o`・`flower_p`（3 いろ あわせて 数える）、き・かみ・ぬの・いと は HOUSE-1 と 同じ 物。§4.1 の「ねんど P÷2 を かまどで やく」「いしばい＋いと」は 作り方の 説明で、**ひつような ものの 行は できあがりの 物（かわら・レンガ・しっくい）で 数える**（AC5 の 数 どおり）。
3. **レシピの 数を テストに 書かない**（表から 数える。#311）。
4. **まきもの・ボタンの 絵・テロップの 音は 2A では 仮**（今 ある 絵・音を かりる）。2B で アートの 案に かえる。仮の 物は コードに `// 仮（HOUSE-2B で かえる）` と 書く。
5. **性能**: おぼえた 記録は 拾った とき・開いた とき だけ 読む。毎ステップ 世界を 読む 物を 足さない（live4-perf AC20・live3-perf AC17）。
6. 国の 宝箱（#195）は まだ ない ので、中身の 表に「レシピ あり」を 書ける 形 だけ。

## テストの 準備（tester。2026-11-10。実装の 前に 書いた。新しい テストは ぜんぶ 赤）

- 約束（レシピの id・えらぶ 物の id・フック・ボタンの id・data-testid・ふきだしの 字・音）は `e2e/helpers/house.ts` の 先頭「2A の 約束」。ユニットの 道具は `src/house/recipes/recipeKit.ts`（`ENTRY` ＝ レシピ 1 まいごとの えらび方〔ボタンの id・窓口の 項目〕）。E2E の 道具は `e2e/helpers/houseRecipe.ts`。
- **レシピの 数は どこにも 書かない**（窓口 `house.recipes().all` から。仕様 §6.1 の `learned`・`fresh` に `all` を 足した）。数が 書いて あるのは 画面の 数（AC10: ばしょ 5・しゅるい 5・家具 14・あかり 3・後ろの 文字 8・材料 17 行）だけ。
- 手元の 確かめ: `npm run typecheck` は 緑（赤い テストは 型では 落とさず、実行で 落ちる。窓口が まだ 無い ので `unknown` 経由で 呼ぶ）。ユニットは 下の 表の ファイルが 赤（`npx vitest run src/house/recipes src/house/preview/glowParts.test.ts src/world/gen/mineRecipe.test.ts`）。E2E は `e2e/house2.spec.ts` が 赤（`house.recipes is not a function`）。UI 検査の 4 画面（`e2e/ui-gate.spec.ts`）は 実装が できてから 回す（ここでは 回していない）。

| 基準 | テスト | ふくむ もの |
|---|---|---|
| AC1（坑道 側） | `src/world/gen/mineRecipe.test.ts` | どの 坑道にも `shaft.recipe`（宝箱の ある 坑道 ＝ chest・宝箱の 本体の マス／ない 坑道 ＝ scroll・へやの 中の 床の 高さ）・あけると `recipe(at)` が 1 回〔2 回目の からっぽ・2 マス どちらでも 出ない〕・taken・ふつうの 中身は 今まで どおり・まきものは 固く ない ブロック・右クリックで 消える・持ち物は 使わない |
| AC1（おぼえる 側） | `src/house/recipes/recipeLearn.test.ts` | `recipes()`・`learn(id)`〔二重・知らない id は false〕・持ち物は 使わない・テロップ〔「…の レシピを おぼえた！ けんちくしさんの せっけいずで えらべるよ」・消える〕・音 `{ k: 'recipe' }`・ぜんぶ おぼえた とき だけ「レシピを ぜんぶ おぼえた！」・紙ふぶき +1・音 `{ k: 'recipeAll' }` |
| AC1（通し） | `e2e/house2.spec.ts` | 坑道の まきもの〔なければ はじまりの 坑道の 宝箱〕を 本物の 右クリックで → 1 まい目 → 上の 帯 → taken → 2 回目は 何も おきない |
| AC2 | `src/house/recipes/recipes.test.ts` | `pickRecipe`〔1 まい目は roof_kawara・まだの 物・重ならない・ぜんぶで null・同じ 入力は 同じ・並び順 関係なし・ばらける〕・`found`〔かみ 3 まいずつ・保存して 開きなおしても 同じ〕 |
| AC3 | `src/house/recipes/recipeEditor.test.ts`・`e2e/house2.spec.ts` | はじめの 形・表の ぜんぶの レシピに ついて「おぼえる まで 出ない → 出る＋印 → えらぶと 消える」〔① ばしょごと・② あかり／まねきねこ・③ 後ろの 文字〕・ばしょの 印〔のこった 物が ある 間 だけ〕・開いた ときの ばしょ〔印の ある いちばん 左〕・② ③ から もどると 前の ばしょ・E2E は 画面の 印 `editor-new-mark`・名前の 行・✓ |
| AC4 | `src/house/recipes/recipeEditor.test.ts` | 1 つだけ〔今と 同じは false・`canUndo` 不変〕・もどす 1 回で もとに ＋ ばしょ／すすみが 切りかわる・すすむ・かざりは いくつでも〔つける・はずす 各 1 回〕・はなだん の ふきだし〔窓 0〕・`part` は もどす／オートセーブに 入らない・まっさら・2 引数の press |
| AC5 | `src/house/recipes/recipeMaterials.test.ts` | レシピ 1 まいごとの ふえ方〔5×5 と 9×9・窓 2〕・仕様の 例 ① ②・はなは 3 いろ 合計で 1 行・いつもの 物は 1 版と 同じ・17 しゅるい |
| AC6 | `src/house/recipes/recipeSave.test.ts` | おぼえた＋印・作りかけ・できた せっけいず の 往復・古い セーブ・こわれた セーブ |
| AC9 | `src/house/preview/glowParts.test.ts` | `glow.parts`〔window・hanadan・door・noren・roof・wall・entotsu・shachi〕・90 コマで 消える・回り方〔135／225・28°・回らない〕・はずすと 光らない・変わらなければ 光らない |
| AC10 | `e2e/ui-gate.spec.ts` の 新しい 画面 4 つ〔`house-editor-soto-recipes`・`house-editor-naka-recipes`・`house-editor-namae-recipes`・`house-need-recipes`〕・`e2e/helpers/houseRecipe.ts` | 数・ならび・正方形の 大きさ・1 行・名前の 行・見本の 大きさ・17 行の スクロール。はみ出し・重なり・56px・24px は 共通の 検査 |
| 音・見た目 | なし（オーナー確認 AC12） | 仮の 絵・音〔2B で かえる〕 |
| AC7・AC8・AC11・AC12 | 2B | — |

E2E は 1 本（`e2e/house2.spec.ts`。`e2e/shard-times.json` に 入れた〔めやす 90 秒。CI の 実測で 直る〕）。

### 2A で こわれて 直した 既存テスト（期待は ゆるめて いない）

| ファイル | テスト | どう 直したか |
|---|---|---|
| `src/house/editor/ops.test.ts` | 「① そと: 帯 ＋ …」 | ① の 行が ばしょ＋しゅるいの ボタンに かわった: `part-roof/wall/window/door` が あり `part-deco` は ない・出る しゅるいは えらんで いる ばしょ〔やね〕の 物だけ。窓の ばしょを えらぶと `windowKind-*` が 出て `roof-*` が 引っこむ |
| 同上 | 「② なか」「② の ボタン」 | あかりの ボタンの id が `light` → `light-lantern`（`light-<kind>` に かわった） |
| 同上 | 「① の ボタン: …windowKind-shoji…」 | やねの ばしょでは `windowKind-shoji` は 出て いない（押せない）→ `part-window` で ばしょを えらんでから 「今と 同じ ＝ かわらない」を 見る |
| `src/house/talk.test.ts` | 「せっけいずを つくる で page が editor」 | 初めに 出る ボタンの 例から `windowKind-shoji` を はずし `part-window` を 入れた |
| `src/house/system.test.ts` | 「hover: まどの かず・しゅるいの ボタン だけ 光る」 | `part-window` を 押してから 窓の ボタンに のせる。`roof-flat` に のせると 今は やねが 光る ので 「光らない ボタン」の 例から はずした〔やねの 光りは AC9〕 |
| `src/house/state.test.ts` | 「はじめの 形」 | 保存の 形に `recipes: { learned: [], fresh: [] }` が 足された〔期待は `toEqual` の まま 強く〕 |
| `src/house/editor/furniture.test.ts` | 「大きさは 1〜3 マス。材料の 並び…」 | 材料が 10 → 17 しゅるいに ふえる: 1 版の 10 しゅるいの 並びは かえない・新しい 6 つと はなが 入る〔固定の 数「10」は やめた〕 |
| `e2e/house1b.spec.ts` | ① の ボタン一覧・しゅるい ✓・「しょうじ・たいらを 押しても…」・② の ボタン一覧・あかりの ふきだし 2 か所 | ① は `part-*` と `roof-flat` が ある・`windowKind-shoji` は `part-window` を 押してから。あかりは `light-lantern` |
| `e2e/house1b-pr2.spec.ts` | 光る ボタン | `windowKind-shoji` は `part-window` を 押してから のせる。`roof-flat` は 「光らない」の 例から はずした〔やねの 光りは `e2e/house2.spec.ts` と AC9〕 |

### 仕様で あいまい だった 所（PO に 聞きたい こと）

1. **`light` ボタンの id**: 今は `light` 1 つ。3 つに なるので `light-<kind>` に した（`light-lantern` は 最初から ある）。PO が 別の 名前を 決めるなら `house.ts` の 約束と 上の 直した テストを 直す。
2. **おぼえた 記録の 置き場**: `HouseState.serialize()` の 中の `recipes: { learned, fresh }`（v は 2 の まま）と 決めた。別の 場所なら `state.test.ts` と `recipeSave.test.ts` の 書き方だけ 直す。
3. **窓口に 足した 物**（仕様 §6.1 に ない）: `recipes().all`（数を 書かない ため）・`found(at)`（坑道から 拾う 本物の 道）・`recipeBand()`・`editor().marks`（印の ある ボタンの id）・`createMineHook` の `chest.recipe(at)` ポート・`HouseSfx` の `recipe`／`recipeAll`・data-testid `editor-new-mark`・`editor-kind-name`・`recipe-band`。
4. **`glow.parts` の 名前**: 仕様は `string[]` と だけ。えらぶ 物の ばしょの 名前（`window`・`hanadan`・`door`・`noren`・`roof`・`wall`・`entotsu`・`shachi`、あかりは `light`）に した。「光る のは 1 つの 部品だけ」と 読んだ（`parts` の 長さ 1）。まど 全部が かわる ときも `['window']`。
5. **後ろの 文字の ボタン id**: 5 つ（`suffix-0〜4`）は そのまま、のしろ・ごてん・のとりで は `suffix-5・6・7`（おぼえて いない 間は 出ない ので 抜け番に なる）。
6. **はなの 行**: `need()` の `item` は `flower` で はじまる id（3 いろ 合計の 1 行）としか 決めて いない。実際の id は 開発が 決めて よい（テストは `startsWith('flower')`）。
7. **「ぜんぶ おぼえた あとは かみ 3 まい」**: 持ち物に 入らない 分は 足もとに 落とす（仕様 §5）。ユニットは「もちものへ +3」だけ 見て いる（落とす 分は 実装後の 検証で）。
8. **見本の こたえ**: やね・かべ・えんとつ・しゃちほこ は「回らない」を、自動の 回りだけ（`PREVIEW.perFrame`）で 見ている。光っている 間 自動の 回りを 止めるか どうかは 仕様に ない（テストは どちらでも 通る）。
9. **おぼえて いない 物が 作りかけに 入っていた セーブ**（古いセーブ・手で 書きかえた セーブ）の 扱いは テストに 入れて いない（仕様 §5 は「入る ことは ない」と だけ）。
10. **まきものの 場所**: 宝箱の ない 坑道は `room` の 中・`y` ＝ `room.y` と だけ 見ている（仕様の「宝箱が 置かれる マス」は 宝箱が ない 坑道では 計画に 無い）。
11. **ポインター ロック**: E2E は 右クリックを `input.press('secondary')` で 送って いる（mine1c と 同じ）。

## PO の 答え（あいまい だった 所。2026-11-10 レビュー係の おすすめを 採用）

1. あかりの ボタン `light-<kind>`。2. 記録は `HouseState.serialize()` の `recipes: { learned, fresh }`（v は 2 の まま）。3. 足した 窓口は ぜんぶ 採用。4. `glow.parts` は ばしょの 名前・長さ 1・あかりは `['light']`・のせている 間の 光りも 同じ 名前。5. 後ろの 文字は `suffix-5〜7`（1C の なまえを かえる 画面も おぼえた 物だけ 出す）。6. はなの 行は 代表 id `flower_y`（名前「はな」・数は 3 いろ 合計）。7. 紙 3 まいが 入らない 分は 足もとに 落とす。8. 光って いる 間の 自動の 回りは 今の まま。9. おぼえて いない 物が 作りかけに 入った セーブは 読む とき いつもの 物に もどす（できた せっけいずは そのまま）。10. まきものは 宝箱の `mid` の マス。11. 右クリックは `input.press('secondary')`。
- 実装の つなぎ目: 「おぼえて いない 物は 使えない」は controller でなく ボタン・ops・フックの がわ。`edit({op:'light'})` は どの 画面からでも 効く。
- テストの 足りない 4 つ（レビュー 指摘 6）: ② あかりを かえた ときの 見本の 光り・種類の ボタンに のせた 間の 光り・まきものは こわしても 水が 来ても 消えない・紙 3 まいの 足もとの 落とし → ようしき（3 版）の テストと いっしょに tester が 足す。

## PO の 答え その 2（仕様 3.2 版。2026-11-10 22:30 の yuzu の直しを受けて）

- 11 上の「よこ・たて・まどの かず」は 今の まま、その 下に ばしょの ボタン。12 名前の 行は **ヘルプに 置きかえる**（`editor-kind-name` は やめて `editor-hover-tip` に）。
- 13 ヘルプの 置き場所は **カーソルの 近く**（yuzu 22:29「カーソルの 近くが いい」。マウスに ついて うごく。ずらし 幅・画面の ふちで 止める 計算は developer が 仕様 §3.2 の 数で）。12 コマで 出る。ばしょの ボタンは 2 行目「いま: 〇〇」を 出す。
- 14 なし: (a) かべなしは 4 すみに 柱（き 12）(b) まどなしは「あな」(c) かべなしで 妖怪が 入れる ことは ふきだしで 知らせる だけ (d) やねなしは ちょうちんを つるす。
- 2A の 基準に AC9b（ヘルプ）・AC9c（なし）が 足された。
