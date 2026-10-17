# CHAR-2: 弓と刀の動きの絵をゲームに入れる（#150）

| 項目 | 内容 |
|---|---|
| マイルストーン | CHAR（キャラの 第 2 段階。`docs/design/CHAR-1-v2-sprite.md` §2.3・§4.8） |
| 状態 | デザイン中 |
| 周回数（全ループ合計） | 0 / 10 |

## 目的（オーナーの言葉で）

- 「薙刀以外おっけー！ いったんコレでマージしちゃいましょう！」（2026-10-16 22:44）
- 「刀には3つの構えがありますが、どれもアニメーションの一コマ目をつかえばいいはずです」（22:53）
- 刀を持って歩くときに 今の歩く絵（刀なし）を出す案には「いや、それはまずい、上半身はそれぞれの構えの絵、下半身は弓の構え移動の絵をそれぞれマージして 構えながら移動している絵を作りましょう」（22:56）
- 絵を作ったときの 直しの言葉（2 回目、なぎなた以外）: 大けさぎりは「1歩目の踏み込みを、2歩分前に…その場で上段の構えに」、切り上げは「下段に構えたまま4歩あるき最後の一歩と同時に振り上げ…振り上げ姿勢のままさらに5F止まって…その場で下段の構えに」、突きは「フォローバックで、元の位置まで歩いてゆっくりもどり…フォローバックを5Fくらい追加」。弓は「完璧」。

## やること

オーナーが OK した 6 つの 動きの絵を、ゲームのキャラ（8 方向のドット絵の板、`src/char/`）で 出す。

| 絵 | いつ 出すか（オーナーの決定・PO の考え） |
|---|---|
| `katana_thrust`・`katana_kesa`・`katana_kiriage` | 刀の わざの あいだ（出だし → 当たり → もどり）。**刀を持って 立っているときの かまえ（中段・上段・下段）は そのわざの 1 コマ目**（オーナー決定） |
| `katana_walk_chudan`・`katana_walk_jodan`・`katana_walk_gedan` | **刀を持って 歩くとき**、今の かまえの絵（オーナー決定 22:56。絵も オーナー OK 23:19）。上半身 = かまえ、足 = 弓を かまえて 歩く 動きの 足の 運び。8 コマの くりかえし。走るときも これ（PO の考え。走る絵は ない） |
| `bow_shot` | 弓を 引いているあいだ と はなしたとき（PO の考え: 引いた tick で 0〜7 コマめ、7 コマめ = いちばん引いた絵 = 40 tick = 段 3。はなすと 8〜11 コマめ）。弓を持って立っているときは 1 コマ目（刀の かまえと そろえる。PO の考え） |
| `bow_walk` | 弓を 引きながら 歩くとき（くりかえし） |
| `bow_hold_walk` | 弓を 持って 引かずに 歩くとき（PO の案を オーナーが 採用 23:19。上半身 = `bow_shot` の 1 コマ目、足 = 弓を かまえて 歩く 動き。8 コマの くりかえし） |
| `bow_rapid` | つづけて うつとき（PO の考え: うって すぐ 次を 引きはじめたとき） |

- **わざの長さ**を 絵に合わせる（オーナーの直しの言葉どおりに 絵を作った長さ）: 突き 4/2/8 → **4/2/35**、大けさぎり 28/6/48 → **28/6/72**、切り上げ 15/5/33 → **38/5/61**（出だし/当たり/もどり、tick）。`src/contracts.ts` の `W2_SETTING_DEFAULTS.bladeTech`。
- **体を 前へ 動かす**: 絵は 腰を まん中にして 撮ってあるので、体（当たり判定・カメラ・板）を `advance` だけ 前へ 動かさないと 足が すべって見える。大けさぎり 0.80 m・切り上げ 1.04 m 前へ。突きは 0.32 m 出て 元の位置へ もどる（今の `thrustLunge` 0.25 の かわり）。かべでは 止まる（今の `PlayerController.lunge`）。カメラが ガクガク しないこと。
- かまえの印・弓の印（`src/ui/aimMarks.ts`）は 残す（PO の考え。かまえは 立っているときしか 絵に出ず、弓の段も 絵だけでは 分かりにくい）。
- なぎなたは 入れない（オーナーの直し待ち、#67）。なぎなたは 今のまま（パンチ＋白い弧）。

## 材料（PO が 作ってオーナーが OK したもの）

- `/mnt/project-files/char-motion-2/`: `bow_shot.png`・`bow_walk.png`・`bow_rapid.png`・`katana_thrust.png`・`katana_kesa.png`・`katana_kiriage.png`（と 入れない `naginata_sweep.png`）、`atlas.json`、`README.md`（中身の説明・tick の表・advance の意味）、`sheet_all.png`。
- コマ表の形は 今の `public/models/char/` と 同じ（1 コマ 256、行 = 段 × 8 + 方向 の 24 行、列 = コマ、色見本の 20 色だけ、ふちから 2 ドット以上 はなれる）。コマ数だけ ちがう（11〜18）。
- `atlas.json` の 新しい 動きには `ticks`（コマごとの 長さ、tick）・`phases`（刀だけ、出だし/当たり/もどり）・`advance`（コマごとの 前へ 進んだ きょり m）・`step`（最後に 進んだ きょり）・`labels`・`note` がある。今の `atlas.json` は idle・walk・run・jump だけ。

