# CHAR-2 指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | design | design-reviewer | 【軽微】AC2・AC6 の「frame が 10 進む」は 8 で回るので数え方があいまい | 書き足し不足 | G1 | 対応済み（番号が変わった回数と明記） |
| 1 | design | design-reviewer | 【軽微】AC20 の「（①だけのとき）」が 意味不明 | 言い回し | G2 | 対応済み |
| 1 | design | design-reviewer | 【軽微】§9 が 質問のまま | オーナー回答待ちだった | G3 | 対応済み（O8 として決定に） |
| 2 | design | design-reviewer | 【軽微】AC23 の `info().cpuBytes` と §8 の `sprite.cpuBytes` の呼び名が ずれている（同じ物なら そろえる） | 言い回し | G5 | 未対応 |
| 2 | design | design-reviewer | 【軽微】§4.7 の表の「本当の値」が空欄。PO が §8 の順番（スクリプト → 表 → テスト係）で 埋めるまで AC20・21・23 の期待が確定しない | 順番待ち | G6 | 未対応（PO が埋める） |
| 1 | design | design-reviewer | 【軽微】`src/ui/bladeHud.ts` が `bladeTech.kesa` を読む。大けさぎりの もどり 48→72 で 表示が変わるか §6.1 に確認がない | 抜け | G4 | 未対応（A 担当が確認） |
| 3 | dev | code-reviewer | 【軽微】テスト準備で AC13 の bladeMoveMul 0・thrustLunge なし・bladeAdvance=atlas.json の確認が抜けていた | 抜け | G4 | 修正済み（contracts.w2.test.ts に追加 2de04e4） |
| 4 | dev | code-reviewer | 【軽微】AC11（80/100 度のうしろ歩き）・AC1〜10・AC15/16/19・AC22/23/25 のユニットは tester の分になく、開発係が先に書く分。AC11 は 90 度ちょうどを避けて 80/100 度で見ること | 引き継ぎ | G4 | 開発係へ |
dev / code-review(B) | 【軽微】【直した】 | src/char/sprite.ts `cpuBytes` が 0 固定で、AC23 のテストが 意味を持たなかった。GPU へ上がるまでの写しを数える形に直し、テストも 上がる前は 4 まい分あることを 確かめるように した
dev / code-review(B) | 【軽微】 | src/char/motion.ts 歩きながら 矢をうって B3 になったあと、a < 22 のうちに 止まると はなす絵（B4）が 遅れて出る。仕様 §4.1 は 「すぐ B3」としか 書いていないので S のつなぎ込み後に Mac で見て 気になれば 直す
dev / code-review(B) | 【軽微】 | src/char/motion.ts SpriteStepInput の weapon/blade/bow は 省略可。S が 渡し忘れても 型で気づけない。つなぎ込みで 必須に 戻すこと
test / tester | 【軽微】 | 弓を持って立つ絵（AC21-1）が うしろ姿だと 弓が 小さく 見えにくい。オーナーが AC29 で 見る | 仕様（見た目）
test / tester | 【軽微】 | e2e/char1.spec.ts AC31 が `sprite.loaded` を 5 秒で待つため 並列で まれに 時間切れ（単独は OK）。待ち時間を のばす | テスト
dev / code-review(14a9a26) | 【軽微】 | src/world/render/drawOrder.ts stableOpaqueSort は 鍵を 材料より先に見るので、種類(kind)が 場所ごとに まざり、絵(extras)と 小ブロックの プログラム切りかえが セクション数ぶん 増える（描画回数は 同じ）。kind を 上位にした鍵にすれば グループ化できる。M4 の実測で 気になったら 直す | 性能
