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
