dev / test-review | 【重大】 | src/world/gen/countryFeatures.test.ts:183-188 blockAt が 1 回ごとに generateChunk（約 100ms）を作りなおす。約 2000 回で 5 秒の既定の時間切れ（#255）。チャンクごとに Map で覚える
dev / test-review | 【軽微】 | src/world/gen/countryFeatures.test.ts:116-127 たけのこ「7 割の升目に 1 こ以上」と :124 のチェビシェフ 8 は仕様に数が無い仮定。票か仕様に書く
