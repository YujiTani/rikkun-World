# CHAR-4: 刃の軌跡（きせき）と 刃の色（#161）

| 項目 | 内容 |
|---|---|
| マイルストーン | CHAR（キャラの 第 2 段階のつづき。`docs/design/CHAR-2.md` の 刀の わざ） |
| 状態 | デザイン中 |
| 周回数（全ループ合計） | 0 / 10 |

## 目的（オーナーの言葉で）

- 「ニンテンドースマッシュブラザーズのように、半月のような形にして欲しい」（2026-10-17 00:19 yuzu）
- 決定カード「刃も変える」（00:18。キャラの絵の 刃も 武器の色に ぬりかえる）
- 決定カード 3 案から **B グラデーション**（00:38。外のへりが 光り、内側へ すける、すぐ 消える）
- 武器ごとの 色の表から 軌跡の色を 決める（木刀 茶・刀 白・水晶の刀 水色＋星・なぎなた 青白）。刃先の 通り道は 3D のデータ（`blade_path.json`）から コマごとに 取る
- 決定の記録: `docs/decisions/2026-10-17-blade-trail.md`

## やること

1. **刃の軌跡**: 刀（ぼくとう・かたな・きらきらの かたな）の わざ 3 つ（突き・大けさぎり・切り上げ）で、刃先が 通った所に 半月の 光の 帯を 出す。見た目は B（そと → うち で 4 だんに すける、9 ステップ = 0.15 秒で 4 だんに 消える、しっぽから 消える）。刃先の 位置は `blade_path.json` の 1 ステップごとの 点（右・上・前、腰の 真下の 地面から）を 体の 本当の位置に 足して 取る。
2. **武器ごとの色**: `W2Settings.bladeTrail`（`src/contracts.ts`）を 軌跡の色・そとの光・刃の地・刃の光 の 表にする。
3. **キャラの絵の 刃の色**: 刀の 6 まい（`katana_thrust`・`katana_kesa`・`katana_kiriage`・`katana_walk_chudan`・`_jodan`・`_gedan`）の 刃を 新しい 2 色（色見本の 表の 20 番 = 刃の地・21 番 = ふちの光。色見本は 22 色）で 撮り直した絵を 入れ、板の 色を 持っている 武器の色に かえる。弓は 刃が ないので 変えない。
4. 今の 刀の 白い帯・線（`src/fx/weaponFx.ts` の 扇の帯と 突きの線）と、きらきらの かたなが ふったとき とばす 星 3 つは、新しい軌跡に 置きかえる。
5. **なぎなたは 今のまま**（パンチ ＋ 白い弧。#67）。表の 値だけ 持つ。

## 材料（PO・アートが 作ったもの）

- `/mnt/project-files/blade-trail/`: `option-B.png`（選ばれた 見本。武器 3 つ × 大けさぎり・切り上げ × 4 方向 × 4 コマ）、`option-A.png`・`option-C.png`（えらばれなかった 案）、`compare.png`、`README.md`（形・色の表・性能の 見つもり）、`blade_path.json`（3 わざの `perTick`。突き 42・大けさぎり 107・切り上げ 105 点。各点 `base`＝つば・`tip`＝刃先、m）、`scripts/render.py`（見本を 作った 道具。半月の はば・消え方・星の 決め方の 元）。
- 撮り直しの絵（PO が 進めている）: 刀の 6 まいを 刃の地 = 表の 20 番・ふちの光 = 表の 21 番 で。見た目の 色は 今の 刃（PO の 言う 6・18）と ほぼ 同じ。

## 重さ（見つもり。README）

- 軌跡: 1 本で 三角形 約 150〜290・描画 1 回（水晶の 星で ＋1）。同時に 1 本だけ。世界（約 20 万 三角形・61 回）に くらべて ごく 小さい。
- 刃の色: テクスチャは ふえない（色見本が 2 色 ふえるだけ）。切りつめた 絵の 大きさ（CHAR-2 §4.7 の 本当の値）は 刃の 形が 同じなら 変わらない。

## 今のしくみ（読む所）

- 軌跡: `src/fx/weaponFx.ts`（`trailStep`・`setTrailShape`・`sectorGeometry`）、`src/fx/weaponFxModel.ts`（`trailOpacity`・`trailFadeSteps`）、`src/contracts.ts` の `BladeTrailStyle`・`W2_SETTING_DEFAULTS.bladeTrail`。
- わざの 時間と ふみこみ: `src/tools/blade/advance.ts`（絵の時 τ・ふみこみ A）、`blade.state().move`（向き u・はじめの位置 O）。
- キャラの板: `src/char/palette.ts`（20 色）・`src/char/sprite.ts`（`uPalette`）。影のパッチ `src/world/render/shadow/shadowPatch.ts` は 板の シェーダーの 色の 1 行を 書きかえている。
- なぎなたの 白い弧: `src/camera/dollAnim.ts`（`arc`）・`src/camera/BlockDoll.ts`。
- こわれそうな テスト: `src/ui/weapon2ui.test.ts`（きせき 8F）、`src/fx/weaponFx.relay.test.ts`（にせの deps）、`src/char/sourceSheets.test.ts`（20 色）。くわしくは 仕様書 §6.1。

## 関連
- 仕様書: `docs/design/CHAR-4.md`
- 前の 仕様: `docs/design/CHAR-2.md`（わざの 長さ・ふみこみ・切りつめ §4.7）
- 指摘台帳: `docs/loop-ledger/CHAR-4.md`
- テストレポート:

## 経過（PO が追記）
| 日付 | ループ | 結果 | メモ |
|---|---|---|---|
| 2026-10-17 | — | — | オーナーが 半月・刃も変える・B を 決定。#161 |
