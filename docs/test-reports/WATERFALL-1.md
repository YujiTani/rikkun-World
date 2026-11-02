# WATERFALL-1 テストレポート

## ユニット（vitest）
| AC | テスト | 結果 |
|---|---|---|
| AC1 | `src/world/water/waterfall.test.ts` わきみず 3 本（15 ステップに 1 つぶ・よこに 出す・こわすと 止まる） | 緑 |
| AC2 | 同 たきつぼ（できる・合計 かわらない 40 回・列が とぎれない・シードで 同じ／ちがう・確率 0.05 前後） | 緑 |
| AC3 | 同 手で 置いた 2 つで つながる・32 より 深いと つながらない | 緑 |
| AC4 | 同 マグマ 45 ステップ・合計 かわらない・押し出し・マグマの わきみず | 緑 |
| AC5 | 同 水に ふれて こくようせき（水は へらない） | 緑 |
| AC7 | `src/combat/magma.test.ts`（すぐ 1・30 ステップごと・でると 止まる） | 緑 |
| WATER-1 | `waterFlow`・`waterWake`・`waterUse`・`water.test.ts`（パスの 中を 下から に した あとも 全部） | 緑 |
- `npm run check:fast`: 526 ファイル 緑（6768 本）。content の 写し・ブロック メッシュの golden は 作り直した（アトラスが 153 → 160 まい・39 → 40 だん に なった ため）。

## E2E（playwright）
- `e2e/waterfall1.spec.ts`: 作る（いし 4 ＋ すいしょう 1）→ 右クリックで 置く → 空中の わきみず（y=20）→ たきつぼ（12, 8, 12）→ 8 × 120 ステップ 合計 同じ・列 11 マス つづく → マグマ 40 つぶ 夜に 光る → 水 → こくようせき。WF_SHOTS で 画面。
- 既存: water1・bucket・smoke・perf 5 本（live1/3/4-perf・perf1-tier-viewer・perf2-slice）・craft 3 本（craft2・craft2-extra・craftPage）。結果は PR に。

## ユニットだけで 確かめた 所
- シードで たきつぼの できる ステップが 同じ／ちがう、takiReach 32 の 上限、手で 置いた 2 つ、マグマの 押し出し、マグマの わきみず、マグマの ダメージ（ゲーム画面では 見て いない）。

## 画面
`/workspace/waterfall-shots/1-waterfall-flow.png`・`2-takitsubo.png`・`3-magma.png`・`4-magma-water-obsidian.png`

## 版 2
- ユニット: `src/world/water/magmaBurn.test.ts`（こげる・seed で 同じ・こげない 物・マグマを とると 止まる・ぐつぐつ の わりあい）、`src/combat/magma.test.ts`（こげた ダメージ 1 秒に 1・マグマと べつ）、`src/world/light/magmaLight.test.ts`（光 12・4 マス 先まで 妖怪が 出ない）
- E2E: `e2e/waterfall1.spec.ts` 2 本目（新マグマ・ぐつぐつ コマ 4 まい・こげた 床・ふむと 19 → 18 → はなれて 止まる）
- golden: アトラスが 41 → 42 だんに なり 面の V が かわる ので `GOLDEN_WRITE=1` で 作り直し。content snapshot: kogeta ブロック・MAGMA_TUNING の 追加で `-u`
- ユニット だけで 確かめた: こげない 物の 一覧、seed の 決まり、かべ（横）からの ダメージ（E2E は 足もと だけ）、光の 数値
- 画面: `/workspace/waterfall-shots-v2/`
