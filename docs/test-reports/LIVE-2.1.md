# LIVE-2.1 テストレポート（テストの準備。実装の前。tester）

- 対象: `docs/archive/design/LIVE-2.1.md` 版 1.1 §6・§6.1・§6.2。ブランチ `claude/project-thread-rcfe6n`。
- 実行: `npx playwright test e2e/live21-*.spec.ts e2e/live2-*.spec.ts e2e/live1-carry.spec.ts e2e/smoke.spec.ts`（`--workers` なし）。
  別スレッドが `src/` に さく の 板（試作）を 入れている ため、実行は HEAD（`fe454e5`）の 別 worktree で した。
- 新しい spec（6 ファイル）: `live21-flat`（AC1〜3）・`live21-throw`（AC4〜6・9）・`live21-home`（AC7・8・18）・`live21-kit`（AC10〜14）・`live21-text`（AC16）・`live21-fence`（AC15 の 当たり）。
- ヘルパー（`e2e/helpers/animals.ts`）: `snap / solidBelow / put / putKit / flight / outsideWest / carryOne / draw`。
- さく・もん の 見た目（板）は 見ない（TODO `LIVE-2.1 fence look` を `live21-fence.spec.ts` に 書いた）。当たり・ねらい・描画の 数 だけ。

## AC → テスト → 赤の理由

| AC | テスト | 赤の理由 |
|---|---|---|
| AC1 | `live21-flat` AC1(とりごや・通し)／AC1(こたつ・通し)。ユニット の 本体（判定 関数）は developer | `toriya_fence` の 上 に 置けて しまう／あな が うまらない（たいら に しない） |
| AC2 | `live21-flat` AC2 | くさ・あな が ある と `noRoom`（たいら に しない） |
| AC3 | `live21-flat` AC3・AC3b | すな／あな が ある と 置けない・こたつ は 置けない とき 合図 が 出ない |
| AC4 | `live21-throw` AC4（ひよこ・大人） | `animals.throwTo` が 無い |
| AC5 | `live21-throw` AC5・5b・5c・5d | `animals.throwSpot` が 無い |
| AC6 | `live21-throw` AC6・6b・6c | `animals.throwTo` が 無い（`bonk` も 無い） |
| AC7 | `live21-home` AC7 | 緑 に なる はず の 守り（小屋 の 子 は 出ない）。HEAD で の 結果 は 下の 表 |
| AC8 | `live21-home` AC8 | `coopEnterTicks` が 180（0 でない）・歩いて 入っても 3 秒 まつ |
| AC9 | `live21-throw` AC9 | `animals.throwSpot` が 無い |
| AC10 | `live21-kit` AC10・10b・10c | `kits()[i].eggs` が 無い・4 こ目 が 入らない 合図 `kitFull` が 無い |
| AC11 | `live21-kit` AC11（通し）・11b（マッチョ 80。今も 通る 守り） | 1 台 に 1 こ しか 入らない（`hatchStart` が 3 回 出ない） |
| AC12 | `live21-kit` AC12 | `eggs[i].wobble`・`fx().kitIcons` が 無い |
| AC13 | `live21-kit` AC13 | `kits()[].eggs` が 無い（3 こ 入らない） |
| AC14 | `live21-kit` AC14 | v 4 の `eggs` を 読み書き できない |
| AC15 | `live21-fence` AC15・15b（当たり・ねらい。今も 通る 守り）・15c（描画 +5 以内・三角形）。見た目 は TODO | 15c は 試作の 板 で +4 に 2 割 |
| AC16 | `live21-text` AC16（合図 3 つ の 文・3 つ の 大きさ）・AC16b（案内画面 2 行） | `kitFull` が 無い・文 が 古い・案内画面 に 新しい 2 行 が 無い |
| AC17 | オーナー確認（テスト なし） | ― |
| AC18 | `live21-home` AC18・18b | 入った ステップ に `home` に ならない |

## こわれる 既存テストの 直し（消した もの は 無い）

| テスト | したこと | 理由（§6.1） |
|---|---|---|
| `live2-coop` AC7b | 柱 を `brick` に・あな を 深さ 3 に | 浅い あな・いし は 置ける ように なる（LIVE-2 AC7） |
| `live2-coop` AC9 | 90/179/180 と 「120 で 出る」を 消し、入った ら すぐ `home` に | LIVE-2 AC9 |
| `live2-coop` AC9b・AC10・AC29・AC19(小屋) | 「おろす」を なげる に（着地 まで すすめる・外 の 位置 を 遠く） | LIVE-2 AC10・LIVE-1 AC19 |
| `live2-coop` AC29c | 変更 なし（`coopEnterTicks` を 大きく して 「中途 の なかま」を 作る。実装 が 設定 を のこす 前提） | ― |
| `live2-kit` AC2・AC2b・AC20 | 2 回目 の egg は 入る（kitWait は トマト で）・照準 `いれる`／`いっぱい` | LIVE-2 AC2・AC20 |
| `live2-gold` AC25 | あな を 深さ 3 に | LIVE-2 AC7 |
| `live2-text` AC25b | `kitFull` を 足し、kitWait を トマト に | LIVE-2 AC25 |
| `live1-carry` AC18・AC19・AC20 | AC19 は 「3 マス先 → 10 ステップ で `toss`」に。AC18 は 着地 まで すすめる。AC20 は なげた あと の パタパタ | LIVE-1 AC19・AC20 |

