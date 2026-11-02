# WAKIDOKORO test report

## ユニット
- `src/world/water/waterfall.test.ts`: 5 方向・上に 出ない・ふさいだ 方向・マグマの たきつぼ・minFall（4 マス 不発生 / 5 マス 発生 / 階段 不発生）。
- `src/world/water/waterFlow.test.ts`: 2 方向（pickTwo・再現できる・水と マグマ）。AC5 の 期待値を 新しい 決まった 形に 更新（合計 8・止まる）。
- `src/world/water/springLoad.test.ts`: ベンチ（数は design §10）・上限で 近い じゅん・ちらつき どめ。
- `src/combat/magma.test.ts`: むてき 30・ノックバックの 向き（マグマ・こげた）・両方でも 0.5 秒に 1 回。
- `src/drops/burn.test.ts`: 20 秒で 消える・そと では 燃えない・出たら 0・炎 2 ＋ けむり 1。
- `src/world/gen/liquidPonds.test.ts`: T 字の はしら・マグマの たきつぼ。
- スナップショット（blocks/content/drops/ids/order/settings）と sectionMesher の ゴールデン（アトラスの 行が ふえた だけ。前の 行数に 固定すると main の 表で 通る）を 作り直し。

## E2E
- `e2e/wakidokoro.spec.ts`（4）: 5 方向・渦の コマ・こわす（落とさない / たきつぼ アイテム・置き直し）・ノックバックと むてき・燃える アイテム。
- `e2e/waterfall1.spec.ts`: 置いた 数を 前後で くらべる（自然の 滝の わきどころが 数に 入る）・空中の わきどころの よこを ふさぐ。
- `e2e/helpers/tex.ts`: 平らな 箱に マグマの たきつぼ。

## 画面
/workspace/wakidokoro-shots/: 1-wakidokoro-water-magma.png・2-swirl-frame-a/b.png・3-takitsubo-water-magma.png・4-item-burning.png
