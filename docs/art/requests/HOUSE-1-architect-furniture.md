# developer への 依頼: HOUSE-1 建築士さん（案 A）と 家具 5 つ を ゲームに 入れる

2026-10-29 art-director。オーナー（yuzu）決定 2026-10-29: 案 A「はっぴの だいくさん ＋ ごつごつの くりの 木」（色の 入れかえ なし。`docs/decisions/2026-10-29-housing-look.md`）。
見た目の きまり: `docs/art/design/06-housing.md`（DESIGN §19）。この メモは「どの コードを 元に、どう 入れるか」。

## 読むもの
- DESIGN §19（形・色・うなずき・ほかの 動きの 目安・三角形）、§16.2・16.8・16.9（どうぶつの 作り。建築士さんも 同じ）、§3.1（面の 明るさ）。
- 仕様 `docs/design/HOUSE-1.md` §2.2（建築士さん）・§2.12（家具の はたらき）・§3.1（盛り上げ）・§3.6（動き）・§4.3（家具の 大きさ・まわす）・§4.8（id は developer が 決める）。

## 元に する コード（パス）

| 何 | パス | 使う 所 |
|---|---|---|
| **数の 元（案 A だけ）** | `docs/art/house-1/proto/houseA.ts.txt` | `architectSpec()`（骨と 形と 色）・`ARCH_TOOL_REST`・`nodPose()`・`applyNod()`・`houseTiles()`（タイル 13 まい）・`furnitureBoxes()`（家具の 箱）・`FURN_CELLS`。見本と 同じ 数で ある ことを たしかめ済み（三角形 514・ふちどり 430、家具の 箱も 一致。ちがう のは おふろの 水 5.2 → 5 だけ） |
| 見本 全体（3 案・撮影・シート） | `/mnt/project-files/housing-art/proto/`（`main.ts` の `archA`・`nodPose`・`applyPose`・`setA`・`furniture`、`shoot.mjs`、`compose.py`） | 撮り方・面の 明るさ・絵の うつし方 を 見る とき |
| 小キューブ → 1 メッシュ | `src/animals/models/voxelMesh.ts`（`buildModel`・`cachedModel`） | 建築士さんの 形 |
| 形の 書き方の 型 | `src/animals/models/chickenSpec.ts`（`Part`・`Prim`・`V3`） | `architectSpec()` の 型 |
| 材料・丸い 影 | `src/animals/models/animalRenderParts.ts`（`shadeMat`・`blobTexture`） | 面の 明るさ（骨で 回った あと）・足もとの 影 |
| 骨の 組み方・ふちどり | `src/animals/models/AnimalRenderer.ts`（`rigOf`・ふちどりの 材料） | SkinnedMesh 1 つ・ねらい中の 水色の ふちどり |
| 家具を 区の メッシュに 足す | `src/world/render/kotatsuMesh.ts`（`pushKotatsuCell`）、`src/world/render/voxel/sectionExtras.ts`、`src/world/render/config.ts`（`FACE_SHADE_BY_INDEX`） | 家具の 面を 区の メッシュへ（描画 +0） |
| 多マスの 家具 | `src/world/blocks/kotatsu.ts`（本体 ＋ 部分 の マス） | テーブル・おふろ（2×1） |
| タイル | `src/world/blocks/textures.ts`（`TILE_NAMES`・`tileSubUv`）、`src/world/blocks/kotatsuArt.ts` | 13 まいを atlas に 足す |

## やる こと

### 1. 建築士さん
1. `architectSpec()` を そのまま ゲームの 形の データに する（置き場所・名前は developer が 決める）。`buildModel` で 1 メッシュ、骨は 7 本（body・legL・legR・armL・armR・tool・head）。
2. 骨 `tool` には いつも `ARCH_TOOL_REST`（x +28°・z −10°）を かける（木づちを かたに のせた 形）。
3. 材料は どうぶつと 同じ `shadeMat`。ねらい中の ふちどり（`#7FE0FF`、0.6 点 ふくらませた 形）・足もとの 丸い 影（直径 約 0.9）も どうぶつと 同じ。
4. うなずき: 話しかけた 次の ステップから `applyNod(bones, f)`（f = 0〜22。1 ステップ 1 コマ。ふきだし・声は f = 0）。**うなずいて から メニューを 出す**（PO 決定 2026-10-29。仕様 §2.2-4: うなずきの 22 ステップは ゲームの 時間が 進み、おわったら メニューを 出して 時間を 止める）。
5. ほかの 動き（よろこび・とんかち・おっとっと・かしげる・あるく）は DESIGN §19.5 の 目安で 作る。作ったら GIF で art-director → yuzu。
6. 三角形 ≤ 600（ふちどり ≤ 体の 2 倍）を ユニットテストで たしかめる（`buildModel(architectSpec()).tris`）。描画は 1 人 1 回（ねらった とき ふちどり +1）。

### 2. 家具 5 つ（テーブル・いす・あんどん・ほんだな・おふろ）
1. `houseTiles()` の 13 まい を atlas に 足す（16×16・Nearest・シード つき。名前は 案 → developer が 決める）。
2. `furnitureBoxes()` の 箱を、こたつと 同じく 区の メッシュに 足す（`pushKotatsuCell` と 同じ やり方。描画 +0）。2×1 の 家具は 本体 ＋ 部分 の マスに 分け、箱を マスの さかい（x = 9/9）で 切る。
3. 絵の うつし方（ローカルの 座標で 決める。家具を まわすと 絵も まわる）: 上・下 (x, −z)・−z の 面 (x, y)・+z の 面 (−x, y)・+x の 面 (z, y)・−x の 面 (−z, y)、1 ブロック ごとに くり返す。画素 = floor(frac(u)·16)、行 = 15 − floor(frac(v)·16)（`houseA.ts.txt` の 家具の 説明 と 同じ）。
4. 面の 明るさ = `FACE_SHADE_BY_INDEX`。`glow` の 箱（あんどんの 紙）は 4 面とも 1.0。あんどんは たいまつと 同じ 光（`torchLevel` 14）。
5. 向き: 前 = −z（方眼の 下 =「まえ」）。まわす は 90° ずつ（2×1 は 縦横が 入れかわる。仕様 §4.3）。
6. 当たり = 方眼の マス × 高さ 1。いすの せもたれの 上 2/9 は 見た目 だけ。
7. 三角形 ≤ 300（1 こ。いちばん 多い ほんだな 264。床に つく 面・ほかの 箱に うまる 面は けして よい）。

### 3. たしかめ（見た目が 変わる ので、マージの 前に yuzu の OK。決定 4）
- ゲームの 中で、`docs/art/house-1/A.png` の 1 だん目と 同じ ような 場面（草の 上に 建築士さん・プレイヤー・家具 5 つ・今の こたつ・たんす・かまど）を 撮る。
- うなずきは `window.__rikkun` で 一時停止・コマ送り して、ななめ前 と 横 の GIF（ふつう ＋ 4 倍 おそい）を 撮り、`docs/art/house-1/A-nod.gif` と くらべる。
- スクショと GIF は PO に わたす（PO → yuzu）。art-director が 見る 点: シルエット（木づちの T）・色（19.3・19.8）・面の 明るさ・絵の 向き（ほんだなの 本が 前、ざぶとんが 上）。

## しない こと
- 形・色・角度を 変えない（変える ときは art-director に 聞く）。Math.random を 使わない（シード つき）。
- `public/` に 絵の ファイルを 足さない（コードで 描く。どうぶつ・たんすと 同じ）。
