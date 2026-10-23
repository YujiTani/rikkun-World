# LIVE-2 テストレポート

## 版 3（テストの準備。実装の前。tester）

- 対象: `docs/design/LIVE-2.md` 版 3 §6（ブランチ `claude/project-thread-rcfe6n`。main 取りこみ済み）。実装のあとの合否は、実装が終わってから下の表に書き足す。
- 実行: `npx playwright test e2e/live2-*.spec.ts e2e/smoke.spec.ts`（`--workers` なし）→ **48 本中 41 本が赤・7 本が緑**。緑 7 は smoke。live2 の 41 本は全部 赤。
- 新しい spec（5 ファイル）: `live2-kit`（こたつ・かえる・種類）、`live2-chick`（ひよこ・パタパタ・大人）、`live2-coop`（とりごや・小屋の子・たまご・ねる・こわせない）、`live2-gold`（金の たまご・保存・文字・性能）、`live2-text`（合図 5 つの 文字）。ヘルパーは `e2e/helpers/animals.ts`（`kit / putEgg / coop / cinfo / face / kid / yawTo / inside / dayLen / night / bags / hintRight`）。
- 時間で待たず `window.__rikkun`（`step`・`time.set`・`settings.set`）で進める。乱数は `?nosave=1` のシード。重い spec は describe に `timeout: 150_000`。

## AC → E2E テスト（赤の理由）

| AC | テスト（spec） | 赤の理由 |
|---|---|---|
| AC1 | `live2-kit` AC1（`nukunuku` を つくる・`craft.nukunuku.1`・置く・こわす・カードの いちばん うしろ） | `nukunuku` が まだ 無い |
| AC2 | `live2-kit` AC2（入れる・kitWait・kitNeedEgg・`kin_tamago`→gold・7 つ目 kitMax・つち は となり） | 設定 `kitHatchTicks`・`animals.kits()` が まだ 無い |
| AC3 | `live2-kit` AC3（通し 600 → `hatchStart` → 60 後 `hatch`・30 マスでは かえらない）、AC3b（8 わで `friendFull`） | 設定 `kitHatchTicks` が 無い |
| AC4 | `live2-kit` AC4（`wobble` 0/1/2） | 設定 `kitHatchTicks` が 無い |
| AC5 | `live2-chick` AC5（当たり 0.35×0.3・ねらう箱 0.7×0.7×0.6）、AC5b（むし・egg は 出ない・ながおし 40・外で あさ 3 回） | `spawn` の `stage` が 効かず ひよこで ない（egg が 出る 等） |
| AC6 | `live2-chick` AC6（10 マス・2.5 以下・228 以上・`roll`） | 設定 `chickFlutterFallSpeed` が 無い |
| AC7 | `live2-coop` AC7（置く・5×5・ブロック 4 種・もんの むき）、AC7b（1 マス ずらし・でこぼこ `coopNoRoom`）、AC7c（4 つ目 `coopMax`） | `animals.placeCoop`・`coops()` が 無い |
| AC8 | `live2-coop` AC8（もん・さく ジャンプ 300 ステップ・やせい・小屋の子・なかま）、AC8b | `placeCoop` が 無い |
| AC9 | `live2-coop` AC9（90/179/180・外へ 出る・だっこで おろす）、AC9b（`coopFull`）、AC9c（なかま 8＋小屋 6） | 設定 `coopEnterTicks`・`placeCoop` が 無い |
| AC10 | `live2-coop` AC10（だっこで 外へ・`friendFull`） | `placeCoop` が 無い |
| AC11 | `live2-chick` AC11（通し）、AC11b（2 わ目 `grow`・30 マス・16 以内） | `placeCoop` が 無い／設定 `kitHatchDist` が 無い |
| AC12 | `live2-coop` AC12（59/60 ステップ・12 こ）、AC12b（あつめる・`coopCollect`・`coopNoEgg`・つち）、AC12c（pity 8 回目） | `placeCoop` が 無い |
| AC13 | `live2-coop` AC13（`sleep`・`zzz`・`sleepHint`・dawn） | `placeCoop` が 無い |
| AC14 | `live2-coop` AC14（こわす・のこらない・`toriya` 1） | `placeCoop` が 無い |
| AC16 | `live2-gold` AC16（通し・`kin_tamago` `epic`・光の柱・たべない）、AC16b（毎回 紙ふぶき） | 設定 `goldBaseWild`・`goldCap` が 無い |
| AC17 | `live2-kit` AC17（`machoChance` 1・80 ステップ・`kin_tamago`→macho・`machoMiss` 5 の まま）、AC17b（19 回＋20 回目・100 回・大人で かわらない） | 設定 `kitHatchTicks`・`machoChance` が 無い |
| AC19 | `live2-kit` AC19（こたつ＋トマト・egg・から＋egg）、`live2-coop` AC19(小屋)（すばこ＋つち・だっこ中） | `animals.kits()` が 無い／`placeCoop` が 無い |
| AC20 | `live2-kit` AC20（`egg`・`いれる`／`まってね`）、`live2-coop` AC20(小屋)（`あつめる`・`おく`・`disabled`） | `いれる` が 出ない（`egg` の たべる のまま）／`placeCoop` が 無い |
| AC21 | `live2-gold` AC21（保存→読み直す）、AC21b（v 1→v 2→v 3・`gold` の breed・小屋 4・kits 7）、AC21c（4,000 文字） | `animals.serialize/deserialize`・`placeCoop`・設定が 無い |
| AC22 | `live2-coop` AC22(窓口)（`list()` の `stage・breed・home・raised`、`coops()` の `kids`） | `coops()` が 無い |
| AC25 | `live2-gold` AC25（`kitNeedEgg`・`coopNoRoom`・`coopNoEgg`・`coopNotEmpty`）、`live2-text` AC25b（`kitWait`・`kitMax`・`coopMax`・`coopFull`・`sleepHint`）。合図 9 つ すべて。3 つの 大きさで はみ出し 0px・2 行まで・漢字 0・禁止語 0 | `placeCoop` が 無い／合図が 無い |
| AC27 | `live2-gold` AC27（29 わ＋あたため中 6 で 描画 +36 以下・三角形 +20,000 以下・**1 ステップ 中央値 0.4 ミリ秒 以下**） | `placeCoop` が 無い |
| AC29 | `live2-coop` AC29（押した ステップ `coopNotEmpty`・`animalHint`・`coopLocked` 1 回・ひび 0・600 ステップ）、AC29b（もん・ねぐら・すばこ・だっこ中・いえの しるし だけなら こわれる） | `placeCoop` が 無い |

