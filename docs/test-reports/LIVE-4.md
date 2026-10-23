# LIVE-4 テストレポート（テストの 準備 = 実装 の 前。第 2 回。仕様書 版 2.1）

- 判定: **準備 完了（新しい テスト は 赤）**。実装 は まだ 無い ので 受け入れ の 合否 は 出さない
- 対象の仕様書: `docs/design/LIVE-4.md` 版 2.1（AC1〜AC21・AC10b は 仕様書 に 無い。版 1.1 の パリィ・かたい 所 の 基準 は AC14 に 入った）／ `docs/decisions/2026-10-23-macho-fight.md`
- 試作（`a866275`・`animals.live4Proto`）は 使わない。テスト は 仕様書 §6.1 の 窓口（`animals.fighters()`・`list()` の `target`/`hits`・出来事 `machoTarget/machoPunch/machoGiveUp/machoKO`・`fx().marks`・`yokai.events()` の `hurt.by`）だけ を 見る
- 実行したコマンド: 新しい spec を 1 回 ずつ（赤 の 確認）・`npm run check:fast`（型 は 通る。ユニット の 赤 は 下 の とおり LIVE-4 の もの だけ）

## 書いた・直した テスト

| 種類 | ファイル | 中身 |
|---|---|---|
| 新規 E2E | `e2e/live4-target.spec.ts` | AC1（窓口）・AC2・AC3・AC8（a〜d）・AC9（じゅんばん・同じ ステップ）・AC10・AC12・AC14（パリィ／からぶり・落下・むてき） |
| 新規 E2E | `e2e/live4-fight.spec.ts` | AC4（既定 と 6・2・40）・AC5・AC5b（ぬりかべ）・AC6・AC7・AC7b（2 回目 は 実績 なし）・AC11・AC13・AC13b・AC15 |
| 新規 E2E | `e2e/live4-misc.spec.ts` | AC17（保存 → 読み直し）・AC19（`fx().marks`） |
| 新規 E2E | `e2e/live4-perf.spec.ts` | AC20（仕事 の 数 = LIVE-4 前 と 同じ 99972・妖怪 5 体 と 10 体・描画 +2/+200・おわる と 0） |
| 新規 道具 | `e2e/helpers/live4.ts` | `openLive4` → `window.__M`（`base/macho/yokai/faceTo/hit/hurtMe/rec/yaFrom/punchStart/bladeFrames`）。1 ステップ ずつ きろく して「その ステップ に」を 見る |
| 新規 ユニット | `src/animals/live4.test.ts` | 設定 6 こ（`machoAtkTicks` なし）・AC1（`fighters()`）・AC17（`animals` v 4・新しい 項目 なし・`SAVE_GEN` 3）・AC16（`bladeTech/DamageMul/Knock` の 今 の 数 を 固定） |
| 新規 ユニット | `src/achievements/live4.test.ts` | AC18: `animal.machoKO.1`（eatMeat の すぐ うしろ・小・名前・`machoKO:*`）・記録 → 実績 |
| 直した | `src/achievements/achievements.test.ts` | 261→262・小 88→89・そだてる 62→63・小 17→18・`ui.total` 262 |
| 直した | `src/achievements/live1.test.ts` | 同じ 数。`animal` の 並び 27→28、小 の 並び に `machoKO.1`（eatMeat の うしろ）、`slice` を -17 に |
| 直した | `src/achievements/live2.test.ts`・`live3.test.ts` | 数 の 行 だけ |
| 直した | `src/ui/m7ui.test.ts`・`src/ui/m72ui.test.ts` | そだてる 63・小 18／ぜんぶ 262・小 89 |

消した テスト・skip した テスト: なし。直した 行 は すべて「実績 が ＋1」の 数 だけ（期待 の 意味 は かえて いない）。

## AC → テスト

