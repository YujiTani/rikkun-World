| 1 | test-review | code-reviewer | 【軽微】AC12b の「最大 8 で 5 回→残り 3・黄、6 回→残り 2・赤」は式で計算しているだけで、BAL-A 後に最大が 8 であることを確かめていない（最大 4 のままでも通る）。BAL-A マージ後に `expect(r.max).toBe(8)` と hp=3 黄・hp=2 赤の個別 expect を足す | 書き足し | AC12b | 未対応 |
| 1 | test-review | code-reviewer | 【軽微】「まる は出ない」は hpBar が null/visible だけ。旧まる（HUD の DOM）が無いことは見ていない。DOM 検査を 1 つ足すとよい | 書き足し | AC12b | 未対応 |
| 1 | test-review | code-reviewer | 【軽微】黄の確認は max>=5 のとき、赤は常に必須。最大 4 の今は黄を確かめない（仕様どおり）。BAL-A 後は max>=5 が必ず真なので問題なし。参考 | 参考 | AC12b | 対応不要 |
