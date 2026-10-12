# M4 開発の担当分け（開発ループ 1 周目）

仕様: `docs/design/M4-craft.md`（第 2 版、付録 A）。つなぎ目: `src/contracts.ts` の M4 の節（PO が決めた型。変えない。足りなければ自分の側で型を広げ、つなぎ込みへの申し送りに書く）。
新しいブロック 3 種のかたさ・レベル・めずらしさは PO が `src/dig/config.ts` に入れた（仕様 §4.4 の値）。

## 共通
- **最初に `git merge claude/m4-crafting`**（worktree は別のブランチから作られるので、M4 の最新を取りこむ）。必要なら `npm install`。
- `CLAUDE.md`、このファイル、`src/contracts.ts` を読む。仕様書は自分の担当の節だけ。担当ファイル以外は編集しない。確認は `npm run check:fast`。最後に自分の worktree のブランチへコミット（push しない）。数値は自分の `config.ts` に 1 か所で（名前は仕様 §4.5）。テスト窓口は `create〇〇Hook(...)`（`window` に付けない）。返答は「作ったファイル・要点・テスト結果・ブランチ名・つなぎ込みへの申し送り・仕様の問題」を短く。

## A つくる・やく・アイテム・防具（仕様 §2.2・§2.3・§2.7・§4.1・§4.2・§4.4、付録 A の A）
- 担当: `src/craft/**`（`CraftSystem`・`ArmorSystem` の実装、レシピ表、かまど、拾った出来事、保存の中身、`craft.*`・`furnace.*`・`armor.*` の窓口）, `src/inventory/items.ts`（新アイテム 22 種）, `src/drops/rarity.ts`（新アイテムのめずらしさ）, `src/combat/PlayerCombat.ts`（防具でふせぐ入口 1 か所・やられたとき そうびも 50% の 1 か所）, `src/save/**`（かまど・そうびの保存を足す）, `src/inventory/**`（そうびのマス・拾ったログ用の `pickup` が要るなら）
- `src/dig/DigSystem.ts` は直さない（B の担当）。`fixedDrop` は `CraftSystem.fixedDrop()` で出すだけ

## B 道具・武器の働き（仕様 §2.4〜§2.6・§4.3、付録 A の B）
- 担当: `src/tools/**`（`ToolSystem`、持っているもので ほる強さ・レベル・たたく強さ・とどく距離・当たるまで、なぎなた の交互、ゆみ と や（飛ぶ や の動きと当たり）、`tool.*` の窓口）, **`src/dig/DigSystem.ts`（ここを直すのは B だけ）**: 右クリックのふりわけ（かまど → `craft.openFurnace` > 防具 → `armor.tryEquip` > 置く）、`craft.fixedDrop` の数、かまど をこわしたら `craft.furnaceBroken`、ほって入ったら拾った出来事（A の窓口へ）、`src/combat/PlayerCombat.ts` のパンチの強さ・距離・時間を `ToolSystem` から取る所（A の 2 か所とは別の場所。ぶつかったらつなぎ込みでまとめる）
- 妖怪に や が当たったら `YokaiWorld.damage`

## C1 画面と音（仕様 §2.1・§2.10〜§2.13・§3 の画面と音）
- 担当: `src/ui/craftPanel.*`（つくる・やく のカード、光る・足りないものは赤、作れるだけのものは時計の印）, `src/ui/inventoryScreen.*`（つくる/やく のタブ、そうびのマス）, `src/ui/pickupLog.*`（拾ったログ、左はし）, `src/ui/tooltip.*`（ツールチップ）, `src/ui/hearts.*`（防具の印）, `src/ui/playOverlay.*` と `src/input/config.ts`（案内画面のタブ 4 つ）, `src/ui/itemIcon.ts`（新アイテム 22 種の和風ドット絵）, `src/world/blocks/**`（かまど・かわら・レンガのブロックの絵、かまどの火・けむり）, `src/fx/**`（M4 の音）
- 使う: `CraftSystem`, `ArmorSystem`, `Inventory`, `CraftEvent` の `pickup`

