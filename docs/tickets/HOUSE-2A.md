# HOUSE-2A / 2B: 家の レシピ（#364）

- issue: #364 / 仕様: `docs/design/HOUSE-2.md` **3.3 版**（3.3 版 ＝ yuzu 11-11 09:45: レシピは まきものを 使った ときに おぼえる。3 版 ＝ yuzu 2026-11-10 21:50〜21:58: 見た目 A・B・C ぜんぶ・ポップアップ・レシピ 1 まいで 3 しゅるい・ふつうの「つくる」。3.2 版 ＝ yuzu 22:29・22:30: ばしょの ボタンは 絵 ＋ 字・名前の ヘルプ・「なし」）。2 版（2026-10-31 03:07 要点 OK）の もと: `docs/decisions/2026-10-31-house-recipes.md`、3 版の もと: `docs/decisions/2026-11-10-house-recipes-look.md`。
- 前: HOUSE-1（1A〜1E）・MINE-1（1C〜1E）は ぜんぶ main。
- 台帳: `docs/loop-ledger/HOUSE-2.md`。
- 2026-11-10 yuzu「家のレシピ #364 このタスクの実装を進めましょう」。

## PR の 分け方（PO 決め 2026-11-10）

| PR | 中身 | 基準 |
|---|---|---|
| **2A レシピを 見つけて えらぶ** | レシピの 表（1 か所・20 レコード。1 まいで むら・おしろ・こうざんの 3 つ）・おぼえた 記録と しゅるいごとの「あたらしい！」・保存・坑道の 宝箱の レシピの わくと まきもの・おぼえた テロップと 音・ぜんぶの 紙ふぶき・エディター ① ばしょの ボタン ＋ **ポップアップ**・② あかり 3 と まねきねこ・③ 後ろの 文字 8・ひつような もの（材料）・もどす・見本の 光（`glow.parts`）・見本は 今 ある ブロックの 色で かわる（同じ 形の 3 案は 同じ 仮の 色で よい） | **AC1〜AC9c**（3.2 版の 番号。AC9b ＝ 名前の ヘルプ・AC9c ＝ 「なし」。**3.3 版で AC1b ＝ 使うまで おぼえない・使うと 1 まい を 足した**。アイテム recipe_scroll・使う〔右クリック 'read'〕・はじめての テロップも 2A） |
| **2B 建てる 見た目** | アートの 3 案 → 家の 新しい ブロック・かざり・あかり・まねきねこ・ボタンの 絵・まきもの。家の 箱の 高さ（`houseBox`）・建てられる 場所・せっけいずどおりに 建つ・三角形 3,000・ブロックの 番号・見本の 描画回数 | AC10〜AC14 |
| **2C ほる・つくる** | 家の 物を ほると その 物（§2.5）・ふつうの「つくる」で 作る・置く（§2.6）。1 版の 物は 2A・2B を またず 先に 出せる | AC15〜AC21 |

2A は 遊びの 流れが ぜんぶ 通る（絵は 仮）。2B の テストの 準備は 2A の あと（形は アートの 3 案）。

## PO が 決めた こと（仕様に ない／あいまい だった 所）

1. **id**: えらぶ 物の 種類は ばしょごとの 型（`RoofKind`・`WallKind`・`WindowKind`・`DoorKind`・`DecoKind`・`LightKind`）で 分ける ので、まどの `suisho` と あかりの `suisho` は ぶつからない。名前は 仕様 §6.1 の とおり（`'flat'|'sankaku'|'kawara'|'wara'|'kin'` ほか）。レシピの id は §4.1 の `roof_kawara` など。
2. **材料の アイテム**: 今 ある アイテムを 使う。かわら＝`kawara`、レンガ＝`brick`（かべの 種類の 名前は `renga`）、しっくい＝`shikkui`、いし＝`stone`、すいしょう＝`crystal`、ほたるいし＝`hotaruishi`、きん＝`kin`、ねんど＝`clay`、てつの かたまり＝今の 鉄の インゴット、くさ＝`grass`、はな＝`flower_y`・`flower_o`・`flower_p`（3 いろ あわせて 数える）、き・かみ・ぬの・いと は HOUSE-1 と 同じ 物。§4.1 の「ねんど P÷2 を かまどで やく」「いしばい＋いと」は 作り方の 説明で、**ひつような ものの 行は できあがりの 物（かわら・レンガ・しっくい）で 数える**（3 版 AC6 の 数 どおり）。
3. **レシピの 数を テストに 書かない**（表から 数える。#311）。
4. **まきもの・ボタンの 絵・テロップの 音は 2A では 仮**（今 ある 絵・音を かりる）。2B で アートの 案に かえる。仮の 物は コードに `// 仮（HOUSE-2B で かえる）` と 書く。
5. **性能**: おぼえた 記録は 拾った とき・開いた とき だけ 読む。毎ステップ 世界を 読む 物を 足さない（live4-perf AC20・live3-perf AC17）。
6. 国の 宝箱（#195）は まだ ない ので、中身の 表に「レシピ あり」を 書ける 形 だけ。

## テストの 準備（tester。2026-11-10。**仕様 3.2 版**に 合わせて 直した。実装の 前。新しい テストは ぜんぶ 赤。**3.3 版の 直しは この 下の「3.3 版の 直し」**）

前の 版の 準備は `fddafe2`・`d115ca0`（2 版の 基準 AC1〜AC10）。3 版で ① の そとが「ばしょの ボタン ＋ ポップアップ」に かわり、1 まいで 3 しゅるい（むら・おしろ・こうざん）が 出る ように なった ので、テストを 3 版の 基準 AC1〜AC9 に 書きなおした（期待は ゆるめて いない）。

**3.2 版の 直し**（yuzu 22:29・22:30）: ポップアップは 行の 見出し・印・名前の 行 なし（`editor().popupRows`＝ 上から いつもの → むら → おしろ → こうざん・1 行 5 こ まで）／やね・かべ・まどに「なし」〔`<ばしょ>-none`・AC9c〕／名前の 行を やめて 名前の ヘルプ〔`editor().hoverTip`・`editor-hover-tip`・12 コマ・AC9b〕／ばしょの ボタンは 絵 ＋ 字。`editor-part-name`・`popup-kind-name`・`popup-row-mark`・`data-style` は なくなった。