| 絵 | コマ | ticks | 合計 |
|---|---|---|---|
| bow_shot | 12 | 6,6,6,6,6,5,5,12,4,6,6,6（7 コマめが いちばん引いた絵、40 tick め） | 74 |
| bow_walk | 8 | 9 × 8 | 72 |
| bow_rapid | 11 | 4,4,4,4,4,4,5,3,4,4,4（0〜2 矢を とる・3〜4 つがえる・5〜6 引く・7 はなす・8〜10 もどる） | 44 |
| katana_thrust | 11 | 2,2,1,1,3,11,4,4,4,4,5 | 41 = 4+2+35 |
| katana_kesa | 15 | 8,7,4,4,5,2,2,2,5,28,8,8,8,8,7 | 106 = 28+6+72 |
| katana_kiriage | 18 | 5,5,5,5,5,5,4,4,2,1,2,8,27,6,6,6,4,4 | 104 = 38+5+61 |
| katana_walk_chudan・jodan・gedan | 8 ずつ | 9 × 8（bow_walk と 同じ 足の 運び） | 72 |
| bow_hold_walk | 8 | 9 × 8 | 72 |

かまえ歩き 3 つと bow_hold_walk は 2026-10-16 23 時すぎに 作り、オーナーが OK（23:19「はい！すばらしいです！提案も素晴らしい、弓を持って歩くも採用で」）。絵は 同じ `/mnt/project-files/char-motion-2/` に 入れる。

## 重さ（PO が はかった数）

- GPU（色番号 1 バイト。1 コマ = 256 × 6144 = 1.57 MB）: 今の 4 つ 50.3 MB（目安 64 MB は 第 1 段階の分。`CHAR-1-v2-sprite.md` AC31）。弓の 3 つ 48.8 MB（＋ bow_hold_walk 12.6 MB）、刀の わざ 3 つ 69.2 MB ＋ かまえ歩き 3 つ 37.7 MB。ぜんぶ 読むと 218.6 MB。
- 動きごとの 余白を切る（§4.8 ②）は 5〜25% しか へらない（どのコマも ほぼ 全部の はばを 使う）。
- PNG: 新しい 6 まいで 7.4 MB（今の 4 まいは 5.2 MB。目安 8 MB は 第 1 段階の分）。
- 仕様 §4.8 ③「第 2 段階の動きは 使うまで読まない」。目安を こえたら 性能ループで決める（§4.8）。PO の考え: その武器を 持ったときに 読み、読んだら 持ったまま（持ちかえのたびに 読み直して カクつかないように）。

## 今のしくみ（読む所）

- キャラの板: `src/char/`（`loader.ts`・`motion.ts`・`sprite.ts`・`view.ts`・`char.test.ts`）。`src/main.ts` の `createCharSprite`（`basePath: './models/char/'`）と `sprite?.step(...)`。
- 刀: `src/tools/blade/BladeSystem.ts`（`state()` の `stance`・`tech`・`phase`・`frame`、突きの ふみこみ `deps.lunge`、`motion()` の 歩く倍率）。設定 `src/contracts.ts` の `W2Settings`（`bladeTech`・`thrustLunge`・`bladeMoveMul`）。
- 弓: `src/tools/bow/BowSystem.ts`（`state()` の `drawing`・`drawTicks`・`stage`・`nockLeft`、出来事 `arrowShot`・`dryRelease`）。
- 向き: `src/player/PlayerController.ts`（ねらう行動のあいだと はなして 30 ステップは カメラの yaw へ）。
- こわれそうな 今のテスト: `e2e/char1-accept.spec.ts` AC29（刀・弓でも motion は idle/walk/run/jump）、`src/char/char.test.ts` AC30・AC31・AC40、`src/contracts.w2.test.ts`（bladeTech の数）、`src/tools/blade/blade.test.ts`（ふみこみ）、`e2e/w2.spec.ts`（わざの tick）。

## 関連
- 仕様書: `docs/design/CHAR-2.md`（これから）
- 第 1 段階の仕様: `docs/design/CHAR-1-v2-sprite.md`
- 絵の見本ページ: https://claude.ai/artifact/QziPk9eB6H762uDmScDUe6
- テストレポート:
- 指摘台帳: `docs/loop-ledger/CHAR-2.md`

## 経過（PO が追記）
| 日付 | ループ | 結果 | メモ |
|---|---|---|---|
| 2026-10-16 | — | — | オーナーが 6 つの絵を OK。#150 を作った |
| 2026-10-16 | — | — | かまえ歩き 3 つ・弓を持って歩く を作り オーナー OK（ぜんぶで 10 の動き） |
