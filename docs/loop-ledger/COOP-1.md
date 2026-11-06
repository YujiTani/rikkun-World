# COOP-1 指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 4a-1 | dev | code-reviewer | 【軽微】src/duo/invFocus.test.ts 頭の 約束: sync(items) を「毎ステップ」に すると 毎フレーム FocusBox[] と getBoundingClientRect を 作る | 約束の 書き方 | | 未 |
| 4a-1 | dev | code-reviewer | 【軽微】AC77 の マウス（2P の パネルを 1P の マウスで 押しても かわらない）が 表の 関数（invAccepts）だけで、配線を 見る 所が ない | E2E 1 本の しばり | | 未 |
| 4a-1 | dev | code-reviewer | 【軽微】e2e/helpers/duoInv.ts の 矢印の 検査は 2 人が 近い ので いつも null（空の 検査）。AC87 は openDuoArrowPanel で 見る と 書く | 場面の とり方 | | 未 |
| 4a-1 | dev | code-reviewer | 【軽微】仕様 §2.6「いっぱいなら 2P の 足もとに 落とす。1P と 同じ」が 今の 1P（CraftSystemImpl は full で 失敗）と 食い違う → designer が 文を 直す | 仕様の 書き まちがい | | 未 |
