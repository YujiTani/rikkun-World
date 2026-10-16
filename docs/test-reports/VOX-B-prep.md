# VOX-B テストの準備（実装の前）

## 新しいテスト: `e2e/voxB-terrain.spec.ts`（26 本）
基準 4・8（6 シード）・12（6 シード＋ほる 1）・13・14（6 シード）・15・16・17・18・19。基準 23 は m7 の今のテストが受け持つ。
hook は タスク票の名前・型のとおり。進めるのは step の数だけ。

**今のコードで: 25 本が赤、1 本が緑。**
赤の理由:
- `w.seaY / loadedChunks / terrainAt / spawnInfo / startTorch / startFeatures / caveMouths / genHash is not a function`（hook がない）: AC4, 8, 12, 14, 16, 17
- AC15: `size()` が `y: 48`（352 でない）
- AC18: 島の高さが 48 のため 20 段ほれない（`dug` 12）。実装後は、スタートが 150 なので ほれる
- AC19: `save.info().saveId` がない（今は `main`・`undefined`）
- 緑の 1 本: AC13（4 方向へ歩く）。今の島でも 広場から出られるため通る（ふるまいは今と同じ。回帰の見張りとして残す）

## 直した既存テスト（今の島でも新しい世界でも通る形）
| テスト | 直し方 |
|---|---|
| `e2e/helpers/arena.ts` `floor()` | 床の上を 空（`size().y−1`）まで空気に（`opts.air` で段数も決められる） |
| `bal-a/b/c/d`・`char1`・`char1-accept`・`craft2`・`craft2-extra`・`fix82`・`m2`・`m3`・`m7`・`m72`・`w2`・`helpers/bal.ts` | じかに書いた `fill(…,9,…,20 or 40,…,'air')` を 空まで（`h.world.size().y - 1`）に（21 か所）。m7 の `T.base` は `__arena.floor(0,0,12,12)` に |
| `m1` AC1/16・AC15 | `size()` を使い、外は `size().y`・`size().x` |
| `m1` AC10/11/17/18/20（6 シード） | スタートは `spawn()` に聞く（`WORLD_CENTER` をやめた）、地面は `seaY()+2〜+12`、草原は `terrainAt`・`spawnInfo().fallback`・`startTorch()` があれば見る。AC20 は `__arena.floor(testArea)` を敷き、床 いし・空まで空気・`lightAt(6,9,6).sky === 15` |
| `m1` AC12 | はしから 2.5 の列の `groundHeight+1` に立ち、`size()` で はしを決める |
| `m1` AC14 | (6.5,6.5) の `groundHeight+1`、終わりは `y ≥ seaY()+1` かつ `onGround` |
| `m2` AC24 | 上限を `size().y`、(b) の置くブロックを `'log'` に |
| `m5` AC1/AC13、AC1(歩き) | `size()` から。立つ高さは `groundHeight+1` |
| `m5` AC6/19 | `startTorch()`（hook がなければ 今の `spawn + (2, H0+1, −1)`）から場所を決める |
| `m5` AC13 | 基準 4 の形（スタートから 8 以内の陸の列の地層・y=0 そこいし。ふるい畑の列はのぞく） |
| `m5` AC18 | `groundHeight+1` に立ち、水は `seaY()` で見る |
| `m5` AC20（VOX-F AC4） | 基準 19 の形に書きかえ: 古い localStorage は 読まない・移さない・残る・`saveId !== 'main'`。**意味が変わるので 今のコードでは赤**（`migrated:true`） |
| `voxF-save` | IndexedDB のキーを `save.info().saveId ?? 'main'` に。stone を置く所（AC5・AC3）は log / sand に |

## 消したテスト
- `m7` 「前の保存: M6 までの保存を読む（AC35）」: M6 の前の保存は もう読まない（決定 5）。`farm.makeLegacySave` も無くなる。読まないことは 基準 19 で確かめる。

## 直さなかったテスト（タスク票の表どおり）
`m1` AC2（新しい地形はシードで変わる）、`m7` AC33/AC22/AC32・スクショ（F1/F2 で今の数を守る）。

## 回した spec と結果（今のコード）
- 直した spec を全部回した: m1・m5・m7・voxF-save・smoke（55 本）→ m1 AC36（F3、500ms の待ち。もともと負荷で揺れる。元のコードでも同じく 1 回落ちた）と、意味が変わった m5 AC20 のほかは 通った。※ m5 AC13 は最初 ふるい畑（farmland）の列で落ち、畑の列をのぞいて直した。
- m2・m3・w2・fix82・bal-a〜d・char1・char1-accept・craft2・craft2-extra・m72・bucket・fixActionHint: **152 本 すべて通った**。
- `npx tsc --noEmit` も通る。

## 地形にたよる所の洗い出し（一時の書きかえ）
`generateIsland` のあとで 128×128 を y=0 そこいし・1〜40 いし・41〜47 空気に書きかえて回した（そのあと元に戻した）:
m2・m3・m7・voxF-save・w2・fix82・bal-*・char1*・craft2*・m72・bucket・fixActionHint → 167 本中 **5 本だけ落ちた**。すべて m7 の ふるい畑・やせいの やさい（島ごと消えるため。タスク票が「直さない（F1/F2）」とした AC33/AC22/AC32・AC20・スクショ）。ほかは 書きかえでも通った → 直した spec は地形にたよっていない。
- 注意: 高さが 48 のままなので、`size().y−1`（=47）までの空気。352 まで空気にした形は 実装後にしか確かめられない（fill の重さ：344 段 × 40×40）。
- 「1〜20 いし」の書きかえは 回していない（差は y=21〜40 の空気だけで、この結果と同じと見て）。
- m1・m5 は この書きかえでは 回していない（スタートや たいまつ が消えて、決め打ちでなくても落ちるため）。

## 気になった点
1. AC8 は `caveMouths()` の `y` が入り口の床か足もとか分からないので、空気の下が固いところまで下げて立つ。`room` は へやの中心の (x,z) と見て、水平に 2 マス以内で「着いた」とする。実装で形が違えば合わせる（タスク票に y の意味を書き足してほしい）。
2. AC14 の「見える」は みき 4 マスのどれかに 線を引いて、最初に当たる固いブロックが log か leaves ならよい（どの木か までは見ない）。
3. 床を空まで空気にする fill が 新しい世界では 1 回 約 58 万マス（40×40 の spec）。実装後に遅ければ `opts.air` で 段数を決める。
4. 試験中に `docs/**/*.png` が書きかわったので、`git checkout` で元に戻した。