| # | 層 | テスト | 状態 |
|---|---|---|---|
| AC1 | ユニット＋E2E | `live4.test.ts` AC1 ×3／`live4-target` AC1（だっこ） | 赤（`fighters` が ない） |
| AC2 | E2E | `live4-target` AC2 | 赤（`target` が null・`hurt.by` が ない） |
| AC3 | E2E | `live4-target` AC3 | 赤（`target` が null） |
| AC4 | E2E | `live4-fight` AC4 | 赤（`machoAtk` が ない・パンチ なし） |
| AC5 | E2E | `live4-fight` AC5・AC5b | 赤（`state` 'punch' なし） |
| AC6 | E2E | `live4-fight` AC6 | 赤 |
| AC7 | E2E | `live4-fight` AC7・AC7b | 赤 |
| AC8 | E2E | `live4-target` AC8 (a)・(b〜d) | 赤（`machoForget` なし・giveUp なし） |
| AC9 | E2E | `live4-target` AC9 | 赤 |
| AC10 | E2E | `live4-target` AC10（や 13/11 マス＋火の玉 8 マス） | 赤（`machoLeash` なし） |
| AC10b（版 1.1） | E2E | AC14 に 統合 | ― |
| AC11 | E2E | `live4-fight` AC11 | 赤（はしらない） |
| AC12 | E2E | `live4-target` AC12 | 赤 |
| AC13 | E2E＋ユニット | `live4-fight` AC13・AC13b（見張り つき） | 赤（見張り の `target`） |
| AC14 | E2E | `live4-target` AC14 ×2（パリィ・からぶり／落下。見張り つき) | 赤（見張り の `target`） |
| AC15 | E2E | `live4-fight` AC15 | 赤（パンチ が 当たらない） |
| AC16 | ユニット | `live4.test.ts` AC16（今 の 数 を 固定）＋ BALANCE・M3・WEAPON-2 の 既存 ユニット を かえず に 通す | 緑（回帰 の 見張り。実装 後 も 緑 の まま） |
| AC17 | E2E＋ユニット | `live4-misc` AC17／`live4.test.ts` AC17 | E2E 赤・ユニット 緑（回帰 の 見張り） |
| AC18 | ユニット（＋E2E の DOM は 本 の 矛盾 C1 のため 未） | `achievements/live4.test.ts`・既存 数 の 直し（案内画面 の 1 行 は 本 の 週次 更新 で 対象外。PO 決定） | 赤 |
| AC19 | E2E（＋UI 検査） | `live4-misc` AC19 | 赤。UI 検査（バー と かさならない・3 つ の 大きさ）は 未（下 の 抜け） |
| AC20 | 性能（自動） | `live4-perf` AC20・20b・20c | 赤（設定・見張り）。仕事 の 数 の 基準 99972 は 実装 前 の HEAD で はかった |
| AC21 | オーナー確認 | ― | 実装 後 |

## 赤 の 理由（実装 が ない から か）

- 設定 6 こ が 無い（`知らない設定: machoForget` など）／`animals.fighters` が 無い／`list()` の 行 に `target`・`hits` が 無い／`hurt` に `by` が 無い／出来事 `machoTarget` などが 出ない／音 `machoGo/Punch/Upper/Flex` が 鳴らない／実績 262・`animal.machoKO` が 無い／案内画面 の 1 行 が 無い。
- 準備 の 動き（ぼくとう の 一撃・からかさ の こうげき・火の玉・や・パリィ・だっこ・落下・水・保存→読み直し）は 実装 なし の ゲーム で 確かめ ずみ（`hit()` は 5 ステップ目 = `bladeTech.thrust` の startup+1 で 当たる、など）。
- 「ねらわない」系 の 否定 の テスト（AC14・AC13・AC20c）は 実装 なし でも 通って しまう ので、かならず「そのあと 体力 を へらす と その ステップ に ねらう／ねらって いる」見張り を 付けて 赤 に した。

## 仕様 の 矛盾・あいまい（デザイン へ）