## 基準ごとの まとめ（赤／緑／ほかの層）

- 赤（E2E）: AC1〜AC14・AC16・AC17・AC19〜AC22・AC25・AC27・AC29。
- ユニット（実装係が書く）: AC15・AC18・AC22（えらべる子の 判定）・AC23・AC24・AC26、AC17・AC21 の ユニットの分（下の表）。
- UI 検査（`npm run check:ui`）: AC23 の 絵・AC25・AC29 の チップの 大きさ（実装あとに 回す。E2E は 3 つの 大きさで 同じ ことを 見る）。
- オーナー確認: AC28。
- **この PR で 作らない もの**（指示）: お肉（LIVE-3）と 本の 中身。仕様 §3.1 の 案内画面 3 行・説明の 表 3 行は テストしない。`e2e/m72.spec.ts` の 本「そだてる 12 こ」は 12 の まま（LIVE-1 と 同じ決め）。

## こわれる 既存テストの 直し（消したものは 無い）

| テスト | したこと | 理由 |
|---|---|---|
| `e2e/bucket.spec.ts` AC2 | カード 34 → 36・いちばん うしろ 3 つが `mushi_ami`・`nukunuku`・`toriya` | §4.2 レシピは いちばん うしろ（`toriya` が 最後） |
| `e2e/m72.spec.ts` カード 33 | 34 → 36・`tail` の 位置を ずらす | 同上 |
| `src/ui/itemArtLive1.test.ts` | `mushi_ami` は うしろから 3 つ目 | 同上 |
| `src/achievements/achievements.test.ts` | 247・小 84・そだてる 52・小 15 → **258・小 87・61・小 16** | §4.5（main の 247・84 に ＋11・小 ＋3） |
| `src/achievements/live1.test.ts` | 同上（数・id かぶりなし） | 同上 |
| `src/ui/m72ui.test.ts`（今回） | ぜんぶ 247 → 258・小 84 → 87・そだてる `26+8+1+12+5` に `+9` | 同上 |
| `src/ui/m7ui.test.ts`（今回） | そだてる 52 → 61・小 15 → 16 | 同上 |

- 上の 実績の 数・レシピの ユニットは 実装が 入るまで 赤（6 本）。期待は 実装に あわせて 変えない。

## ユニットの AC（実装係が書く。どこで 見るか）

