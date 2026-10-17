# FIX-yokai-block-dig 指摘台帳

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | dev | code-reviewer | 【軽微】 src/dig/DigSystem.ts:1007-1015 previewLeftClick（照準の下の案内）は aimedYokaiId()==null のあと tgt があれば 'dig'/'harvest' を返す。妖怪がじゃまで空ぶりのときも「ほる」と出て、クリックと合わない（タスク票の「案内も合う」が成り立っていない）。freshDecision の use が whiff（tgt あり）なら null を返す | つなぎ目の結びつき | G1 | 未対応 |
| 1 | dev | code-reviewer | 【軽微】 src/yokai/ai/YokaiManager.ts:361 raycast は dying/leaving の妖怪も当てる。たおした直後のきえていく体がブロックの手前にあると、数歩ほれず空ぶりになる（攻撃の対象にはならないのに）。DigSystem 側で state を見るか raycast に除外を足す | 境界（時間） | G2 | 未対応 |
| 1 | dev | code-reviewer | 【軽微】 src/dig/DigSystem.ts:954 buildDecision は tgt があるたび（毎ステップ＋preview・aimed の呼び出しごと）に raycast を 1 回足す。数が少ないので許容だが、yokai が 0 体のとき早く抜ける近道があるとよい | 性能 | G3 | 未対応 |