| # | 重大度 | 内容 | テスト の 扱い |
|---|---|---|---|
| C1 | 解決 | PO: 案内画面・本 の 行 は 機能 PR の 対象外。テスト 削除 ずみ | ― |
| C2 | 解決 | PO: (d) 防具 は 外す。(b) ぬりかべ は パリィ で はじいた こうげき に 置きかえ（(a) が その テスト） | ― |
| C3 | 【軽微】 | AC10 の「13 マス 先 の ちょうちん の 火の玉」: 火の玉 は 約 10 マス 以内 しか とどかず 作れない | や だけ 13/11 マス。火の玉 は とどく 8 マス で「ねらう」を 見る |
| C4 | 【軽微】 | AC7 の `yokai_orb`: M3 第 1 版 の なごりで もう 使わない（ドロップ は 出来事 `drop`） | 経験値・`defeat.reward` を プレイヤー が たおした のと 同じ に する 形 に した |
| C5 | 【軽微】 | AC4 の「とどいた ステップ を 0」は `state` 'punch' に なった 最初 の ステップ と 読んだ。「5 ステップ目 に −2」は その 5 ステップ あと。別 の 読み方 なら 開発 と すりあわせ | `punchStart()` の 1 か所 |
| C6 | 【軽微】 | §6.1 の `fx().marks`「妖怪 の id ごと に `machoTarget?`」: 行 の `id` は 妖怪 の id と 読んだ。「！」は マッチョ の id の 行 の `bang` | AC19 |
| C7 | 【軽微】 | AC20c「ねらい なし と くらべて」: 同じ 場面 で `machoFighters` を 0 に した 回 と くらべる。0 が 設定 で 許される と 仮定 | 許されない なら 開発 から 連絡 |
| C8 | 【軽微】 | AC9「同じ ステップ」: B の 当たり を `attackNow().hitInSteps` で、プレイヤー の 突き を 押す のを おくらせて 合わせる | テスト 側 で 合わせた |

## 抜け（このテストで 確かめて いない もの）

- AC19: しるし が 体力 の バー・二つ名 と かさならない（UI 検査 `check:ui` に 場面 を 足す必要。ui-gate 側 は 開発 の つなぎ込み）。
- AC6: からぶり を 数えない（からぶり を 起こす 場面 を 作る 窓口 が 無い）。AC15: 「ほか の にわとり が かわらない」は 存在 と 位置 だけ。
- 実装 前 なので 緑 の 道（`target` が ある ときの 細部。例: AC8 (d) のだっこ中の マッチョ の 位置、AC11 の 水の 範囲）は 実装 後 に 調整 が 要る かも しれない。
- 動き の 絵（GIF）: オーナー決定 で 試作 の 確かめ は なし。実装 後 の パンチ・きりあげ・ポーズ の GIF は 実装 の あと。

## 性能（実装 前 の 基準）

| 項目 | 値 |
|---|---|
| 29 わ・60 ステップ の `work` getBlock | 99972（LIVE-3 と 同じ。マッチョ 大人 を ふくむ） |
| 妖怪 5 体／10 体 の 仕事 の 数（ねらい なし） | 98255／98255 |
| `AC20c` の 差（ねらい なし の 同じ 場面） | 描画 0・三角形 0 |

## 第 2 回（コードレビュー 差し戻し の 直し）
- 足した: AC14(b) 火の玉 を パリィ（`live4-target`）／AC12b `machoFighters` 0（E2E＋ユニット）／AC1 (g) いただきます 中 と「1 番目 を だっこ → 次 の ステップ に 2 番目」（E2E＋ユニット）／AC13 火の玉 側（AC13c）と 体力 なし（ユニット）／AC15b や は マッチョ に 当たらない。
- 直した: AC2 の 2 回目 は プレイヤー の 一撃 と 確認／AC5b を 3 回 以上／AC7 の ドロップ 依存 を 外した（経験値・reward だけ）／AC11 を 180 ちょうど に。
- 抜け（そのまま）: AC6 からぶり、AC19 UI 検査（実装 が ui-gate の 場面 を 足す）。
