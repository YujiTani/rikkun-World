# POST-M7-W2 指摘台帳（M7 #18・WEAPON-2 #19 のマージ後レビュー）

対象: `git diff 3730784..origin/main -- src`（origin/main を `git archive` で別の場所に展開して `npm run check:fast` → 型 OK・64 ファイル 1257 テスト すべて通過）。
判定: **合格**（重大 0 件）。軽微は次の作業のついでに。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | dev | code-reviewer | 【軽微・優先高め】src/main.ts:857 と src/fx/weaponFx.ts:105: ゆみの出来事の列を 2 か所で drain している（`tools.drainArrowEvents()` = `bowSys.drainEvents()`、`weaponFx.step()` の `d.bow.drainEvents()` も同じ列）。main が先に空にするので、weaponFx には何も来ず、ゆみの音（ひく段・うつ・ささる・空ぶり・とどかない）と や をひろったときの hotbar 表示（`onArrowPickup`）が出ない。どちらか 1 か所で読み、もう一方へ配る（CLAUDE.md の「1 か所で 1 回だけ drain」） | 受け手が 2 つ | | 直した（POST-fix） |
| 1 | dev | code-reviewer | 【軽微】src/main.ts `trackOldFarmSeeds`: ふるいたんすからたねを取った最初の 1 回、`computeFarmPlacement(seed)` が島を丸ごと作り直す（配列の世界＋生成＋光線の計算）。あそびの途中で止まる（ひっかかる）。ゲーム開始時に 1 回計算して持つか、`farm.kakashi()` から たんすの場所を出す | 重い計算を毎ステップの経路で呼ぶ | | 直した（POST-fix） |
| 1 | dev | code-reviewer | 【軽微】src/farm/FarmSystem.ts `serialize` と src/save/SaveManager.ts `makeBody`: 作物の `ticks` が毎ステップ変わるので、育っている作物が 1 つでもあると、自動保存のたびに「変わった」と判定されて保存全体を書き直す（`bagsKey` のように比べる文字列では ticks を除く）。保存が消えるわけではないが無駄 | 比べる文字列に毎ステップ変わる値 | | 直した（POST-fix） |
| 1 | dev | code-reviewer | 【軽微】src/dig/raycast.ts `targetable` を使う場所: 作物・やせいのやさい・かかし・さく・たいまつ は「固くない」のに照準・遮り判定では壁あつかい。刀の `blocked()`（BladeSystem）で、間に作物があると妖怪に当たらず、や（BowSystem）は作物に「ささる」。畑のそばでたたかう時だけ起きる | 判定が `solid` でなく「空気でない」 | | 直した（POST-fix） |
| 1 | dev | code-reviewer | 【軽微】src/main.ts `onDropPicked`: たねを拾うと出どころに関係なく `seedFound('yokai')` になる。たんす満杯であふれた分・自分で すてた たね・しゅうかくの あふれ（`scatterItem` は 'yokai' 種）を拾い直しても「ようかいからたね」の実績に数えられる。ドロップに出どころを持たせるか、実績は妖怪の `defeat` ドロップ由来だけにする | 出どころを区別していない | | 直した（POST-fix） |
| 1 | dev | code-reviewer | 【軽微】src/dig/DigSystem.ts `updatePlace`（till）: たねを使い切った直後も右ボタンを押しつづけていて、ねらいが くさ/つち だと、素手のたがやし（`placeRepeatTicks` ごとに 1 回数える）が始まり 3 回で はたけ になる。押した瞬間だけ数える（`first` か `wasPressed`）と意図せず耕さない | 押しつづけもたがやしに数える | | 直した（POST-fix） |
| 1 | dev | code-reviewer | 【軽微】src/save/SaveManager.ts:222-226 と FarmSystem `deserialize`: `farm` の保存がこわれていて `deserialize(null)` に落ちると `placed=false` になり、そのあと `placeLegacy` が やせいのやさい を また置く（取った後のやさいが復活）。新しい保存（`farm` キーがある）でこわれたときは `placed=true` のままにする | 「こわれた」と「前の保存」の見分けがない | | 直した（POST-fix） |

## 確かめて問題なかった所（メモ）
- 右/左クリックのふりわけ: 刀は 妖怪が手前 or 何もねらっていない → わざ、作物・ブロック → しゅうかく/ほる。`previewRightClick` と実行側（`updatePlace`）は同じ順序（たんす→かまど→防具→たがやす→まく→合図→たべる→置く）で一致。作物の上には置けない（`placeSpot` が air/water のみ）。たべるは体力満タンなら食べずに合図だけ。
- たいきゅう: 持ち物・防具・たんす・ふくろ（DropField）・カーソル・保存すべて `wear` を運ぶ（`copyStack`/`addStack`/`readWear`）。防具は先にカットを決めてから へらす。こわれた同じステップでも1回は効く。古い保存は新品あつかい。
- 作物の保存: 保存の `farm` は ブロックの復元のあとで読む。前の保存（印なし）は `placeLegacy` で、変えたマスをよけて置く。`baseline` は置きものの前に取っている（置きものが保存の差分に入る）。
- おめでとう画面中: onUpdate が先頭で return するので 時刻・作物・刀・ゆみ・妖怪は止まり、画面の時間だけ進む。作物の育ちと時刻が ずれない。
