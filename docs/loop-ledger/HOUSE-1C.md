# HOUSE-1C 指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

PR-1（#340, PR #369, ec84f42）を code-reviewer が見た結果（判定: 不合格・重大 1・軽微 7・できれば 数件）。PR #369 は直しより先に main へ squash で入ったので、直しは wt-340 の 458cc98（次の PR に入れる）。2 周目は 458cc98 の直しだけを見た（判定: 合格・重大 0。tsc・関係ユニット 93 ファイル 1448 件・ratchet 緑。E2E は回していない）。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | dev | code-reviewer | 【重大】1: dig/digPlace.ts furnSpot — 家具の 2 マス目以降が空気しか見ず、草・チョークの上に置けない／ねらったマスを 2 回見る | 置けるかの判定を spot() と別に書いた | | 対応済み（458cc98: ねらったマスを飛ばし、ほかは空気・水・isReplaceable を受ける） |
| 1 | dev | code-reviewer | 【軽微】2: dig/config.ts — 家ブロック・家具・しょうじの硬さが数の直書き | 表に足さずに値を置いた | | 対応済み（458cc98: WOOD_HARDNESS・QUICK_HARDNESS・OLD_FURN に集めた） |
| 1 | dev | code-reviewer | 【軽微】3: content/items/houseEditor.ts — せっけいずの how が変わった／家具ボタンの表記が操作と合わない | 説明文を item 側で直書き | | 対応済み（458cc98: NOW_HOW に戻す、PLACE_HOW は howText から、ボタン ['1-9','right']） |
| 1 | dev | code-reviewer | 【軽微】4: houseUi.ts — 名前の帯を独自に出し、上の帯（テロップ・トースト）と重なる | ui/celebrate の帯の列を使っていない | | 対応済み（458cc98: TopBandModel に house の帯、HOUSE_BAND_STEPS=180、houseUi の古い帯を削除） |
| 1 | dev | code-reviewer | 【軽微】5: 名前を打つときの Esc・Backspace がゲーム側にもれる | キーのガードがない | | 対応済み（458cc98: house/keyGuard.ts を game/wire/house.ts でつなぐ） |
| 1 | dev | code-reviewer | 【軽微】6: dig/toolFamily.ts — 家・戸・家具の道具の系統が足りない／たんす・かまどだけ個別 | 新しい id を系統の表に足し忘れ | | 対応済み（458cc98: houseFamilies() で全部 log、かまどは stone） |
| 1 | dev | code-reviewer | 【軽微】7: テスト不足（形 全種×4 向き、AC24 darkForSpawn、掘る時間、キーガード、帯、草の上に置く など） | — | | 対応済み（458cc98: shape・houseLight・toolFamily・keyGuard・bandModel・storage・dugItems・houseBlocks のテスト） |
| 1 | dev | code-reviewer | 【軽微】8（できれば）: house/book.ts — キーの作り方が x,y,z でない／外→戸→中の順を見ずに帯が出る | 入ったかの判定が雑 | | 対応済み（458cc98: keyOf(x,y,z)、via で 外(南)→戸→中 のときだけ） |
| 1 | dev | code-reviewer | 【軽微】9（できれば）: digBreak.ts と house/cell.ts で落とす物の決め方が 2 か所 | 1 データ 1 か所の違反 | | 対応済み（458cc98: dig/dugItems.ts dropBlockOf・dugItemOf） |
| 1 | dev | code-reviewer | 【軽微】10（できれば）: FURN_NAME・足あと計算・向きの計算の写し | 同じ表を 2 か所に | | 対応済み（458cc98: FURNITURE[kind].name、furnFootprint、furnRotFromYaw） |
| 1 | dev | code-reviewer | 【軽微】11（できれば）: world/render/voxel/sectionExtras.ts:57 — しょうじのマスごとに shojiAxisAt のクロージャを作る | メッシュ作りのときの小さな割り当て | | 未対応（毎フレームではない。次の PR でよい） |
| 2 | dev | code-reviewer | 【軽微】12: ui-gate の house-name-band — 入って 2 ステップ後に撮るが、帯は 30 ステップでフェードインするので薄い。見え方・コントラストの検査が CI で落ちるかも | 帯を TopBandModel に移してイーズが付いた | | 未対応（CI で確かめる。落ちたら撮るまで 30 ステップ進めるか、reduced motion で撮る） |
| 2 | dev | code-reviewer | 【軽微】13: house/book.ts doorBelow — 1 ステップに最大 3 回の表引き（AC34①「2 こまで」と読める） | fy±1 まで見るようにした | | 未対応（fy だけで足りるなら減らす） |
| 2 | dev | code-reviewer | 【軽微】14（できれば）: 出入りをくり返すと同じ家の名前の帯が何回も列に入る | 列に同じ名前の重複よけがない | | 未対応 |
| 2 | dev | code-reviewer | 【軽微】15（できれば）: world/blocks/blockTypes.ts が house/editor/furniture を import（向きが逆。輪はなし、cycles 6/6） | FURN_NAME を消して FURNITURE を直接見た | | 未対応（害はない。気になるなら名前の表を world 側へ） |
