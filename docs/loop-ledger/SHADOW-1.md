# SHADOW-1 指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | design | design-reviewer | 【重大】受け入れ基準に層の印がない／E2E が 13 本ぶん並ぶ。→ 層を付け、AC2・AC8 を統合、AC5・AC13 はユニットへ | 基準を案のまま書いた | G1 | 対応済み |
| 1 | design | design-reviewer | 【重大】AC9 と §9 が「10 秒」（壁の時計で速さに左右される）。→ 600 tick に | 時間の単位 | G2 | 対応済み |
| 1 | design | design-reviewer | 【重大】段 1 に入る丸い影・設定の「かげ オン／オフ」・F3 の影の数に基準も画面の配置もない。→ AC15・AC16・画面の配置を追加 | 抜け | G3 | 対応済み |
| 1 | design | design-reviewer | 【軽微】AC8 が tick 指定なし（スタートは日の出で影がうすい）／AC5 の「近く」があいまい／影がまっ黒でない下限と昼夜切りかわりの基準がない。→ 追記 | あいまい | G4 | 対応済み |
| 1 | design | design-reviewer | 【軽微】アート（TEX-A の丸い影・AO・面の明るさ）と丸い影が重なる可能性。ただし `docs/tickets/TEX-A.md` と `docs/art/DESIGN.md` の影の節がこのブランチに無く確認できない。PO が丸い影の持ち主を 1 か所に決める | 他スレッドが見えない | G5 | 未対応 |
- PO: 丸い影の持ち主は TEX-A（#146）に決めた。SHADOW AC15 は重なりの下限だけを見る（TEX-A は 6 ブロック、SHADOW は 3 ブロックで食いちがっていたため）。
- テストレビュー合格（70b6ac2 で AC1/AC4 を影の先っぽで見る・AC12 の step を外す）。developer へ: 実装後に shadow.test.ts 4 本・time.test.ts 4 本の it.fails と m3 の test.fail を外し、shadow.test.ts の動的 import を普通の import に。nightBrightness 0.25・開始 9000 で他の spec（m72:791 の 0.45、sound1・fix129・bal ヘルパー）が前提をくずさないか確かめる。実装は TEX-A（#146）マージ後、main に rebase してから。

## developer（実装）の記録
- 実装: `src/world/render/shadow/`（shadowLight・shadowCamera・shadowGlsl・shadowPatch・ShadowSystem・shadowHook・shadowPref）。試作 `src/proto/shadow/`・`?shadow=1` の試作 hook・試作の計測（shadowBench・shadowShots）は消した。見本スクショと計測は `e2e-perf/shadowImpl.perf.ts`（`npx playwright test --config playwright.shadow.config.ts shadowImpl`、スクショは /mnt/project-files/shadow/impl/）。
- オーナーの決定: nightBrightness 0.25、はじまり tick 9000（`START_DAY_TICK`）。it.fails / test.fail は外した（期待の数は変えていない）。
- 受ける側は `shRatio`（影ありの光 ÷ 影なしの光）を色にかけるだけ。voxelMaterial・lightShader に `shadowPatch.active` のときだけ差し込む。丸い影・AO・面の明るさは TEX-A のまま。たいまつの影は段 2（入れていない）。
- **CI で影を切る方法: E2E のサーバーの既定オフ**（`playwright.config.ts` の webServer に `VITE_SHADOW_DEFAULT=off`）。URL に `shadow` が無く E2E の既定オフのときは影のしくみを作らない。`?shadow=1` でオン、`?shadow=0` で作らない。ふだんの遊び（環境変数なし）の既定はオン。設定の「かげ」は localStorage `rikkun.shadow.v1` に保存（?nosave=1 では読み書きしない）。
- spec への手直し（テスト係へ）: AC16 の URL を `?nosave=1&shadow=1` に（E2E サーバーが既定オフのため。「はじめはオン」は shadowPref.test.ts が見る）／AC16 の F3 は resume してから押し、文字が書きかわるのを待つ（一時停止のままだと F3 が効かず、文字は 0.25 秒ごと）／AC12 の画素くらべは右上の時計の飾り（コマごとに数画素ゆれる）を外す clip（y ≥ 120）。
- キャラの影を落とす板は、足のすきまで光がもれ AC3 が落ちたので、まわり 12 目ふくらませた形にした（見やすい影）。
- 地図のカメラは 1 目にそろえるとき奥行きも 1 目にそろえる（shadow.test.ts の最後の期待に合わせた。奥行きは 160 ブロックぶんなので影響なし）。
- 数（1280×720、SwiftShader、tick 14000 ほか）: メインの描く回数・三角形は影なしと同じ（start 82 / 380,376、sky 117 / 661,310、dusk 96 / 417,532、night 101 / 482,250、cave 81 / 350,716）。ふだんのコマに影が足すのは 1〜12 回・2〜134 三角形（動く物の地図だけ）。止まっている地図の描き直し 1 回: 近く 71〜87 回・約 74〜84 万三角形、遠く 108〜118 回・約 76〜85 万三角形（目標 1 枚 1.3M 以下）。立って 600 tick: 近く 6〜8・遠く 3〜4（昼 3 場面。夜は月が速く 近く 12・遠く 6）、1 コマに描き直す地図は最大 1 枚。F3 に `shadow near N far N dyn N  draw N tri N`。
- 確かめた E2E: shadow1・m3・texA・smoke・m1・m2・m7・m72・bal-a〜d,g・fix129・seethru・sound1・w2 が通った（m2 の AC19/20/21 が 1 回だけ落ちたが、再実行・main でも通る。時間のゆれ）。m72:791 の 0.45 は畑のしずくの不透明度で夜の明るさと関係なし。
- 気になる所: (1) 夜の再描き直しは月が速いので多い（近く 12 / 10 秒）。(2) 妖怪が影を受けるのは段 3。(3) 本当の fps と M4 での描き直しのコマは、オーナーの Mac の F3 で確認が必要（AC14）。