- 約束（レシピの id・しゅるいの id〔`<形>_<案>`〕・フック〔`popup`・`recipeKinds`・`edit {op:'popup'}`〕・ボタンの id〔`part-<ばしょ>`＝ポップアップを 開く・`<ばしょ>-<kind>`・`popupClose`〕・data-testid・ふきだしの 字・音）は `e2e/helpers/house.ts` の 先頭「2A の 約束」。ユニットの 道具は `src/house/recipes/recipeKit.ts`（`ENTRY` ＝ レシピ 1 まいごとの えらび方〔3 案ぶんの しゅるいと ボタンの id〕・`popupRowsOf` ＝ ポップアップの 行〔3.2 版: なし 入り・1 行 `ROW_MAX`＝5〕）。E2E の 道具は `e2e/helpers/houseRecipe.ts`。
- **レシピの 数・しゅるいの 数は どこにも 書かない**（窓口 `house.recipes().all`・`house.recipeKinds(id)`・画面の 表から）。ENTRY が 窓口の 表と ずれたら `recipeEditor.test.ts` の「ENTRY ＝ 表」が 落ちる。数が 書いて あるのは レイアウトの 上限（ばしょ 5・1 行 5 こ・入る 行 9・11・13）と ヘルプの 12 コマだけ。
- 手元の 確かめ（yuzu の 決定で E2E は 回さない）: `npm run typecheck` は 緑。ユニットは 下の 表の ファイルが 赤（`npx vitest run src/house src/world/gen/mineRecipe.test.ts`）。E2E（`e2e/house2.spec.ts`・`e2e/ui-gate.spec.ts` の 新しい 画面 6 つ）は 回して いない（CI）。3.2 版の 直しの あとの ユニットの 赤: `npx vitest run src/house src/world/gen/mineRecipe.test.ts` で 新しい ファイル〔`recipeNone`・`recipeTip`・`recipePopup`〕も ぜんぶ 赤〔窓口が 無くて 落ちる〕、`src/debug` は 緑。

| 基準（3 版） | テスト | ふくむ もの |
|---|---|---|
| AC1（坑道 側。**3.3 版で 直した**） | `src/world/gen/mineRecipe.test.ts` | どの 坑道にも `shaft.recipe`・あけると `recipe(at)` が 1 回・taken・ふつうの 中身は 今まで どおり・まきものは 固く ない ブロック・右クリックで 消える・持ち物は 使わない。**足した（レビュー 指摘 6）: まきものは `BlockBreaker.breakBlock` を よんでも 水が 流れこんでも のこり、そのあと 右クリックで とれる** |
| AC1・AC1b（**3.3 版で 書きなおし**。下の「3.3 版の 直し」） | `src/house/recipes/recipeLearn.test.ts` | （3.2 版までは「おぼえる 側」: `learn(id)` で おぼえた 記録・テロップ・音。3.3 版では 手に 入れる〔`found`〕・使う〔`read`〕に 組みなおした） |
| AC1・AC1b（通し。**3.3 版で 直した**） | `e2e/house2.spec.ts` | 坑道の まきもの〔なければ はじまりの 坑道の 宝箱〕を 本物の 右クリックで → 持ち物に まきもの・まだ おぼえない・はじめての テロップ → taken → 2 回目は 何も おきない → 手に 何も もたずに 右クリック → 何も おきない → 手に もって 長押し → 1 まい へって 1 つ〔直前の nextPick〕 |
| AC2（**3.3 版で 直した**） | `src/house/recipes/recipes.test.ts` | `pickRecipe({ seed, learned })`〔`at` なし〕・`recipes().nextPick`・`read`〔かみ 3 まい・保存して 開きなおしても 同じ〕。**3.2 版で 足した: ぜんぶ おぼえた あとの かみ 3 まいが 持ち物に 入らない とき 足もとに 落ちる〔いっぱい・一部だけ入る・レシピの ときは 落とさない〕**（`houseRig` に deps `drop(item, count)` と `rig.drops`） |
| AC3 | `src/house/recipes/recipeEditor.test.ts`・`e2e/house2.spec.ts` | **ポップアップの 行 `popupRows`〔いつもの → むら → おしろ → こうざん・1 行 1 なかま・1 行 5 こ まで・空の 行 なし〕**・1 まいで 3 つ〔`recipeKinds`〕・レシピ 1 まいごとに「おぼえる まで 出ない → 出る＋ボタンごとの 印 → 1 つずつ えらぶと その 印だけ 消える〔ばしょの 印は のこりが ある 間〕」・かざりの ばしょは 1 つ おぼえる まで ない・並び〔いつもの → むら → おしろ → こうざん・左 つめ・しゃちほこは おしろの 行〕・おぼえて いない 物は edit でも 押しても えらべない |
| AC4 | `src/house/recipes/recipePopup.test.ts` | `part-<ばしょ>` で `popup`・✕・Esc〔ポップアップだけ〕・上下の 帯の ボタンで とじる＋そのはたらき・えらんでも 開いた まま・開く・とじるは `canUndo` を かえず 保存に 入らない・エディターを 開いた とき／② ③ から もどった とき／あたらしい せっけいずの あとは `null`・開いて いる 間は ① の パネルの ボタンは かくれる |
| AC5 | `src/house/recipes/recipePopup.test.ts` | レシピ 1 まいごとに 3 案を 順に えらぶ〔今と 同じは false・もどす/すすむ〕・案を まぜる・かざり〔つける/はずす/同じ形の 入れかえ/いくつでも/しゃちほこ〕・はなだんの ふきだし・もどす/すすむで ポップアップが 切りかわる〔開いて いれば その ばしょ・ばしょでない 物は とじる・とじて いれば 開かない〕・まっさら・2 引数の press |
| AC6 | `src/house/recipes/recipeMaterials.test.ts` | レシピ 1 まいごとの ふえ方〔5×5 と 9×9・窓 2。**3 案 どれでも 同じ**〕・仕様の 例 ① ②〔案を まぜる〕・はなは 3 いろ 合計で 1 行・いつもの 物は 1 版と 同じ・材料の 表 `MATERIAL_ORDER` の ぜんぶ |
| AC7（**3.3 版で 足した**） | `src/house/recipes/recipeSave.test.ts` | 〔3.3 版: 持ち物・たんすの まきものの 数・「はじめて」の 記録・古い セーブ〕おぼえた＋しゅるいごとの 印・作りかけ〔案こみの id・popup は のこらない〕・できた せっけいず・古い セーブ・**おぼえて いない／知らない しゅるいは いつもの 物に・2 版の 形の id は 案 むら として 読む**・こわれた セーブ |
| AC8 | `src/house/preview/glowParts.test.ts`・`src/house/system.test.ts` | `glow.parts`〔window・hanadan・door・noren・roof・wall・entotsu・shachi〕・同じ 形の 案の 入れかえでも 光る・90 コマで 消える・回り方・はずすと 光らない。**足した（指摘 6）: ② あかりを かえた ときの 見本の 光り〔なかの 見本・parts ['light']・回らない〕・ポップアップの しゅるいの ボタンに のせた 間の 光り〔`Preview3D.hover(on, part)`・`HouseSystem.hover(id)` が 部品を 決める〕** |
| AC9 | `e2e/ui-gate.spec.ts` の 新しい 画面 6 つ〔`house-editor-soto-recipes`・`-popup-recipes`・`-popup-deco-recipes`・`-naka-recipes`・`-namae-recipes`・`house-need-recipes`〕・`e2e/helpers/houseRecipe.ts` | ばしょ 5 と 名前の 行・ポップアップ〔パネルと 同じ x・はば、見本と 重ならない、スクロール なし、1 行 4 こ まで・左 つめ・行の 順・行の 印・空の 行 なし、名前の 行に いちばん 長い 名前、✕ 56px〕・② 家具〔上 ⌈n÷2⌉・下 のこり、まねきねこが 右下〕・あかり・③ 後ろの 文字・材料の スクロール。はみ出し・重なり・56px・24px は 共通の 検査 |
| AC9（3.2 版） | 同上（ばしょ 5 は 絵 ＋ 字） | 上の 6 画面。ばしょの ボタン〔高さ 72・80・80／はば・あき は 表／字 24px・1 行／かざりは ぜんぶ おぼえて いる ので 出る〕・ポップアップ〔5 こ まで・見出し・印・名前の 行 なし・「なし」が 左・窓口 `popupRows` と 画面が 同じ〕・**名前の ヘルプが 画面の 外へ 出ない**〔いちばん 右・いちばん 上の ボタン・いちばん 長い 名前・ばしょの 2 行〕 |
| AC9b | `src/house/recipes/recipeTip.test.ts`・`e2e/house2.spec.ts` | 11 コマ目まで `null`・12 コマで 出る・はなすと 次の コマで `null`・うつると 待たずに 切りかわる・押しても 消えない・ポップアップが とじる／すすみが かわると `null`・字〔しゅるい 1 行・ばしょ 2 行「いま: 〇〇」・かざりの 数〕。E2E は 通しの 中で 1 回 のせて 字・画面の 外へ 出ない・カーソルの 近く〔48px 以内〕・カーソルの 先を かくさない・マウスに ついて うごく〔同じ ボタンの 中で 下へ 10px〕 を 見る |
| AC9c | `src/house/recipes/recipeNone.test.ts`（＋ `glowParts.test.ts`・`e2e/house2.spec.ts`） | やね・かべ・まどに `none`〔1 回の 操作・もどす・保存の 往復・と は なしに できない〕・材料〔5×5・かべ なし・やね なし・窓 4・ふとん 1 → き 12・いし 25・ぬの 3・いと 1〕・やね なしで かざり／かべ なしで 窓・はなだんの ふきだし・かべ なしを えらぶと「かべが ないと ようかいが はいって くるよ」・光らない・まっさらは たいら・き・しょうじ |
| 音・見た目 | なし（オーナー確認 AC14） | 仮の 絵・音〔2B で かえる〕 |
| AC10〜AC14 | 2B | — |
| AC15〜AC21 | 2C | — |