| AC | ファイル・関数 |
|---|---|
| AC15 | `src/animals/gold.test.ts`（仮。新規）: `goldChance(bird, settings)` — 野原 `bugs` 0/40/200 → 0.01/0.03/0.05、`raised` 80/200 → 0.08、`macho` でも 同じ、`goldMiss` 30 → 次は かならず、同じ シードで 同じ、`settings` に `goldBaseGold` が 無い |
| AC17（ユニットの分） | `src/animals/hatch.test.ts`（仮）: `rollBreed(item, settings, state, rng)` — `egg` は 5%・19 回 外れで 20 回目 かならず、`kin_tamago` は かならず `macho` で `machoMiss` を かえない、`'gold'` が 1 度も 出ない（1,000 回） |
| AC18 | `src/animals/size.test.ts`（仮）: `bodySize(stage, breed)` — マッチョ大人 高さ ＝ ふつう ×1.15（±0.03）、マッチョひよこ 当たり ×1.15、速さ・`follow`・たまごの くじ・金の 確率 が 同じ |
| AC21（ユニットの分） | `src/animals/animals.test.ts` と `src/save/SaveManager.test.ts`: v 1→v 2→v 3 の 道・`breed 'gold'`→`normal`・小屋 3 つ・`kits` 6 行・ブロックが 無い 行は すてる・4,000 文字・`SAVE_GEN` が 変わらない |
| AC22（ユニット） | `src/animals/animals.test.ts`: えらべる子（`home` あり・`adult`・`raised` true）— (a) ひよこから 育った大人 だけ、(b) 野原の なかまを 小屋に 入れた大人は 不可、(c) ひよこは 不可、(a) を 外に 出すと 不可。仮の 関数名 `meatEligible(bird)` |
| AC23 | `src/ui/itemArtLive2.test.ts`（仮。新規）: 3 アイテムの 名前（`こたつ`・`とりごや`・`きん の たまご`）・上限・置く・カテゴリー・めずらしさ・`kin_tamago` の 絵が `egg` と ちがう。`CRAFT_RECIPES` の うしろ 2 つ。UI 検査 |
| AC24 | `src/achievements/live1.test.ts`（直した）・`achievements.test.ts`（直した）、`src/achievements/live2.test.ts`（仮。新規）: 253 ではなく **258**・小 87・そだてる 61・小 16・並び（§4.5）・`craft.nukunuku` の 名前 |
| AC26 | `src/yokai/` の ユニット: マッチョ・金の 乱数を 使っても 妖怪の 出る数・場所が 同じ シードで 同じ |
| 設定 | `src/animals/animals.test.ts`: 初期値 17 こ（§4.1）・`goldBaseGold` が 無い |

## 仮の 窓口（仕様 §6.1 に 無い もの。実装係は これに あわせる）

| 名前 | 使い方 |
|---|---|
| `animals.serialize()` / `animals.deserialize(data)` | 保存 v 3 の 形（§4.4）を 取り出す・流しこむ（AC21。`h.save.now()` でなく 小さな 窓口で 形を 見る） |
| `animals.coops()` の `gate` | `{ x, z }`（もんの マス。まん中から もんへの 向きを `face()` で 出す） |
| 小屋の ブロック id | `toriya_fence`（さく）・`toriya_gate`（もん）・`toriya_nest`（ねぐら）・`toriya_box`（すばこ） |
| `animals.placeCoop(x, y, z, dir?)` の `y` | 5×5×4 の いちばん 下の 空気の 高さ（§6.1 の 文では あいまい） |
| `animals.list()` の `state` `'hatch'` ほか | `§6.1` の とおり。`hatchStart` の `x・y・z` は こたつの マス |
| 設定の 読みかた | `h.settings.get/set` に §4.1 の 17 こ が 入る（`goldBaseGold` は 無い） |
| `hud.actionHint()` の `disabled` | `toriya` の すけた形で 入らない所 の とき true（§6 AC20） |
| `rarity.of('kin_tamago')` と `combat.bags()` の `rarity` | `epic`（光の柱 の 見かたは RARITY-7 と 同じ） |

## 仕様で 分からなかった 所

