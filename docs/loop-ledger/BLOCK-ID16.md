# BLOCK-ID16 指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | dev | code-reviewer（テスト） | 【軽微】src/world/sections.wide.test.ts:63-71 palette の 16 種類の数え方が 1 つ多い（1000 を数えず 14 足して 17 種類 → 正しい実装でも落ちる） | テストの誤り | | 対応済み（c7c22dd、13 に直した） |
| 1 | dev | code-reviewer（テスト） | 【重大】AC4 の「番号 255 を UNKNOWN とまちがえない」「表の外を読まない」の UNKNOWN 側に テストがない。つなぎ目どおり 表 = 1024・UNKNOWN_BLOCK = 0xFFFF にすると OPAQ[0xFFFF] が undefined で spreadLight が 読みこんでいない所へ 光を広げる（lightSpread.ts:52 `op >= 15` が false）。今の 255 の壁のテストは main で もう緑で 赤になっていない | テストの抜け・つなぎ目の矛盾 | | 未対応 |
| 1 | dev | code-reviewer（テスト） | 【軽微】AC2 の 版の付け方（sectionsFormatVersion が 255 種類以下 → 2・256 以上 → 3、packColumn の v、backend/portable が v3 を読む）のテストがない。いまは decodeSections に 版を 手で渡しているだけ | テストの抜け | | 未対応 |
| 1 | dev | code-reviewer（テスト） | 【軽微】lightSpread.wide.test.ts の 1024 を 数で書いている → maxBlockKinds.ts の MAX_BLOCK_KINDS を import する。sectionWide.test.ts の hasLook の vi.mock は 実装が looks 内の表を 直接読むと 効かなくなる（そのときは 窓口に 合わせて 直す） | 決め打ち | | 未対応 |
| 2 | dev | code-reviewer（実装） | 【軽微】src/world/gen/mineHook.ts:77・110 となりの列の面（Faces）が Uint8Array のまま。番号 256 以上が となりの列に あると 下 8 ビットに 化けて 見える側の 判定（水・空気）を まちがえる | 入れ物の 見落とし | | 対応済み（レビュー係が Uint16Array・BlockArray に 直した） |