E2E は 1 本（`e2e/house2.spec.ts`。`e2e/shard-times.json` に 入れて ある〔めやす 90 秒。ポップアップの 手順が ふえたが 同じ 1 本で 足りる見こみ。CI の 実測で 直る〕）。

### 3.3 版の 直し（tester。2026-11-11。仕様 3.3 版 §2.1・§2.2・§5・§6.1・§6.2 AC1・AC1b・AC2・AC7。**実装の 前。新しい 期待は 赤**。期待は ゆるめて いない）

**約束**（`e2e/helpers/house.ts` の「2A の 約束」・`src/house/recipes/recipeKit.ts`）:

| 窓口・口 | 約束 |
|---|---|
| アイテム `recipe_scroll`「レシピの まきもの」 | 重ね 64・置けない・作れない・説明の 行は 仕様 §2.2 の とおり・source「こうどうの いちばん したの へや」。宝箱の くじ〔`chestPool()`〕には 入れない〔`chestExcluded()` に 理由つき〕 |
| `house.found(at, who?)`（`void`） | **手に 入れた**: who の 持ち物へ 1 まい（いっぱいなら 足もとに `drop(item, count, who)`）。おぼえない・音なし。世界で はじめての 1 回だけ 使い方の テロップ（`recipeBand()`。足もとに 落ちた ときも）。mine の `chest.recipe(at)` が 呼ぶ |
| `house.read(who?)`（`boolean`） | **手に もって 右クリックの 本体**: who の まきものを 1 まい へらして 1 つ おぼえる（直前の `nextPick`）。持って いなければ false。ぜんぶ おぼえた あとは まきもの 1 へって かみ 3 まい〔へらして から 入れる〕＋ テロップ「もう ぜんぶ おぼえて いるよ。まきものは かみに なった」 |
| `house.recipes().nextPick` | 今 使ったら おぼえる 物。ぜんぶ おぼえて いれば `null` |
| `house.learn(id)` | テスト用の 近道。AC1b では 使わない（E2E の 通しの 中でも 使わない） |
| `pickRecipe({ seed, learned })` | `at` なし。坑道の 場所に よらない |
| 右クリックの 種類 `'read'` | item ＝ recipe_scroll・右の 案内 `{ icon: 'recipe_scroll', word: 'よむ' }`・DigSystem の m4 の 口 `scroll.read(who)`（1 回の 右クリックで 1 回。長押しで 続けない・`chestWho` を who に・持ち物の 画面〔`lock.overlayVisible`〕では 呼ばない） |
| 右クリックで とる／ほって とる | まきものの ブロック: 右クリックは `chestPort.open` → `recipe(at)`（今まで どおり）。**ほる（`BlockBreaker.breakBlock`）も 消えて 持ち物に recipe_scroll 1 こ**（`dugItemOf('makimono')`・いっぱいなら `scatterItem`）。ほる 固さは null でなく・`BLOCK_TYPES` も `breakable: true` |
| HouseSystem の deps | `bagOf(who)`（今まで）・`drop(item, count, who?)`・`recipeBand(text, who?)`〔2P は 使った 人の 半分〕。`houseRig` に `rig.drops[].who`・`rig.bands` を 足した |

| 基準（3.3 版） | テスト（赤の もと） | 内容 |
|---|---|---|
| AC1（手に 入れる） | `src/house/recipes/recipeLearn.test.ts`・`recipeRead2p.test.ts` | `found` は 持ち物に 1 まい・おぼえない・音なし・時間が たっても おぼえない・いっぱいで 足もとへ・たんすに 入れても おぼえない・はじめて 1 回だけ テロップ〔2 まい目なし・保存で 引きつぐ・足もとに 落ちても 1 回〕・2P は 2P の 持ち物・足もと・テロップは 2P |
| AC1（坑道 側） | `src/world/gen/mineRecipe.test.ts` | `recipe(at)` は 今まで どおり。**「こわしても のこる」を「ほっても とれる」に かえた**（下の 表）・水は のこる・坑道の 係は 持ち物へ 直接 入れない |
| AC1b | `recipeLearn.test.ts`・`recipeRead2p.test.ts`・`src/dig/rightClickScroll.test.ts`・`e2e/house2.spec.ts` | 使うと 1 まい へる・1 つ おぼえる〔直前の nextPick〕・3 まい 持って 1 回で のこり 2・テロップと 音が その コマ・持って いなければ 何も おきない・ぜんぶ おぼえた とき〔さいごの 1 まい〕の テロップ・紙ふぶき・音。**右クリックの 判定**: 手に もてば read・はたらきが ある ブロック〔たんす・かまど・戸・ふとん・まきものの ブロック〕が 先・手に もって いない・持ち物の 画面では 呼ばない・長押しで 続けない・2P は who 2・案内「よむ」。**2P**: 2P の 持ち物が へる・learned は 1P の エディターにも 出る・テロップは 2P・1P の まきものは へらない |
| AC2 | `src/house/recipes/recipes.test.ts` | 1 まい目 roof_kawara・同じ 物 2 回なし・**場所に よらない**〔`at` を わたしても 同じ・found の 場所が ちがう 世界で 同じ 順〕・シードで 順が かわる・保存して 開きなおしても 同じ・ぜんぶ おぼえた あとの かみ 3 まい〔空き あり・使った マスが あく・2 まい 重なって 落ちる・一部だけ 入る〕・テロップ |
| AC7 | `src/house/recipes/recipeSave.test.ts` | 持ち物・たんすの まきものの 数・「はじめて」の 記録・古い セーブ〔3.3 版の 前〕 |
| アイテム（`src/content/CLAUDE.md` の「たしかめ」） | `src/content/items/recipeScroll.test.ts` | 登録・名前・重ね 64・置けない・作れない〔`ALL_RECIPES` に ない〕・`dugItemOf('makimono')`・色分け・絵・source・説明の 行・zukan〔ルビ〕・くじから のぞく。**件数を 数える テストは 表から 数える ので 直す 所なし**。**値の 写し `src/content/__snapshots__/content.json` は 実装で `npx vitest run -u src/content` して 差分を 読む**（tester は 実装の 前なので 更新しない） |

