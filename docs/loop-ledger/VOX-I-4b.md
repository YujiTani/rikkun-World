dev / test-review | 【軽微】 | src/world/gen/countryFeatures4b.test.ts:~236 かいだんの「長さ 10 歩以上」を p.length>=10 で見ているが p は 1 歩 2 マス → 5 歩。票どおり 10 歩なら >=20、数を変えるなら票を直す（仕様に長さの数は無い仮定）
dev / test-review | 【軽微】 | src/world/gen/countryFeatures4b.test.ts:~303 おちば「山の外に 0 こ」を ±96 で見ているが、もみじやま（top 64 ÷ k 0.6、maxReach 200）は ±96 が ほぼ中なので外が 見えない。国の境目をまたぐ 範囲（例: 山の点から 160〜240 の チャンク）も数える
dev / test-review | 【軽微】 | src/world/gen/countryFeatures4b.test.ts:~330 おちばの木は plantsInRect の生のもの。おおもみじ（まわり 6 以内の木を どける）や 4a の どけで 消えた木を 拾うと正しい実装でも落ちる → 木の みき（log）が 実際にある木だけ 検査する
dev / test-review | 【軽微】 | src/world/gen/countryFeatures4b.test.ts:~292 ゆきだるまの「目の いし」は ±2・高さ 3 の中に stone が 1 つあれば通る。ゆきやまの 地形の いしで 偶然通りうる → ゆきの列の となり・かつ 地面より上（dy>=1）に 限る
dev / test-review | 【軽微】 | すいしょうの「いし の上・空が見える」、おおもみじの「まわり 6 以内の木を どける」は 検査なし（足してもよい。なくても可）
dev / code-review | 【重大】 | src/world/blocks/crushable.ts:12 canCrushBlock が touro を除いていない → ぬりかべのたおれこみ・がしゃどくろのたたきつけ（stone.ts / gashaBigCrush.ts）で、こわせないはずのとうろうが消える | canCrushBlock に touro（breakable:false 全般でもよい）を足し、crushable のテストを 1 本足す
dev / code-review | 【軽微】 | src/world/gen/mineOres.test.ts A4（約 126 行）比べた列の数が n>0 だけ。skipsColumnCopy は国だけの物の近く(NEAR 14)の列をぜんぶ除くので、見本 324 列のうち印のブロックだけなら 66、いまは 127 列(39%)を除く（比べた 197 列）→ 見張りが弱くなる前に n が見本の半分以上を見る 1 行を足す（mine1dSave D9 には既にある） | expect(n).toBeGreaterThan(全体/2)
dev / code-review | 【軽微】 | src/world/gen/countryMountain.ts:~30 かいだんの始まり startGap=2 は頂上 s から。とうろうが y270 の上限で まわりへずれた時（standingSpot）は とうろうからは 2 マスにならない | ずれた時は とうろうの位置から数える（実際はほぼ起きない）
dev / code-review | 【軽微】 | src/world/gen/countryKaidan.ts:~35 walk のループが k<=maxSteps なので最大 101 歩（仕様 8〜100 歩） | k<maxSteps
