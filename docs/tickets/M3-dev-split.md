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

## 経過
| 日付 | 内容 |
|---|---|
| 2026-10-12 | 3 担当（AD・B・C）で開始。`ItemId` に `yokai_orb` を足すための型の最小修正を PO が先に入れた（inventory/items.ts, ui/itemIcon.ts, camera/BlockDoll.ts） |
