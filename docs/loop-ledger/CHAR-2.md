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