**こわれる 既存テストを 探して 直した 物**（`grep` で 窓口 `found(`・`pickRecipe`・`recipes()`・`'makimono'`・`こわしても`）: 

| ファイル | テスト | どう 直したか（理由） |
|---|---|---|
| `src/house/recipes/recipeLearn.test.ts` | 「おぼえた 記録」「おぼえた テロップと 音」の 3 つ | `learn(id)` で おぼえて テロップ・音を 見て いた → 3.3 版では おぼえる 道は まきもの だけ なので `read` に かえた。`learn` の 近道の テストは 1 つ のこした〔ゲームの 中の 道では ない と 明記〕。期待〔テロップの 字・音 1 回・ぜんぶ の とき だけ 紙ふぶき +1〕は そのまま |
| `src/house/recipes/recipes.test.ts` | `pickRecipe` の `at`・「場所が ちがえば ちがう 物」・`found` の 3 つ | `at` を 使う 期待は 3.3 版で ぎゃくに なった〔場所に よらない〕。「場所が ちがえば」は「シードが ちがえば」に・`found` で おぼえる 期待は `read` に。1 まい目・同じ 物 2 回 なし・並び順 関係なし・保存して 同じ・かみ 3 まい・足もとの 落とし 4 つは 残した〔入り口だけ かえた〕 |
| `src/world/gen/mineRecipe.test.ts` | 「まきものを 持ち物の マスに かえない」 | 3.3 版では まきものは 持ち物に 入る。ただし 入れる のは 家の 係〔`found`〕なので、坑道の 係の テストは「`recipe(at)` を よぶ だけ・直接 入れない」に かえた |
| 同上 | 「こわす 処理を 直接 よんでも まきものは のこる」 | §5 の 3.3 版〔右クリック か ほる〕で ぎゃくに なった → 「ほると 消えて 持ち物に 1 こ・いっぱいなら 足もとに」に かえた。**「水が 来ても 消えない」は 3.3 版でも 生きて いる ので そのまま** |
| `e2e/house2.spec.ts` | 通しの 最初〔右クリックで おぼえる〕と さいごの `learn` | 拾った 場で おぼえる 期待を 「持ち物に 入る・まだ おぼえない → 手に もって 右クリック」に。さいごの `learn(...) === false` は 近道なので やめて `scrollCount`・`learned` で 見る |
| `e2e/helpers/house.ts`・`houseRecipe.ts` | 約束の 書き出し・`Recipes` の 型 | `found`・`read`・`learn`・`nextPick`・まきものの 約束を 3.3 版に。`scrollCount`・`holdScroll`・`holdNothing`・`holdRightClick` を 足した |
| `src/house/houseRig.ts`・`recipeKit.ts` | テスト用の 道具 | `drops` に who・`bands`・`found`・`read` の 型・`SCROLL` を 足した |
| 消した 物 | なし | 期待を ゆるめた ものは ない。「learn で おぼえる」期待 だけ read に 置きかえた |

**赤の 結果**（`npm run typecheck` は 緑。ユニット: `npx vitest run src/house src/dig src/content src/debug src/world/gen/mineRecipe.test.ts`）: 新しい 期待が 59 こ 赤〔`recipe_scroll` が 登録表に ない・`found`/`read`/`nextPick` が ない・`pickRecipe` が `at` を 読む・右クリックの 'read' が ない・ほって とれない〕。ほかの 既存 テスト〔`src/debug` の 見張りを ふくむ〕は 緑のまま。E2E は 回して いない〔CI〕。

**3.3 版で 仕様に なくて テストが 決めた 所（PO に 聞きたい）**:

1. **ほって とった まきものの「はじめて」テロップ**: 右クリックは `recipe(at)` → `house.found`〔はじめての テロップが 出る〕。ほる 道〔`breakBlock` → 持ち物に 直接〕は `found` を 通らない ので、はじめての テロップが 出ない おそれ。テストは ほる 道の テロップを 見て いない。ほる 道も `found` を 通す〔`onPickup` など〕か、ほる 道は テロップなし と するか 決めて ほしい。
2. **足もとに 落ちた ときも「はじめて」の テロップ**: 仕様 §2.1 は「はじめて 手に 入れた とき」。落ちた〔まだ 拾って いない〕ときも 出す と 読んだ〔`recipeLearn.test.ts`〕。拾った 時に 出す 読みなら 直す。
3. **重ね数 64**: 仕様 §2.1 は「小物の いつもの 数」。`misc.ts` の ふつうの 小物〔ちょうちん・ふとん・やぶれた おまもり〕と 同じ 64 と 読んだ。レア度は 仕様に 数が ない ので テストは「ある」だけ 見る。
4. **`read` の 窓口**: 仕様 §6.1 は 本番の 道を「手に もつ・右クリックの 窓口」と だけ 書いて いて、ユニットで 使う `house.read(who)` と DigSystem の m4 の 口 `scroll.read(who)` は テストが 決めた 名前。かえる なら 3 つの テストを 一緒に 直す。
5. **ぜんぶ おぼえた あとの 音**: 仕様は テロップだけ。テストは 'recipe'・'recipeAll' の 音を 鳴らさない と した〔かみに なった ときは おぼえた 音では ない〕。
6. **さいごの 1 まいの とき かみは もらえない**: さいごの 1 まいは レシピに なる ので かみ 3 まいは なし〔2 まい目 以降の まきものから〕と 読んだ。
7. **2P の 紙ふぶき**: 「使った 人の 半分」は ユニットでは テロップ〔`recipeBand(text, who)`〕だけ 見る。紙ふぶきの who は 画面の つなぎ込みで 見る〔UI 検査・オーナー確認〕。
8. **宝箱の くじから のぞく**: `chestExcluded()` に 理由つきで 入れる 約束に した〔MINE-1E の かびた パン と 同じ 手順〕。

### 3 版で こわれて 直した 既存テスト（期待は ゆるめて いない）

