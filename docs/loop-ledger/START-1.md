# START-1 指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | design | design-reviewer | 【重大】§3.3 の つよさの行のはば 524 は 624 の計算まちがい（600 超え） | 足し算のまちがい（ルール D） | G1 | 対応済み（v2。左右のあきを 16 にして再計算。148/172/204、行 552/576/504/453/492 を再検算: すべて合う） |
| 1 | design | design-reviewer | 【重大】`VITE_START_MENU=off` が `playwright.config.ts` だけ。perf・shadow・calm の 3 つにも必要 | 設定ファイルの数を数えていない | G2 | 対応済み（v2 §4.1・§6.1・AC15 に 4 つとも） |
| 1 | design | design-reviewer | 【重大】CHAR-5 との順番・つなぎ目 | 仕様どうしのつなぎ目 | G3 | 対応済み（v2 §8。CHAR-5 先・CHAR-5 のテストは消さない。AC13 に ready・gpuBytes・girl を読まない を移した） |
| 1 | design | design-reviewer | 【軽微】キャラのボタンのはば 220 | 足し算のまちがい | G1 | 対応済み（204 に） |
| 1 | design | design-reviewer | 【軽微】つよいで ろくろくび すで 18 回が §2.7 を超える | ゆるす範囲の書き漏れ | G4 | 対応済み（§4.3・§9・AC4 に安全の確認） |
| 1 | design | design-reviewer | 【軽微】調べ中のフォーカスの移し方 | 例外の書き漏れ | G5 | 対応済み（§2.1 の 6・AC8） |
| 1 | design | design-reviewer | 【軽微】`?menu=1&char=block` | 接ぎ目の書き漏れ | G3 | 対応済み（§3.3・§5・AC8） |
| 2 | design | design-reviewer | 2 周目の確認: 新しい重大 0 件。→ **合格** | — | — | — |
| 1 | test-prep | tester | 【重大】AC13 の「かるい → microR 16・ring small・shadowBuilt false」は、E2E の サーバー（`VITE_MICRO_DEFAULT=off`・`VITE_RING_DEFAULT=small`・`VITE_SHADOW_DEFAULT=off`）では 成り立たない。§4.4 の 決める順は「環境変数 ＞ おもさ」なので microR は 0（環境変数が 先）、ring・かげは かるいと 同じ値で おもさの 効きが 見えない。AC13 の とおりには 書けない | 仕様どうしの ぶつかり（AC13 と §4.4 の 順） | T1 | テストは 環境変数が 先の 数（microR 0・ring small・shadowBuilt false）と `start.info().weight = light` を 見る。おもさ → 16・small・かげなし の 中身は ユニット（`src/start/weightPref.test.ts`）が 見る。AC13 の 数を 仕様側で 直してほしい（候補: 「E2E では 環境変数の 値」と 書く） |
| 1 | test-prep | tester | 【軽微】`start-menu`・`start-new-screen` が パネルそのもの（はば 648）か、そのまわりの 全面の 暗い 地かが 書いていない | 書き漏れ（§3.3 と §4.7） | T2 | テストは「パネルそのもの」と 決めて 書いた（AC12 の はば 648 ±4・まん中 ±4 を この 要素で はかる）。ちがえば 開発が 合図して テストを 直す |
| 1 | test-prep | tester | 【軽微】調べている あいだ スタートが 暗い（§5）のを `disabled` 属性で 表すか、押せて `dry` が 鳴る見た目だけの 暗さ（`aria-disabled` かクラス）かが 書いていない（つづきから は AC8 で `disabled`） | 書き漏れ | T3 | テストは どちらでも 通る 書き方（属性が あれば 待つ、なければ 少し 待って 押し直す） |
| 1 | test-prep | tester | 【軽微】§2.1 の 6「何も 押していなければ（クリック・キーとも）」の「押す」に、調べている あいだの Enter（きかない）が 入るか 書いていない | 例外の 書き漏れ | T4 | ユニットは クリックだけを「押した」として 確かめた（Enter だけでは 確かめない） |
| 1 | test-prep | tester | 【軽微】保存の meta は あるが 列が 1 つも ない 世界（さわらずに 保存だけ された）を「つづきから」に 出すか 書いていない（§4.1 は「読める」とだけ） | 書き漏れ | T5 | ユニットは 列があり gen・size が 合う 保存だけを「読める」と した（meta だけの 保存は 確かめない）。決まったら 足す |
| 1 | test-prep | tester | 【軽微】【ユニット】と 書かれた AC8〜AC11 は DOM が 要る（vitest は node 環境で jsdom なし）。画面の 状態を 純粋な 状態機械（`src/start/startModel.ts`）に 切り出し、DOM との つなぎは E2E（`e2e/start1.spec.ts`）で 見ることに した | 層の 割りふり | T6 | 開発は startModel を 先に 作り、DOM は その 見え方にする（窓口の 名前は `src/start/startModel.test.ts` の 先頭に 書いた） |
| 1 | test-prep | tester | 【軽微】`?strength=` で 始めた 新しい 世界（保存なし）の 最初の 保存に どの つよさを 書くか（URL の 値か ふつう か）が 書いていない（§4.3 は「保存の 値は 書きかえない」とだけ） | 書き漏れ | T7 | ユニットは `SaveDeps.strength` に 渡した 値を 書く とだけ 決めた（main.ts が 何を 渡すかは 開発が 決める） |
| 1 | test-prep | PO | T1〜T7 を 仕様 2.2 に 反映（T1 は AC13 を 直す、T2〜T7 は tester の 仮の 決め方を 決まりに） | — | T1〜T7 | 対応済み |
| 1 | test-review | code-reviewer | 【軽微】`src/start/startModel.test.ts` 「始まった あとは なにも 受けつけない」が `rikkun.char.v1` を `undefined` と決めていた（スタートで キャラを 書く 作りも AC7 では 許されるので 基準より きびしい） | 基準にない ことを 確かめていた | R1 | 対応済み（押した おとこのこ = `boy` が 書かれていない、に ゆるめた） |
| 1 | test-review | code-reviewer | 【軽微】AC14 の `focusedTestId` が `checking=false` の 直後の 1 回読み（フォーカスを 移すのが 少し あとなら ゆれる） | 待ちが 足りない | R2 | 対応済み（`expect.poll` に） |
| 1 | test-review | code-reviewer | 【軽微】AC14/§3.1: 「つづきから」カードの シード・「おしらせ」の 文言が E2E で 確かめられていなかった | 基準の 抜け | R3 | 対応済み（カードに `シード42`、`start-existing` に §3.1 の 文を 足した） |
| 1 | test-review | code-reviewer | 【軽微】`e2e/ui-gate.spec.ts` の 保存ありの 3 場面（世界を 先に 作る）が 既定 60 秒 | 時間の 見積もり | R4 | 対応済み（`start-` の 画面だけ 240 秒） |
| 1 | test-review | code-reviewer | 【軽微】「調べている あいだ `start-continue` が `disabled`」は 画面で 直接は 見ていない（E2E は 調べおわりを 待つ。ユニットは `continue = null` と Enter 無効まで）。窓口に 調べ中の 同じ シード（existingChecking）が ないので 画面では 確かめにくい | 窓口の 不足（許容） | R5 | 許容（ユニットの 状態機械で 見ている） |
| 1 | test-review | code-reviewer | 判定: 重大 0 件 → **合格**（AC1〜AC15 の 非オーナー分を 網羅。6.1 の 直しは 正しく 無関係の 削除なし。ユニットは 実装なしで 赤、型は 未実装の 名前だけ 赤） | — | — | — |
| 1 | code-review | code-reviewer | 判定: **合格**（重大 0 件。`npm run check:fast` 緑）。見た所: 起動順（メニュー → 世界。URL・`VITE_START_MENU=off` は `shouldShowStartMenu` で false → `readSeed`・`decideWeight`=fine で 今と 同じ決め方）、IndexedDB の 共有（`idbOpening` 1 本を メニューと main が 使う）、meta `strength`（なし = ふつう。古い保存は 書きなおしても ふつう）、`yokaiStrength` の 式（仕様 §4.3 の 表と 一致）、§4.4 の 順、`start` 窓口、CHAR-5 `initial` | — | — | 合格 |
| 1 | code-review | code-reviewer | 【軽微】`src/main.ts:268-271` `store:` に 同じ 意味の 即時関数を 書いている。すぐ 上の `store`（nosave なら null）を そのまま 渡せば よい | 重複 | — | 未対応 |
| 1 | code-review | code-reviewer | 【軽微】`src/start/startBoot.ts:97-113` 起動時に 同じ 保存を 2 回 調べる（`findContinue` と、シード空 = ふだんの シードの `checkExisting`）。どちらも `readKeys` で 全部の キーを 読むので、大きい `vox-main` では 重複。シードを 1 けた 打つたびにも `readKeys`。`timed()` の 3 秒タイマーも 毎回 clearTimeout しない。`lastWorld.ts` の `within` を 使えば 解消 | 性能（起動の 3 秒以内・メニューの あいだだけ） | — | 未対応 |
| 1 | code-review | code-reviewer | 【軽微】`src/start/startMenu.ts:149-156` Enter は フォーカスの ボタンでなく モデルの `focus`（つづきから／はじめから）で 決まる。Tab で キャラ・おもさ に 移して Enter すると「はじめから」が 始まる（`preventDefault` で ボタンの 既定の 動きも 消える）。6 歳は マウスなので 軽微 | キー処理の 範囲 | — | 未対応 |
| 1 | code-review | code-reviewer | 【軽微】`src/start/lastWorld.ts:10` と `src/main.ts`（`SAVE_BOOT_TIMEOUT_MS` 3000）で 同じ 定数が 2 か所。`src/main.ts:265` は lastWorld の を import して 1 本に | 重複 | — | 未対応 |
| 1 | code-review | code-reviewer | 【軽微】`src/char/charPref.ts:61` `initial` が あると `?menu=1&char=boy` の URL 指定を おぼえない（CHAR-5 §4.1 は URL で 始めても おぼえる）。メニューで 押せば `saveChar` するので 実害は ほぼ なし。仕様に 書いて 割り切るか、model 初期化で `saveChar` | 仕様の すきま | — | 未対応 |
| 1 | code-review | code-reviewer | 【軽微】`src/yokai/strengthPref.ts:22-24` 保存の meta が あって `strength` が ない（古い保存 または メニューの 調べが 3 秒で 時間切れ・`fromPending` のみ）とき、メニューで えらんだ つよさは 黙って ふつうに なる。仕様の「保存が 先」どおりで 正しいが、時間切れの ときだけ 画面と ちがう | 例外 | — | 未対応 |