1. **`placeCoop` の `y`**: 「地面の 高さ」か「5×5×4 の いちばん 下の 空気の 高さ」か。テストは 後者（置く 判定の 5×5 の 下が 固い）。
2. **AC9「`home` が 0.45〜0.55」**: 90 ステップ ＝ 0.5 の 前提（`coopEnterTicks` 180）。歩いて 入る 前の ステップは 数えない と 読んだ。
3. **AC27 の 計算 0.4 ミリ秒**: 「クラウド・中央値」だけで、何ステップを 平均するか 書いて ない。テストは 40 ステップ × 9 回の 中央値。重い CI で ぶれる ときは 数を 見直す（期待を ゆるめる前に 相談）。
4. **本の 中身**: AC25 の 「案内画面 3 行・説明 3 行」は 指示で 作らない。LIVE-2 の 実装 PR 後の 本の 更新で 足す とき に 別の spec にする。
5. **AC16「光の 柱が 出る」**: `rarity` の 見えかたの 窓口が RARITY-7 の `combat.bags()` の `rarity` しか 無い ので、柱の 見えは 窓口の `rarity` で 見ている。見た目は オーナー確認（AC28 (6)）。

## つなぎ込み後の合否（developer・つなぎ込み担当。ブランチ `claude/project-thread-rcfe6n`）

- 実行: `npx playwright test e2e/live2-*.spec.ts`（`--workers` なし）→ **42 本中 30 本 緑・12 本 赤**。ほか `live1-*`・`m7*`・`m72`・`bucket` は 87 本中 86 緑・1 赤（`live1-net` AC6）。`npm run test:e2e:fast`（smoke）13/13 緑。`npm run check:fast` 緑（3,356 本）。`npm run check:ui` 46/46 緑。
- 赤 13 本の理由は **すべて テスト側の まちがい（tester へ 差し戻し）** か 予算の 問題。期待は 変えて いない。実装側の 原因 だった 物（たまごの 二重 カウント・ねている 子 への むし・押しつづけ の チップ・`collect` の 音の 名前・こたつの おとす 数・toriya の おちかた・読み直し の 位置）は 直した。

| spec | AC | 赤の理由（テスト側） |
|---|---|---|
| live2-kit | AC1 | こわす とき `primary` を 600 ステップ 押しっぱなし。ほりの 段が MAX で とまり「押し直した 瞬間 に こわれる」（`DigSystem` の 決まり）ので こわれない。押し直しを 入れると 緑（実装は `nukunuku` を 固定 1 こに 直した） |
| live2-coop | AC7 | `craft.make` の あと `step` なしで `unlocked('craft.toriya.1')` を 読む（`live1-net` は `step(3)` を はさんで いる）。さらに toriya を 置く 所を 11.5 マス 先（届く 距離 5）にねらう → `target` が null。距離を つめると 緑 |
| live2-coop | AC7b・AC20(小屋)・live2-gold AC25 | でこぼこ・入らない 所の ねらいが 5 マス 以上 先で `target` null（`hint` が 出ない）。距離を つめると 緑 |
| live2-coop | AC9b・live2-text AC25b | おろす とき `pitch: 30`（上向き）にして いて「前 1.5 マス」が さくの マスに なり おろせない。下向き（−30）に すると 緑。AC25b は さらに `animals.clear()` の あと 4 つ目の 小屋を 置く（`clear()` は 小屋を 消さない。AC8 は 消えない 前提）→ `coopMax`。`coopMax` の ねらいも 遠すぎ |
| live2-coop | AC14・AC29c | AC1 と 同じ「押しっぱなし 600」 で こわれない。押し直しを 入れると 緑 |
| live2-coop | AC29b | 中から もんを ねらう とき 立つ 場所（もんの 手前 1 マス・肩の 点 S が もんの マスの 中）が わるく、もんの 上の 段を ねらって しまう。まん中に 立つと 緑 |
| live2-gold | AC21b | 読みこんだ あと `step(2)` して から `follow` を 読むので 18,000→17,998・500→498（v 2 の 行も 同じ）。`step` を はさまなければ 緑 |
| live2-gold | AC25 | 上と 同じ 遠すぎる ねらい。さらに「2 行まで」の 数えかたが `#animal-hint` の `line-height: normal` を `fontSize × 1.3` と みなす ので 2 行の チップ（高さ 75px）が 4 行に なる（本当は 文字の 高さ 67px ÷ 33.6px ＝ 2 行） |
| live2-gold | AC27 | **予算の 問題**。+44 描画（鳥 29＋影 1＋こたつの たまご 6＝36 に、小屋の ブロック +4・手に 持つ たまご・こたつの ブロック +1〜3 が のる）。小屋を ブロックで 描く（PO 決定）ので 小屋の 分は ふえる。1 ステップ 中央値は 0.42〜0.50ms（動物 なしでも 0.47ms。並列の とき 1.5ms）→ 0.4 は この 環境では ゆれる。三角形 +15,558 は 合格 |
| live1-net | AC6 | LIVE-2 で カードの いちばん うしろが `toriya` に なった（`bucket`・`m72` は 直して あるが `live1-net` が 直って いない）。期待は `mushi_ami` のまま |