| ファイル | テスト | どう 直したか |
|---|---|---|
| `src/house/editor/ops.test.ts` | 「① そと: 帯 ＋ …」 | ① は ばしょの ボタン 4 つ〔かざりは なし〕だけ。しゅるいの ボタンは ポップアップを 開くまで ない。`part-window` を 押すと `window-none`・`window-shoji` と `popupClose` が 出て、① の パネルの ボタン〔part-*・width-*・depth-*・windowsUp/Down〕が かくれる。`popupClose` で もどる |
| 同上 | 「② なか」「② の ボタン」 | あかりの id が `light` → `light-lantern`（`light-<kind>`）。まねきねこは おぼえる まで 出ない（2A の 準備の まま） |
| 同上 | 「① の ボタン: …windowKind-shoji…」 | `windowKind-shoji` → `window-shoji`。ポップアップが とじて いる 間は 押せない・ほかの ばしょの ポップアップが 開いて いる 間は 押せない・パネルの ボタンも 押せない・2 引数は `press('window', 'shoji')` |
| `src/house/talk.test.ts` | 「せっけいずを つくる で page が editor」 | 初めに 出る ボタンの 例を `part-window`・`part-roof` に し、`roof-flat` は 出ないことを 足した |
| `src/house/system.test.ts` | 「hover: …」 | まどの かず −＋ は 今まで どおり `hover true`。ポップアップの しゅるいの ボタン〔`window-shoji`・`roof-flat`・`deco-entotsu_shiro` …〕は その ばしょの 名前つき〔`hover true window` …〕。とじて いる 間の しゅるいの ボタン・ほかの ボタンは 光らない。偽の 見本の ログに ばしょの 名前も 入れた |
| `src/house/state.test.ts` | 「はじめの 形」 | 保存の 形に `recipes: { learned: [], fresh: [] }`（2A の 準備の まま） |
| `src/house/editor/furniture.test.ts`・`model.test.ts` | 家具の 表・材料の 並び | 2A の 準備の まま（まねきねこ 14 種目・材料が 1 版の 10 しゅるいの 並びを かえずに ふえる） |
| `e2e/house1b.spec.ts` | ① の ボタン一覧・しゅるい ✓・「しょうじ・たいらを 押しても…」・② の ボタン一覧・あかりの ふきだし | ① は `part-*` が あり、しゅるいの ボタン〔`roof-flat` など〕は 出ない。`part-window` → `window-shoji` ✓ → `popupClose`。ポップアップが 開いて いる 間も 画面と `menu()` が 同じ〔`editorMismatch`〕。あかりは `light-lantern` |
| `e2e/house1b-pr2.spec.ts` | 光る ボタン | `windowsDown` は 今まで どおり。窓の しゅるいは `part-window` を 押して `window-shoji` に のせる。`roof-flat` は 「光らない」の 例から はずした〔やねの 光りは `e2e/house2.spec.ts`・AC8〕 |
| `e2e/helpers/houseEditor.ts` | UI 検査の ① の ボタンの 高さ | 対象の 正規表現に `<ばしょ>-<kind>` を 足した。**`part-*` は 入れない**〔3.2 版の ばしょの ボタンは 絵 ＋ 字で 正方形では ない。高さ 72・80・80 は `houseRecipe.ts`〕 |

### 仕様で あいまい だった 所（PO に 聞きたい こと）

1. **「あたらしい！」の 保存の 形**: PO の 答え 2 は `recipes: { learned, fresh }`。3 版は しゅるいの ボタンごとの 印が いる ので `fresh` の 中身は しゅるい id〔例 `kawara_mura`〕の ほうが 自然。テストは 保存の 形を 見ず、窓口の `recipes().fresh`〔レシピ id〕と `editor().marks`〔ボタン id〕だけを 見る。`fresh: []`〔はじめの 形〕は どちらでも 通る。
2. **`marks` の 意味**: 「印の ある ボタンの id」を ポップアップが 開いて いるか どうかに よらない 状態から 決まる 物と した〔印の のこった しゅるいの ボタン ＋ 印の のこった しゅるいが ある ばしょの ボタン〕。画面に 今 見えている 物だけに する 案も ある〔E2E の 数え方が かわる〕。
3. **ポップアップが 開いて いる 間の パネル**: 仕様 §2.3 は「パネルの 上に 重なる」。テストは ① の パネルの ボタン〔part-*・width-*・depth-*・windowsUp/Down〕が `menu().buttons` と 画面から 消える〔押せない・UI 検査で 重ならない〕と 読んだ。パネルを 暗く して 残す 作りなら 直す。
4. **`glow` の のせた 光りの 窓口**: `Preview3D.hover(on, part?)`・`PreviewPort.hover(on, part?)`〔まどの かず −＋ は part なし ＝ 今まで どおり 窓 ぜんぶ〕。`HouseSystem.hover(id)` が ボタン id から 部品を 決める〔`house.ts` の 表〕。別の 作りなら 約束と 3 つの テストを 直す。
5. **できた せっけいずの 扱い**: PO の 答え 9 は「できた せっけいずは そのまま」、3 版 §5 は「作りかけ・せっけいずに おぼえて いない しゅるいが あれば いつもの 物に」。テストは 作りかけ〔両方 一致〕だけ。せっけいずは 決まるまで 見ない。
6. **ポップアップの 開き閉じに ついての 小さな 決め**: 開いて いる 間に ほかの ばしょの ボタンは 出ない〔✕ で とじてから 開く〕。同じ ばしょの ボタンを もう 1 回 押す〔切り替えか 何も しないか〕は 見て いない。`edit {op:'popup', part:null}` は 開いて いる ときだけ true〔とじて いる ときの 返り値は 見て いない〕。
7. **ポップアップの testid**: 外わく `editor-popup`、上の だん `popup-title`、行 `popup-row`、一覧 `popup-list`、ヘルプ `editor-hover-tip`〔仕様〕。仕様に 名前が ない ものは テストが 決めた。3.2 版で `editor-part-name`・`popup-kind-name`・`popup-row-mark`・`data-style` は なくなった〔画面に 残って いたら UI 検査が 落ちる〕。
8. **紙 3 まいの 足もとの 落とし**: `HouseSystem` の deps に `drop(item, count)`〔`game/wire/mine.ts` の `chest.drop` と 同じ 形〕が いる。ユニットの 道具 `houseRig` が 受けて `rig.drops` に ためる。
9. **「つくる」画面（AC20）**: 配置の 節が まだ ない ので 2A の 対象に しない〔2C〕。
10. 〔**決まった**（2026-11-10 レビュー）: カーソルの 近く・マウスに ついて うごく。仕様を 3.2.1 に 直し、テストを きびしく した: カーソルから 48px 以内・カーソルの 先を かくさない・同じ ボタンの 中で 下へ 10px うごかすと ヘルプも 10px 下へ〔待ちなおさない〕・画面の ふちの 内がわ〕 もとの 質問 → **ヘルプの 置き場所が 仕様と PO の 答えで 食い違う**: 仕様 §2.3・§3.2 は「ボタンに 合わせて 固定（マウスに ついて 動かない）・上 8px」、PO の 答え 13 は「カーソルの 近く（マウスに ついて うごく）」。テストは 位置を **マウスから 100px 以内・画面の ふち〔16・24・32〕の 内がわ・画面の 外へ 出ない** だけ 見る〔どちらの 作りでも 通る〕。どちらかに 決まれば きびしく する〔固定なら 上 8px・まん中、ついて 動くなら ずらし 幅〕。
11. **ヘルプの 「コマ」**: `HouseSystem.update()` の 呼び出し 1 回。マウスを のせた コマから 数え 12 回目で 出る〔ユニット: `rig.run(12)`・E2E: `stepUi(12)`〕。のせた コマを 1 つ目に 数える か どうかは 窓口の 約束〔`house.ts`〕に 書いた。ずれたら 1 コマだけ ずらして 直す。
12. **「かべが ないと まどは つかないよ」の 出る とき**: テストは「かべ なしの まま 窓を ふやした とき」だけ 見る〔はなだん・えんとつと 同じ 考え。つけた ことには なる〕。**窓が すでに ある 家で かべを なしに した とき**〔「ようかいが はいって くるよ」と 2 つ 出るか・どちらが 先か〕は 仕様に 順が 無い ので テストに 入れて いない。決まれば 足す。
13. **ふきだしの くりかえし**: 「かべが ないと ようかいが はいって くるよ」は えらんだ 1 回だけ〔そのあと ほかの ボタンを 押すと 消え、同じ ふきだしは 出ない〕と 読んだ。
14. **「なし」の 保存 id**: `none`〔`roof`・`wall`・`windowKind` に そのまま 入る〕。古い セーブ〔`none` の 無い〕は そのまま 読める。


