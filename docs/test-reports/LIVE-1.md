# LIVE-1 テストレポート

## 版 3.2（テストの準備。実装の前。tester）

- 対象: `docs/design/LIVE-1.md` 版 3.2 §6。この節は「実装の前に書いた E2E と、落ちる（赤）の確認」。実装のあとの合否は、実装が終わってから下の表に書き足す。
- 実行: `npx playwright test e2e/live1-core.spec.ts e2e/live1-follow.spec.ts e2e/live1-egg.spec.ts e2e/live1-net.spec.ts e2e/live1-carry.spec.ts e2e/smoke.spec.ts`（`--workers` なし）→ **56 本中 34 本が赤・21 本が緑・1 本 fixme**。緑 21 は smoke と、版 2 から意味が変わらない既存テスト（下の「のこした」）。赤の理由は全部「設定・窓口・アイテムが まだ無い」か「やさいを あげられる／なかまを押した瞬間に あげる」などの版 2 の動き。
- 新しい spec: `e2e/live1-net.spec.ts`（あみ・むし）、`e2e/live1-carry.spec.ts`（だっこ・おろす・パタパタ）。ヘルパー: `e2e/helpers/animals.ts` に `full / friend / stand / press / release / tree / aimBlock / swing / chip / lift` を足した。

### AC → E2E テスト（赤の理由）

| AC | テスト（spec） | 赤の理由 |
|---|---|---|
| AC1（E2E の分） | `live1-core` AC1 AC2b（出てくる 30 ステップは ねらえない。むしを持って押しても あげない） | 道具 `mushi` が無く、むしが へらない のを確かめる所で落ちる |
| AC2 | `live1-core` AC2 | **のこした**（緑） |
| AC4 | `live1-core` AC4 | **のこした**（緑） |
| AC5 | `live1-core` AC5・AC5b | **のこした**（緑） |
| AC6 | `live1-net` AC6（つくる・いちばん うしろ・こわれない） | `mushi_ami` のレシピが無い（カードの うしろ は seed_eggplant） |
| AC7 | `live1-net` AC7（30 ステップ目・き は のこる・bug:*・animal.bug.1）、AC7b（swing は 1 回・log）、AC7c（bamboo・stone・くさ は netHint・もみじ／まつ は ふれる） | 設定 `bugChance`・アイテム `mushi_ami` が無い |
| AC8（E2E の分） | `live1-net` AC8（`bugChance` 0 でも 3 回目は pity） | 設定 `bugChance` が無い |
| AC9 | `live1-net` AC9（おやすみ・treeEmpty・6 はなれる・1,800 後） | 設定 `bugTreeCooldown` が無い |
| AC10 | `live1-net` AC10（いっぱいで 足もと→あけて ひろう） | 設定 `bugChance` が無い |
| AC11 | `live1-core` AC11（あげる・fullHint・animalFull・600 後 ハート 2・3 つ目で なかま・follow まんたん）、AC11b（お祝い・carryHint）。AC11c は fixme のまま（動きの強さ設定が まだ無い） | 設定 `animalFullTicks` が無い／`fullLeft`・`follow` が無い |
| AC12 | `live1-core` AC12（やせい＋トマトは pet・feedHint・DOM に「むし」。なかまは はなした 瞬間に pet／feed） | トマトが あげられて しまう（feedHint の文が やさい）・押した瞬間に あげる |
| AC13 | `live1-core` AC13（あげる／まってね／なでる）、`live1-carry` AC19（おろす）、`live1-egg` AC25b（egg の たべる は のこす） | 窓口の絵 `mushi` が無い |
| AC14 | `live1-core` AC14（なかま 8＋むし） | `fullLeft` が無い・むしが へらない確認で落ちる |
| AC15 | `live1-follow` AC15（follow 600・followEnd・warp なし・むしで もどる・30 マス先は warp） | 設定 `animalFollowTicks` が無い |
| AC16 | `live1-follow` AC16（あしあと 3/2/1/なし・full・9 マス・だっこ中）、`live1-egg` AC18（ハート → `marks.hearts`） | `fx().marks` が無い |
| AC17 | `live1-carry` AC17（39/40・むし 5 のまま・egg なし）、AC17b（わ）、AC17c（ねらい はずし・1 わ だけ）、AC17d（ついばみ・たまごの 動きが おわってから だっこ・300 歩く） | 設定 `carryHoldTicks`・`carrying()` が無い |
| AC18 | `live1-carry` AC18（左クリック・つち・トマト・弓） | `carried` が無い |
| AC19 | `live1-carry` AC19（おろす 20 ステップ・putDown）、AC19b（cantPutHere・carryWild） | `carrying()`・`carried` が無い |
| AC20 | `live1-carry` AC20（10 マス・2.0 以下・285 以上）、AC20b（足場を こわす・みず） | 設定 `animalFlutterFallSpeed` が無い |
| AC21 | `live1-egg` AC21（chance 1 で 60 ステップ目・上限なし）、AC21b（chance 0 で 8 回目 かならず・9 回目 なし）、AC21c（なでる・やせい） | 設定 `animalEggChance` が無い |
| AC23 | `live1-egg` AC23（たまごを たべる） | **のこした**（緑。番号を AC15 → AC23 に付け直した） |
| AC24 | `live1-follow` AC24（3 わ・follow・fullLeft 0）、AC24b（だっこ中に 保存） | `follow`・`fullLeft`・`carried` が無い |
| AC25（E2E の分） | `live1-net` AC25（むしは たべられない・置けない） | `mushi` が無い |
| AC27 | `live1-core` AC27（fullHint）、`live1-net` AC27（netHint・treeEmpty）、`live1-carry` AC27（carryWild・carryHint）。3 サイズで はみ出し 0px・ルビの外に 漢字 なし | 合図の 種類が まだ無い |
| ふりわけ（版 2 の AC16 を のこす） | `live1-egg` AC16・16b・16c（あみ・トマトも なでる に 足した） | **のこした**（緑） |
| 版 2 の 12 の AC | `live1-follow` AC10・10b・11・11b・11c・12 | **のこした**（緑。`follow: まんたん` を 明示して 渡す） |

