# CRAFT-2 開発の担当表（PO が決める）

仕様書: `docs/design/CRAFT-2.md`（版 2・オーナー確認① 済み 2026-10-16）。全員がこれを読む。
軽微の指摘 G1〜G5（`docs/loop-ledger/CRAFT-2.md`）は、関係する担当がついでに守る（G5: 中身が変わったら しらべ直す）。

## 手順
0. **S0 つなぎ目**（developer 1 人、このブランチに直接）: 下の「つなぎ目の約束」を `src/contracts.ts` に型として書き、§4 の設定の名前とはじめの値を設定の入れ物に足し、`openLog`（KeyL）を `src/input/actions.ts` に足す。中身の実装はしない。`npm run check:fast` を通してコミット。
1. **A・B・C を並列**（別々の git worktree・別ブランチ `craft2-a` / `craft2-b` / `craft2-c`、S0 のコミットから）。担当外のファイルは編集しない。相手のコードは約束の形の仮のものでテストする。各自 `npm run check:fast` を通してコミット。
2. **S つなぎ込み**（developer 1 人）: PO が A・B・C をまとめたあと、`src/main.ts`・`src/debug/testHook.ts`（§6.1 の窓口）・`src/ui/playOverlay.ts` でつなぎ、関係する E2E（新しい craft2 spec・m4・m6・smoke）を回す。C が共通 CSS を変えるので、全部（`npm run test:e2e`）も 1 回回す。

## 担当ファイル
| 担当 | 担当ファイル | 中身 |
|---|---|---|
| A 素材のしくみ | `src/craft/`、`src/storage/StorageSystem.ts`（と、それぞれのユニットテスト） | §2.1〜§2.4・§5・AC27。`fogFar` は `src/game/config.ts` を読むだけ |
| B ログとできごと | `src/ui/log/`（新規）、`src/ui/pickupLog*.ts`・`pickupLog.css`、`src/inventory/pickupLog.ts`、`src/ui/notice.ts`・`noticeModel.ts`、`src/ui/wearNotice.ts`、`src/ui/achievementsPage.ts` | §2.5〜§2.7・§3.2 のログの部分 |
| C 半透明・ざいりょうのまる | `src/ui/theme/`、`src/ui/` のほかの `*.css`（B の分をのぞく）、`src/ui/craftPanel.detail.ts`・`craftPanel.css` | §2.8・§3.2 のざいりょうのまる・AC22〜24 |
| S つなぎ込み | `src/main.ts`、`src/debug/testHook.ts`、`src/ui/playOverlay.ts`、`e2e/` | §6.1 の窓口・E2E |

## つなぎ目の約束（S0 が `src/contracts.ts` に書く）
- `TansuPos = { x:number; y:number; z:number }`
- `MaterialUse = { inv: {item:ItemId; count:number}[]; tansu: (TansuPos & {item:ItemId; count:number})[] }`
- つくる・やくの結果（ok のとき）に `used: MaterialUse | null` を足す。
- `CraftEvent` の `craft` に `fromTansu: (TansuPos & {item:ItemId; count:number})[]` を足す（空配列 = たんす から使っていない）。
- `CraftSystem` に足す: `sources(recipeId): { ok:boolean; inv; tansu; missing:{item;count}[] }`、`tansuInRange(): (TansuPos & {dist:number})[]`、`debugCounts(): { tansuFilterCount:number }`。
- `StorageSystem` に足す（A が実装）: たんす ごとに 中身を数える口と、指定の数を取り出す口（形は A が決めて contracts に書き足してよい。B・C は使わない）。
- `LogCategory = 'pickup' | 'craft' | 'fight' | 'achieve' | 'info' | 'warn'`（§2.7 の 6 つ）
- `LogKind` = §6.1 の `log.history()` の `kind` 12 種。
- `LogEntry = { tick:number; kind:LogKind; category:LogCategory; item:ItemId|null; count:number|null; text:string; positions?: (TansuPos & {count:number})[] }`
- B が作る `LogSystem`: `push(e)`・`live()`・`history()`・`clear()`・`ui()`・`open()`・`scroll(dir)`・`icon(category)`（§6.1 の形）。
- C が作る: `applyUiAlpha(settings)` と `uiAlpha(): { panel; hud; scrim; min }`。
- `craft.ui().detail.materials[]` に `inTansu:number`、`fuel.inTansu: Record<ItemId, number>`（A が値を出し、C が表示する）。

## 経過
| 日付 | 手順 | 結果 |
|---|---|---|
