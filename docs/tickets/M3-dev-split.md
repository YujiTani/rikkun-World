# M3 開発の担当分け（開発ループ 1 周目）

仕様: `docs/design/M3-combat.md`（第 2 版、付録 A）と `docs/design/M3-yokai-candidates.md`（第 2 版、形・攻撃・強さの表）。つなぎ目: `src/contracts.ts` の M3 の節（PO が決めた型。変えない）。
予算節約のため 3 担当（付録 A の「人数を減らすなら」の案）。

## 共通
最初に `CLAUDE.md`、このファイル、`src/contracts.ts` を読む。仕様書は自分の担当の節だけ読む。担当ファイル以外は編集しない。自分の worktree のブランチに最後にコミット（push しない）。確認は `npm run check:fast`（E2E は回さない）。相手のものは contracts の形の仮のものでテストする。各担当の数値は自分の `config.ts` に 1 か所でまとめ、名前は仕様 §4 の「設定の名前」にそろえる（`settings.*` へはつなぎ込みで出す）。テスト用窓口は `create〇〇Hook(...)` で中身を返す（`window` には付けない）。返答は「作ったファイル・要点・テスト結果・ブランチ名・つなぎ込みへの申し送り・仕様の問題」を短く。

## AD 時間と空＋画面と音（仕様 §2.2・§3・§4.1・§3.3〜3.7）
- 担当: `src/time/**`（`TimeOfDay` の実装、`createTimeHook` → `time.*`）, `src/sky/**`（空・かすみ・明るさ・おひさま／おつきさま。ブロックと人形を暗くする方法は、既存のマテリアルを直接書きかえず、ここで「明るさを渡す仕組み」を作る。必要な既存ファイルの最小の変更はつなぎ込みへの申し送りに書く）, `src/ui/hearts.*`, `src/ui/clock.*`, `src/ui/deathScreen.*`, `src/ui/homeNotice.*`, `src/fx/combatFx.ts`（ダメージのふちピンク・ハートがはじける・ふくろの光の柱・パンチのうで・M3 の音。画面全体の点滅はしない）, `src/ui/itemIcon.ts` と `src/camera/BlockDoll.ts` の「ようかいだま」の絵・持ち方（今は石で仮表示している所）
- 使う: `TimeOfDay`, `YokaiWorld.drainEvents()`, `PlayerCombat`（`hp`, `drainEvents()`）

## B 妖怪（仕様 §2.3〜§2.5・§2.9 の妖怪がわ・§4.2〜§4.4、候補書）
- 担当: `src/yokai/**`（モデルは見本で作った `src/yokai/models` を使い回す。`src/yokai/ai/` に出現・AI・攻撃の当たり・火の玉・たおれる・帰る・頭の上のまる、`YokaiWorld` の実装、`createYokaiHook` → `yokai.*`）。`src/preview/**` は壊さない程度に追従してよい
- 使う: `TimeOfDay`（夜だけ出る、朝に帰る）, `VoxelWorld`, `() => PlayerState`, `PlayerCombat.damage()`, `Inventory`（ようかいだまを入れる）, `IslandInfo.spawn()`（おうち）, 乱数はシード付き
- 当たりの箱は仕様 §4.4（からかさ・ろくろくびのからだは高さ 1.8、目より上）

## C プレイヤーの戦い・体力・やられる（仕様 §2.6〜§2.8・§2.10・§4.5・§4.6）
- 担当: `src/combat/**`（`PlayerCombat` の実装、パンチ、体力・むてき・回復、やられた・落とす（えらんでいるマスは守る、50%）・ふくろ・拾う・復活、ふくろの保存、`createCombatHook` → `combat.*`）、`src/dig/DigSystem.ts` の **`primary` の入口だけ**（線上で妖怪がブロックより手前ならパンチ、いなければ M2 のほる。妖怪の箱の所にはブロックを置かない）、`src/inventory/items.ts`（ようかいだま `yokai_orb` を足す。置けない、名前 ひらがな）、`src/save/**`（ふくろの保存を足す）
- 使う: `YokaiWorld`（`raycast`, `damage`, `occupies`）, `Inventory`, `PlayerController`（復活で位置を戻す。`src/player` は読むだけ。必要ならつなぎ込みへ申し送り）

## つなぎ込み（AD・B・C の後。担当: `src/main.ts`, `src/game/**`, `src/debug/**`, `src/ui/hud.ts`, `src/ui/style.css`, `index.html`）
- 申し送りはこのファイルに PO がまとめる。ついでに直す: `settings.set('rarity', ...)` が文字列を受け付けない、M2 コードレビュー軽微 2〜4（`docs/loop-ledger/M2.md`）。