## PO の 答え（2 版の ときの あいまいな 所。2026-11-10 レビュー係の おすすめを 採用。**3 版でも 生きて いる 物**）

1. あかりの ボタン `light-<kind>`。2. 記録は `HouseState.serialize()` の `recipes: { learned, fresh }`（v は 2 の まま。`fresh` の 中身は 上の 1）。3. 足した 窓口は ぜんぶ 採用。4. `glow.parts` は ばしょの 名前・長さ 1・あかりは `['light']`・のせている 間の 光りも 同じ 名前。5. 後ろの 文字は `suffix-5〜7`（1C の なまえを かえる 画面も おぼえた 物だけ 出す）。6. はなの 行は 代表 id `flower_y`（名前「はな」・数は 3 いろ 合計）。7. 紙 3 まいが 入らない 分は 足もとに 落とす。8. 光って いる 間の 自動の 回りは 今の まま。9. おぼえて いない 物が 作りかけに 入った セーブは 読む とき いつもの 物に もどす（できた せっけいずは そのまま → 上の 5）。10. まきものは 宝箱の `mid` の マス。11. 右クリックは `input.press('secondary')`。
- 実装の つなぎ目: 「おぼえて いない 物は 使えない」は controller でなく ボタン・ops・フックの がわ。`edit({op:'light'})` は どの 画面からでも 効く。
- テストの 足りない 4 つ（レビュー 指摘 6）は 3 版の テストに 足した: ② あかりを かえた ときの 見本の 光り〔`glowParts.test.ts`〕・しゅるいの ボタンに のせた 間の 光り〔`glowParts.test.ts`・`system.test.ts`〕・まきものは こわしても 水が 来ても 消えない〔`mineRecipe.test.ts`〕・紙 3 まいの 足もとの 落とし〔`recipes.test.ts`〕。

## PO の 答え その 2（仕様 3.2 版。2026-11-10 22:30 の yuzu の直しを受けて）

- 11 上の「よこ・たて・まどの かず」は 今の まま、その 下に ばしょの ボタン。12 名前の 行は **ヘルプに 置きかえる**（`editor-kind-name` は やめて `editor-hover-tip` に）。
- 13 ヘルプの 置き場所は **カーソルの 近く**（yuzu 22:29「カーソルの 近くが いい」。マウスに ついて うごく。ずらし 幅・画面の ふちで 止める 計算は developer が 仕様 §3.2 の 数で）。12 コマで 出る。ばしょの ボタンは 2 行目「いま: 〇〇」を 出す。
- 14 なし: (a) かべなしは 4 すみに 柱（き 12）(b) まどなしは「あな」(c) かべなしで 妖怪が 入れる ことは ふきだしで 知らせる だけ (d) やねなしは ちょうちんを つるす。
- 2A の 基準に AC9b（ヘルプ）・AC9c（なし）が 足された。
- tester の 注意（3.2 版の 準備で 気づいた。**レビューで 仕様の 文を 13 に そろえた ＝ 3.2.1 版**）: 13 は 仕様 §2.3・§3.2 の「ボタンに 固定」と 食い違う。テストは どちらでも 通る 緩い 形〔上の 質問 10〕。PO か designer が 決めたら、片方の 文を 直す。

## PO の 答え その 3（仕様 3.3 版。2026-11-11 09:45 の yuzu「レシピは 使った 時に 追加する」を受けて）

- アイテム `recipe_scroll`「レシピの まきもの」。宝箱・床の まきものから 持ち物に 入り、手に 持って 右クリックで 1 まい へって 1 つ おぼえる（テロップ・音・紙ふぶきは 使った その場）。15 ぜんぶ おぼえた あと ＝ 案 B（使うと かみ 3 まい）。16 右の 案内「よむ」・たべものと 同じ 道・1 回で 1 まい。17 はじめて 手に 入れた ときだけ 使い方の テロップ（保存に「はじめて」を 1 つ）。18 乱数から 坑道の 場所を はずす（世界ごとに おぼえる 順が 1 本）。19 2A の テストを 直す: `recipeLearn.test.ts`・`mineRecipe.test.ts`・`e2e/house2.spec.ts`・窓口 `found(at)` ほか。20 重ね数は 小物の いつもの 数・レア度 と 図鑑の 文は 仕様の 下書きどおり。
- 持って いる だけでは エディターに 出ない・「つくる」にも 出ない。`house.learn(id)` は テスト用の 近道。

## 2B の 進め方（PO 決め 2026-11-11。2A は PR #442 で main）

- yuzu 2026-11-11「つづきのさぎょうをすすめて」。2B ＝ 仕様 3.3 版の AC10〜AC14。ブランチは `claude/project-thread-42v6vo`（main から 切りなおし）。
- **しゅるいは A・B・C ぜんぶ 入る**（`<形>_<案>`。案 ＝ mura〔A〕・shiro〔B〕・kozan〔C〕の 対応は art README の とおり）。しゃちほこ ＝ B、まねきねこ ＝ B、まきもの ＝ C（決定 `docs/decisions/2026-11-10-house-recipes-look.md`）。
- **パーツごとに 1 つ だけの 物**（ばしょの ボタンの 絵 5・なしの 絵 3・「あたらしい！」の 印・ほたるいし／すいしょうの あかり・かべ なしの 柱）は、pixel-artist が 3 案から 32px で いちばん 見分けやすい 物を えらび、見本シート 1 まいに して PO に 出す。PO が 一覧に して yuzu に 見せる（ゲーム内 試作。yuzu は ローカルで 見る）。
- 三角形の 上限は **1 けん 3,000**（数の 表と 06-housing §21.7 を 直す）。
- 順番: ① tester が AC10〜AC13 の テスト（ユニット ＋ AC11 の E2E 1 つ）を 先に 書いて 赤を 確かめる ‖ pixel-artist が ゲームに 入れる 絵（ブロックの 面・ボタンの 絵）を 作る → ② code-reviewer → ③ developer が 実装（仮の 絵 `// 仮（HOUSE-2B で かえる）` を ぜんぶ 本物に）→ ④ レビュー・UI 検査 → yuzu が 見る（AC14）。
- E2E は 手元で 回さない（CI）。

