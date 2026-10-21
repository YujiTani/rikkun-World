# WEAPON-9: 虹（にじ）— WEAPON-7 の PR3（強さ 4〜10・ためわざ シャイニング・にじ色の 斬撃）

| 項目 | 内容 |
|---|---|
| issue | #70（WEAPON-7 の さいごの 1 本。この PR で Closes #70） |
| ブランチ | `claude/weapon-9-niji`（main から） |
| 状態 | オーナーへの 質問まち（GLB・見本の 絵・マージの 順） |
| 周回数（全ループ合計） | 0 / 10 |

## 目的（オーナーの言葉そのまま、2026-10-21 yuzu）
「もう一本まだ実装してないレジェンダリーの刀の虹ってのがあるんだけど、これの開発を別セッションですすめたい」

## もう 決まっていること（オーナー決定）
`docs/decisions/2026-10-18-legendary-weapons.md`
- 10 行目: **虹（にじ）**: 落ちるたびに 強さが 4〜10 で ランダム。ためわざは **シャイニング** — 両手を 上げて ゆっくり 空中に うかび、まわりに ドームの オーラ（半径 7 マス）。ふれると 大ダメージ。エフェクトは **にじ色の 斬撃**。
- 22 行目（見た目）: おもちゃの 光る 刀。まっすぐな 刃が 中から にじ色（緑・青・赤むらさき）に 光る（見本 `weapon7/ref/niji.png`。他人の 絵なので リポジトリに 入れない）。
- 28 行目（名前）: 漢字に ルビ **［虹｜にじ］**。「にじの けん」は 使わない。id は `niji`。
- シャイニングの 見本（shining.jpg・dome.png）: まん中が 白く 強く 光る 大きな 球・ドーム。ふちは 光る リング、まわりに にじ色の 光の 帯が うずを まいて 飛ぶ。中に 光の かけら・つぶが 舞う。
- 47 行目（体の 動き）: 男の子の Meshy GLB の **WallFlip の 後半** を シャイニングの 体の 動きに 使う 案。3 連続攻撃用（コンボ用）・なぎなたを 振りまわす skill2 も ある。**PR3 に 取りかかる とき GLB の 置き場所と 中身は オーナーに 聞く**。
- 68 行目: レジェンダリーも 3 段攻撃 → `bladeCombo.items` に **虹も 入れる**。
- 仕様 2.2 の 数（オーナー確認① すみ）: 強さ 4〜10 は 同じ 重さ・うかぶ 2 マス・4 秒・ダメージ 強さ × 2.5・同じ 妖怪に 1 秒に 1 回・中は 安全・おわったら 10 秒 休み・たいきゅう 10000。ヌシの 表は ランダム。

## 仕様
- 本体は `docs/design/WEAPON-7.md` §5（虹）・§11 PR3 の AC28〜AC34・§12。**新しく 仕様は 作らず、WEAPON-7 仕様の 版 2.3 で 次を 足す**（designer → design-reviewer）:
  1. 体の 動きを 「上段の かまえの 使い回し」から **GLB の WallFlip 後半**（オーナーの 答え しだい）へ。女の子キャラの とき どうするか。
  2. 3 段攻撃に 虹（68 行目。雷神剣と 同じ: つなぎの 窓で 次の 段、窓の 外は ための 先行入力）。
  3. 絵は **新しい 作り方**（`docs/art/PIPELINE.md`・DESIGN.md 17・18 章、決定 `2026-10-21-thunder-b-billboard.md`）: 「常に カメラに 正面・一番 決まる 絵が 出る・ペラペラに 見せない」。ドームの まく・リングは 3D、帯・かけらは ビルボードの ドット絵 など。エフェクト 1 つの 上限（描画回数 4・三角形 150）を ドームでは どう 数えるか。
  4. 性能: シャイニングも **最初の 1 回で 材質の 作りなおしが 起きない**（`docs/tickets/PERF-thunder-warmup.md` と 同じ 先に あたためる 作り）。一人称で 画面が 白く ならない。
  5. ための 光・音は WEAPON-8 で 作り直した 共通の もの（`src/legend/chargeLight.ts` など）を 使う（WEAPON-8 の マージ後）。

