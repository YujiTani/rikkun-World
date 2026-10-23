# START-1 テストレポート（第 1 回）

- 判定: 合格
- 対象の仕様書: docs/design/START-1.md（v2.3）／ 実装コミット 69f3177
- 実行したコマンド:
  - `npm run check:fast` → ユニット 242 ファイル 通過（1 スキップ）・3544 テスト 通過（1 スキップ・4 todo）・型チェック OK
  - `npx playwright test e2e/start1.spec.ts e2e/smoke.spec.ts e2e/char5.spec.ts e2e/voxF-save.spec.ts e2e/m2.spec.ts e2e/live1-core.spec.ts` → 60 通過・1 スキップ・0 失敗（start1 14 本・smoke 8 本・char5 2 本ほか）
  - `npm run check:ui` → 51 通過（start-* 4 画面 × 3 つの大きさ と START-1 AC12 を含む）
  - 全部の E2E・perf は PR の CI にまかせる
- テストの直し: `src/char/charFiles.test.ts` の「boy/: idle・walk・run・jump の PNG と atlas.json」。START-1 で `boy/face.png` が入ったため、動きの絵の一覧から `face.png` を明示的に除いた（意図の「4 枚だけ・武器の絵なし」は同じ）。girl/ のケースはディレクトリの一覧を見ないので直す必要なし。

## 受け入れ基準
| # | 結果 | 確かめ方・証拠（テスト名・スクショ） |
|---|---|---|
| AC1 | OK | ユニット（check:fast 通過） |
| AC2 | OK | ユニット |
| AC3 | OK | ユニット |
| AC4 | OK | ユニット（BALANCE の既存テストも通過） |
| AC5 | OK | ユニット |
| AC6 | OK | ユニット |
| AC7 | OK | ユニット ＋ e2e/start1「おぼえる」2 本 |
| AC8 | OK | ユニット ＋ start1「AC8: 1 枚目」 |
| AC9 | OK | ユニット ＋ start1「AC9: 2 枚目」 |
| AC10 | OK | ユニット |
| AC11 | OK | start1「AC11: スタートの あと」 |
| AC12 | OK | UI 検査「START-1 AC12」3 つの大きさ通過。スクショ（下） |
| AC13 | OK | start1「AC13: はじめからの通し」 |
| AC14 | OK | start1「AC14: つづきからの通し」 |
| AC15 | OK | start1「飛ばし方（AC15）」2 本 ＋ smoke 通過 ＋ 関係 spec（m2・voxF-save・live1-core・char5）通過。全 E2E は CI で見る |
| AC16〜19 | オーナー確認 | 下のスクショと試作で yuzu さんが見る |

## スクショ（オーナー向け）
`/mnt/project-files/shots/START-1/`
- start-menu-save-{1024x700,1280x800,1440x900}.png（1 枚目・保存あり）
- start-menu-nosave-*.png（1 枚目・保存なし）
- start-new-existing-*.png（2 枚目・おしらせあり）
- start-new-nine-*.png（2 枚目・シード 9 けた）

目で見た: 字はひらがな・カタカナ・数字だけ。パネルは上下左右まん中、ボタンは重ならず、えらんだ物はオレンジで区別できる。「つづきから」は大きなオレンジで主役。おしらせの行ではつよさ 3 つが暗くなり、保存の つよさ（やさしい）だけ印が残る。

## 性能（前回との比較）
| 項目 | 前回 | 今回 |
|---|---|---|
| drawCalls | － | 計っていない（CI／perf 担当。メニュー中は世界を作らない） |
| triangles | － | 同上 |
| stepMsMedian | － | 同上 |
| stepMsP95 | － | 同上 |

## 見つけた問題
- なし（重大 0・軽微 0）。2 枚目でおしらせが ない とき、字の行と つよさの間に空きが できる（9 けたのスクショ）が、仕様の位置どおりで問題なし。