### こわれる 既存テストの 直し・消したもの

| テスト | したこと | 理由 |
|---|---|---|
| `live1-core` 旧 AC6（トマトで なかま）・旧 AC8（失敗の返し・やさい）・旧 AC9（トマトで 8 わ） | むし版の AC11・AC12・AC14 に **おきかえ** | 版 3 は やさいを あげられない／ずっと…でなく むし |
| `live1-egg` 旧 AC13（なでて たまご・1 日 1 回・`eggLater`）・旧 AC14（トマトで たまご・今日もう くれた） | **消した**。AC21 に おきかえ | 仕様 §0 の 7・8 行。なでても うまない／1 日の 上限 なし／`eggLater` を 消す |
| `live1-egg` 旧 AC17（案内: トマト あげる／今日もう → なでる） | **消した**。`live1-core` AC13 に おきかえ（egg の「たべる」は AC25b） | 絵が `mushi`・おなかいっぱいは `まってね` |
| `live1-egg` 旧 AC18（ハート `fx().progress`） | `marks.hearts` に **直した** | §0 の 22 行 |
| `live1-follow` 旧 AC19（`eggDay` の 保存） | **消した**。AC24 に おきかえ | `eggDay` を すてる／`follow` を 保存 |
| `e2e/bucket.spec.ts` AC2・`e2e/m72.spec.ts` カード 33 | 34 に **直した**（`mushi_ami` が いちばん うしろ、尾の 3 つは `long_watering_can`・`sprinkler`・`bucket`） | §4.2 レシピは いちばん うしろ |
| `e2e/m72.spec.ts` AC25 本「そだてる」12 こ | **12 のまま**（一度 16 に した が 戻した） | PO 決定: 本は この PR で 変えない（週一の 更新で 足す）。仕様 LIVE-1 の 案内画面 4 行 も 直した |

### ユニットの AC（実装係が書く。どこで 見るか）

