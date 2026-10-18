# WEAPON-7 指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | design | design-reviewer | 【軽微】AC19 の「画面のゆれが 1 回」は E2E で見る窓口がない（ゆれは CameraRig.setShake のみ） | 窓口表に ゆれが ない | G1 | 対応済み（AC37 ユニットに移した） |
| 1 | design | design-reviewer | 【軽微】ため中の「ジャンプできない」は水の中で泳ぎあがれない。水中で ためたとき上がれるか書いてない | 例外表の書き足し | G2 | 対応済み（1.2: §2.2・AC12 水の中は 上へ およげる） |
| 1 | design | design-reviewer | 【軽微】ため中の右クリック（食べる・うえる など）・ジャンプ以外の入力の扱いが書いてない | 例外表の書き足し | G2 | 対応済み（1.2: §2.2 右クリック・Q・1〜9、AC12） |
| 1 | design | design-reviewer | 【軽微】AC8（絵のコマ）・AC12（0.5 倍）に許容幅・見る窓口の名前がない（WEAPON-6 AC6 と同じ書き方なので `bladePoseAt` を読むと書くとよい） | 窓口表に コマの 口がない | G3 | 対応済み（1.2: AC8 は `src/char/motion.ts`〈`bladePoseAt` は人形の腕の角度で コマでは ないため〉・ちょうど、AC12 は `motion()` ±0.001・速さ ±1%） |
| 1 | design | design-reviewer | 【軽微】MOTION の決めポーズの絵がない（今のふりかぶりコマ使い回しのため。試作で撮る 3 枚で補うと仕様に書いてあり容認） | 試作で補う | G3 | 未対応 |
| 2 | design | design-reviewer | 【軽微】シャイニングの同じ妖怪への当たりが「多くて 3 回」だが 240÷60 で 4 回になりうる（§5.3・AC30） | 数の見落とし | G4 | 対応済み（2.1） |
| 2 | design | design-reviewer | 【軽微】ため中の Shift、近い地面をねらうと ふりわけで「ほる」になること、雷・波・ドームで倒した扱いが未記載 | 例外の書き足し | G2 | 対応済み（2.1: §2.2） |
| 2 | design | design-reviewer | 【軽微】ヌシの表の抽選・虹の強さが今のドロップの乱数列をずらす可能性 | 乱数の分離が未記載 | G5 | 対応済み（2.1: §2.3 べつの乱数） |
| 2 | design | design-reviewer | 【軽微】タスク票 `docs/tickets/WEAPON-7.md` が金の かたな・rarityAtLeast のまま古い（PO が直す） | 票が未更新 | G6 | 未対応 |
| 2 | design | design-reviewer | 【軽微】§6 表の風神剣の回数は「波こみ」だが列の見出しは刀だけに読める。AC に雷/風/虹の「ふつうの わざ」ダメージ（P×倍率）の確認が雷の AC17 しかない | 書き方 | G7 | 未対応 |
| 1 | dev | code-reviewer(テスト準備) | 【軽微】AC5〜AC11 など【ユニット】層の基準が E2E 側に寄っている。開発が実装と同時に src/ のユニット(窓口名は開発が決める)を足すこと。contracts.w7 に雷神剣の bladeTrail 行(thunder)の確認もあるとよい | 窓口名が実装前に未定 | G8 | 未対応 |
| 3 | dev | code-reviewer(impl PR1) | 【軽微】`ThunderFx.dispose`（src/fx/thunderFx.ts:233）が 地面の 板・手の 板の ジオメトリ（`flat`・`PlaneGeometry`）と 3 つの 材質（glow/ring/aim/hand）、`boltMat` 以外を 捨てない。作りっぱなし（1 回しか 作らないので 実害は 小さい） | 後片付け漏れ | R1 | 対応済み |
| 3 | dev | code-reviewer(impl PR1) | 【軽微】強さ 8 が `legendary[].power`（src/contracts.ts:1868）と `weaponDamage.raijin_ken`（src/tools/config.ts:32・src/fx/craftConfig.ts:66）の 2 か所。刀の 強さは `legendPowerOf` が 先に 読むので 後者は 死んだ データ。PR2 以降で 食いちがいやすい | 二重の 持ち方 | R2 | 対応済み |
| 3 | dev | code-reviewer(impl PR1) | 【軽微】`legend.state()`/`view()`（src/main.ts の 雷の ブロック）が 毎ステップ オブジェクトを 作る。小さいが 持ち物が 雷神剣でない ときは 呼ばない 早期 return が あると よい | 毎コマの new | R3 | 対応済み |
| 3 | dev | code-reviewer(impl PR1) | 【軽微】`npm run check:fast` で 5 件 失敗（WorldRenderer・WorldRendererStream の 5 秒 タイムアウト）。他の係と 同時実行の 負荷で、このコミットの コードとは 関係なし | 負荷での タイムアウト | R4 | 確認待ち |
| 4 | dev | code-reviewer(test PR2) | 【重大】e2e/weapon7-fujin.spec.ts AC24 の fillAhead: ブロックを 前 1.5 に 置くと ＋マークが ブロックに 向いて 左クリックが「ほる」に なり、わざも 波も 出ない（weapon4.spec.ts:185 と 同じ 落とし穴）。pitch 40 で 空へ 向ける 直しを 入れた | ほると わざの 取りちがえ | R5 | 対応済み |
| 4 | dev | code-reviewer(test PR2) | 【軽微】AC22（歩き・はしり）は 仕様では ユニット だが E2E だけ。実装後に 速さの 計算を ユニットでも 見ると よい。AC24 の 刀 4.5（つき P6×0.75）は 設定の 決め打ち。windWave の 高さ 3 つ 切りかえ（§4.3）は 未確認 | AC の 層・取りこぼし | R6 | 確認待ち |
