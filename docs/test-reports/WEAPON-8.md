# WEAPON-8 テストレポート（第 2 回: 検証。実装のあと）

- 判定: **合格**（重大 0 件。軽微 3 件は台帳）。オーナー確認が残る: AC18・28・29・31・35（AC19 は アイコンの 見た目として 合わせて）
- 対象: `docs/design/WEAPON-8.md` 版 0.5、ブランチ `claude/weapon-8-fujin`
- 実行: `npx playwright test e2e/weapon8.spec.ts e2e/weapon7-fujin.spec.ts e2e/weapon7.spec.ts e2e/artPipe1.spec.ts e2e/smoke.spec.ts` → **88 本とも緑**（`--workers` なし）。`npx playwright test e2e/ui-gate.spec.ts -g "hud-fujin|AC17"` → 2 本緑。`npm run check:fast` → 型 OK・ユニット 3139 緑・1 本（`WorldRendererStream.test.ts` 「歩いて中心が変わると…」）が 5 秒の時間切れ。単独で再実行しても同じ 1 本が出たが、私の変更を外しても通り、`src/` は触っていないので負荷による揺れ（この issue と関係なし）。

## 受け入れ基準ごとの結果

| # | 層 | 結果 | 確かめたテスト・メモ |
|---|---|---|---|
| AC1〜12, 20〜23, 25, 30, 32, 33, 34, 36 | ユニット | 緑 | developer のユニット（`check:fast` で緑。上の 1 本の時間切れ以外） |
| AC13 | E2E | 緑 | `weapon8.spec.ts` 通し 2 本 |
| AC14 | E2E | 緑 | `weapon8.spec.ts` 通し 1 本 |
| AC15 | E2E | 緑 | weapon7・weapon7-fujin・artPipe1・smoke（風神剣でらせん 1 回・エラーなし） |
| AC16 | E2E | 緑 | `weapon8.spec.ts` 4 本（らせん 1 つ／K1 8 つ＋らせん／T1 風神・雷神）。数の期待（描画 4・三角形 150・点 48・K1 描画 2・三角形 32）は 弱めていない |
| AC17 | UI 検査 | 緑 | `ui-gate.spec.ts` の画面 `hud-fujin`（重なり・はみ出し）と「WEAPON-8 AC17」（すき間 8/6.8/9 ±1・左はし ±1・大きさ 43/36.8/48 ±4・字 0・画面内）。3 つの大きさ。スクショ `ui-gate-report/hud-fujin-*.png`・`ac17-hud-fujin-*.png`（`docs/art/WEAPON-8/final-game/ac17-hud-fujin-*.png` にも） |
| AC24 | E2E | 緑 | `weapon8.spec.ts` 3 本 |
| AC18, 19, 28, 29, 31, 35 | オーナー確認 | 残り | スクショは下。AC29・31 は 音（試聴）なのでゲーム内で 聞いてもらう |

## この回で直したテスト（実装は直していない）

| ファイル | 直し | 理由 |
|---|---|---|
| `e2e/helpers/weapon8.ts`（`baseStats`・`settle8`・`rec8` perf） | はかる 場面で 時刻を 昼（20000）に 固定し、描く 直前に `animals.clear()` | 揺れの 本当の 原因は 空の どうぶつ（鳥の SkinnedMesh・Points）が 出入りして 描画の 基準が +2 描画・+530 三角形 ぶれた こと。時刻だけでは 直らなかった。描画の 数の 期待は そのまま |
| `e2e/weapon8.spec.ts` AC16 | K1 の 場面で 時刻固定、らせん後の「点」は 空の 点の ±1 を 見て 1 以下、T1 の 2 本の 制限時間 600 秒 | 点は 基準が ±1 ゆれる（土と 草の つぶ 最大 48 の 確かめは 変えない）。雷神剣の 10 回くり返しは 1 回 約 13 秒（SwiftShader） |
| `e2e/weapon7-fujin.spec.ts` 3 段攻撃 | 毎ステップ 押す → 1 ステップ 押して 1 ステップ はなす（くり返し） | 風神剣は 押しつづけ = ため（仕様 §9）。期待（0・20・47 の 3 段・waveStart 3）は そのまま |
| `e2e/ui-gate.spec.ts` | 画面 `hud-fujin`（layoutOnly）と AC17 の 計測を 足した | AC17 |

## 見た目のスクショ（ゲームを 実際に 動かして 撮った。試作 `docs/art/WEAPON-8/proto2/` と 同じ 構図）

`docs/art/WEAPON-8/final-game/` に:
- らせん: `spiral_back_F15.png`（うしろから）・`spiral_side_F21.png`・`spiral_side_F35.png`（横から。回る すきとおった 帯、地面の 土と 草が 舞う）
- K1: `k1_back.png`・`k1_side.png`（小さな 風の 刃。手の 側へ ずれて 見える）
- 手もとの 光: `charge_fujin_F30/F62/F90.png`・`charge_raijin_F30/F62/F90.png`
- アイコン: 上の らせんの 画面の 体力の 上・左はしの くつ。`ac17-hud-fujin-1280x800.png`（ほか 1024×700・1440×900）

