# TEX-A 台帳（developer）

## 結果（SwiftShader, 1280x720, スタート地点）
- 三角形: 約 380k（スタート）/ 386k（キャラ・鉱石の壁）。描画回数: 81〜84。
- legibilityScore（AC13）: start 2.07 / hill 2.49 / high 1.27
- 区画のつくり直し時間: 基準（af11836）との比較は未計測。
- check:fast 緑。E2E: voxE-mesh・smoke・char1・m1 全部通過。texA.spec は 8 通過 / 6 失敗（下）。
- スクショ: /mnt/project-files/texture-back/impl/{start,chara,sky,furnace,ore}.png

## texA.spec の失敗 6 件（テストの設計とのぶつかり。期待値は変えていない）
AC1, AC4, AC7, AC8, AC10, AC11。原因は次のとおり。
- 地面は「小さな凸凹（micro terrain）」で面が平らでない。平らな面を測るテストは `render.setTerrain(false)` を使うとよい（足したフック）。
- AO は小ブロック面ごとにバイリニア補間。セル中心でなく頂点で測るべき。
- AC8 の足の点が脚のすきまに当たる。AC10 は霧（40〜80）が色に混ざる。霧なしか霧補正した値で比べる。
- 推奨: PO がテスト係に上の 4 点の直しを依頼。

## 判断メモ
- world.test.ts の面の明るさを [0.5,0.6,0.8,1] に変更（新しい明るさ表のため）。
- AO の式は DESIGN の係数 [1,.82,.68,.55]、前の層の 8 近傍から面ごとにバイリニア。r-8〜r で薄くなる。
- 追加フック: render.setTerrain（micro terrain の入切）。
- 平らな箱 7 種は AO を頂点属性 aDark＋対角反転で表す。