## 開発に 頼む 窓口（仕様 §6.2 の 名前どおり）

- `animals.throwSpot()`・`animals.throwTo(x, y, z)`（足の 点）・`events()` の `toss {id, to}`／`bonk {id, x, y, z}`・`list()[].state === 'thrown'`。
- `animals.kits()[].eggs[{egg, left, wobble}]`（先頭 の 前の 形 も のこす）。`fx().kitIcons`・`fx().homePop`・`fx().dust`。`lastHint()` の `kitFull`。
- `serialize()/deserialize()` の v 4（`kits[].eggs`）。
- `animals.fx().kitEggMeshes`（こたつ の 中 の たまご の 3D の 物 の 数。いつも 0。PO 決定。仕様 §6.2 に 1 行 足した）。
- `world.renderKind(x, y, z)`: 'panel'（さく・もん）／'cross'（草花）／'box'（ねぐら・すばこ など）。`live21-fence` AC15d が 見る。
- 照準で さく ごしに 中 の 床 を ねらえる か は 画面の 高さ しだい。AC4 は `throwTo` で 見た。AC17 (2) で オーナー確認。

## 結果（HEAD `fe454e5` の 別 worktree・`--workers` なし）

- 新しい spec: 25 本中 **赤 20**・緑 5。緑 5 は 今の ゲームでも 通る 守り: AC7（小屋の 子は 出ない）・AC11b（マッチョ 80）・AC15（当たり・ねらい）・AC15b（さく は こえられない）・AC18b（つまっても ワープ しない。今は 子 の 設定上 通る。AC18 本体 が 赤）。
- 直した 既存テスト: 赤に なる のは 仕様が かわった 所 だけ（`live1-carry` AC19、`live2-coop` AC9、`live2-kit` AC2b・AC20、`live2-text` AC25b）。ほか（`live2-coop` AC7b・AC9b・AC10・AC29・AC19(小屋)、`live2-kit` AC2、`live2-gold` AC25、`live1-carry` AC18・AC20）は 今も 緑。
- 手つかず の テスト は 緑（live2-chick・smoke 含め 57 本 緑）。`live2-gold` AC21 は 並列 実行で 1 回 だけ 落ち（kits 0）、単独 では 緑（負荷 による ゆれ。内容は 変えていない）。
- `npm run check:fast`（型＋ユニット 3,822）緑。
- 注意: AC15c の 描画回数 +5 は 板 の 試作（+4）に 2 割。見た目 が 決まって 絵 が かわったら 測り直す。
- 注意: AC29c は 実装 が `coopEnterTicks` を のこす 前提（のこさない なら 「中途 の なかま」を 別の 方法で 作る）。

## 差し戻し（code-reviewer）への 直し（第 2 回）

| # | したこと | 結果 |
|---|---|---|
| 1 | `live21-kit` AC10: 3 回目 の tap の すぐ あと（step の 前）に eggs を 読む | 赤（`eggs` が 無い） |
| 2 | AC12 に `fx().kitEggMeshes === 0`。仕様 §6.2 に 1 行 | 赤（窓口 が 無い） |
| 3 | `live21-home` AC8: `homeAtEnter` は `toBe(r.cid)`（直してあった） | 赤（`coopEnterTicks` 180） |
| 4 | AC18b: LIVE-1 AC11b と 同じ かべ の 向こう で 近づけない 形（stuck）。対の 外 の なかま が stuck で warp する こと（120〜240 ステップ）と、距離 は `animalWarpDist` 以内 を assert | 緑（守り。今の ゲームでも 小屋 の 子 は warp しない・対 は warp する） |
| 5 | AC10c: egg を さきに、つち を 最後 に して `aimed` を assert | 赤（`eggs` が 無い） |
| 6 | `live1-carry` AC19 に `carryDown` を のこした（`toss` は 足す だけ）。`live2-text` AC25b の 立ち位置 を 元に もどした。`live2-coop` AC9 に `markSteps` null を もどした（`follow` 「出れば なかま」は 仕様で 消えた ので もどさない） | AC19・AC9 は 赤、AC25b は `kitFull` で 赤 |
| 7 | `live21-fence` AC15c: 描画回数 は 「前の 箱 の さく より ふえない」。箱 の さく（c96d19a）で はかった 小屋 3 つ の ふえ = +4（三角形 +996）を 上限 に | 緑（板 の 試作 も +4） |
| 8 | 決まった 形（9dc0f0c）を ユニット `src/world/render/coopPanels.test.ts` で 見る（さく=板 2 面・高さ 12/9・マス 中央・角 L 4 面・もん=板＋くい 2 本で 6 面・はば 1.5・高さ 1.8・もん の 上 は 0 面・箱 の 面 0）。E2E は `world.renderKind`（AC15d） | ユニット 7 本 緑（試作 が もう 入っている ため）／AC15d 赤（窓口 が 無い）。絵 は UI 検査 と AC17 |