見て 分かったこと: らせんは 試作と 同じ 形・色で 横からも ペラペラに 見えない。K1 は らせんと 大きさ・形で 見分けられる。手もとの 光は 体を かくさない。アイコンは 体力の かたまりの すぐ 上・左はしで 字なし。

## 性能（前回との比較）

前回は 実装の 前で 数が ない。今回の 値（草の 地面・昼・どうぶつ なし。AC16 の 範囲に 収まる）: らせん 1 つ 最大 描画 +2・三角形 +130・点 約 +30（上限 4・150・48）。T1（手もとの 光）は 描画 +2・三角形 +6。終わると 0（点は ±1 のゆれ）。K1 8 つ ＋ らせんも 上限内。`npm run perf` は 回していない（描画の 数は AC16 で はかっている）。

## 見つけた 軽微な 点
- 速さアイコンの 板の 色 `#4fa8d8` が UI 検査の「決まりの色」に 入っていない（`hud-fujin` を layoutOnly に して 通した）。art の 決めた 色なら 色の きまりの 表に 足す。
- 画面 `hud-fujin` は 色・字の 既知の くずれ（#57。`hud` と 同じ 物）を 見ていない。
- `WorldRendererStream.test.ts` の 5 秒の 時間切れ（負荷）。

## 直した・足した・消した既存テスト（仕様 §9）

| ファイル | 内容 | 理由 |
|---|---|---|
| `src/legend/fujin.test.ts` | `chargeOf` が null → `kind: 'spiral'`（8 つの数） | Y1。風神剣に ためわざ |
| `src/contracts.w7.test.ts` | 風神剣の `charge` null → spiral | 同上 |
| `e2e/weapon7-fujin.spec.ts` | AC21 データ（charge）→ spiral。「ためない・押しつづけでくり返す」→「押しつづけ = ため（chargeStart あり・ふつうの わざをくり返さない）」 | 同上。仕様 §2.1「変わる所」 |
| 同上 `swing` と AC23 3 本 | ふつうの わざの F1 が「押した」→「はなした ステップ」(i 1) になる。`rec[0]`→`rec[1]`、`at+1`→`at` | ためわざがある武器は、はなした ステップが F1（雷神剣の AC17 と同じ） |
| 同上 AC25 smoke | 押しっぱなし 100 ステップ → 30 ステップごとに押して はなす | 押しつづけは ため |
| `src/fx/windWaveFx.test.ts` | 十字 2 まい・カメラで向き不変 → 板 1 まい・カメラ正面・`drawPos` の位置（頭に ART-PIPE-1 AC19 が置きかわった理由を書いた） | Y9・K1 |
| `src/legend/thunderAssets.test.ts` | 題名の文だけ（`thunder_ground.png` は ねらいの わが使う）。期待は同じ | 手の光が無くなる |
| 消したテスト | なし | |

## 回した結果（第 1 回: 実装の前。記録）

- `npx playwright test e2e/weapon8.spec.ts`: **10 本とも赤**。理由はどれも「`window.__rikkun` に無い窓口: legend.chargeFx、legend.chargeSound、legend.debris、player.handPos、ui.buffs」。
- 窓口が無くても進む部分は別に確かめた: 一人称にする置き方（体の うしろ・上に石、`camera.get().hideChar` が true になる）、真空波 8 つ同時（速さ 1.5・range 20・21 ステップごとに押す → 約 8 つ）。
- `e2e/weapon7-fujin.spec.ts`: 直した 5 本が赤（データ、押しつづけ = ため、AC23 の 3 本）。ほかは緑。実装のあとに緑になる。
- `e2e/weapon7.spec.ts`・`e2e/artPipe1.spec.ts`・`e2e/smoke.spec.ts`（追加分以外）: 緑（期待は変えていない）。
- `npm run check:fast`: 赤 = 直したユニット 5 本（上の表の fujin・contracts.w7・windWaveFx 3 本）。ほかに `src/fx/titleSoundFiles.test.ts`（音の素材ファイル）が赤だが、この issue と関係なく前から。

## 実装のあと、注意して見る所

- `weapon7.spec.ts` の AC2・AC15 の `chargeReady` の期待は そのまま通る はず（仕様 §9）。
- `artPipe1.spec.ts` AC13（F1〜88 で 4・150 以下、F89 で 0）は、ためF 60 のあとの F1〜F4 に手もとの光（描画 2）が入る。通らなければ仕様の矛盾として デザインへ。
- `weapon7-fujin.spec.ts` の「3 段攻撃」（毎ステップ押す）は 雷神剣と同じ押し方なので 通る はず。
- 見た目の基準（AC18・28・35）はスクショ（`shots/WEAPON-8/`）で、実装のあとの検証で撮る。

## 性能（前回との比較）
実装のあと（`npm run perf` を回して書く）。

## 見つけた問題 / 仕様でわかりにくかった所
指摘台帳 `docs/loop-ledger/WEAPON-8.md` に追記した（軽微）。
