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

PR-2「地盤と 建築」（#340, house-1c-pr2, 実装 e8ec7f1・3a99109）を code-reviewer が見た結果（判定: 合格・重大 0・軽微 12）。tsc・関係ユニット 71 ファイル 935 件・ratchet 緑・eslint の max-lines／no-restricted-imports 0。音は install-A.diff.txt と 同じ。E2E は回していない。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | dev | code-reviewer | 【軽微】PR2-1: dig/DigSystem.ts:527 — どうづきを 押しつづけると due（placeRepeatTicks 30）で 30 ステップごと。§4.4 は「押しつづけても 20 ステップに 1 回」 | 置くの くり返しの 間かくに 乗せた | | 対応済み（DigSystem.ts: tamp は due を見ず毎ステップ build.tamp。20 ステップは Dozuki。長押しの E2E は緑） |
| 1 | dev | code-reviewer | 【軽微】PR2-2: ui/houseSite/celebrate.ts・wire/house.ts:161 — 「<名前> が できた！」を TopBandModel の 列に 入れず 別の DOM。帯が 出ている 間は かくれた まま 420 ステップが へり、出ない ことも ある／あとから 来た 実績が 上に かさなる | PR-1 指摘 4 と 同じ（上の 帯を 1 か所で ならべない） | PR-1 の 4 | 対応済み（完成の帯を TopBandModel の列に: enqueueHouseDone・houseDone。ui/houseSite/celebrate.ts は紙ふぶきだけ・かくし方をやめた。bandModel.test に 2 本。house-done-banner は E2E で見える） |
| 1 | dev | code-reviewer | 【軽微】PR2-3: house/build/glue.ts:149 finishShape と house/system.ts:366 buildNow が 同じ「形を 書く＋記録」を 2 か所に。glue.ts:204 houseViews も system.houses の 写し | 1 データ 1 か所（#304） | | 対応済み（shape.ts の writeShape・recordHouse に1本化。buildNow と完成が同じ。houseViews を消した） |
| 1 | dev | code-reviewer | 【軽微】PR2-4: world/blocks/flora.ts:4 LEAF_BLOCKS — blockTypes.ts:165 の isLeafId と 同じ 表 | 既存を さがさず 足した | | 対応済み（glue.ts は isLeafId。flora.ts の LEAF_BLOCKS を消した） |
| 1 | dev | code-reviewer | 【軽微】PR2-5: house/build/sites.ts:25・glue.ts:120・tamp.ts:37 — 「消える 草花」が isFloraBlock（kusa・nobana）だけ。§4.7 は はな・すすき も 入る | 既存の 関数の 名前で 決めた | | 対応済み（PO OK。flora.ts の isVanishingFlora: くさ・のばな・はな 3 しゅ・すすき。sites・glue・tamp が 1 か所の関数を使う。isFloraBlock〔ほる側〕は変えない） |
| 1 | dev | code-reviewer | 【軽微】PR2-6: house/build/glue.ts:127 — 中に いた プレイヤーを 戸の 前の 2 マス先（z = 箱 ＋ 1）へ うつすが、そこは しらべて いない（しらべたのは 1 マス先）。妖怪・動物（AnimalManager.evictFrom・YokaiManager.evictFrom）も 同じ | うつす 先の 立てるかを 見ていない | | 対応済み（glue.ts outSpots: 戸の前の列から近い順に standY で立てる列を最大 9 こ集める〔tuning EVICT〕。プレイヤー・動物・妖怪がそこへ。AnimalManager・YokaiManager.evictFrom は spots を受ける） |
| 1 | dev | code-reviewer | 【軽微】PR2-7: house/build/tuning.ts:50 SKY.height 40 — §3.4 は「真上 24 マス」【PO 案】 | 探す 範囲を 画面に 入れる ため 変えた | | 対応済み（PO: 40 のまま。docs/design/HOUSE-1.md §3.4 を 24→40 に直し、理由〔探す範囲が画面に入る高さ〕を書いた） |
| 1 | dev | code-reviewer | 【軽微】PR2-8: house/keyGuard.ts:23 — 上空の 視点の Enter を keydown で 直に 読む。§3.4・CLAUDE.md は Action（confirm 案）経由 | 既存の キーの 見はりに 足した | | 対応済み（actions.ts に confirm〔Enter・NumpadEnter〕。keyGuard は actionForKey で confirm を読む。keyGuard.test に 2 本） |
| 1 | dev | code-reviewer | 【軽微】PR2-9: ユニット不足 — 票の 期待 8（AC23 シード固定 3,600 ステップの 湧き・AC34② ちょうちん 2 倍で 仕事 2 倍くらい）・10（AC40 10,000 ステップ 3 マス 以内・32／31 マスで もどる／もどらない） | 判定の 関数だけ 見た | | 対応済み（spawnGuard.test.ts: AC23 シード固定 3,600 ステップ・16 以内 0／17 以上は湧く・完成で戻る、AC34② 1→2→4 けんの 1 回あたり getBlock が 2.2 倍以下。manager.test.ts: AC40 10,000 ステップ 3 マス以内・32 でもどる／31 でもどらない） |
| 1 | dev | code-reviewer | 【軽微】PR2-10（できれば）: 使われない 数・口 — tuning.ts の ARCHITECT_WORK.wanderRadius（architect.ts の WANDER_RADIUS 2.5 と 意味が かさなる）・CELEBRATE.confettiTicks／toastTicks・GlueDeps.blueprint・builder.start の length 0 の 式（glue が いつも 長さを わたす） | 書きかけの 名残 | | 対応済み（ARCHITECT_WORK.wanderRadius・CELEBRATE.confettiTicks／toastTicks・GlueDeps.blueprint・builder.start の長さ 0 の式を消した〔長さは glue が houseBuildTicks で渡す〕） |
| 1 | dev | code-reviewer | 【軽微】PR2-11（できれば）: game/wire/houseSite.ts:103・117 — 上空の 視点の 間 毎フレーム cursor() の 物・inSky の クロージャを 作る／みずもりを 持つ 間 毎フレーム 169 この 行列を 書きなおす | 毎フレーム 呼ぶ 所で 変わった かを 見ていない | | 対応済み（上空の絵は flow.version が変わった時だけ作る・renderWorld は 1 つ。みずもりの色は LevelTool.revision と配列が変わった時だけ書く） |
| 1 | dev | code-reviewer | 【軽微】PR2-12（できれば）: house/build/builder.ts — 場所が 読みこまれて いない 間に 完成すると houses() と 紙ふぶきが 読みこみ まで おくれる（AC21「同じ ステップで houses() に 入る」）。builder.ts:101 の「写しを 返す」は 中身 そのもの | 世界を 書けない 間の 扱い | | 対応済み（builder の deps を shape〔形を書く〕と record〔記録・紙ふぶき〕に分け、読みこみ前でも record は完成と同じステップ。形は読みこまれてから。builder.test を直した。builder.ts の「写しを返す」コメントも直した） |
