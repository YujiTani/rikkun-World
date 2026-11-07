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
| 4a-2 | dev | code-reviewer | 【軽微】src/game/wire/duo.ts:206・256・259 毎ステップ（1 人の ときも）invLayoutFor・invCloseReason・invQuitHeld に 新しい 物（{…}）を わたす → 使いまわす 入力に（hintIn と 同じ 形） | 毎フレーム new の きまり | | 未 |
| 4a-2 | dev | code-reviewer | 【軽微】src/game/wire/duo.ts:256 1P の「倒れたら とじる」が 1 人の ときも 毎ステップ「倒れている あいだ」で 走る（combat.die の closeInventory と 二重）。仕様は「倒れた ステップ」。joined の ときだけ／倒れた ステップだけに | 決まりの 写し | | 未 |
| 4a-2 | dev | code-reviewer | 【軽微】src/ui/duoNotice.css:21 「ちょっと まってね」z-index 7 ＜ 2 人用 パネル z-index 8（inventoryDuo.css）。§3.3「本・建築士さんの とき 文は パネルの 上」に ならない おそれ → UI 検査で 見て 直す | 重なりの 順 | | 未 |
| 4a-2 | dev | code-reviewer | 【軽微】src/game/wire/combat.ts:282 canOpen で 2 人の あいだ 1P も たんすを 開けない（段階 1 では 開けた）。4c までの 仮の 決まりと して PO が 受けるか 決める（仕様に 1 行） | 4c との さかい | | 未 |
| 4a-2 | dev | code-reviewer | 【軽微】src/ui/inventoryScreen.ts:427〜 629 行（500 目安 超え）。2 人用の 部分（setLayout・page・snapshot・pad*・cursorAnchor）は inventoryDuo.ts 側へ 分けられる | ファイルの 大きさ | | 未 |
| 4a-2 | dev | code-reviewer | 【軽微】src/ui/inventoryScreen.ts:549 2 人用で 手に 物を もつ あいだ 毎コマ getBoundingClientRect 2 回（placeCursor）。えらびが かわった・描きなおした ときだけで 足りる | 毎フレームの 読み | | 未 |
| 4b | dev | code-reviewer | 【軽微】src/game/wire/duoPlay.ts:203 2P の 小太刀の 斬撃の 手前の 向きを 1P の game.camera で きめる。分割画面で 2P の 半分では 妖怪の 向こう側に 出て 体に かくれる おそれ。duoView の camera2（vr.camera2）の 位置を わたす 口を 足すか、せめて 2P の 足もと（2P の カメラは 2P の 後ろ）を camera の かわりに わたす | 分割画面の 向き | | 未 |
| 4b | dev | code-reviewer | 【軽微】src/game/wire/save.ts:101 セーブ読みこみで 1P の kodachi は clear するが 2P の live.kodachi は clear しない（参加中に 読みこむと 前の 世界の 追い打ちが 待ちに のこる おそれ。P2Kodachi.clear は 作ったが 呼ぶ 所が ない） | 後片付け | | 未 |
| 4c-test | dev | code-reviewer | 【軽微】src/craft/furnaceWorld.test.ts 頭の 約束: FurnaceWorld から 入れた 人の つくる へ bakeStart/bakeDone を とどける 口が ない（「足りない 口: なし」は ちがう）。例 `listen(who, sink: (e: CraftEvent) => void)` を CraftSystemImpl が 作る ときに 関数で 登録（this を わたさない）。とどけ先は joined で きまった 受け取る 人（2P が いなければ 1P） | 約束の 抜け | | 済 |
| 4c-test | dev | code-reviewer | 【軽微】src/craft/furnaceWorld.test.ts: 1 人の 遊びが かわらない 確かめが ない。本番で 1P の つくる に furnaces を わたすなら、fw.update の 呼ぶ 所（今の craft.update の すぐ あと・1 人でも 毎ステップ 1 回）と onDelivered→受け取る 人の craft.notifyPickup（1P は ログ＋pickup 出来事、2P は 実績の pickup だけ）を 約束に 書き、「furnaces あり・joined false」と「なし」で pickupLog・drainEvents が 同じ テストを 1 つ | 1 人の 不変 | | 済 |
| 4c-test | dev | code-reviewer | 【軽微】src/storage/tansuView.test.ts 頭: slotsAt は 記録だけで なく 世界の ブロックが たんすか 見る（st.update の 前に こわれた ケース）と 書く。click/shiftClick/storeAll などは StorageSystem の 動かし方を 1 か所に 出して 使う（写さない。CODE-RULES 1）。とおく・こわれて とじる とき 2P の 手の 物は onClose→パネルの とじ方（invClose）で もちものへ、と 書く | 約束の あいまい | | 済 |
| 4c-test | dev | code-reviewer | 【軽微】AC93「やく の ページの ねんりょう・できる かず は その人の 物」の テストが ない（craft2 の 数が inv2 だけを 数える）。1 本 足すか、配線で 2P の やく の ページが p2Craft を 見る ことを 実装の レビューで 見る | 基準の 抜け | | 済 |
| 4c-test | dev | code-reviewer | 【軽微】src/duo/invRules.test.ts 頭: §3.3「1P は パッドで 開いた ときも 同じ えらび」を 約束に 1 行（1P の パッド経路も duoFirstFocus を 使う。キー・マウスは 今の まま） | 約束の 抜け | | 済 |
