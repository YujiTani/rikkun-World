# HOUSE-1A テストレポート（第 1 回）

- 判定: 合格（重大 0・軽微 4）
- 対象の仕様書: docs/design/HOUSE-1.md §6.2（AC1〜AC8・AC32・AC33・AC34・AC35・AC37・AC40・AC41）／ 票 docs/tickets/HOUSE-1A.md ／ ブランチ claude/project-thread-aqd916（main を取りこんだ 90b68f7 で再確認）
- 実行したコマンド:
  - `npx playwright test -c pw.local.config.ts e2e/house1a.spec.ts e2e/smoke.spec.ts`（90b68f7）→ 9 通過・1 失敗。house1a 2 本は通過。失敗は smoke 1 本の「Failed to load resource 404」で、原因は手元の Chromium が取りに行く `/favicon.ico`（環境の問題。index.html・public はこの PR で変えていない。ヘッドレスシェル（CI と同じ形）では smoke 8/8 通過を確認）
  - `npm run check:fast` → ユニット 428 ファイル通過（1 スキップ）・5581 テスト通過
  - `npm run check:ui`（取りこみ前）→ 73 通過。house-menu・house-kura は 3 つの大きさとも指摘なし（結果は scratchpad/ui-gate-house1a/）
  - `e2e/flora75.spec.ts -g AC11` → 通過（スタートの描画回数）
  - 全部の E2E は PR の CI にまかせる

## 受け入れ基準
| # | 結果 | 確かめ方・証拠 |
|---|---|---|
| AC1 | OK | ユニット ＋ house1a の通し（first が 1 人・spawn から 6〜10 マス） |
| AC2 | OK | ユニット（check:fast） |
| AC3 | OK | house1a の通し（21 ステップまで open false → 22 で true・声 1 回・道具 1 こずつ・2 回目は増えない・なくすと「どうぐを もらう」）。GIF で見た目も確認 |
| AC4 | OK | ユニット（妖怪が建築士さんを知らない作り）。弓は作りで素通り（台帳に軽微で記録済み） |
| AC5 | OK | ユニット ＋ house1a（2 人目はテレポートで共有） |
| AC6〜AC8 | OK | ユニット |
| AC32 | OK | ユニット（読み書き）。E2E の保存は建築が入る HOUSE-1C で |
| AC33 | OK | ユニット |
| AC34 | OK | 下の性能。スタート +1 回（上限 +1）・flora75 AC11 通過 |
| AC35 | OK | UI 検査 house-menu・house-kura が 3 つの大きさで はみ出し・字・48px・ふりがな 指摘なし。コントラストは既存のきまり（大きい太字 3:1）まで。4.5:1 はオーナーが目で見る |
| AC37 | オーナー確認 | /mnt/project-files/shots/HOUSE-1A/ のスクショと GIF |
| AC40 | OK | ユニット |
| AC41 | OK | ユニット ＋ house1a（メニュー中 step(600) の前後で時刻が同じ・とじると進む） |

## スクショ・GIF（/mnt/project-files/shots/HOUSE-1A/）
- nod-greet-menu.gif / -slow4x.gif: うなずき〜あいさつ 2 行〜メニュー（1 コマ=1 ステップ・263 コマ・前後に止まった 20 コマ・カメラ同じ・20ms / 70ms）
- nod-closeup(.gif / -slow4x.gif): うなずきのよりの絵（63 コマ）
- walk.gif / walk-slow4x.gif: ぶらぶら歩く（155 コマ・前後に止まった 20 コマ・まわりの木の切り出しなし）
- aim-outline.png / aim-none.png（同じカメラ）、greeting-1.png・greeting-2.png、menu-5buttons.png・menu-6buttons.png、kura-overview / kura-bag-selected / kura-store-selected.png、views-front / side / back.png

## 見本・試作との見くらべ
- 形・色・うなずきの数は `docs/art/house-1/proto/houseA.ts.txt` と 一致（ARCH_COL・architectSpec・うなずきのキー・木づちの休みの角度を文字比べで同じ）。ちがいは描画のしかた（視野角 75° と 40°、ゲームの明かり）だけで、形・色のずれは見つからなかった。
- 見た目の ちがい: ねらった時の水色のふちどりは、見本の図にはない（仕様どおり）。

## 性能（前回との比較。前回 = main 533e71b を同じやり方で測定。手元は GPU なし）
| 項目 | 前回（main） | 今回 |
|---|---|---|
| drawCalls（スタート・flora75 と同じ測り方） | 92 | 93（+1。ゴールデン 87 との差 +6 ≦ +10） |
| triangles | 356,180 | 356,710（+530 = 体 514 ＋ 影のまとめ描きの隠し四角 16。影は +0 回） |
| 建築士さんが うしろ（見えない） | 91 / 282,472 | 91 / 282,488（+0 回・+16） |
| 建築士さんが いない所（東 300 マス） | 139 / 82,632 | 139 / 82,632（同じ） |
| ねらった時のふちどり | － | +1 回・+430 三角形（ほかの ブロックの枠 +1 回・+144 とは別） |
| はなしている間（うなずき・あいさつ・メニュー） | － | 増えない |
| stepMsMedian / stepMsP95 | 計っていない | 計っていない（CI／perf 担当） |

## 見つけた問題（軽微のみ）
1. 建築士さんをねらって左クリックを押しつづけると、うしろのブロックにひびが入り（120 ステップで 0.33）、ほりつづけるとこわれる。ヒントも「ほる」と出る（建築士さんには「はなす」の案内なし）。右クリックだけ案内を消している作りとそろっていない。
2. はじめてのあいさつ 2 行目「これを あげる。みずもり と どうづき だよ」が 1280×800 で「よ」だけ 2 行目に落ちる。
3. 手元の smoke の favicon 404 は環境（CI に影響なし）。
4. 既存画面 3 つの known.json「もう出ない」の知らせ（今回と無関係）。