## 実装側で 直した もの（つなぎ込みで 見つかった）
- すばこの たまごが 二重に 入る: A の `collectCoop` が `addItem` で 入れ、C の `doCoopCollect` も `inventory.add`。→ C は 知らせ だけ・A は 足もとに おとさない `tryAddItem`（新しい 任意の 口）で 入れる。
- ねている 子に むし: `preview` が `animalPet` を 返して `feed` が 呼ばれず `sleepHint` が 出ない。→ むしを 持って いる とき は `feed` へ（`sleepHint`・むしは へらない）。
- 小屋を こわせない 合図: 押しつづけの あいだ チップが 120 ステップで 消える。→ 100 ステップごとに 合図だけ 出し直す（`coopLocked` 出来事は 1 回のまま）。
- `collect` の 音の 名前: 5 こ 以上で `collectMany` に なり 仕様の `collect` が 出ない。→ いつも `collect`、多い ときは つづき（`collectMany`）を かさねる。
- こたつを こわす と `nukunuku` が 1〜2 こ → `fixedDrop` に 1 こ。toriya は すばこの たまごと いっしょに 足もとに おちる（AC14）。
- 保存の 読み直し: 小屋の 子が ふちの 近く（0.05）だと 中心に もどされた → 中 3×3 の 中なら そのまま。
- つなぎ目: `hatch` 出来事の `first`（`AnimalDeps.hatchedBefore`・実績 `hatch:*`）。さくの 当たり 高さ 2 は `VoxelWorld.isSolidForPlayer`（プレイヤー の 体だけ。動物は 自分の 小屋の きまりで 出入りを 決める）。もんは 固くない ブロックの まま（プレイヤーと ついてくる なかまが 通れる）。

## テストの直し後の合否（tester。f012825 の上。期待の意味は変えていない）

- 実行: `npx playwright test e2e/live2-*.spec.ts e2e/live1-net.spec.ts`（`--workers` なし）→ **52 本 すべて 緑**（8.7 分・時間切れ 0）。AC27 は 1 本ずつ 回し直して 4 回 とも 緑（ふえ −0.08〜0.31 ミリ秒。ゆれが 大きいので 15 回の 中央値に した）。
- 上の「つなぎ込み後」の 赤 13 本は、すべて **テスト側の まちがい**として 直した。実装の まちがい: **なし**。

| spec | AC | 合否 | 直した こと |
|---|---|---|---|
| live2-kit | AC1 | OK | `craft.make` の あと `step(3)`。こわす とき 60 ステップ 押す → はなす を こわれるまで くり返す（ほりの 段が MAX で とまる きまり） |
| live2-coop | AC7 | OK | `step(3)` を はさむ。ねらいを 届く 距離に（x 10.5 から） |
| live2-coop | AC7b・AC7c | OK | 立つ 場所を 穴・4 つ目の 近くに（距離 5 以内） |
| live2-coop | AC9b | OK | おろす 向き `pitch` 30 → −30 |
| live2-coop | AC14・AC29c | OK | 押し直しを 入れる |
| live2-coop | AC29b | OK | 中の まん中に 立って ねらう |
| live2-coop | AC20(小屋) | OK | 距離を つめる。「あつめる」は すばこに たまご 1 こ 以上の ときだけ（§2.11 1b）なので、保存の 形で すばこに 2 こ 入れる（テスト側の 思いちがい。たまご 0 の 小屋は `coopNoEgg` で 照準の 下に 出ない） |
| live2-gold | AC21b | OK | 読み直した 直後に 読む（`step` すると `follow` が へる） |
| live2-gold | AC25 | OK | 距離を つめる。行の 数は 文字の 箱の 上の 位置が はなれた 数で 数える（`line-height: normal` を みなさない）。大きさごとに ページを 読み直す（`clear()` は 小屋・こたつを 消さない） |
| live2-text | AC25b | OK | −30。`coopMax` の 距離。4 つ目を 置かず 3 つ 目までの 小屋を つかう。行の 数え方・読み直しは AC25 と 同じ |
| live2-gold | AC27 | OK | 仕様 §4.6（PO 2026-10-22）に あわせる: 描画の ふえ 48 以下（実測 +45）・計算は 動物 なしより 1 ステップの ふえ 0.2 ミリ秒 以下・三角形 +20,000 以下（実測 +15,614） |
| live1-net | AC6 | OK | カードの いちばん うしろ `toriya` |