### つなぎ込みへの申し送り（PO がまとめた。B の分はあとで足す）
**C（戦い）**
- 循環をさけるため `PlayerCombatImpl` を先に作り、`yokai: () => yokaiWorld` で後から返す: `new PlayerCombatImpl({ world, player: {get: () => controller.state, set: controller.set}, inventory, yokai, spawn: () => island.spawn(), closeInventory: <D の閉じる>, requestSave: () => save.saveIfChanged() })`
- `new DigSystemImpl(..., createDigConfig(), 既定の rng, combat)`（最後の引数がパンチの入口）
- 毎ステップ: `controller.update` → `dig.update`（中で primaryStep）→ `combat.update()`
- `SaveManager` に `bags: { serialize: () => combat.serializeBags(), deserialize: d => combat.deserializeBags(d) }`。combat は `save.load()` より前に作る
- `settings` に `combat.config`。時間が止まっているあいだは `combat.update()` を呼ばない
**AD（時間と空・画面と音）**
- 毎ステップ: `time.update()`、`sky.update(game.camera)`、`combatFx.update(dt)` は DigFx の `fx.update` の直後・`rig.update` の前
- `new Sky({scene, time, timeSettings: time.settings, lighting})`。`CombatFx` に `bags: () => combat.bags()`, `doll: rig.doll`, `view: rig`, `onPickup: (i, n) => hotbar.pickup(i, n)`。`createCombatUi(hud)`
- 明るさの登録: `WorldRenderer` に材料の取得口（例 `materials()`）を足して `lighting.register(m, 'block')`、`buildScenery` の海・海の底も `'block'`、人形は `lighting.registerTree(rig.doll.group, 'doll')`。色を後から変えるときは `lighting.setBase`
- `settings` に `createTimeSettings()` の入れ物
- CSS: `#notice-name` の bottom を 90px ほど上げてハートと重ならないように。`#clock` と F3 の表示が重なるなら調整
- **昼夜の長さを変える（オーナー決定・最新）**: ひる 15 分（54,000）・ゆうがた 1 分 30 秒（5,400）・よる 7 分 30 秒（27,000、ひるの半分）・あさ 1 分 30 秒（5,400）、1 日 25 分 30 秒（91,800 ステップ）。`src/time/config.ts` の値と、その値を決め打ちしているテスト（`src/time/time.test.ts` など）を直す
- 「もちもの が いっぱい」の合図は `notice.showSignal('full')` を、妖怪のドロップが入らなかったときに呼ぶ
**B（妖怪）**
- `new YokaiManager({ world, time, getPlayer, combat, inventory, tick: () => game.tick + 1, seed, config })`、`scene.add(m.group)`、毎ステップ `m.update()`（プレイヤー更新のあと、`dig.update` のまえ）。`createYokaiHook(m)` → `yokai.*`。`m.config` を `settings` に
- C の `PlayerCombatImpl` の `yokai: () => m`
- `settings` の名前の重なり: `knockback` が B と C の両方にある。1 つにまとめ、値を両方に渡す
- 「もちもの が いっぱい」: B のテスト窓口の `drop` イベント（`added < count`）か、`defeat` で入りきらなかったときに `notice.showSignal('full')`
- 妖怪の暗さは B が `time.dollBrightness()` で自分でかける（AD の lighting に二重登録しない）
- **PO の判断**: 出現の「屋根の下」の判定で **はっぱ は屋根に数えない**（木の下は明るい。ひるに木の下から妖怪が出ないように）。`src/yokai/ai/terrain.ts` の屋根の判定を直す（このつなぎ込みで許可）
- ちょうちんの止まり位置 4.3 は B の判断で OK

## 経過
| 日付 | 内容 |
|---|---|
| 2026-10-12 | オーナー決定を途中で反映: 昼 5 分・夜 2.5 分、出現は暗い所にランダム（おうちなし）、AI は距離だけ、パンチは手前のものが受ける、ドロップ表（新アイテム 6 種） |
| 2026-10-12 | C・AD 完了・取りこみ（ユニット 374 件） |
| 2026-10-12 | 3 担当（AD・B・C）で開始。`ItemId` に `yokai_orb` を足すための型の最小修正を PO が先に入れた（inventory/items.ts, ui/itemIcon.ts, camera/BlockDoll.ts） |
