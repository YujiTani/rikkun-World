# VOX-0 指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | perf | perf-analyst | 【軽微】近くを小ブロックの形にするとブロック 1 つの変更で micro を作り直すのに約 50ms（目標は 16ms 以下）。`ProtoScene.rebuildChunk`。ゲーム本体は今 135.8ms なので悪化ではない。本番の計画で「小さく分ける／Worker／先に箱＋模様で出す」を入れること | 1 チャンク（16×16×48）の約 8 万三角形を毎回作り直している | G1 | 未対応 |
| 1 | perf | perf-analyst | 【軽微】全部を小ブロックの形で描く方式（naive/greedyColor/greedyShape）は、スタートで 340〜470 万三角形・200〜340MB・作るのに 2.2〜2.6 秒。本番に使わない（hybrid にする）。greedy・3D テクスチャでは 30% しか減らず、主因はでこぼこの形そのもの | 段差が細かく greedy でまとまらない | G2 | 未対応（方針として hybrid） |
| 1 | perf | perf-analyst | 【軽微】`ProtoScene.update` が、近さが変わったチャンクの古いメッシュを捨てず隠すだけ。歩きまわるとメモリが増え続ける。本番では捨てるか上限を決める | micro/box/far を別々に持って dispose していない | G3 | 未対応 |
| 1 | perf | perf-analyst | 【軽微】hybrid の近さの判定が水平だけ（`chunkNearDistance`）。上空では真下が micro になり実際より重く出る。本番は 3D の距離に | カメラの高さを見ていない | G4 | 未対応 |
| 1 | perf | perf-analyst | 【軽微】`measure()` の `renderCpuMs` は SwiftShader では描き終わりを待たず（1 千万三角形でも 2ms）方式の比べに使えない。`syncRenderMs`（readPixels で待つ）を `e2e-perf/voxelProto.perf.ts` に足した。`buildAllMs` などは 1 回測定で JIT のぶれ（±30%）あり | GPU が別プロセス | G5 | 対応済み（シナリオ） |
| 1 | perf | perf-analyst | 【軽微】計測シナリオが、スクショを `docs/` に書くたびに vite の画面更新で `window.__voxelProto` が消えて途中で落ちることがあった。スクショを最後にまとめて書くようにした。`docs/screenshots/VOX-0/` の hybrid のファイル名が `hybrid16-*.png` に変わった（古い `hybrid-*.png` は残っている。PO が整理） | 開発サーバーのファイル監視 | G6 | 対応済み（シナリオ） |
| 1 | perf | perf-analyst | 【軽微】fps は Mac 未確認。クラウドの数だけでは hybrid r=16/24 が 60fps かは言い切れない（スタートで 70〜140 万三角形。M4 の目安では余裕のはず）。レポート末尾の手順でオーナー確認が要る | GPU なし | G7 | 未対応（オーナー確認待ち） |
