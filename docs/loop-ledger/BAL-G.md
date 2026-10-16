# BAL-G（#115）指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

1 周目 design: **合格**（重大 0・軽微 6）。軽微は PO の決めで すぐ対応（BALANCE.md 版 4.1・BAL-G.md）。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | design | design-reviewer | 【軽微】§5・AC20 の立ち上がりの はかり方が あいまい（途中の太鼓の一撃も入るのか）。「鳴りはじめ → 最大の 9 割（meta の `attack_s`）が 0.05 秒以上」と明記し、途中の一撃の急さは オーナーが聞いて OK 済みと書いた | はかり方の書き漏れ | G1 | 対応済み（版 4.1） |
| 1 | design | design-reviewer | 【軽微】重ねない時間に meta の `length`（ファイル全体、約 2 秒長い）を使ってもよい書き方だった。README の聞こえる長さ（−20 dB まで）3.0・3.8・5.2 秒を使い、`length` は使わないと直した | 数の出どころが 2 つ | G2 | 対応済み（版 4.1・BAL-G §1 の 6） |
| 1 | design | design-reviewer | 【軽微】AC20 (5)「試聴ページで鳴らせる」は ユニットで確かめられない。ページのファイルがあるのは ユニット、鳴るかは AC24（オーナー確認）といっしょにした | 層の当てはめ違い | G3 | 対応済み（版 4.1） |
| 1 | design | design-reviewer | 【軽微】音の記録が「鳴った」だけだと 読みこみ待ちで E2E が不安定。出来事 1 回で「鳴らす頼み」を 1 回記録（読めたかに関係なく）、「鳴った」は別に記録。E2E は頼みを見て 読みこみは待たない。読みこみ（成功・失敗・まだ）は うその読みこみ係で ユニット | テストの決定性 | G4 | 対応済み（版 4.1・BAL-G §2・§4） |
| 1 | design | design-reviewer | 【軽微】ヌシの ふんわり光の「点滅しない」が UI 検査の静止画では確かめにくい。明るさの式（周期 2.5 秒・上下の幅）を ユニットで確かめると AC19 に書き、BALANCE.md と BAL-G.md をそろえた | 層の当てはめ違い | G5 | 対応済み（版 4.1） |
| 1 | design | design-reviewer | 【軽微】「ゲームでも最後に −1 dBFS で止める」は 実装のしかたを決めていて、テストもしにくい。やめて「音ファイルのピーク −1 dBFS 以下（ユニットで測る）、ゲームでの音量の倍率は 1 以下」にした | 実装に踏みこみすぎ | G6 | 対応済み（版 4.1・BAL-G §2） |

2 周目 test-review（tester の準備 c61617b を code-reviewer が確認）: **合格**（重大 0・軽微 5）。`npm run check:fast` は 新しい窓口が まだ無い型エラーだけで赤（期待どおり）。既存テストの変更は `title.test.ts` の soundSeconds（1.0・1.5・2.5 → 0・3.0・3.8・5.2。§5・§6 に合う）と hpBar の足しだけで、消した物・ゆるめた物なし。v4 の B の WAV で `measure()` を試すと 聞こえる長さ 2.98・3.78・5.20 秒・ピーク −6.2・−5.5・−4.8 dB で、期待の数に合う。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 2 | test-review | code-reviewer | 【軽微】AC19 の UI 検査の画面（二つ名 たいしょう・ヌシ × 色 1〜3・おしらせ・おの のアイコンと手に持った形、3 つの大きさ）が `e2e/ui-gate.spec.ts` に 足されていない（BAL-G.md §4 の 1）。E2E の おしらせのアイコン（48px・ぼかさない）だけでは バー 20 本の はば・名前の長さ・ツールチップが 見えない。検証の前に tester が 足す | 依頼の取りこぼし | G7 | 未対応（検証の前までに） |
| 2 | test-review | code-reviewer | 【軽微】`titleSoundFiles.test.ts` の AC20 (2) は ffmpeg がないと skip され、`.github/workflows/ci.yml` に ffmpeg を入れる手順がない → CI で 音の安全の数が 確かめられないまま緑になりうる。`process.env.CI` のときは skip でなく失敗にする＋ ci.yml に `apt-get install ffmpeg`（または 入っている確認）を足す。ファイルの コメントの「台帳へ」は この台帳に 書いたことにする | skip の扱い | G8 | 未対応（開発の前後どちらでも） |
| 2 | test-review | code-reviewer | 【軽微】「音は nick の 3 つだけ」の `walk(ROOT)` が 作業ツリー全体（未追跡の `ui-gate-report/`・`test-results/`・ほかの worktree）を 見るので、手元で 別の音が 置かれると 落ちる。`git ls-files` の 一覧を使うと 決定的 | 決定性 | G9 | 未対応 |
| 2 | test-review | code-reviewer | 【軽微】`titleSound.test.ts` の うその AudioContext は `decodeAudioData`・`createBufferSource`・`createGain`（`gain.value`／`setValueAtTime`）しか持たない。実装が `linearRampToValueAtTime`・フィルタ等を 使うと 例外で落ちる。使ってよい口を 窓口の コメントに 書くか、うそを 広げる。`combatFx.test.ts` は 私有の `d` を 直接さわる（実装の名前に 依存） | 窓口の書き足し | G10 | 未対応 |
| 2 | test-review | code-reviewer | 【軽微】立ち上がりを測る `measure()` は「鳴りはじめ」を 絶対値 1e-3 で決め（仕様は 最大の 1%）、meta の `attack_s`（1.11）と 数がずれる（1.38）。判定は ≥ 0.05 なので 結果は 同じだが、コメントに「仕様の 1% とは少し違う」と書くか 1% にそろえる。E2E の `combat.sounds()`・`yokai.palette()`・`yokai.marks()` は まだ testHook に無い（窓口は spec 冒頭に書いてある。開発が足す）| はかり方・窓口 | G11 | 未対応 |

