# GFX-1 指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | dev | code-reviewer | 【軽微】src/game/wire/shadow.ts: 戻り値の `system` は 起動の ときの 値の まま（あとから 作った 影の しくみが 入らない）。使う 所は 無いが まぎらわしい | 遅れて 作る ように した とき 戻り値を 見なおさなかった | | レビュー係が 直した（返さない。onBuilt で 受ける） |
| 1 | dev | code-reviewer | 【軽微】src/world/render/shadow/shadowPref.ts の decideShadowStart が 本番で 使われなく なり、かげの 決め方が weightPref.ts と 2 か所に（順も ちがう） | 決め方を weightPref に 移した とき 古い 方を 残した | | 未 |
| 1 | dev | code-reviewer | 【軽微】src/gasha/gashaGirl.ts:626 粒の 大きさ uPx が min(devicePixelRatio, 2) 決め打ち。がめんの こまかさ 1・1.5 では 粒が 大きく なる → renderer.getPixelRatio() を 使う | pixelRatio の 上限が 1 か所で ない | | 未 |
| 1 | dev | code-reviewer | 【軽微】src/start/startBoot.ts:93 メニュー前の 窓口の 既定 weight が 'fine' の まま（新しい 既定は light） | 既定の 書きかえ もれ | | 未 |
| 1 | dev | code-reviewer | 【軽微】2 人 あそびの 分割中（duoView.setLight）に かげ・おもさを 変えると、分割を やめた とき 前の 値に もどされる／がめんタブの かげ表示（wantOn）が 実際（分割で オフ）と ずれる | 分割の 軽くする 工夫と せっていが 別々に 同じ 物を さわる | | 未（あとで 別 issue で よい） |
