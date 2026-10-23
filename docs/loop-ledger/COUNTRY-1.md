# COUNTRY-1 指摘台帳

## 1 回目（design-reviewer、2026-10-23）判定: 差し戻し

| # | 重さ | 指摘 | 対応 |
|---|---|---|---|
| 1 | 重大 | §8 の `biome.found/setFound/plate/celebrated` は VOX-I §8.2 にあるだけでコードに無い。全部新規と書く。VOX-I の `plate()` の形（`{visible, kind, shownCount}`）と本仕様の `size/smallCount` のずれをどちらが正か明記。窓口を置くファイル（biomeHook は seed と player しか持たない）も一言。 | 2 版 §8: 窓口は ぜんぶ 新しく作る と明記。置き場所は createBiomeHook に 見つけた国の係を聞く口を足す。plate() の形の ずれは ふだ廃止で不要（オーナー決定。この仕様が正） |
| 2 | 重大 | AC5〜AC7 がテストできない。`pickKind` は private・引数なし。純粋関数（例 `pickYokaiKind(row, scale, nurikabeFull, rng)`）と表の差しかえ口を約束する。AC6 は trySpawn を通す口と 200 体の出し方を書く。今の trySpawn は「種類 → KIND_AI で夜か → 場所」なので「場所 → 国 → 種類」は組み替え。乱数の消費順が変わり既存テストが壊れうるので、AC8 の「前と同じ」は強さの計算だけに絞り、壊れるテストの確認をタスク票に足す。 | 2 版 §3.3: 純粋な関数 pickYokaiKind(row, scale, nurikabeFull, r) と countryOf・表を外から渡す口。AC6 に 200 体の出し方。trySpawn の組みかえ・乱数の順の変化を明記し AC8 は強さの計算だけ。こわれうるテストはタスク票 |
| 3 | 重大 | 新しいゲームの開始 3 秒（はらっぱ）で全テストに ふだ・実績・音が出る。実績数・pending・音の回数を見る既存テスト（M6・audio・hud・smoke）への影響一覧をテスト準備に書く。テスト用に「ふだを出さない／最初の国を見つけた扱い」のフラグがいるならここで約束。開始時の他の表示との重なりと出す順番を決める。 | 2 版 §4.3: スタートの はらっぱ を はじめから並びに入れ 実績はしずかに取る。テスト用 biome.quiet(on)。影響を見るテスト一覧をタスク票に。ふだの出す順番・重なりは ふだ廃止で不要 |
| 4 | 重大 | §5.1 セーブの二重持ち。stats `country:<kind>` も serialize される。向きを決める（例: 並びが正、deserialize の最後に stats の country:* を並びから作りなおす）。キー名（例 `achievements.found: string[]`）を書く。片方だけ残った古いセーブの挙動を AC13・AC14 に。 | 2 版 §5.1: 並びが正（キー foundCountries: string[]）。deserialize の最後に country:* を並びから作りなおす。古いセーブ 3 形の表と AC14・AC15 |
| 5 | 中 | `visit.peak` が頂上をどう知るか（ctx に何を足すか、頂上を返す関数名）。`visit.sea` は regions 経路のままなので「regions で 0 こ」は古い 7 つ＋visit.all だけと書く。古い id は `visit.<x>.1`・`visit.all.9`。取れない印（例 `legacy: true`）と visit:all を数えない変更。 | 2 版 §5.2: peakNear(seed,x,z) と StepContext.peak。regions の道は visit.sea だけ残ると明記。古い id を visit.<x>.1・visit.all.9 に、legacy: true、visit:all をふやさない。AC16 |
| 6 | 軽微 | AC10 を境目・地下・往復に分ける。「地面の高さ」の関数名。 | 2 版: AC11 境目・AC12 地下・AC13 往復 に分けた。地面の高さは heightAt(seed,x,z)（§4.1） |
| 7 | 軽微 | AC18 の UI 検査で ふだ・ぜんぶみつけた・むかしの実績ありの画面の出し方。AC11 の「音 0」は音のモックの約束。 | 2 版 AC20: UI 検査の画面の出し方（setFound・restoreLegacy・flush）。ふだの画面・音のモックの部分は ふだ廃止で不要（音は今の audio.sfx() で数える） |
| 8 | 軽微 | §3.3 境目: countryAt().kind はもともと最近点。「境目の特別な処理は無い」と書く。 | 2 版 §3.3: 「境目の特別な処理はない」と明記 |
| 9 | 軽微 | §4.4 の時計の位置・二つ名のおしらせ 14% の出典（ファイルか CSS 変数）。 | ふだ廃止で不要（§4.4 は今の じっせき ページ・おめでとう画面に入るかだけ） |
| 10 | 軽微 | 6 歳向け・ルビは問題なし。AC2 は画面の名前の ruby だけ見ればよい。 | 2 版 AC2: 表の name の ruby だけを見る |
