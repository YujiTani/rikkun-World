# M6 開発の担当分け

仕様: `docs/design/M6-ui-achievements.md`（第 3 版）。担当ファイルは **付録 A の表** のとおり（その表で確定）。
全員: `CLAUDE.md`、このファイル、`src/contracts.ts`、仕様書の自分の節だけを読む。担当ファイル以外は編集しない。確認は `npm run check:fast`。自分の worktree のブランチにコミット（push しない、git add はファイル指定）。返答は「作ったファイル・要点・テスト結果・ブランチ名・つなぎ込みへの申し送り・仕様の問題」を短く。

## 順番
1. **S1＋先にやること**（1 人、claude/m6-ui で直接）: 付録 A の S1 と、「PO が先にやること」（contracts の型・inventoryScreen の差しこみ口・止める画面の状態・§4.1 設定の名前と初期値）。軽微 G10〜G12（台帳）も仕様に合わせて扱う: G12 の えらぶ処理は A の `craftPanel` に置く。
2. **A・B・C・S2・D を並列**（各自 worktree）。
3. **つなぎ込み**（1 人）。防具の役わり分け・落下ダメージ（FIX-fall-reach）が main に入っていれば、説明の表と U テストに反映。

## 申し送り
**S1（8fe7c09）** 全員が使う土台:
- CSS 変数 `src/ui/theme/tokens.css`（`--rk-*`、カテゴリー `--rk-cat-*`、めずらしさ `--rk-rarity-0..3`）、部品 class `src/ui/theme/components.css`（`rk-panel/card/slot/btn/tab/bar/meter/chip/tooltip/badge/modal/medal`）、作る関数 `src/ui/theme/index.ts`（`createSlot`・`paintSlot`・`createButton` ほか）。色・大きさの数をじかに書かない。
- DOM しらべ `e2e/helpers/uiRules.ts`（`snapshotUi` と `check*`）。部品見本 `/src/ui/theme/parts.html`。
- 型 `src/contracts.ts` の M6 節: `AchievementId`・`AchievementShow`・`AchievementModalPort`（B）・`CelebrateBusyPort`（B）・`AchievementShowSource`（C）・`CraftMadeEvent`（A→B,C）・`StorageEvent`（D→C）・`M6Settings`/`M6_SETTING_DEFAULTS`。
- 止める画面: `ScreenMode` に `'celebrate'`、`ScreenController` の `openModal/closeModal/modalOpen/lockDenied/relock`。
- もちもの画面の口（`src/ui/inventoryScreen.ts`）: `tabsEl`・`craftSlot`・`storageSlot`・`pageSlot`、`setSide('craft'|'storage')`、`setTab('items'|'achievements')`、`setOutsideHandlers({down,move,up})`、`isInsidePanels(x,y)`。
- 申し送り（B・つなぎ込み）: `lockDenied()` の間は案内画面でなく札「クリック で つづける」→ クリックで `relock()`。
- `hardness.tansu`・`fixedDrop.tansu` は D が足す。`--rk-ng` の面の上の文字は `--rk-ink`。

## 経過
| 日付 | 内容 |
|---|---|
| 2026-10-12 | オーナー確認① 合格。S1 開始 |
| 2026-10-12 | S1 完了（8fe7c09）。A・B・C・S2・D を並列で開始 |
| 2026-10-12 | オーナー指示で M6 を保留。A・B・C・S2・D を途中で止めた（各 worktree /home/user/m6-* に途中の作業が残る。再開時は続きから） |

### B（m6-b, f131b77）
- 窓口 `new CelebrateUi(deps)`（`src/ui/celebrate/`）。deps: hud・badgeParent?・sound・screen・settings・tileEl(recipe)・itemName・itemRarity・itemIconUrl・achievement(id)・levelUpShowing。
- main で毎ステップ `celebrate.step()`、A の「つくった」→ `celebrate.made(e)`（`e.first` は C の `isFirstMade`）、ぷぷ → `failed()`。C へは `.modal`・`.busy`、C から `setPending(n)`。
- testHook: `craft.fx()`→`fxInfo()`、`craft.sounds()`→`drainCraftSounds()`、`achievements.sounds()`→`drainAchievementSounds()`、`achievements.modal()`→`modalInfo()`、`achievements.close()`→`close()`。
- `handleCraftEvents` に `celebrate: true`（音の二重を防ぐ）。メダルの印は S2 の「B おしらせ」を badgeParent に。`#hud` の pointer-events でおめでとう画面のボタンが押せるか実機で確認。
- コンボは B が画面ステップで数える（A の `CraftMadeEvent.combo` は使わない）。AC11 と §2.4 のぽよんは山形 1.0→1.08→1.0 で両立。