## C2 人形の動き（仕様 §2.8・§2.9、オーナー決定「プレイヤーキャラのアニメーションをいい感じに」）
- 担当: `src/camera/BlockDoll.ts` と `src/camera/` の人形まわり（武器ごとの振り: かたな＝切る、なぎなた＝突く・払う、ゆみ＝引いて放つ、ほか 歩く・ジャンプ・着地・ダメージ・やられた・拾った・作れた〈ばんざい〉。2 つの層と優先は §2.9）、手に持つ道具・武器の板の見た目、防具を着た人形、飛ぶ や の見た目（`src/fx/arrowVisuals.ts`）
- 使う: `ToolSystem.drainSwings()`, `PlayerState`, `ArmorSystem`, 出来事（`CraftEvent`, `CombatEvent`）

## L 光（オーナー決定: 「夜は明るいところ以外見えづらく。光源がなければ真っ暗でよい。マイクラと同じ仕様。スタート地点には絶対にこわれない たいまつ」）
- 担当: `src/world/light/**`（新規。`LightField` の実装: 空の光 0〜15（空の下 15、上にふさがるものがあれば 1 マスごとに弱まる。はっぱは 1 弱める）、ブロックの光（たいまつ 14、マイクラと同じく 1 マスごとに 1 弱まって広がる）、ブロックを置く・こわすと近くだけ計算し直す）, `src/world/render/**`（メッシュの頂点に空の光とブロックの光を入れ、時刻による空の明るさは材料の uniform で毎フレームかける＝作り直しなし。明るさ 0 でも真っ黒ではなく、ごくわずかに見える最低値。見た目の明るさの曲線はマイクラ風）, `src/sky/**`（いまの「材料の色に明るさをかける」仕組みのうち、ブロックはこの新しい仕組みに置きかえ。人形・妖怪・落とし物は足もとの `LightField.level` で明るさを決める）, `src/world/blocks/**` の たいまつ・こわれない たいまつ の見た目（細い棒＋炎。固くない・光る。こわれない たいまつ は少し特別な見た目＝赤いひも など）, `src/world/gen/**`（スタート地点のすぐ横に `start_torch` を置く。スタートの平らな所・出現の決まりをこわさない）, `src/yokai/ai/terrain.ts`（出現の「暗い所」を `LightField.level <= 7` に置きかえる。マイクラと同じ）
- たいまつ を置ける・こわせる処理は A（アイテムの `placeBlock: 'torch'`、レシピの works を true に）と B（置く処理）の担当。`start_torch` はかたさ null（こわれない）を PO が入れた。
- `src/contracts.ts` の `LightField` を実装する。`BlockId` に `torch`・`start_torch` を PO が足した。

**C1（画面と音）**
- `ArmorSystem` に `click(slot)`（そうびのマスのクリック。M2 §2.5 と同じ）を足す（つなぎ込みで）。`FurnaceView.get(x,y,z)` は A の `furnace.get` をそのまま渡す
- `new FurnaceFx(scene, sound)`、毎フレーム `update(dt, entries, playerPos)`（entries は置いたかまどの一覧 `{x,y,z,burning,waiting}`）
- 出来事は 1 回だけ drain して配る: `craft.drainEvents()` → `handleCraftEvents(events, {sound, pickupLog})` と C2 と テスト用の列。`tools.drainSwings()` → C1 の `playSwing` と C2 の両方
- `InventoryScreen` の 5 番目に `{craft, armor, furnaces, nameOf, rarityOf: itemRarity, placeable, onFull: () => notice.showSignal('full')}`。B の や が無い合図は `notice.showSignal('noArrow')`
- 毎ステップ `hearts.setArmor(armor.get().hudIcons)`、`CraftUiHud` を動かす
- 窓口: `createCraftUiHook(...)`、案内画面の `createGuideHook`。`playOverlay` の第 4 引数 `onTab` に `playCraft(sound, 'tab')`
- `e2e/m1.spec.ts:31` の `types.length` を新しいブロック数に直す
- `fx/craftConfig.ts` の既定値を `settings` につなぐ

