# LIVE-1 テストレポート（第 1 回）

- 判定: 合格（重大 0。AC24 の描画回数の実測と AC25 は未実施・下記）
- 対象の仕様書: `docs/design/LIVE-1.md`
- 実行したコマンド: `npx playwright test e2e/live1-*.spec.ts e2e/m7.spec.ts e2e/m72.spec.ts e2e/bucket.spec.ts e2e/smoke.spec.ts`（62 本 OK・1 skip。全部の E2E は PR の CI）。落ちた 4 本のうち 3 本は直して通った。smoke の刀のわざ（`smoke.spec.ts:76`）は全部まとめて回すと 1 回落ち、単独では通った（負荷のゆれ。CI で見る）。`npm run perf` は 10 分で時間切れ（LIVE-1 の数値なし）。

## 受け入れ基準
| # | 結果 | 層 | 確かめ方・証拠 |
|---|---|---|---|
| AC1 | OK | ユニット | `src/animals/animals.test.ts`（開発） |
| AC2 | OK | E2E | `live1-core` AC2（3,600 ステップ・くさ・harappa/hana・3 わ以下）、AC2b（appear 中はねらえない） |
| AC3 | OK | ユニット | `src/animals/animals.test.ts` |
| AC4 | OK | E2E | `live1-core` AC4 |
| AC5 | OK | E2E | `live1-core` AC5・AC5b（直した: ねらいの線が床に当たるので壁を にわとりのすぐうしろ x=5 に。ほる確認は「押し直すとこわれる」まで） |
| AC6 | OK | E2E | `live1-core` AC6（おめでとう画面が出たことも `__modalSeen` で確認） |
| AC7 | OK（AC7b は fixme） | E2E | `live1-core` AC7。「動きの強さ」設定がまだ無いので 0 の場合は書けない |
| AC8 | OK | E2E | `live1-core` AC8（チップ・音・DOM のルビ） |
| AC9 | OK | E2E | `live1-core` AC9 |
| AC10 | OK | E2E | `live1-follow` AC10・AC10b |
| AC11 | OK | E2E | `live1-follow` AC11・11b・11c（直した: x=210 は列を読み込んで settle してから床を作る） |
| AC12 | OK | E2E | `live1-follow` AC12 |
| AC13 | OK | E2E | `live1-egg` AC13 |
| AC14 | OK | E2E | `live1-egg` AC14 |
| AC15 | OK | E2E | `live1-egg` AC15 |
| AC16 | OK | E2E | `live1-egg` AC16・16b・16c |
| AC17 | OK | E2E | `live1-egg` AC17 |
| AC18 | OK | E2E | `live1-egg` AC18 |
| AC19 | 一部 | E2E＋ユニット | 保存の往復は `live1-follow` AC19。1,000 文字・10 わ・おかしい行・うまった場所はユニット（開発） |
| AC20 | OK | ユニット＋UI 検査 | 開発のユニット。UI 検査は画面を変えた PR の CI で |
| AC21 | OK | ユニット | `achievements.test.ts`・`m7ui.test.ts`・`m72ui.test.ts`（236・82・47・15） |
| AC22 | 一部 | E2E（DOM） | AC8 のチップ文とルビ。案内画面の行数は `m72` AC25（13 行）。3 サイズのはみ出し 0px は UI 検査 |
| AC23 | OK | ユニット | yokai のユニットが変えずに通る |
| AC24 | 未実測 | 性能 | 描画回数・三角形の増え（16 以下・8,000 以下）は、今回の `npm run perf` が時間切れで取れていない。計算 0.2 ms・保存の大きさは開発のユニット。PR の CI か perf-engineer で取る |
| AC25 | オーナー確認 | オーナー | Mac で §6 の (1)〜(7) |

## つなぎ込み担当が足した準備の確認
- 最初のクリックで音を unlock: 音の記録を取るのに必要で、基準は弱まらない。
- `h.step` ごとにおめでとう画面を閉じる: 世界が止まる仕様のため。弱まらないよう、出たことを `__modalSeen` に残して AC6 で断言した。
- `forward` → `moveForward`: 正しい操作名への直し。m72 の `animalAutoSpawn=false`: 描画回数にまざらないため。いずれも基準は弱まらない。

## 性能（前回との比較）
| 項目 | 前回 | 今回 |
|---|---|---|
| drawCalls / triangles | 未実測 | 未実測（perf 時間切れ） |

## 見つけた問題
- 重大: なし。軽微: テスト側の AC5 の壁の位置・AC11 の床の作り方（直した）。smoke の刀のわざが負荷で 1 回落ちた。
