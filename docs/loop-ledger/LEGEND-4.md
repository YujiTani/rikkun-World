# LEGEND-4 指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | design | design-reviewer | 【軽微】ハンマーの 振りの 元（Meshy Heavy Hammer Swing・時間は 上段の 1.5 倍）が §8.4 に 書いて なかった | BRIEF の 取りこぼし | G1 | 対応済み（レビュー係が §8.4 に 追記） |
| 1 | design | design-reviewer | 【軽微】PR5 が §6.3-1（PR3）の「空中」の 定義に 頼る。PR 単独で 通る ように 注記 | PR 独立性 | G2 | 対応済み（§8.3(3)-1 に 注記） |
| 1 | design | design-reviewer | 【軽微】`legend.kinds` の 段は PR ごとに 4→8 と 1 つずつ（契約テストの 1・2・3 固定を PR1 で 直す）。§9 に 具体の テスト名（`contracts.w7.test.ts`・`achievements/ninja.test.ts`）を 足すと 親切 | 書き足し | G3 | 未対応 |

### dev 1 周目（code-reviewer・統合 PR #467 c9b0c96。check:fast 緑 808 ファイル／ratchet 緑・上限ふえず／eslint の max-lines・no-restricted-imports 0）

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | dev | code-reviewer | 【軽微】毎フレーム new: `src/tools/hammer/HammerSystem.ts:111-116` の `reset()` が `hitSet = new Set()`。ハンマーを 持って いない 間 `update` が 毎ステップ `reset()` を 呼ぶので 1P・2P とも 毎ステップ Set を 作る → `hitSet.clear()` に。同じく `drainEvents()`（:289-292）の `events = []` も 毎ステップ（step.ts:346・p2Hammer）→ 2 本の 入れ物を 入れかえるか 長さ 0 に | 並列実装の 型（刀の 作りを まねた） | — | 対応済み（reset は hitSet.clear()・drainEvents は 2 本を 入れかえ） |
| 1 | dev | code-reviewer | 【軽微】毎フレーム new: `src/fx/kokuryuInkModel.ts:72` の `new Set<number>()` が 矢が なくても 毎ステップ（コメントは「飛んで いる ときだけ」）。`src/fx/tenshiFx.ts:161` の `: []`、`src/char/gnomeSprite.ts:15`（斧を 持つ 間 毎ステップ 物と `{...LENGTHS}`）も → 使いまわしの 入れ物に | 同上 | — | 対応済み（kokuryu の seen を 使いまわし・tenshi は 空の 定数・gnomeSprite は 入れ物 1 つ） |
| 1 | dev | code-reviewer | 【軽微】`src/fx/yatagarasuFxModel.ts:94` の `boltPool` が モジュールに 1 つで 1P・2P の YatagarasuFx が 同じ Bolt を 書きあう。今は step 直後に 描くので 見た目は 正しいが、`count()`・窓口で 1P の bolts() を あとから 読むと 2P の 値 → pool を createYatagarasuFxModel の 中へ | 1 人用の つもりで 書いた | — | 対応済み（boltPool を createYataModel の 中へ） |
| 1 | dev | code-reviewer | 【軽微】手に 持つ 絵の スキンの 色見本（23 番〜）は atlas を はじめて 読んだ とき 1 回だけ 書く（`src/char/sprite.ts:276-277`）。ハンマー → ノームの斧 → ハンマー（や 虹）と 持ちかえると、2 回目からは 前の スキンの 色で 描かれる。仕組みは WEAPON-9 から だが、スキンが 5 つに なり ふつうに 起きる → setSkin で えらんだ スキンの extras を 書きなおす | 前から ある 穴が 表に 出た | — | 対応済み（絵を 入れかえる たびに その スキンの extras を 書く） |
| 1 | dev | code-reviewer | 【軽微】ハンマーの `active`（`src/game/step.ts:131`・`src/game/wire/duoPlay.ts:352`）が だっこ中（LIVE-1 §2.8 左クリックは 何も しない）を 見ない。だっこ中に 振れて しまう → `animals.carrying() === null` を 足す（2P も） | ほる係の 口を 通らない 新しい 係 | — | 対応済み（1P・2P とも animals.carrying が null の ときだけ active） |
| 1 | dev | code-reviewer | 【軽微】`DigSystem.breakExternal`（`src/dig/DigSystem.ts:485`）→ `BlockBreaker.breakBlock` は 先に `c.bodyTgt()`（今の ねらい）を 見る（`src/dig/digBreak.ts:62`）。体（がしゃどくろ 等）を ねらった まま ハンマーを 振ると 6 マスが こわれず 'bodyDone' → ねらいに よらない 道（bodyTgt を 見ない 引数）に | ほった ねらい 前提の 関数を 流用 | — | 対応済み（breakBlock に ignoreAim。breakExternal が 使う。bodyBlocks.test に 追加） |
| 1 | dev | code-reviewer | 【軽微】仕様 §8.3(3)-5 は ⌊h⌋ だが `src/tools/hammer/hammerModel.ts:42,48` は ⌊h + diveHeightSlack(0.05)⌋。h 3.96 で 28（仕様 26）・奥行き 2。E2E の 1 ステップ ずれを ひろう ため と 思うが 仕様と ちがう → designer に 一言 書いて もらうか、y0 を 押した ステップ前の 高さに する | テストに 合わせた ゆとり | — | 未対応（診断: ゆとり 0.05 を 外すと E2E D9 の「6 マスから 32」が 落ちる。E2E は 地面 +6 を set して 1 ステップ 落ちてから 押すので、押した 時の 高さも その 前の 高さも 5.99… で ⌊h⌋ = 5 → 30。E2E か 仕様の 判断が いる） |
| 1 | dev | code-reviewer | 【軽微】id の 文字が 3 か所: `LEGEND4_ID` は daichi_hammer だけ（`src/content/items/ids.ts:64`）で、`src/dig/gnomeChop.ts:5`・`src/player/tenshiMove.ts:11`・`src/ui/buffIconsModel.ts:12`（tenshi_yumi）が それぞれ 直書き → `LEGEND4_ID` に 5 つ そろえて 読む | 4 人 並列で 別々に 決めた | — | 対応済み（LEGEND4_ID を 5 つに して 3 か所が 読む） |
| 1 | dev | code-reviewer | 【軽微】表に あるのに 使われない／別の 数を 使う: ノームの よこなぎの たいきゅうは `w2.toolWear.blade.hit`（combat.ts:129 経由）で `LEGEND4_TUNING.gnome.wearPerHit` を 読まない。kokuryu/tenshi/yatagarasu の `wearPerShot` も 未使用。ハンマーの 当たりは `shape.rMin` を 見ない（HammerSystem.ts:188）。`daichi.breakable` が `readonly string[]`（BlockId の 書きまちがいが 型で 落ちない → `satisfies readonly BlockId[]`） | 表と 実装の つなぎ忘れ | — | 一部対応（wearPerShot・wearPerHit を legend4Wear.ts で つないだ・breakable は BlockId の 型。shape.rMin は 未対応） |
| 1 | dev | code-reviewer | 【軽微】表の 外の 数: `HammerSystem.ts:17,19`（NO_FALL_AFTER_LAND 3・FOOT_HALF 0.29 = 体の はばの 写し）、`yatagarasu.ts:14,16`（BODY_CENTER 0.8・BURST_BACKOFF 0.05）。単位コメントは ある ので 好みの 範囲だが、FOOT_HALF は 体の はばの 1 か所から 読む | — | — | 対応済み（noFallAfterLand・footHalf・bodyCenter・burstBackoff を 表へ） |
| 1 | dev | code-reviewer | 【軽微】ノームの よこなぎの 当たりを `techHit`（tech 'kiriage'・step 1）で 出すので、小太刀の 追い打ち（Kodachi.ts:62）・impact の「わざ 中」が 刀と 同じに 動く。仕様に 書いて ない → 意図なら 仕様に 1 行、ちがうなら 専用の 出来事に | 刀の 出来事を 流用 | — | 未対応 |