### C（m6-c, 88c946d）
- `src/achievements/`（`AchievementSystem`・defs 180 こ・pageModel・hook）、`src/ui/achievementsPage.*`。
- 出来事は 1 か所で drain して `feedDig`・`feedCraft`・`feedCombat`・`feedStorage` にも同じ列を渡す。`feedDefeat({kind,tick,with,hp})`（最後の一撃の武器と、たおした瞬間の体力は渡す側が出す）、`feedArrow('shot'|'hit')`、`feedFull()`、`feedPhase(phase)`（time の onPhaseChange）。毎ステップ `update(ctx: StepContext)`（screenSteps: あそぶ 1・もちもの 4・案内/おめでとう 0）。
- `attach(B.modal, B.busy)`、`onUnlock(fn)` で B の印の音。`save` に SaveExtra として登録、ロード直後に `syncSilently({level, armor})`。設定は `createM6Settings()` を settings に出し `() => settings` を渡す。
- `createAchievementsHook(sys, pageModel, {inventoryOpen, onTab})` に B の modal・close・sounds を足して `__rikkun.achievements`。毎フレーム `AchievementsPage.update()`。
- 支えを失って落ちた たいまつ は break に数えない。
- **つなぎ込みで直す**: `InventoryScreen.tabsEl` が panel の中にあり、じっせき タブで panel ごと隠れて戻れない → tabsEl を body の外へ（inventoryScreen.ts の口）。
- 「〇 にちめ」は day+1 表示。

### A（m6-a, 1524cd3。この後「その5 持っている材料だけ」を追加中）
- 窓口: `craft: {...craftHook, ...craftUiHook.craft, ...createCraftPanelHook(inventoryScreen.craftPanel!)}`。
- `craftPanel.configure({ info, cursorHeld: ()=>inv.cursor()!==null, isMade, onSelect, onFull })`。`info = createItemInfo({recipes, nameOf, numbers})`、numbers は設定の生の値を読む関数（weaponReach・weaponTicks・armorValue も）。`isMade = !C.isFirstMade`。
- タブ: `mountInventoryTabs(inventoryScreen, { dot: ()=>C のあたらしい, onSwitch })`、毎ステップ `.update()`。
- つくった出来事: `new CraftMadeTracker({comboTicks, comboMax, isFirstMade})`、`craft.drainEvents()` の各イベントを `handle(ev)`（C が記録する前に）→ `onMade` で B の `made`。止まっていない時だけ `advance(1/timeScale)`。
- B 向け: `craftPanel.tileElFor(recipeId)`、`buttonEl()`。ツールチップ: `inventory.tooltip()` に `desc` を足す（craftUi.ts）。
- 仕様の読みかえ: なぎなた とどく 5.0・素手 3.5（main の値）。U1〜U14 の世界を動かす分は E2E で（テスト係）。DOM の寸法（AC53・AC55・AC32）はつなぎ込み後に確かめる。
- A 追加（157e248）: 作る一覧は `visibleCards`（持っている材料のあるレシピだけ）。`craft.ui().tiles` は表示中だけ（AC1 読みかえ）、`cards` は全件。えらびが消えたら作れる先頭に選び直す。E2E では先に材料を入れてから tileClick。

### D（m6-d, 9a78596）
- 毎ステップ `storage.update()`・`dropController.update()`（hover に `dragOut.hoverTarget()`）。`StorageScreen.update()` 毎フレーム。
- `new DropField` の live に `dropPickupDelay`・`dropThrowSpeed`・`dropThrowUp`。dropper の throwItem = `(s)=>drops.throwItem(s, yawDeg, eyeHeight)`、onThrown → 音「ポイッ」と swing 'throw'。
- `StorageSystem` deps: scatter=`(p,s)=>drops.scatter(p,s)`、open/closeScreen=`screen.toggle`、onSound=drawerOpen/drawerClose。`DigSystem` の `m4.storage` に渡す。
- E でたんす: ScreenController を作る前に `onPress('toggleInventory')` を登録し、`!screen.inventoryOpen()` のとき `dig.tryOpenAimedStorage()`。
- 保存: `storage.serialize/deserialize` はブロック復元の**あと**に登録。
- `new StorageScreen(inventoryScreen, storage)`、`new DragOut(inventoryScreen, {...})`（shiftMove: たんすが開いていれば `storage.shiftClick('inv', i)`、閉じていれば `inventory.shiftMove(i)`）。
- testHook: `storage: createStorageHook(...)`、inventory に `createInventoryM6Extras(...)`。StorageEvent は `storage.drainEvents()` と `dropper.drainEvents()` から C へ。
- settings: dropPickupDelay・dropThrowSpeed・dropThrowUp・tansuSlots・tansuCloseDist・hardness.tansu。
- 未: 向きの描き分けなし（4 面とも前、facing は記録）、世界のブロックの開いた絵は切りかえない、たんすのマスのツールチップなし、アイテム絵は itemIcon.ts で専用絵にする（つなぎ込み）、たんす画面の縦並び（上たんす・下もちもの）は inventoryScreen 側で。
