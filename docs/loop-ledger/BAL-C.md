| 1 | test-review | code-reviewer | 【軽微】AC12b の「最大 8 で 5 回→残り 3・黄、6 回→残り 2・赤」は式で計算しているだけで、BAL-A 後に最大が 8 であることを確かめていない（最大 4 のままでも通る）。BAL-A マージ後に `expect(r.max).toBe(8)` と hp=3 黄・hp=2 赤の個別 expect を足す | 書き足し | AC12b | 未対応 |
| 1 | test-review | code-reviewer | 【軽微】「まる は出ない」は hpBar が null/visible だけ。旧まる（HUD の DOM）が無いことは見ていない。DOM 検査を 1 つ足すとよい | 書き足し | AC12b | 未対応 |
| 1 | test-review | code-reviewer | 【軽微】黄の確認は max>=5 のとき、赤は常に必須。最大 4 の今は黄を確かめない（仕様どおり）。BAL-A 後は max>=5 が必ず真なので問題なし。参考 | 参考 | AC12b | 対応不要 |
| 1 | code-review | code-reviewer | 【軽微】src/yokai/ai/hpBar.ts: 二つ名のアイコン用の PlaneGeometry と MeshBasicMaterial が妖怪ごとに作られ、disposeEnt（YokaiManager.ts:362）で捨てていない。HpBar に dispose() を足して呼ぶ。二つ名が出る BAL-B 後に増える | 書き足し | AC12 | 未対応 |
| 1 | code-review | code-reviewer | 【軽微】長方形 1 本ごとに Mesh（最大 20 描画呼び出し/妖怪）。二つ名の妖怪が 16 ブロック内に何体も出ると増える。InstancedMesh か、色ごとに 1 本の帯にまとめると 1〜2 回で済む。性能ループで計測してから | 参考 | AC12 | 未対応 |
| 1 | code-review | code-reviewer | 【軽微】YokaiManager.ts refreshBar が出ている間は毎ステップ HpBarState を new する（二つ名 + 近くの妖怪）。小さいが、値が変わったときだけ計算するとよい | 参考 | AC12 | 未対応 |
| 1 | code-review | code-reviewer | 倒れかけ・帰りかけのバーをすぐ隠す判断は妥当（体力 0 や去る妖怪に出すと残像のように見える。仕様に反しない）。指摘なし | 参考 | §4.7 | 対応不要 |
