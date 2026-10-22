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
