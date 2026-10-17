# CHAR-4 テストレポート（第 1 回・UI 検査と見た目）

- 判定: 合格（重大 0・軽微 2）
- 対象の仕様書: `docs/design/CHAR-4.md` 第 2 版（オーナー §9 はおすすめのまま）。HEAD 0b8d71c
- 範囲: 【UI 検査】AC13・AC18、準備した E2E（`e2e/char4.spec.ts`）、見た目。ユニットの基準（AC1〜AC12 の多く・AC14・AC15）は `npm run check:fast` と CI の分
- 実行したコマンド:
  - `npm run check:ui`（35 本 全部 OK・3.1 分）
  - `npx playwright test e2e/char4.spec.ts e2e/char2.spec.ts e2e/smoke.spec.ts`（17 本 全部 OK・1.4 分）
  - `npm run perf` は 回していない（性能は AC14 のユニットと CI）

## 受け入れ基準
| # | 結果 | 確かめ方・証拠 |
|---|---|---|
| AC13 | OK | `e2e/ui-gate.spec.ts` に「CHAR-4 AC13」を 足した。HUD を `display:none` で 隠し、立って 中段・yaw 45・pitch −10・1280×800 で ぼくとう と かたなを 撮る。ちがう ドット 345 こ（x 483〜527・y 394〜449 = 刃の 所）。板の 四すみを `camera.get()`・`camera.fov()`・`atlas.json` の modelH から 画面へ うつした 四角（(418,587)(682,565)(685,312)(396,312)）の 外は 0 こ（1 ドットの よゆう）。かたなを 2 回 撮ると 同じ（決定的）。CHAR-2 AC34（切りつめる 前と 後）も 同じ 場面で OK |
| AC18 | OK | `e2e/ui-gate.spec.ts` に 5 場面を 足した（下の 一覧）。各 場面で 軌跡が `visible`・刀の frame が 決めた F であることを たしかめてから 1280×800・1440×900・1024×700 で HUD の はみ出し・重なりを 検査。5 場面 × 3 サイズ とも 0 件（`ui-gate-report/char4-*.txt` は 空）。`known.json` に 足した 物は ない |
| AC16 | OK | `char4.spec.ts`「刀の通し」「当たっても外れても」 OK |
| AC17 | OK | `char4.spec.ts`「水晶の かたな・下段で 切り上げ」「中段で 突き」「なぎなた・つるはし・素手・弓」 OK |
| AC2・AC5・AC7・AC8・AC12（ゲームに聞く） | OK | `char4.spec.ts` の 該当の 5 本 OK |
| smoke・CHAR-2 の 通し（AC20・AC21） | OK | smoke 5 本・char2 2 本 OK |
| 見た目（見本・試作との くらべ） | OK（軽微 2） | 下の「見た目」 |

## UI 検査で 足した 場面（ui-reviewer が 見る スクショ）
パスは リポジトリの `ui-gate-report/`（git の 管理外。1 つの 場面に 3 サイズ）。すべて HUD ははみ出し 0・重なり 0。

| 場面 | スクショ |
|---|---|
| 大けさぎり F31 ぼくとう | `ui-gate-report/char4-kesa-bokuto-F31-{1280x800,1440x900,1024x700}.png` |
| 大けさぎり F31 かたな | `ui-gate-report/char4-kesa-katana-F31-{1280x800,1440x900,1024x700}.png` |
| 大けさぎり F31 きらきらの かたな | `ui-gate-report/char4-kesa-crystal-F31-{1280x800,1440x900,1024x700}.png` |
| 切り上げ F41 きらきらの かたな | `ui-gate-report/char4-kiriage-crystal-F41-{1280x800,1440x900,1024x700}.png` |
| 突き F5 かたな | `ui-gate-report/char4-thrust-katana-F5-{1280x800,1440x900,1024x700}.png` |
| AC13 くらべた 2 まい（HUD なし） | `ui-gate-report/ac13-bokuto.png`・`ui-gate-report/ac13-katana.png` |

ほかに 画面が かわる 物: CHAR-2 の 2 場面（`char2-katana-tech`・`char2-bow-draw`）は 刀の 色（20・21 番）が 変わるので 見た目が かわるが、検査の 結果は 0 件。

`docs/screenshots/CHAR-4/` の 4 まい（`kesa-bokuto-F31`・`kesa-katana-F31`・`kiriage-crystal-F41`・`thrust-katana-F5`）は 2 回 撮っても 同じ（git に 差が 出ない）。

## 見た目（`docs/screenshots/CHAR-4/` を 見本 `option-B.png`・試作 `contact-sheet_orbit-rightfront.png` と くらべた）
- 色: ぼくとうは 木の ちゃ色、かたなは 白・水色がかった 銀、きらきらの かたなは 水色で 星が ちらつく。見本 B・試作と 同じ 色の 向き。かたなの 刃の 板（手に 持つ 絵）も ぼくとう = ちゃ色、かたな = 銀、と 見分けが つく
- 形: 半月の 弧が 外がわ ほど 明るく、うしろ ほど うすい（グラデーション）。切り上げは 細い 弧に 星 3 こ（F41 で 星が 見える）。見本・試作の 向きと 同じ
- HUD: ホットバーの 絵は 武器で ちがい（ぼくとう・かたな）、えらんだ 枠も 武器に 合っている。HUD と 軌跡は 重なっていない
- 地面・空に 変な 色・線は ない

## 見つけた問題（軽微）
1. 【軽微】突き F5 の スクショ（`thrust-katana-F5.png`）は 軌跡が 見えない。カメラは いつも キャラの うしろなので、前へ 出る 突きの 弧は 体の かげで ほぼ 点に なる。試作の `katana_thrust_F05_shoulder.png` も 同じ（見えない）ので 試作どおり。見える 角度は 試作の「みぎまえ」だけ。AC17 の 数値の 確かめ（F3〜F14 で `visible`）は OK。スクショで 見せたいなら 基準の 文言（「F5 の スクショ」）を 「うしろから では 見えにくい」と 書くか、別の 角度の 撮り方を 決める → 原因: 仕様
2. 【軽微】大けさぎり F31 の スクショ（うしろ からの 見え方）は 弧の 始まりだけで、試作の みぎまえ より ずっと 短く 見える（頭の うしろから のびる ところ）。F31 は 点 4 こ だけ なので 数値どおり。見た目の 判断は オーナー（AC19〜AC21）

## 注意
- 検査の 最中に 別の 人が `src/fx/bladeTrailModel.ts` を 書きかえていた（`timeToTau` の 書きなおし。私は さわっていない。git の 差分に 出ている）。私の 結果は その 途中の 版も ふくむ。PR の CI の 結果で もう 1 回 たしかめて ほしい
- E2E の ログに 「jump・run の 絵を 読めませんでした（Failed to fetch）」の 警告が 出た（テストが おわって ページを とじた ときの 物。落ちては いない）
- 私が 変えた ファイルは `e2e/ui-gate.spec.ts` だけ（`char2Setup` の 引数の 型を 文字に ひろげ、CHAR-4 の 5 場面と AC13 を 足した）。`docs/screenshots/CHAR-2/*` は 元に もどした