## 2B の テストの 準備（tester。2026-11-11。仕様 3.3 版 AC10〜AC13。**実装の 前**。新しい テストは ぜんぶ 赤）

**約束**（名前の 本文は `src/house/recipes/lookKit.ts` 先頭の「2B の 約束」。変えるなら その ファイルと 下の テストを 一緒に 直す）:

| 窓口 | 置く 所 | 約束 |
|---|---|---|
| `houseShape(bp)` | `src/house/shape.ts` | bp の `roof`・`wall`・`windowKind`・`door`・`deco`・`light` を 読む。cells は 箱（よこ・たて・高さ）の ぜんぶの マスを 1 回ずつ。やね なしは 高さ 4 |
| `houseBox(bp)` → `{ w, d, h }` | 同上 | §4.2 の 表（なし 4／たいら 5・6／ななめ 7・8。かざりは えんとつ・しゃちほこ だけ）。案・かべ・まどの なしで かわらない |
| `houseTriangles(bp)` → 数 | 同上 | 家の 三角形（家具を のぞく）。上限 3,000 |
| `kindBlocks(part, kind)` → `BlockId[]` | `src/house/recipes/kinds.ts` | その **形**（かわら・てつの と …）の ブロックぜんぶ。同じ 形の 3 案は 同じ id を 共有して よい。ちがう 形の あいだでは 重ならない。やね・まどの `none` は `[]`、かべの `none` は 柱 |
| `houseShape` の `cells[].look` | `src/house/shape.ts` | その マスを 建てた しゅるいの id（案こみ）。床・家具・空気には ない。案の ちがいは look で くらべる |
| `HouseBook.lookAt(x,y,z)`・`recordHouse` | `src/house/book.ts`・`shape.ts` | 記録に 場所ごとの しゅるいを のこす。記録に ない 場所は `null` |
| `dugItemAt(book, id, x, y, z)` → `ItemId` | `src/dig/dugItems.ts` | 場所で 引く ほった アイテム（`lookAt` の しゅるいの `kindItem`。なければ `dugItemOf`） |
| `kindItem(part, kind)` → `ItemId｜null` | 同上 | ほると 手に 入る アイテム。案ごとに 別・名前は `kindName` |
| `siteOk(…, doorX, h = 5)`・`findSites(…, used, limit, h = 5)` | `src/house/build/sites.ts` | 床の 上 `h − 1` 段を しらべる |
| `HouseBuilder.locked` | `src/house/build/builder.ts` | 高さは `houseBox(bp).h` |
| `previewDrawCalls(state, mode)` → 数 | `src/house/preview/mesh.ts` | 見本 1 コマの 描画回数（光りは のぞく・材料ごとに まとめる） |

| 基準 | テスト | ふくむ もの |
|---|---|---|
| AC10 | `src/house/lookBox.test.ts` | 高さの 表〔やね ぜんぶ × かざり〔なし・1 つずつ・ぜんぶ〕× 3 つの 大きさ。表は テストの 中の 計算で、実装の 表を 写さない〕・のれん／はなだんでは かわらない・やね なしは 4・**案で かわらない**・かべ・まどの なしと 案で かわらない・**箱の 外に ない／箱の ぜんぶの マスが 1 回ずつ**〔3 案 それぞれ・おしろの のき・しゃちほこ・やね なし・かべ なし〕・**建てられる 場所**〔6 段目に 石: H 7 は 置けない・H 5 は 置ける・7 段目は H 8 だけ・H を わたさない 呼び方は 今まで どおり・findSites も〕・**建築中の 守り**〔locked の いちばん 上の 段 ＝ H − 1〕 |
| AC11 | `src/house/lookShape.test.ts` | しゅるいごとに ブロックが ある・いつもの 物と 形が ちがう・3 案が ちがう 形・**案を まぜた せっけいず**〔えらんだ しゅるいの ブロックだけ・床と 家具のぞく〕・**てつの と**〔戸の 下と 上が 戸の ブロック・記録の 戸の 場所・ほると その アイテム〕・**ほると その しゅるいの アイテム 1 こ**〔建てて から マスごとに `dugItemAt`。同じ id の 3 案も 場所で 別の アイテム〕・**かべ なし・やね なしでも 戸が あれば `recordHouse` で 記録に のる**・`cells[].look`・**なしの 家**〔やね なし＝4・ちょうちんは いつもの 場所・かざり つかない／かべ なし＝4 すみの 柱 3 段 と 戸 だけ・窓・はなだん なし／まど なし＝窓の マスが 空気〕 |
| AC11（夜の 湧き） | `src/house/lookDark.test.ts` | あかり 3 つ とも 中の どの マスも `darkForSpawn` が false・あかりを ほると 湧く・やね なし／かべ なし／まど なし／ななめの やね でも false。1C の `houseLight.test.ts` と 同じ 手順 |
| AC11（アイテム） | `src/content/items/houseLooks.test.ts` | 新しい アイテムの 登録〔件数は 表から〕・名前・めずらしさ・色分け・絵・説明の 行・図鑑の 文〔ルビ〕・しゅるいごとに 別。**値の 写し `content.json` は 実装で `npx vitest run -u src/content` して 差分を 読む** |
| AC11（E2E 1 つ） | `e2e/house1cBuild.spec.ts` の さいごの step〔`e2e/helpers/houseLook.ts`〕 | おしろの かわらの やね〔`kawara_shiro`〕の せっけいずを 作る → `buildNow` → 箱の ぜんぶの マスが `houseShape` どおり・箱の 外は 空気・やねの ブロックが 建って いて item が ある・`houses()` に のる |
| AC12 | `src/house/lookTriangles.test.ts` | 外 11×11・窓 いっぱいで 各 ばしょの いちばん 重い しゅるい〔案 まぜ〕＋ かざり ぜんぶ ＋ あかり ≦ 3,000／3 案 それぞれ だけの いちばん 重い 家 ≦ 3,000／家具は のぞく。いちばん 重い しゅるいは 窓口から 探す〔数を 書かない〕 |
| AC13 | `src/house/preview/lookDraws.test.ts` | 9×9・窓 いっぱい・ななめの やね ぜんぶ × かべ・まど・と ぜんぶ〔3 案 それぞれ・① ②〕・案まぜ ＜ 24／かざり 0→4 では かざりの 数 まで しか ふえない／ブロック 256 こえない・id 重ならない・しゅるいの ブロックが 登録表に ある |