## code-reviewer（実装レビュー、fe3f6e7）判定: 合格（check:fast 緑。重大 0）

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 2 | dev | code-reviewer | 【中】CI は影なし（playwright.config.ts の VITE_SHADOW_DEFAULT=off）なので、影ありの本番の見た目を見る自動の目は shadow1 だけ。ui-gate に「かげ」の行が出ない／texA（AO・丸い影）と影のかけ算も自動では見ない。→ ui-gate か texA に `?shadow=1` の 1 画面を足す | CI を軽くした副作用 | G6 | 未対応 |
| 2 | dev | code-reviewer | 【中】ShadowSystem.ts meshChanged/maybeStatic: 掘る・歩いて新しいチャンクが出るたびに近い地図（約 75 万三角形）が 4 コマに 1 回まで描き直される。AC9 は立ち止まりだけ。歩き・掘りの間の数は未計測 → オーナーの Mac の F3 で確認（AC14）。重ければ THROTTLE を上げる | 計測が立ち止まりのみ | G7 | 未対応 |
| 2 | dev | code-reviewer | 【軽微】ShadowSystem.ts: dispose なし（地図 3 枚・板の材料）。placeCam/cardCall が毎コマ new（Matrix4・Vector3）。renderWorldDepth/renderDynamic の材料の入れかえが try/finally でない | 一生ものなので害は小さい | G8 | 未対応 |
| 2 | dev | code-reviewer | 【軽微】docs/design/SHADOW.md §8.1 と e2e/helpers/shadow.ts の説明が「ほかの spec は `?shadow=0`」のまま。実際は VITE_SHADOW_DEFAULT=off。AC12 の clip y≥120 は時計の飾りだけを避ける目的で妥当（影の差は上 120px に出ない場面）。文書だけ合わせる | 実装中に方法が変わった | G9 | 未対応 |

## developer（レビューの直し）
- 【中 1】texA に AC8c を足した（`?shadow=1`、石の柱の影の中に丸い影と AO が重なる点で、影あり ÷ 影なし が 0.35 以上 0.8 未満）。1 本だけなので CI は軽い。
- 【軽微】ShadowSystem に dispose（地図・材料・板。pagehide で呼ぶ）、placeCam / cardCall の new をやめて作業用の物を使い回す、材料の入れかえを try/finally に。SHADOW.md §8.1 と e2e/helpers/shadow.ts の説明を VITE_SHADOW_DEFAULT=off に直した。
- 【中 2】歩き・掘りの間の地図の描き直しの数は未計測のまま。オーナーの Mac の F3（`shadow near N far N`）で確認してもらう。

## art-reviewer（見た目、合格）
| 3 | art | art-reviewer | 【軽微】はじまり（tick 9000・start 視点）でキャラが草のでこぼこの影に入り、髪が白→灰むらさき・パーカーが暗く見える（影あり/なしの比較）。第一印象でキャラが少しくすむ | キャラが受ける影の下限をほかの物より少しあげる（例 0.55→0.7）か、はじまりの向きを日なたにする | オーナーの Mac で見て決める | 未対応 |
| 3 | art | art-reviewer | 【軽微】夜（tick 70000・0.25）は遠くの木・地面がほぼ黒緑、夕方（dusk）も試作より約 13% 暗くキャラのパーカーが沈む。たいまつの近くは十分見える | こわくはないがオーナーが Mac で確認。暗いと感じたら遠くだけ明るさの下限をあげる | オーナーの Mac | 未対応 |
| 3 | art | art-reviewer | 【軽微】impl/sky.png は上空でなく地上の絵（落下して地面に着く）で、木の影・丸い影の「上から見た見え方」が確認できない。cave も妖怪がいない | 撮影スクリプトで player を浮かせて撮り直す（見た目ではなく撮り方の問題） | 次のついで | 未対応 |
- 【軽微】impl/sky.png を撮り直した（撮影スクリプトで 600 tick の前に撮り、空の上にもどしてから 1 コマ。見た目はかえていない）。