## 進め方（CLAUDE.md「1 つの issue の進め方」）
1. デザイン: designer（版 2.3）→ design-reviewer → オーナー確認①（足した 所だけ）。
2. アート: 刀の アイコン・手に 持つ 絵・にじの 斬撃・ドーム（帯・かけら）。art-director → pixel-artist → art-reviewer → オーナー。見本が あるので 方向の 3 案は オーナーに 聞く。PixelLab は lite だけ（呼ぶ 前後の 残りを `art/WEAPON-9/pixellab/` に 記録。上限 3 回）。体の 動き（GLB → スプライト）は GLB しだい。
3. サウンド: `shiningStart`・`shiningHit`・`shiningEnd`・`shiningReady`（sound-director → sfx-designer → audio-reviewer → オーナー試聴）。
4. ゲームに 入れた 試作の スクショで オーナーの OK（テストの 準備の 前）。
5. tester が AC28〜AC34 ＋ 版 2.3 の 基準の E2E（赤）→ code-reviewer。ブランチの 最初の コミット。
6. developer → code-reviewer ＋ 検証（UI 検査・ui-reviewer・tester）。
7. 性能の 前後（描画回数・三角形・処理時間。シャイニング中・最初の 1 回）。
8. PR は オーナーが「作って いい」と 言ってから。見た目が 変わるので マージは オーナー。

## ぶつかりそうな 所（WEAPON-8 = `claude/weapon-8-fujin`、#239）
WEAPON-8 が 大きく さわっている: `src/legend/LegendSystem.ts`（ための 光・ためわざ）・`src/legend/WaveSystem.ts`・`src/fx/thunderFx.ts`・`src/fx/legendSounds.ts`・`src/fx/sfxCatalog.ts`・`src/main.ts`・HUD（`src/ui/buffIcons*`）・`src/legend/chargeLight.ts`・`handPos.ts`（新しい）。
虹も `LegendSystem.ts`（`shining`）・`legendSounds.ts`・`sfxCatalog.ts`・`main.ts`・`contracts.ts` を さわる。
→ **PO の おすすめ: WEAPON-8 を 先に マージ → この ブランチに main を 取りこんでから 実装**（デザイン・アート・音は その前に 進めて よい）。マージの 順は オーナーに 聞く。

## 関連
- 仕様: `docs/design/WEAPON-7.md`（§5・AC28〜AC34）、`docs/design/ART-PIPE-1.md`、`docs/art/DESIGN.md` 17・18 章、`docs/art/PIPELINE.md`、`docs/art/MOTION.md`、`docs/design/BALANCE.md`
- 前の 2 本: `docs/tickets/WEAPON-7.md`、`docs/tickets/ART-PIPE-1.md`、`docs/tickets/PERF-thunder-warmup.md`、`docs/tickets/WEAPON-8.md`（別ブランチ）
- 指摘台帳: `docs/loop-ledger/WEAPON-9.md`

## オーナーへの 質問（2026-10-21）
1. 男の子 GLB（WallFlip・コンボ・skill2）の 置き場所と 中身。このセッションからは 共有フォルダ（`/mnt/project-files/`）が 見えない。
2. 見本の 絵（niji.png・shining.jpg・dome.png）を チャットに もらえるか。
3. マージの 順（WEAPON-8 の あと が おすすめ）。

## 経過（PO が追記）
| 日付 | ループ | 結果 | メモ |
|---|---|---|---|
| 2026-10-21 | 準備 | タスク票を 作った | 仕様は WEAPON-7 §5 が ある（確認① すみ）。足す 所を 版 2.3 で |