3 周目 code-review（開発の実装 7420c85・be8d826・a6dd494 を code-reviewer が確認）: **合格**（重大 0・軽微 4）。`npm run check:fast` は 型・ユニット 1690 とも緑。`e2e/ui-gate.spec.ts` の `openNick` に `announce` を引数へ足した直しは正当（`page.evaluate` の中から外の変数は見えず ReferenceError になる もとの バグで、期待は変えていない）。`known.json` の 追加 102 行は 今の `hud` と同じ 3 種（`#title`・`slot-key 1〜9`・`#hearts`）と、`tansu` と同じ `wear-gauge` だけで、新しい種類のくずれは なし。音は 最初の `pointerdown`/`keydown` のあとで はじめて AudioContext を作り、音量 0・読めない・AudioContext なし では 鳴らさず例外も 出さない。重ね防止は `titleSoundLeft`（`soundSeconds` を dt で減らす）。mp3 3 つで 約 313KB、元の素材は なし。テクスチャ・材料の dispose は 通っている。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 3 | code-review | code-reviewer | 【軽微】`main.ts` の `warm` → `titleSound.preload()` は 失敗しても 結果を キャッシュ（`loading ??=`）し、やりなおさない。通信が 一瞬 切れると そのセッションは 出現音が 無音のまま。失敗した音だけ 次の `play` で 読みなおす等（止まらないことは 守れている） | 失敗の再試行なし | G12 | 対応済み（次の頼みで 1 回だけ やりなおす。titleSoundRetry.test.ts） |
| 3 | code-review | code-reviewer | 【軽微】`SoundFx` と `TitleSound` が 別々の AudioContext を作る（2 つ）。動くが 資源が 2 倍。`SoundFx` の ctx を 渡せると よい。また「鳴った」の記録は `played` の数だけで `soundLog` の 列には 出ない（BAL-G §2「別に記録」は 数で 足りるが 窓口が 無い） | 窓口・資源 | G13 | 対応済み（`SoundFx.audioContext()` を 共有） |
| 3 | code-review | code-reviewer | 【軽微】ヌシの光は `rig` の子で、`dying`（たおれる）・ふきだし中も 光り続ける可能性。たおれたとき 光も 消える／ 一緒に ちぢむか、ユニットか 目で確かめる（AC21 は オーナー確認） | 終わり方の確認もれ | G14 | 対応済み（die() で 光を消す。nickMarks.test.ts） |
| 3 | code-review | code-reviewer | 【軽微】`baseColorOf` は 段階 2・3 の色から 逆引きする。今の表に 衝突は 無いが、将来 段階色が 別の もとの色と 同じになると 戻し間違える。表を 足すとき 衝突しない ユニットが あると 安全 | 将来の 衝突 | G15 | 対応済み（variants.test.ts に 衝突しない確認） |

4 周目 ui（ui-reviewer の指摘を 開発が 直した）:

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | ui | ui-reviewer | 【軽微】nick-*-stage の画面で 妖怪が りっくんの体と「たたく」ヒントに かくれ、はちまき・かんむりが 見えない | 撮る位置 | U1 | 対応済み（妖怪を 斜め前（x+5.5, z+3.6・向き 300 度）に。かんむり・はちまきが 見える） |
| 1 | ui | ui-reviewer | 【軽微】ヌシの光の箱が 地面の下まで はみ出して 見える | 箱が 体より 横に 1.1 倍 大きく、手前の下の角が 足より 低く 見えた | U2 | 対応済み（横・奥行きを 体と同じに。地面から 高さの 1 割 うかす 仕様は そのまま。かどの見え方は オーナー確認） |
| 1 | ui | ui-reviewer | 【軽微】バーの横の アイコンが 小さい | DESIGN 13.3 の 大きさ（バーの高さの 1.5 倍まで）どおり | U3 | 直さない（オーナー確認へ） |
| 1 | ui | ui-reviewer | 【軽微】頭の上の名前の文字が 小さい | `--rk-fs-body`（1280 幅で 20px・1024 幅で 17px） | U4 | 対応済み（`--rk-fs-head` = 20.4px 以上。BALANCE §5.1 は 字の大きさを きめておらず 矛盾なし。14 字でも 1 行に おさまる） |