**直した 既存テスト**: なし（`grep` で 2,000・三角形・`houseShape`・`ROOF_Y`・`KEEP_OUT` を 探した。家の 三角形の 2,000 を 見る テストは なかった〔2,000 は 文書だけ: `docs/art/requests/HOUSE-1-house-blocks.md`・`06-housing.md` §21.7・数の 表。開発が 3,000 に 直す〕。`build/plan.test.ts` の 足場 2,000 は 別の 数で そのまま）。いつもの 物の 家〔やね・かたちを 渡さない〕は 今まで どおり なので `shape.test.ts`・`houseLight.test.ts`・`sites.test.ts`・`builder.test.ts` は 緑の まま。消した テストは なし。

**赤の 結果**: `npm run typecheck` は 緑。`npx vitest run src/house/lookBox.test.ts src/house/lookShape.test.ts src/house/lookDark.test.ts src/house/lookTriangles.test.ts src/house/preview/lookDraws.test.ts src/content/items/houseLooks.test.ts` → 99 こ 中 94 こ 赤〔`houseBox`・`houseTriangles`・`kindBlocks`・`kindItem`・`previewDrawCalls` が まだ 無い ほか、`siteOk` の h・やね しゅるいを 読む 形が まだ 無い〕。のこりの 5 こ（ブロックの 数 ≦ 256 と id 重ならない・ちょうちんは どの やねでも いつもの 場所・草花は H に よらず 場所・h を わたさない siteOk・今までの 形の locked）は 今の 実装でも 通る 守り〔実装が こわしたら 落ちる〕。`src/debug` は 緑。E2E は 回して いない〔CI〕。

**仕様で あいまい だった 所（PO・開発に 聞きたい）**:

1. **`houseBox` ・`houseTriangles` の 置き場**: 仕様 §6.1 は「`blueprints()` に … `houseBox(blueprint)`」と 書く が、窓口か 関数か 決まって いない。テストは 純粋な 関数（`shape.ts`）に した。`window.__rikkun.house` に も 出す なら 足す だけ（テストは かえない）。
2. **かべ なしの 柱**: 柱の ブロック（art の 1 つだけ の 物）を `kindBlocks('wall', 'none')` に した。柱を ほると 何が 出るかは 仕様に ない〔き 12 を 使う ので き？〕。テストは 「あれば `dugItemOf` と 同じ」だけ 見る。
3. **やねの 上の かざり**: 高さが 1 段 ふえる のは えんとつ・しゃちほこ だけ（のれん・はなだんは かわらない）と 読んだ。やね なしの ときは かざりが あっても 4。
4. 〔**決まった**〕ブロックの 番号は 形ごと（案は 共有）。
5. **家の 三角形の 数え方**: 「区の メッシュの 三角形」（art 依頼）と 読み、`houseTriangles` は 実際に 描く 三角形。面の 数では ない。
6. **AC13 の 描画回数**: ユニットは `previewDrawCalls`（GPU なしで 数える 約束）。本物の レンダラーの 数は 既存の `e2e/house1b.spec.ts` AC34 ③〔いちばん 大きい 形〕に 任せる。かざり・案まぜで 本物を 数える E2E は 足して いない〔レシピを ぜんぶ おぼえて から 開く 手順が 要る ため。足すなら 1 本だけ〕。
7. **宝箱の くじ**: 仕様 §4.2「図鑑と 宝箱の くじの 箱にも 入る」は、新しい アイテムを `chestPool()` に 入れるか 決まって いない〔MINE-1 の 当たり方が かわる〕。テストは 見て いない。
8. **アイテムの 作り方**: 2B では 作れない〔「つくる」は 2C〕。`recipe` を 持つか どうかは 見て いない。

**PO 決め 2026-11-11: ブロックの 番号は 形ごと。案は 家の 記録から 場所で 引く。手で 置いた ブロックの 案の 記録は 2C で 決める**（ブロックは 217 使用・のこり 39 で、案ごとの id は 76 以上 いる ため）。これで 上の 表を 直した。

## 2C の 進め方（PO 決め 2026-11-12。2B は PR #458 で main）

- yuzu 2026-11-12「はじめていいよ」。2C ＝ 仕様 **3.4 版**の AC15〜AC21（AC17b 案の ボタン・AC18b 手で 置いた 物の 案 を ふくむ）、§2.5〜§2.7・§3.5。ブランチ `claude/house-2c`。
- 1 版の 家の 物 13（ブロック 5・家具 8）は はじめから「つくる」に 出る。yuzu の「レシピを 持っていないと 解禁されない」は レシピで ふえる 物の こと（2026-11-10 の 決め）と 読む。
- 「つくる」の 一覧を 中で スクロールに する 変え方（§7 の 22）は 2C の PR に 入れる（PO）。
- 手で 置いた ななめの やね・のれん・はなだんは 向き（`placedLook.facing`）で 描く。2B の `lookPieces(id, null)` は 立方体 なので、2C で 置いた 記録から 描く 道を 足す（ユニットで 向きごとの 形を 見る）。
- 順番: yuzu が §7 の 4 つを 見る → tester（AC15〜AC21・E2E 1 本）→ code-reviewer → developer → レビュー・UI 検査（AC20）→ yuzu（AC21）。E2E は 手元で 回さない。

## 2C の テストの 準備（tester 2026-11-12。窓口の 名前は src/house/recipes/craftKit.ts の「2C の 約束」）

| AC | ファイル | 確かめる こと |
|---|---|---|
| AC15 | src/dig/houseDig2C.test.ts | 家の ブロック・家具・HOUSE-2 の しゅるい ぜんぶ・記録 なしの lk_ を ほると その 物 1 こ（log に ならない）。いまは 緑（もどり防止） |
| AC16・AC17 | src/craft/houseCraft.test.ts | 1 版 13 物の 作り方・レシピ ゲート・3 案 同じ 材料・まねきねこ（かまど）・はなだんの 花の 順・実績名の 除外 |
| AC17b | src/ui/craftHouseCards.test.ts | カードの 出方・並び・案の ボタン（CraftLooks） |
| AC18 | src/dig/placedLooksDig.test.ts・e2e/house2c.spec.ts | 置く→ほる 通し・戸は 家の 記録を ふやさない・あかりの 湧かない 範囲。E2E は 本物の クリックで 1 本 |
| AC18b | src/house/placedLooks.test.ts・src/dig/placedLooksDig.test.ts・src/world/render/placedLookPieces.test.ts | 置いた 記録の 保存・向き・消え方・2 人・向きごとの 描き分け |
| AC19 | src/content/items/houseCraftText.test.ts | 図鑑の source 文 |
| AC20 | e2e/ui-gate.spec.ts（craft-house・duo-inv-craft-house） | 画面の 数・大きさ |
| AC21 | 既存の 件数・スナップショット | content.json は 実装側で `-u` |

直した 既存テスト: craft2.test（canCraftAny は 木 1 で true）・houseBlocks.test（source 文）・live3-text.spec は 5 まいの まま（まねきねこ は おぼえる まで 出ない。code-reviewer で 6 → 5 に もどした）。placedLookPieces.test の「3 案で ちがう」は 形 だけで なく 絵・色 も 見る（2B の 建てた 家でも さんかく・かわら・きん は 3 案で 形が 同じ）。
