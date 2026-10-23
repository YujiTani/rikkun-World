# LIVE-3 テストレポート（テストの準備。実装の前。tester）

- 対象: `docs/design/LIVE-3.md` 版 1.1 §6・§6.1。ブランチ `live3`。試作（abb7ac0・1ff2143）の上で実行。
- 数え方: `いただきます` を 押した 直後 = 0 ステップ目、`go(n)` の あと = n ステップ目（e2e/helpers/live3.ts）。時間(ms)の 合否は なし。
- DOM の 約束（仕様 に 名前 が 無い ので テスト が 決めた）: メニュー `[data-testid="coop-menu"]`・× `coop-close`・カード `coop-card`・一言 `#itadakimasu`。
- 本（ルールブック）・案内画面 の 1 行は 週一 の 本の まとめ へ 移した ので テストしない。説明の 表・ツールチップ は ユニット で 見る。

## AC → テスト → 赤の理由

| AC | テスト | 赤の理由 |
|---|---|---|
| AC1 | `live3-menu` AC1（meatList・meat の reason） | `animals.meatList` が 無い |
| AC2 | `live3-menu` AC2 | `ui.coopMenu` 無し・照準が「ひらく」でない |
| AC3 | `live3-menu` AC3 | `ui.coopMenu` 無し |
| AC4 | `live3-menu` AC4 | `ui.coopMenu` 無し |
| AC5 | `live3-menu` AC5 | `ui.coopMenuPress` 無し |
| AC6 | `live3-meat` AC6 | `ui.coopMenuPress` 無し |
| AC7 | `live3-meat` AC7 | 同上 |
| AC8 | `live3-meat` AC8 | 同上 |
| AC9 | `live3-meat` AC9 | 同上 |
| AC10 | `live3-meat` AC10（E2E）。SAVE_GEN は 変更なし（3）で ユニット 不要と 判断 | 同上 |
| AC11 | `live3-cook` AC11 | `rawMeat` が 出ない（hint null） |
| AC12 | `live3-cook` AC12・`live3Items.test` | `furnace.list()` が 4 こ |
| AC13 | `live3-cook` AC13 | 設定 `meatHeal` 無し |
| AC14 | `src/ui/live3Items.test.ts` | 名前 が 仕様 と ちがう・レシピ 無し・説明の 表 無し |
| AC15 | `src/achievements/live3.test.ts` ＋ 既存 5 ファイルの 数 | 実績 260 のまま |
| AC16 | `live3-text` AC16・16b・16c・16d | menu 無し・やく 4 まい |
| AC17 | `live3-perf` AC17（緑の 守り: 29 わ の getBlock = 99972）・17b・17c | 17b/17c は `ui.coopMenuPress`・`animals.meat` 無し |
| AC18 | `live3-meat` AC18 | `ui.coopMenuPress` 無し |
| AC19 | オーナー確認 | ― |

## こわれる 既存テストの 直し（消した もの・skip は 無い）

| テスト | 直し | 理由 |
|---|---|---|
| `achievements.test` / `live1.test` / `live2.test` / `m72ui.test` / `m7ui.test` | 260→261・87→88・61→62・16→17。live1 は animal 数 27・小 に eatMeat.1・並び に eatMeat | AC15 |
| `craft/info/info.test` | 65→67 こ | 説明の 表 に 2 こ（§3.1） |
| `live2-coop` AC12b・AC19(小屋)・AC20(小屋) | kid を `raised:false` に | 仕様 §2.2: そだてた 子 が いる 小屋 は メニュー。LIVE-2 の あつめる を 見る テスト は 野原の 大人 で |
| 試作 の `rarity7.test`・`itemCategory.test`（76 こ・common 41） | 仕様 と 合う（変更なし） | §4.2 |
| 試作 の `animalFx.test`（36 音・`itadakimasu` だけ 1.8 秒） | 仕様 は 長さを 決めて いない・オーナー決定（SOUND 案 A）に 合う ので 変更なし | §3.5 |

## 結果

- 新 spec: 5 ファイル 17 本中 赤 16・緑 1（AC17 の 守り）。赤 は すべて「窓口・機能 が 無い」。
- `npm run check:fast`: 赤 16（新しい 数・名前 の 期待）。`WorldRendererStream` は 1 回 ゆれて 単独 では 緑（無関係）。
- 試作 の item 名 `なま の もも にく` は 仕様 `なま もも にく` と ちがう（AC14 が 赤）。

## 仕様の 食いちがい・穴

1. §4.4 の「animals は v 3」は 古い。いま は v 4（LIVE-2.1）。AC10 は v 4・新しい 項目 なし で 見る（PO 指示）。
2. §6.1 に DOM の 名前 が 無い（上の 約束）。
3. 「押した ステップ」の 数え方 が 曖昧（上の 決め）。
4. §2.3 の「選んだ 子 が 見えなくなった」は 作る 方法 が 無く 未テスト（ユニット に まかせる）。
5. UI 検査（`ui-gate` の SCREENS）に メニュー 画面 を 足すのは DOM 確定後（つなぎ込み）。
6. AC18 の ユニット 部分・AC1 の ユニット 本体 は developer。
