# ART-PIPE-1 テストレポート（第 1 回）

- 判定: **合格**（重大 0。軽微 2 件は台帳）
- 対象の仕様書: `docs/design/ART-PIPE-1.md`（1.2。ささる所は A 案）
- 実行したコマンド: `npx playwright test e2e/artPipe1.spec.ts`（13 本）・`e2e/ui-gate.spec.ts -g artpipe1`（7 場面）・`e2e/weapon7.spec.ts e2e/weapon7-fujin.spec.ts e2e/smoke.spec.ts`（64 本）・`npm run check:fast`（型 OK・ユニット 3042 通過）。全部の E2E は PR の CI。`npm run perf` は回していない（雷の場面を測る perf がない。雷の描画回数・三角形は AC13 の E2E で測った）
- テスト側の直し（仕様の期待は変えていない）: ①つぶの数の比べは F9 から ②もとの描画回数は世界の読みこみが落ちついてから ③遠い柱は高い柱にして画面の上の所を測る ④シェーダーの数は「妖怪・柱が初めて雷の絵の先で描かれる分」を除き、同じ場面の 3 回目の前後で比べる（AC13 の最後のテスト）

## 受け入れ基準
| # | 結果 | 確かめ方・証拠 |
|---|---|---|
| AC1 | OK | `src/legend/thunderModel.test.ts` |
| AC2 | OK | `artPipe1.spec.ts` AC2 通し（ふつう）・AC2・AC15（うごきを へらす）。エラー 0 |
| AC3 | OK | `thunderModel.test.ts`（形・反転・`boltVariantOf`） |
| AC4 | OK | `artPipe1.spec.ts` AC4（8 方向×低い・60° 見下ろし・本物のカメラ） |
| AC5・AC6 | OK | `thunderBoard.test.ts` |
| AC7 | OK（見た目は ui-reviewer） | `ui-gate` の artpipe1-flat/wall-F9/F12 が 3 つの大きさで通過。スクショ `ui-gate-report/artpipe1-*.png`。今の雷（main）との並べは ui-reviewer。かべの場面（`docs/test-reports/ART-PIPE-1/` のスクショ・`ui-gate-report/artpipe1-wall-F12-1280x800.png`）で ささる所に まっすぐな切れ目の線は見えなかった |
| AC8 | OK | `thunderModel.test.ts`・`artPipe1.spec.ts` AC8 |
| AC9 | OK | `thunderModel.test.ts` |
| AC10 | OK | `thunderGlow.test.ts`・`artPipe1.spec.ts` AC10（入れ口の数は前・中・後で同じ） |
| AC11 | OK | `artPipe1.spec.ts` AC11（柱・妖怪 F8 ≧ F1 の 1.10 倍、遠い面・空 2% 以内、F30 は F1 と 2% 以内） |
| AC12 | OK | `thunderGlow.test.ts`・`artPipe1.spec.ts` AC12（屋根の下で量 0） |
| AC13 | OK | `artPipe1.spec.ts` AC13（F10 の ふえ・F1〜88 は 4・150 以下・F89 で もとと同じ）と最後の「シェーダーの数」 |
| AC14 | OK | `thunderAssets.test.ts`・`artPipe1.spec.ts` AC14 |
| AC15 | OK | `thunderGlow.test.ts`・AC2・AC15 の通し |
| AC16 | OK | `artPipe1.spec.ts` AC16（上がり ≦ 1・F8〜15 の白い点 ≦ 20%） |
| AC17 | OK | `src/ui/itemArtW7.test.ts` |
| AC18 | OK（見た目は ui-reviewer） | `ui-gate` の artpipe1-icon-hud/inventory/tooltip（全マスが雷神剣）が通過 |
| AC19 | OK | weapon7・weapon7-fujin・smoke 64 本が期待を変えずに通過。`windWaveFx.test.ts` が通過 |
| AC20 | オーナー確認 | `docs/test-reports/ART-PIPE-1/`: `day-front-F8.png`・`day-front-F12.png`・`day-diag45-F12.png`・`day-side90-F12.png`・`day-topdown-F12.png`・`night-front-F8.png`・`night-front-F12.png`・`icon-hotbar.png` |

## 見た目のメモ（AC20 の前に）
- 昼の正面 F12: 玉が大きく明るく、白〜黄色。近くの唐傘（からかさ）は ほぼ真っ白に見える（足し算で 白に近づく）。気になれば明るさの量を見直す（軽微）。
- 夜: ほんのり 黄色く 照らされて 雷が よく目立つ。まぶしすぎは しない。
- 見下ろし: 板は ねない（上から見ても 縦のまま）。芝の上では 緑がかって 見える（足し算の せい）。

## 性能（前回との比較）
| 項目 | 前回 | 今回 |
|---|---|---|
| 描画回数の ふえ（雷 B 1 つ。上限 4） | 5（今の雷） | F1〜F88 の どの ステップも ≦ 4（E2E が 通過）。F89 で もとと 同じ |
| 三角形の ふえ（上限 150） | 82 | ≦ 150（E2E が 通過）・F10 は 72〜150 |
| シェーダーの数 | — | 落雷ごとに ふえつづけは しない（同じ場面の 3 回目の前後で同じ）。2 回目で ふえるのは 妖怪・柱が 初めて 雷の絵の先で描かれる分（6 こ ほど。1 回だけ） |
| stepMsMedian / P95 | 未計測 | 未計測（`npm run perf` に 雷の場面が ない。落雷中だけ 画面大の 描き先を 使う ので、PR で 性能の係が 見る） |

## 見つけた問題
- 【軽微】昼は 近くの妖怪が ほぼ真っ白に 見える（AC11 の 1.10 倍は 満たす）。AC20 で オーナーが 見る。
- 【軽微】落雷中だけ 画面大の 描き先に 世界を 描くので、初めて 使う 材質は シェーダーが 1 回 ふえる（hitch の もと）。性能の係へ。