| AC | ファイル・関数 |
|---|---|
| AC1 (1)〜(5) | `src/animals/animals.test.ts`: `trySpawn`（にせの 世界）— 距離・上 2 マス・空が見える／すな・くさ以外・`mori`／`dusk` `night` `dawn` 100 回 0 わ／やせい 3 わで 0／同じ シードで 同じ 場所 |
| AC3 | 同上: うろうろ（速さ・1 段・2 段・4 マスの がけ・みず・y<−10 の `remove 'void'`）、ハート 0 は 70 で `'far'`、**ハート 1 は 70 で 消えず 100 で 消える** |
| AC6（表の 分） | `src/craft/` のレシピのテスト（`CRAFT_RECIPES` の いちばん うしろ・`craft.everything` に 入れない）、`src/tools/durability` のテスト（`mushi_ami` は たいきゅうなし・上限 1・置けない） |
| AC8 | `src/animals/animals.test.ts`: あみの くじ — 1,000 回で 0.40〜0.55／どの 3 回つづきでも 1 回以上（おやすみを のぞく）／同じ シード・同じ 操作で 同じ |
| AC22 | 同上: たまごの くじ — 0.25・pity 7 で 1,000 回 → 0.24〜0.32／8 回つづけて うまない が 0 回／同じ シード／設定の 初期値（`animalEggChance` 0.25・`animalEggPity` 7） |
| AC24（v1・おかしい行） | `src/animals/animals.test.ts` か `src/save/SaveManager.test.ts`: `{v:1, friends:[{…eggDay:3}]}` → `follow` まんたん／`follow:'a'` は まんたん・`-5` は 0／8 わで 1,000 文字以下／`SAVE_GEN`・`SAVE_VERSION` が 変わらない |
| AC25（ユニット） | `src/ui/m72ui.test.ts`・`src/ui/book/bookData.test.ts`（grow に 4 つ足す）・アイテム表／rarity／カテゴリーの テスト（`mushi`・`mushi_ami`）・`src/ui/itemIcon` の 絵が ちがう テスト |
| AC26 | `src/achievements/live1.test.ts`（242・小 83・そだてる 52・小 15・並び・`animal.feed`／`animal.egg` の id が 同じ） |
| AC29 | `src/yokai/` の 既存ユニットが 変わらず 通る＋「あみ・たまごの 乱数を 使っても 妖怪の 出る数・場所が 同じ シードで 同じ」を 足す |

### 仮に きめた 名前（実装係は これに あわせる。仕様書に 無い もの）

仕様書 §6.1 の 名前（`animals.carrying()`・`events()` の `swing`／`bugCatch`／`full`／`followEnd`／`carry`／`putDown`・`fx().marks`・`lastHint()` の 8 つ・`list()` の `follow`／`fullLeft`／`carried`／`fluttering`／`vy`／`state`・`spawn` の `follow`／`fullLeft`・設定 11 こ）は そのまま 使った。仕様書に 書いて 無く、テストが 仮に 決めた もの:

| 名前 | 使い方 |
|---|---|
| `craft.make('mushi_ami')` | 既存の窓口（AC6 の 文に ある）。カード一覧は `craft.ui().cards` |
| 合図の チップ `#animal-hint` | 既存の DOM（AC27 の ルビ・はみ出し） |
| `hud.actionHint().progress` | 0〜1（§6.1 の 文の とおり）。`right.word` は `だっこ`／`おろす`／`まってね`。`right.icon` は `mushi`／`mushi_ami`／`heart` |
| `events()` の `hint` | 既存（`{type:'hint', hint}`）。`carryHint` を この形で 流す |
| `events()` の `swing` の 項目 | `{ caught: boolean, reason: 'chance'|'pity'|'empty'|'miss' }`（§6.1）。`bugCatch` に `toInventory: boolean` |
| 状態名 | `state` の `'eat'` は のこす。たまごの 動きの 名前は テストで 使わない |
| `fx().marks` の 行 | `{ id, hearts?, steps?, full }`。ハートも あしあとも 無い 時は 行が 無くても よい（テストは `?.` で 読む） |

### 仕様で 分からなかった 所

1. （解決）案内画面「そだてる」: PO 決定で 本は 変えない。12 こ のまま。
2. **だっこの 押しつづけ と おろし**: 「だっこ中に 別の 1 わを ねらって 押す」は 00（おろす）が 先なので、テストは「2 わ目は だっこされない」だけ 確かめる（1 わ目が おろされる のは 仕様どおり）。
3. **なかまへの 右クリック（押して 40 未満で はなす）の 時刻**: 「はなした ステップ」を 押した ステップ + 押した 長さ と 読んだ。ステップの 数え方（±1〜2）は テストが ゆるめに とって いる（AC11 の 30 目は ±2、AC21 の 60 目は ±2、AC7 の 30 目は 29〜31）。
4. **`follow` の 減り始め**: スポーンした 次の ステップに 1 へる か 同じステップか 仕様に 無い。AC16 は 窓口が 返す `follow` の 値から 期待を 出す。AC24 の 保存は ±3 まで ゆるす。
5. **パタパタの 「着地」**: `y ≤ 9.05` かつ `vy > -0.01` を 着地と みなす（AC20）。実装で `vy` が 着地の ステップに 0 に ならない 場合は 直す。
6. **だっこ中の `fullLeft`**: 仕様は「へる」。AC17d は 300 ステップ歩いて 前より 小さい ことだけ 見る。

---

## 版 2 のときの レポート（第 1 回。参考）

