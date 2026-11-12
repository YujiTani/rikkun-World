dev / test-review | 【重大】 | src/world/gen/countryFeatures.test.ts:183-188 blockAt が 1 回ごとに generateChunk（約 100ms）を作りなおす。約 2000 回で 5 秒の既定の時間切れ（#255）。チャンクごとに Map で覚える | 済み（時間切れは 4a65e90 で解消）
dev / test-review | 【軽微】 | src/world/gen/countryFeatures.test.ts:116-127 たけのこ「7 割の升目に 1 こ以上」と :124 のチェビシェフ 8 は仕様に数が無い仮定。票か仕様に書く | 済み（PO 指示の軽微修正コミット）
dev / code-review | 【軽微】 | 妖怪のたおれこみ(crushable.ts canCrushBlock)がひまわりの片方だけ消し、1段残る。片方を消すとき相手の段も消す（または canCrushBlock で相手も消す） | 済み（PO 指示の軽微修正コミット）
dev / code-review | 【軽微】 | たけのこの「たけ 12 本以上」→下限 2 は仕様とずれた。仕様 §2.3 を実測に合わせて直す（designer）か、数える窓を広げる。仕様書か数の表をそろえる | 済み（PO 指示の軽微修正コミット）
dev / code-review | 【軽微】 | countryFeatureBlocks.ts で interface ChunkFeatures が 2 回宣言（19行と 28行あたり）。1 つにまとめる | 済み（PO 指示の軽微修正コミット）
dev / code-review | 【軽微】 | flatten.ts の FLORA に COUNTRY_PLANT_IDS が無く、きのこ等の上は「たいらにする」でじゃまになりうる。FLORA に足すか意図をコメント | 済み（PO 指示の軽微修正コミット）
