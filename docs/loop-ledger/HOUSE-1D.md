# HOUSE-1D 指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

先行テスト（e66c2c5。E2E 1 本＋ユニット 4 ファイル）を code-reviewer が見た結果（判定: 合格・重大 0・軽微 3・できれば 2）。tsc は seat.test.ts の import './seat' だけ 赤（票どおり）。ユニットは 16 本 赤・52 本 緑（seat.test.ts は モジュール 無しで 全体が 赤）。E2E は 回していない。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | test | code-reviewer | 【軽微】1: docs/tickets/HOUSE-1D.md:52 — 「gadgets.step の 近く」は まちがいやすい。step.ts:51 の gadgets.step は motion を 書く 所（:66-79）より 前なので、そこで 書くと stopNow・faceDeg・hoverY・jumpLocked が 毎ステップ 上書きされる。「:79（noMoveInput）の あと、controller.update（:83）の 前」と 書く | 順番の 約束を あいまいに 書いた | | 対応済み（gadgets.step の 近く を step.ts :79 の あと・:83 の 前 に 直した） |
| 1 | test | code-reviewer | 【軽微】2: docs/tickets/HOUSE-1D.md:52 — 「立って いる 間は motion を 元に もどす」を 毎ステップ やると、step.ts が 書いた 値（刀の speedMul・怯みの noMoveInput など）が 消える。「座って いる 間だけ 書く。立った ステップに 自分が 書いた 欄だけ 1 回 もどし、立って いる 間は さわらない」に する | 約束の ことばが 実装を しばりすぎ／まちがいに みちびく | | 対応済み（「座って いる 間だけ 書く・立った ステップに 自分の 欄だけ 1 回 もどす・立って いる 間は さわらない」に 直した） |
| 1 | test | code-reviewer | 【軽微】3: いす・おふろの つなぎ（DigSystem の 'sit'・'bath' → SeatSystem.use）と step.ts の 順番を 見る テストが ない（ユニットは 別々、E2E は ほんだなだけ）。e2e/house1d.spec.ts の 同じ 1 本に いすを 足す（chair を 置く → useBlock → seatNow().kind 'sit' → 60 ステップ 後も position が 同じ → moveForward を 1 ステップ 押すと null） | E2E を AC の 割りふり どおり ほんだなだけに した | | 対応済み（e2e/house1d.spec.ts の 同じ 1 本に いす（座る → 60 ステップ 同じ 位置 → moveForward 1 ステップで null）を 足した（helpers/houseFurn.ts に stepAndPosition・tapMove）） |
| 1 | test | code-reviewer | 【軽微】4（できれば）: src/house/seat.test.ts:131-134 — おふろの 位置は「どれかの マスの まん中」で 通るが、票 :49 は「ねらった マスの まん中」。テストを ねらった マスに しぼるか、票を「どちらかの マス（実装が 決める）」に そろえる | 票と テストの ずれ | | 対応済み（seat.test.ts の おふろの 位置を ねらった マスの まん中 に しぼった（票 :49 どおり）） |
| 1 | test | code-reviewer | 【軽微】5（できれば）: e2e/house1d.spec.ts:20 の あと — テーブルで 右の 案内が 出ない こと（AC54）を `expect(t.hint).toBeNull()` で 1 行 足す（もう とって いる 値） | — | | 対応済み（テーブルで `expect(t.hint).toBeNull()` を 足した） |

実装（2175cbd）を code-reviewer が見た結果（判定: 合格・重大 0・軽微 1・できれば 3）。tsc 0、ユニット（src/house・dig・world/light・fx・ui・camera・game）162 ファイル 2004 件 緑、ratchet は 上限の まま、eslint の max-lines・no-restricted-imports は 0。E2E は 回して いない。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 2 | dev | code-reviewer | 【軽微】6: src/house/seat.ts:128-130 — 座る 前から 移動キーを 押した まま だと、座って いる 間も PlayerController の st.moving が true に なる（wlen > 0）。afterUpdate が onGround を true に するので、CameraRig.ts:382 の 人形が その場で 歩く 形に なる。座って いる 間は afterUpdate で st.moving・st.running も false に するか、SeatMotion に noMoveInput を 足して true を 書く | 押して いた キーを 立つ もとから はずしたが、歩く 入力は 止めて いない | | 対応済み（seat.ts afterUpdate で 座って いる 間 moving・running を false に。seatExtra.test.ts に 1 本） |
| 2 | dev | code-reviewer | 【軽微】7（できれば）: src/fx/bathSteam.ts:69 — `this.pool.update(dt, [e])` が 毎ステップ 配列を 作る。`private readonly entries = [this.entry]` を 持って わたす | 毎フレーム new しない きまりの もれ | | 対応済み（bathSteam.ts: readonly の entries を 持って わたす） |
| 2 | dev | code-reviewer | 【軽微】8（できれば）: src/game/wire/seat.ts:28-50 の 錠の 開け閉めは wire/house.ts:40-56・wire/ui.ts:228-245 と 同じ 3 つめの 写し。#340 PR-2 が 入った あとで 1 つの 関数に まとめる | 前から ある 写しを まねた | | #340 PR-2 の あとで 別に まとめる（今は しない） |
| 2 | dev | code-reviewer | 【軽微】9（できれば）: 'sit' \| 'bath' \| 'read' の 字が digPorts.ts:103・DigSystem.ts:545・wire/seat.ts:56 に 直書き。furnUse.ts の `FurnUse` 型を 使う | 型を 1 か所から 読んで いない | | 対応済み（furnUse.ts の FurnUse 型と isFurnUse を digPorts.ts・DigSystem.ts・wire/seat.ts が 読む） |
