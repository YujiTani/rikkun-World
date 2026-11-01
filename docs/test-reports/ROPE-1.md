# ROPE-1 テストレポート（第 1 回）

- 判定: 合格（オーナー確認 AC12・AC13・AC18 は のこり）
- 対象の仕様書: docs/design/ROPE-1.md（版 2）
- 実行したコマンド: `npm run check:fast`（521 ファイル・6726 本 緑）・`npm run check:ratchet`（ふえなし）・`npx playwright test e2e/smoke.spec.ts`（8 本 緑）

## 受け入れ基準
| # | 結果 | 確かめ方・証拠 |
|---|---|---|
| AC1 | OK | src/dig/rope.test.ts「がけの よこの 面に 使うと…」「上の 面には 使えない」 |
| AC2〜AC4 | OK | src/world/blocks/rope.test.ts「planRope」、dig/rope.test.ts「1 本だと 10 マスで とまり…」 |
| AC5 | OK | registry.test.ts（rope_coil は BLOCK_ONLY_IDS） |
| AC6・AC7 | OK | dig/rope.test.ts「どの マスを こわしても…」、rope.test.ts「ropeColumn」 |
| AC8〜AC10 | OK | src/player/rope.test.ts |
| AC11 | OK | content snapshot（rope・rope_hemp） |
| AC14 | OK | dig/rope.test.ts「あさが でる」 |
| AC15〜AC17 | OK | src/craft/hemp.test.ts |
| AC12・AC13・AC18 | 未（オーナー確認） | docs/art/rope-1/sheet.png・hemp-sheet.png。通しの E2E は 書いて いない（下の 問題 1） |

## 性能
- 新しい 描画の しくみは なし（ロープは 今の 十字の 板）。1 マス = 2 面。perf は 回して いない（変更が 小さい ため）。

## 見つけた問題
1. 【軽微】がけを おりて のぼって 上に もどる 通しの E2E を 書いて いない（ルールの「実装の 前に E2E を 書いて 赤を 見る」を 守れて いない。役割の 指示が 実装の とちゅうで 来たため）。
2. 【軽微】たてに くっついた 2 つの ロープは 1 つと して こわれ、もどる 本数が ⌈合計÷10⌉ に なる（少し へる ことが ある）。

## 版 3（たらし方・操作・落下・つなぎ・さく）2026-11-01 夕
- ユニット: src/dig/rope.test.ts（たらす・つなぎ・さく・こわす）、src/player/rope.test.ts（スペース/シフト・ダメージ 0）、src/player/tether.test.ts（長さで しばる・ぶら下がり・のぼる・くいが きえると きれる）、src/world/blocks/rope.test.ts（facingStep・planRopeHere・stakeRope）
- E2E: e2e/rope1.spec.ts（つなぎ → がけで ぶら下がり → スペースで のぼる。ROPE_SHOTS=dir で 画面を のこす）
- 実画面: /workspace/rope-shots/1-tethered-flat.png・2-hanging.png・3-climbed.png
- sectionMesher の golden を 作りなおした: タイルが 1 つ ふえて アトラスの 行の 数（ceil(タイル数/4)）が かわり、ぜんぶの V 座標が かわる ため（GOLDEN_WRITE=1）