## オーナー決定（A の実装のあと）: 防具は「決まった回を 0」ではなく **受けるダメージをカット**
- 受けるダメージ = max(ハート半分（体力 1）, 元のダメージ − 防具の値)。防具の値は設定（例 かぶと 1・よろい 2・両方 3。体力の単位＝ハート半分）。ふせいだときの「カキン」は、カットが 1 以上のとき鳴らす
- **妖怪の攻撃を全部 2 倍**（オーナー決定 A）: からかさ・ちょうちん・ろくろくび＝ハート 1（体力 2）、ぬりかべ＝ハート 2（体力 4）。`src/yokai/stats.ts` の `damageHearts` を直す
- `src/craft/ArmorSystem.ts` の `absorbHit()` を「カットする量を返す」形に変え、`src/combat/PlayerCombat.ts` の入口 1 か所を直す（つなぎ込みで、またはつなぎ込みの前の小さな修正で）。`contracts.ts` の `ArmorSystem` も PO の代わりに直してよい

## つなぎ込み（全員の後。担当: `src/main.ts`, `src/game/**`, `src/debug/**`, `index.html`）
- ついでに直す: `docs/tickets/M4.md` の「ついでに直す軽微なこと」

### つなぎ込みへの申し送り（PO がまとめる）
**B（道具・武器）**
- `new ToolSystemImpl({ inventory, world, player, yokai: () => yokaiManager, base: { dig: digCfg, combat: combatCfg } })`。`step()` は DigSystem の中から呼ばれる
- `DigSystemImpl` の最後の引数に `{ tools, craft, armor, onPickup }`（`onPickup(item, count)` は A の拾った出来事＝ログへ）
- `PlayerCombatImpl` に `tool: toolSystem`。A も `PlayerCombat.ts` を直すので、つなぎ込みでぶつかりを確認（B は `primaryStep`・`resolvePunch` の周りだけ）
- 窓口: `createToolHook(tool)` → `{ tool: { get }, arrows, arrowEvents }`。`combat.arrows` に `arrows`、`combat.events()` に `arrowEvents()` を足す。画面・音は `tool.drainArrowEvents()`、人形は `tool.drainSwings()`
- `settings` に `tool.config`
- `tryEquip` が成功したら手の 1 こを減らすのは A 側
**A（つくる・やく・防具）**
- `ArmorSystemImpl(inv, config)`、`CraftSystemImpl({world, inventory, drops, requestSave, config})`、毎ステップ `craft.update()`（持ち物の更新のあと）
- `PlayerCombatImpl` に `armor` と `onPickup: (i, n) => craft.notifyPickup(i, n)`。共有の DropField にも `onPickup` を渡す（妖怪のドロップもログに出る）
- `SaveManager` に `furnaces: {serialize: craft.serializeFurnaces, deserialize: craft.deserializeFurnaces}` と `armor`
- 窓口: `createCraftHook`・`createFurnaceHook`・`createArmorHook`・`createPickupHook`（`createInventoryHook(inv, screen, extras)` の extras に）
- B の `onPickup` は `craft.notifyPickup`、かまど を閉じるとき `craft.closeFurnace()`
- `combat.damage` の窓口を妖怪つき（例 `hurt(n, 'karakasa', null)`）にして `playerHit.blocked` を見られるように。`contracts.ts` の `CombatEvent` の playerHit に `blocked?: boolean` を足す（つなぎ込みで PO の代わりに足してよい）
- かまどの保存は `BLOCK_TYPES` に新ブロック（C1 が足す）が入ってから動く
**C2（人形の動き）**
- `rig.setSwingSource(() => tools.drainSwings())`、`rig.setArmorProvider(slot => armor.equipped(slot))`
- 出来事は 1 か所で drain して配る: `craft.drainEvents()` → `rig.onCraftEvent(e)`（ほかに ログ・音へも）、`combat.drainEvents()` → `rig.onCombatEvent(e)`（ほかに CombatFx へも）。**drain は 1 回だけ**にして、受け手に配る形にする
- `const av = new ArrowVisuals(); av.addTo(scene);` 毎ステップ `av.sync(combat.arrows())`
- `player.doll()` は `createCameraHook(rig).doll()` に armAnim/bodyAnim/animTick/armor/arc が入っている

## 経過
| 日付 | 内容 |
|---|---|
| 2026-10-12 | 4 担当（A・B・C1・C2）で開始 |
| 2026-10-12 | オーナー決定で 光（担当 L）を追加。たいまつ を置ける光源に |
