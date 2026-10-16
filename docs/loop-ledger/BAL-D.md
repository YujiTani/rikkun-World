# BAL-D 指摘台帳

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | test-review | code-reviewer | 【軽微】e2e/bal-d.spec.ts「おの が ホットバーに ないとき・つち のとき」: つち のケースは `seenIn(25)`。ヒントは 31 ステップ目からなので 25 では実装がどうでも失敗せず、何も確かめていない。`seenIn(40)` 以上にして、31 ステップ目以降も出ないことを見る（つち はすでで 30 で MAX なので 31 以降は ほり直しになる点に注意） | 数え方の短さ | G1 | 未対応 |
| 1 | test-review | code-reviewer | 【軽微】e2e/bal-d.spec.ts ヒント: §4.6 の条件 3「別のブロックなら もう 1 回光る」、条件 1 の「刀・ほかの物 を持っていても出る」、「同じ強さなら 左」が確かめられていない（強さ違いの 3 本だけ）。あとで足せばよい | 書き足し | G2 | 未対応 |
| 1 | test-review | code-reviewer | 【軽微】src/ui/itemArtM72.test.ts: おの 3 つが「てつの つるはし のすぐ後ろ」（4〜6 こ目）は 26〜28 こ目の ずれ からの間接確認だけ。`CRAFT_RECIPES.slice(2,6)` の id が iron_pickaxe→wood_axe→stone_axe→iron_axe の順、の直接の確認と、材料（AC17）は 開発が書くとのことなので忘れずに | 書き足し | G3 | 未対応 |
| 2 | code-review | code-reviewer | 【軽微】src/dig/DigSystem.ts updateToolHint: あわない道具で ほっている間 毎ステップ `items` 配列（9 こ）と `fits` のクロージャを new している。ヒントを出すのは 31 ステップ目の 1 回だけなので、`count === HINT_AFTER_TICKS` のときだけ スロットを数えるか、使いまわしの配列にする | 性能（毎ステップの new） | G4 | 未対応 |
| 2 | code-review | code-reviewer | 【軽微】src/achievements/defs.ts: BALANCE.md §5「おの を はじめて作った = 今の『はじめて つくった道具』と同じ」は、つるはし と同じ「はじめて ○○ を つくった！」を おの にも付ける とも読める（今は 25 → 28 の「ぜんぶ つくった」だけ）。開発の判断は 実績の追加を避ける安全側で、演出・音の列の「同じ」とも読めるので 重大にしない。PO / デザインで どちらか決めて 仕様に一言書く | 仕様のあいまいさ | G5 | 未対応 |
| 2 | code-review | code-reviewer | 【軽微】docs/test-reports/assets/BAL-D-hotbar-glow-full.png: 光った瞬間（opacity 0.55 の山）が 写っておらず、マス 3 が光っているか 絵では分からない。AC18 の確認はスクショでなく toolHint() の E2E 頼み。山（0.5 秒付近）で撮りなおすと 見る係が助かる | 書き足し | G6 | 未対応 |
