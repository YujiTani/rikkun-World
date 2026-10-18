# CHAR-5: 男の子のキャラ（キャラえらび）

| 項目 | 内容 |
|---|---|
| マイルストーン | CHAR のつづき |
| 状態 | デザイン中 |
| 周回数（全ループ合計） | 0 / 10 |

## 目的（オーナーの言葉で）
2026-10-18 yuzu「新しいキャラクターをつくってほしいです。男の子」「女の子と同じモーションにしたい」。ちびキャラ（白髪・はかま・刀）の設定画と Meshy の GLB は yuzu が用意。
見た目の試作（ゲーム内スクショ）は 2026-10-18 23:00 に yuzu OK（頭を少し起こす・腕 1.6 倍）。

## PO が決めた初めの値（仕様でたしかめて直してよい）
- **キャラえらび**: 女の子（今のキャラ）と 男の子 の 2 人から えらぶ。えらぶ場所は 設定の画面（「かげ」の近く）。おぼえ方は かげ と同じ（localStorage `rikkun.char.v1`、`?nosave=1` では読まない、`?char=boy|girl` で上書き）。切りかえは その場で（読み直しなし。読みこみ中は 今の代わりの絵）。
- **絵の置き場**: `public/models/char/girl/` と `public/models/char/boy/`（今の `public/models/char/` は girl へ 移す。`art/char-sheets/` も同じ分け方）。atlas.json は キャラごと。
- **色見本はキャラごと**: 今は `src/char/palette.ts` の 1 つだけ。キャラごとの色見本（girl 22 色・boy 20 色＋刀の刃の 2 色）を atlas.json か palette.json から読み、板の `uPalette` を そのキャラの色に。色番号の数（1 バイト）は変えない。
- **男の子の 1 版の動き**: たつ・あるく・はしる・ジャンプ の 4 つ（絵は `/mnt/project-files/char-boy/sprites/`。撮り方 `scripts/render_boy.py`、頭 -20 度・腕 1.6 倍）。**刀・弓・パリィの絵は この issue では作らない**: 男の子のときは 女の子の わざの絵を そのキャラの色見本で出す（仕様が決める。例: わざの絵は 女の子の色見本のまま出し、わざが終わったら 男の子へ戻る）。男の子の わざの絵は 次の issue（Skill_02 なぎなた・Weapon_Combo_1 3 段・Wall_Flip 虹チャージ・素手 Right_Jab_from_Guard・つるはし・オノ）。
- **背の高さ**: 男の子は モデル 1.63 m（女の子 1.7 m）。ゲームの当たり・足もとの位置は変えない（CHAR_HEIGHT 1.8 に合わせて板の大きさを決める今のしくみのまま）。
- GPU メモリ: えらんでいない方の絵は読まない（§4.8 ③）。目安 64 MB は変えない。
- 文字: 「キャラ」「おんなのこ」「おとこのこ」（ひらがな・カタカナ）。

## 進め方
1. designer が仕様書 `docs/design/CHAR-5.md`（受け入れ基準つき）→ design-reviewer → 遊び方の要点を yuzu に見せて OK。
2. tester がテスト準備（赤）→ code-reviewer → developer → code-reviewer・tester → PR。
3. CI 緑 → yuzu がマージ（見た目が変わる PR なので自動マージしない）。

## 関連
- issue: #231
- 前の仕様: `docs/design/CHAR-1-v2-sprite.md`（§3.1 色見本・§4.8 重さ）・`CHAR-2.md`（切りつめ）・`SHADOW.md` §8.1（設定のおぼえ方）
- 素材: `/mnt/project-files/char-boy/`（設定画・GLB・sprites・palette.json・scripts）、team memory `char-boy`
- 指摘台帳: `docs/loop-ledger/CHAR-5.md`

## 経過（PO が追記）
| 日付 | ループ | 結果 | メモ |
|---|---|---|---|
| 2026-10-18 | 0 | 試作 OK | 4 動きのドット絵・ゲーム内スクショを yuzu が OK |
