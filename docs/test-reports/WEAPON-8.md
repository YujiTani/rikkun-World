# WEAPON-8 テストレポート（第 1 回: テストの準備。実装の前）

- 判定: （実装のあと、検証で書く。今は「準備」だけ）
- 対象の仕様書: `docs/design/WEAPON-8.md` 版 0.4、決定 `docs/decisions/2026-10-21-fujin-charge.md`
- 実行したコマンド: `npx playwright test e2e/weapon8.spec.ts e2e/weapon7-fujin.spec.ts e2e/weapon7.spec.ts e2e/artPipe1.spec.ts e2e/smoke.spec.ts`・`npm run check:fast`

## 受け入れ基準 × 層 × テスト

| # | 層 | テスト | 今（実装の前）の結果 |
|---|---|---|---|
| AC1 | ユニット | `src/legend/fujin.test.ts`（直した）・`src/contracts.w7.test.ts`（直した）＋ developer の新規 | 赤（`charge` が null） |
| AC2〜AC12, 20, 21, 22, 23, 25, 30, 32, 33 | ユニット | developer が書く | ― |
| AC34 | ユニット | `src/fx/windWaveFx.test.ts`（書きかえ。板 1 まい・カメラ正面・drawPos の位置） | 赤（今は板 2 まい） |
| AC13 | E2E | `e2e/weapon8.spec.ts`「AC13 通し」2 本（風神剣 → 雷神剣） | 赤（窓口 `legend.chargeFx` ほかが無い） |
| AC14 | E2E | `e2e/weapon8.spec.ts`「AC14 通し」 | 赤（同上） |
| AC15 | E2E | 今の期待は weapon7・weapon7-fujin・artPipe1 がそのまま確かめる。smoke は `e2e/smoke.spec.ts` に「風神剣で らせんの かぜを 1 回」を足した | smoke 追加分は赤。既存は下の表 |
| AC16 | E2E | `e2e/weapon8.spec.ts`「AC16 性能」4 本（らせん 1 つ／K1 8 つ＋らせん／T1 風神・雷神。10 回ためても増えない） | 赤（窓口なし・`renderStats().points` なし） |
| AC24 | E2E | `e2e/weapon8.spec.ts`「AC24」3 本（三人称 風神・雷神／一人称） | 赤（`player.handPos` なし） |
| AC17 | UI 検査 | `e2e/ui-gate.spec.ts` ほか（UI 検査の担当。この準備では書いていない） | ― |
| AC18, 19, 28, 29, 31, 35 | オーナー確認 | 試作スクショ・試聴で済み、最後はゲーム内で確認 | ― |

道具: `e2e/helpers/weapon8.ts`（`rec8`・`chargeRun8`・`holdRun8`・`fIndex`・`grassFloor`・`baseStats`・`expectW8Hook`）。数は `window.__rikkun`（`legend.chargeFx()`・`chargeSound()`・`debris()`・`waves()`・`player.handPos()`・`ui.buffs()`・`combat.sounds()`・`renderStats()`）に聞く。窓口が無いあいだは `expectW8Hook` が「無い窓口の名前」を出して落ちる。

## 直した・足した・消した既存テスト（仕様 §9）

| ファイル | 内容 | 理由 |
|---|---|---|
| `src/legend/fujin.test.ts` | `chargeOf` が null → `kind: 'spiral'`（8 つの数） | Y1。風神剣に ためわざ |
| `src/contracts.w7.test.ts` | 風神剣の `charge` null → spiral | 同上 |
| `e2e/weapon7-fujin.spec.ts` | AC21 データ（charge）→ spiral。「ためない・押しつづけでくり返す」→「押しつづけ = ため（chargeStart あり・ふつうの わざをくり返さない）」 | 同上。仕様 §2.1「変わる所」 |
| 同上 `swing` と AC23 3 本 | ふつうの わざの F1 が「押した」→「はなした ステップ」(i 1) になる。`rec[0]`→`rec[1]`、`at+1`→`at` | ためわざがある武器は、はなした ステップが F1（雷神剣の AC17 と同じ） |
| 同上 AC25 smoke | 押しっぱなし 100 ステップ → 30 ステップごとに押して はなす | 押しつづけは ため |
| `src/fx/windWaveFx.test.ts` | 十字 2 まい・カメラで向き不変 → 板 1 まい・カメラ正面・`drawPos` の位置（頭に ART-PIPE-1 AC19 が置きかわった理由を書いた） | Y9・K1 |
| `src/legend/thunderAssets.test.ts` | 題名の文だけ（`thunder_ground.png` は ねらいの わが使う）。期待は同じ | 手の光が無くなる |
| 消したテスト | なし | |

## 回した結果（実装の前）

- `npx playwright test e2e/weapon8.spec.ts`: **10 本とも赤**。理由はどれも「`window.__rikkun` に無い窓口: legend.chargeFx、legend.chargeSound、legend.debris、player.handPos、ui.buffs」。
- 窓口が無くても進む部分は別に確かめた: 一人称にする置き方（体の うしろ・上に石、`camera.get().hideChar` が true になる）、真空波 8 つ同時（速さ 1.5・range 20・21 ステップごとに押す → 約 8 つ）。
- `e2e/weapon7-fujin.spec.ts`: 直した 5 本が赤（データ、押しつづけ = ため、AC23 の 3 本）。ほかは緑。実装のあとに緑になる。
- `e2e/weapon7.spec.ts`・`e2e/artPipe1.spec.ts`・`e2e/smoke.spec.ts`（追加分以外）: 緑（期待は変えていない）。
- `npm run check:fast`: 赤 = 直したユニット 5 本（上の表の fujin・contracts.w7・windWaveFx 3 本）。ほかに `src/fx/titleSoundFiles.test.ts`（音の素材ファイル）が赤だが、この issue と関係なく前から。

## 実装のあと、注意して見る所

- `weapon7.spec.ts` の AC2・AC15 の `chargeReady` の期待は そのまま通る はず（仕様 §9）。
- `artPipe1.spec.ts` AC13（F1〜88 で 4・150 以下、F89 で 0）は、ためF 60 のあとの F1〜F4 に手もとの光（描画 2）が入る。通らなければ仕様の矛盾として デザインへ。
- `weapon7-fujin.spec.ts` の「3 段攻撃」（毎ステップ押す）は 雷神剣と同じ押し方なので 通る はず。
- 見た目の基準（AC18・28・35）はスクショ（`shots/WEAPON-8/`）で、実装のあとの検証で撮る。

## 性能（前回との比較）
実装のあと（`npm run perf` を回して書く）。

## 見つけた問題 / 仕様でわかりにくかった所
指摘台帳 `docs/loop-ledger/WEAPON-8.md` に追記した（軽微）。
