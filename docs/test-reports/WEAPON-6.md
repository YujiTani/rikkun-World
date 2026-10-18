# WEAPON-6 テストレポート（第 1 回）

- 判定: 合格（重大な指摘 0 件）
- 対象の仕様書: `docs/design/WEAPON-6.md`（第 3 版）
- 実行したコマンド: `npx playwright test e2e/weapon6.spec.ts`（14 本）、`npm run check:ui`（37 本）、AC23 用に `e2e/weapon3・weapon4・weapon5・char4・char2・w2・rarity7・craft2・smoke`（計 75 本）。全部の E2E は PR の CI にまかせる。性能の変更は仕様にないので `npm run perf` は回していない。
- スクショ: `/mnt/project-files/weapon6/final/`（`sheet.png` に 6 枚をならべた物。1280×800）

## 受け入れ基準（E2E・UI 検査の層。ユニットの AC1〜AC11b はユニットテストが担当）
| # | 結果 | 確かめ方・証拠 |
|---|---|---|
| AC12 | OK | weapon6.spec AC12。thrust・kiriage +20・kesa +47・thrust +145。`combo2`・`combo3` が 1 回ずつ、2・3 段目を始めたステップに鳴る |
| AC13 | OK | weapon6.spec AC13。下段 +34・+54・+152 |
| AC14 | OK | weapon6.spec AC14。1 周期（145 ステップ）で techHit が step 1・2・3、合計 = 強さ × 4.4、ぬりかべの手前で止まる、実績 `blade.combo3.1` |
| AC14b | OK | weapon6.spec AC14b（中段 前 2.5・下段 前 1.9。当たる F も確認） |
| AC14c | OK | weapon6.spec AC14c。きりあげ F14・F45 で 1.4、つき F6 で 1.4、かべ・がけで止まる（押さずに 1 回だけ押して見る） |
| AC15 | OK | weapon6.spec AC15（かたな: 42 ステップごと・step 1・combo null） |
| AC16 | OK | weapon6.spec AC16（長押し） |
| AC17 | OK | weapon6.spec AC17（窓 F5〜F41、F42 は idle、次は step 1） |
| AC18 | OK | weapon6.spec AC18（R だけ → F42 にかまえ変え。R のあとに押す → F38 に 2 段目・buffered null） |
| AC19 | OK | weapon6.spec AC19。parryStart は blade の t0 +21（`parry.events` の tick は game.tick+1。仕様の F21 と一致） |
| AC20 | OK | weapon6.spec AC20（星 1・2・3、上段 1、かたな 0） |
| AC21 | OK | weapon6.spec AC21（右キーで右へ。3 段目は斜めの妖怪の方へ） |
| AC22 | OK | weapon6.spec AC22（2・2・2 で作れる、1・2・2 では作れない、たいきゅう 400） |
| AC23 | OK | 既存の weapon3・4・5・char2・char4・w2・rarity7・craft2・smoke がテストの直し（weapon5 AC16・char4 AC17）だけで通る |
| AC24 | OK | weapon6.spec AC24（smoke。エラーなし） |
| AC25 | OK（自動） | ui-gate の `hud`・`prep` 系が 3 つの大きさで通る。3 段の最中の HUD は sheet.png の 3 枚（部品・置き場所は同じ。わざの名前は 1 つ）で目視 |
| AC26 | OK（自動） | ui-gate の `craft-detail`・`inventory`・`rarity-7` が 3 つの大きさで はみ出しなし。`info-crystal-katana.png` で たいきゅう 400 を確認 |
| AC27 | OK（自動） | ui-gate の `craft-detail`・`achievements` が通る。`craft-crystal-katana.png` で 材料 2/2 が 3 つ |
| AC28 | 目視のみ | 当たりのコマと `blade.shape()` のそろい: 自動の比べは未実装。`chudan-step*-hit.png`・`gedan-step*-hit.png` で 各段の当たりの絵を撮った。細かい比べは UI 検査係・オーナー確認（AC30）へ |
| AC29〜32 | オーナー確認 | まだ |

## check:ui の結果
- 37 本中 36 本が通った。落ちたのは `CHAR-4 AC13`（「同じかたなを 2 回撮ると同じ」の画像の一致）の 1 回だけで、単独で 2 回回すと 2 回とも通った。かたな（きらめく カタナではない）を撮る場面で、WEAPON-6 に関係しない描画のゆらぎと見立てる（軽微）。
- 違いが出た画面（HUD・つくる画面・もちものの説明）は、はみ出し・部品の数の検査にすべて合格。

## 性能（前回との比較）
性能に関わる変更ではないので計測していない（`npm run perf` は回していない）。

## 見つけた問題
- 【軽微】`CHAR-4 AC13` が 1 回だけ不安定に落ちた（上記）。再現せず。
- 【軽微】AC28 の自動比べは書いていない（見た目の確認に回した）。
