# INV-PAD-HELP 指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | dev | code-reviewer | 【重大】src/game/wire/duo.ts の 2P の すてる: 共有の DropField.throwItem は 1P の 足もと（d.player()）から 投げるので、2P が すてた 物が 1P の 所に 出る（1P/2P の 混ざり） | throwItem に 出どころの 口が なかった | | 対応済み（throwItem に from を 足し 2P の 位置を わたす） |
| 1 | dev | code-reviewer | 【軽微】src/game/step.ts updateHint1Pad の lastPad: 2 人→1 人に もどる とき DuoAimHud が hint1 を 'mouse' に するが、lastPad が 'pad' の ままだと 書きなおさず、パッドでも マウス絵の まま（入力を かえるまで） | lastPad の 覚えが よそからの setPad を 知らない | | 未対応 |
| 1 | dev | code-reviewer | 【軽微】src/ui/inventoryScreen.ts syncPadTip: たんすの マス（tansu:n）に パッドの ツールチップが 出ない。毎ステップ name.slice で 文字列を 作る（key が 同じなら 先に 返すと よい） | 対象の 種類の 抜け | | 未対応 |
| 1 | dev | code-reviewer | 【軽微】src/duo/p2Drop.ts FROM_FOCUS は `as const` で kind を as で 引く。`satisfies Record<'slot'\|'tansu'\|'equip', …>` に すると 抜けが 型で 落ちる | | | 未対応 |