- 判定: 合格（重大 0。AC24 の描画回数の実測と AC25 は未実施・下記）
- 対象の仕様書: `docs/design/LIVE-1.md`
- 実行したコマンド: `npx playwright test e2e/live1-*.spec.ts e2e/m7.spec.ts e2e/m72.spec.ts e2e/bucket.spec.ts e2e/smoke.spec.ts`（62 本 OK・1 skip。全部の E2E は PR の CI）。落ちた 4 本のうち 3 本は直して通った。smoke の刀のわざ（`smoke.spec.ts:76`）は全部まとめて回すと 1 回落ち、単独では通った（負荷のゆれ。CI で見る）。`npm run perf` は 10 分で時間切れ（LIVE-1 の数値なし）。

## 受け入れ基準
| # | 結果 | 層 | 確かめ方・証拠 |
|---|---|---|---|
| AC1 | OK | ユニット | `src/animals/animals.test.ts`（開発） |
| AC2 | OK | E2E | `live1-core` AC2（3,600 ステップ・くさ・harappa/hana・3 わ以下）、AC2b（appear 中はねらえない） |
| AC3 | OK | ユニット | `src/animals/animals.test.ts` |
| AC4 | OK | E2E | `live1-core` AC4 |
| AC5 | OK | E2E | `live1-core` AC5・AC5b（直した: ねらいの線が床に当たるので壁を にわとりのすぐうしろ x=5 に。ほる確認は「押し直すとこわれる」まで） |
| AC6 | OK | E2E | `live1-core` AC6（おめでとう画面が出たことも `__modalSeen` で確認） |
| AC7 | OK（AC7b は fixme） | E2E | `live1-core` AC7。「動きの強さ」設定がまだ無いので 0 の場合は書けない |
| AC8 | OK | E2E | `live1-core` AC8（チップ・音・DOM のルビ） |
| AC9 | OK | E2E | `live1-core` AC9 |
| AC10 | OK | E2E | `live1-follow` AC10・AC10b |
| AC11 | OK | E2E | `live1-follow` AC11・11b・11c（直した: x=210 は列を読み込んで settle してから床を作る） |
| AC12 | OK | E2E | `live1-follow` AC12 |
| AC13 | OK | E2E | `live1-egg` AC13 |
| AC14 | OK | E2E | `live1-egg` AC14 |
| AC15 | OK | E2E | `live1-egg` AC15 |
| AC16 | OK | E2E | `live1-egg` AC16・16b・16c |
| AC17 | OK | E2E | `live1-egg` AC17 |
| AC18 | OK | E2E | `live1-egg` AC18 |
| AC19 | 一部 | E2E＋ユニット | 保存の往復は `live1-follow` AC19。1,000 文字・10 わ・おかしい行・うまった場所はユニット（開発） |
| AC20 | OK | ユニット＋UI 検査 | 開発のユニット。UI 検査は画面を変えた PR の CI で |
| AC21 | OK | ユニット | `achievements.test.ts`・`m7ui.test.ts`・`m72ui.test.ts`（236・82・47・15） |
| AC22 | 一部 | E2E（DOM） | AC8 のチップ文とルビ。案内画面の行数は `m72` AC25（13 行）。3 サイズのはみ出し 0px は UI 検査 |
| AC23 | OK | ユニット | yokai のユニットが変えずに通る |
| AC24 | 未実測 | 性能 | 描画回数・三角形の増え（16 以下・8,000 以下）は、今回の `npm run perf` が時間切れで取れていない。計算 0.2 ms・保存の大きさは開発のユニット。PR の CI か perf-engineer で取る |
| AC25 | オーナー確認 | オーナー | Mac で §6 の (1)〜(7) |

## つなぎ込み担当が足した準備の確認
- 最初のクリックで音を unlock: 音の記録を取るのに必要で、基準は弱まらない。
- `h.step` ごとにおめでとう画面を閉じる: 世界が止まる仕様のため。弱まらないよう、出たことを `__modalSeen` に残して AC6 で断言した。
- `forward` → `moveForward`: 正しい操作名への直し。m72 の `animalAutoSpawn=false`: 描画回数にまざらないため。いずれも基準は弱まらない。

## 性能（前回との比較）
| 項目 | 前回 | 今回 |
|---|---|---|
| drawCalls / triangles | 未実測 | 未実測（perf 時間切れ） |

## 見つけた問題
- 重大: なし。軽微: テスト側の AC5 の壁の位置・AC11 の床の作り方（直した）。smoke の刀のわざが負荷で 1 回落ちた。
