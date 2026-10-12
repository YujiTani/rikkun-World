| 1 | dev | code-reviewer | 【軽微】`YokaiManager.ts` stoneTick/crush は `world.setBlock` を 1 マスずつ呼ぶ。票は「メッシュ作り直しは 1 回にまとめる」。setBlock 内の markDirty が同じチャンクで重複しなければ問題ないが、まとめ API は未使用 | 1 マスずつ setBlock | P1 | 未対応 |
| 1 | dev | code-reviewer | 【軽微】ぬりかべ の顔に ほおの ピンク（PP）が残り、怖い顔と合わない（血ではないので 6 歳ルールには反しない）。好みなら消す | 前の顔の PP 行を残した | D1 | 未対応 |
| 1 | dev | code-reviewer | 【軽微】`stoneTick` の `e.y += 3.2` で ドロップ位置をずらして defeat を呼ぶ一時的な書き換え。動くが読みにくい | defeat が e.y を直接読む | L1 | 未対応 |
