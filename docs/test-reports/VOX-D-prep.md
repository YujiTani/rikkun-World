# VOX-D テストの準備（実装の前。rule #102）

issue #94 / 仕様 `docs/tickets/VOX-D.md`。ブランチ claude/project-thread-kfvgqc。

## 書いたテスト（基準 → テスト）
| 基準 | テスト | 場所 |
|---|---|---|
| 5 | 起動 ready で 25 列は本当の段・81 列 meshed（seed 既定・1・3）／`?streamWork=1` で ready まで 1 step ずつ位置が変わらない（p は減らない・p=1⇔ready も） | `e2e/voxD-stream.spec.ts` |
| 6 | 動かない起動 → `settle({full})` で 289 列・meshed 169・lit 以上 225 | 同上 |
| 7 | `setStreamWork(4)` で 北へ 1,200 step、毎 step 北 7 列先まで `isLoaded`・持つ列 441 以下。止まって 10 以内だけ・8 以内は全部 | 同上 |
| 8 | `findLand`（P）へ teleport → 60 step で onGround・足 = groundHeight+1 ±0.01・スタートの列は読みこまれていない・全列 `hash===genHash`（seed 既定・2） | 同上 |
| 9 | 3 マス置く → P → `hasChunk`・`writes` ふえる → もどって hash が同じ | 同上 |
| 10 | P で 20 段ほる（立つ所は列のすみ）→ メッシュ待ち 0 → かべの tier ≠ none → `save.now()` → 読みなおし: 中心 P・位置 ±0.01・hash・畑（till/plant）が同じ | 同上 |
| 13 | `?nosave=1` で 9 と同じ手順 → hash が同じ。読みなおすと genHash と同じ | 同上 |
| 14 | pagehide の保険。スタートから 300 はなれた列に 1 マス置いて閉じる → ready のあと当たっている・最初の保存のあと保険が消える・もどっても残る | `e2e/voxF-save.spec.ts` AC5（書きかえ） |
| 15〜18 | 1 本の流れ（W=1200）。妖怪 2・ふくろ（死んでばらまく）・たんす 3 しゅるい・かまど・ぬれた畑（段 1）→ P → 15 → W step → もどる → 16（同じ場所・同じ中身・のこり時間は経過 tick ぶん）・17・18（水を消して 65 step で かわく） | `e2e/voxD-stream.spec.ts` |
| 20 | regions・`farm.placement`・`caveMouths` が 起動・teleport・読みなおしで同じ、R の中（seed 既定・1〜5） | 同上 |
| 21 | ready で ふるい畑のマス全部・やせいの やさい が `getBlock` である。ready のあとの `rebuildLog` に置きものの セクションがない（seed 既定・1） | 同上 |
| 22 | スタートから 4〜6 列の置きものの無い 10 列で hash===genHash（grep のユニットは開発） | 同上 |
| 23 | `teleport(29990, 100)` → fill で床 → 東へ 600 step → x=29999.7±0.01、ななめに おしつけると z は動く、x=30000 は set できない | 同上 |
| 24 | `?streamWork=1` 起動: ことば・ブロック 5・できた数=floor(p×5)・押してもロックしない・タブ切替・ready の次のコマで字がもどる | 同上 |
| 25 | teleport(P) → `setStreamWork(1)` → `player.respawn()`: 29 step でカード無し・31 step で有り、動かない・HP 同じ、そろったらスタートの地面の上・カード消える、近くのもどりはカード無し | 同上 |
| 26 | UI 検査に 2 行（`prep-boot`・`prep-card`） | `e2e/ui-gate.spec.ts` |

共通の準備: `e2e/helpers/stream.ts`（`openStream`・`openBooting`・`settleWorld`・`findLand`・`flatNearStart`・`drainRebuilds`・画面のセレクタ `PREP`）。

## 直した既存のテスト
| テスト | 直し方 | 理由 |
|---|---|---|
| `voxB-terrain.spec.ts` AC15 | 範囲の外を x=±100000 で確かめる。size は y だけ | 128 の固定をやめた |
| `voxB-terrain.spec.ts` AC16 | 「64 列」→「動かない起動で 289 列（スタートから 8 以内）」 | 同上。海のふちは 基準 22 |
| `m1.spec.ts` AC1/AC16・AC15 | 範囲の外の x を 100000 に。size は y だけ | `size().x` が動く |
| `m1.spec.ts` AC12 | 4 方向へ 300 step、毎 step `isLoaded`・落ちない | はしの海が無い |
| `m1.spec.ts` AC14 | `terrainAt` で近い海を さがし teleport で立つ（400 以内）。seed 既定の最も近い海は約 226 ブロック先 | R の中に海が無い（下の「仕様で分からない所」1） |
| `m5.spec.ts` AC1/AC13 | size.x/z=128 を消す | 同上 |
| `m5.spec.ts` AC1(歩き) | 「0.3〜size−0.3」→「壁 ±30,000 の中・読みこんだ列の上」（`wall()`） | 同上 |
| `voxF-save.spec.ts` AC1 | hash 比べの前に `settle({full})` | 読みこんだ列の数が毎回ちがうと全体のハッシュが比べられない |
| `voxF-save.spec.ts` AC5 | 基準 14 の形に書きかえ | 仕様どおり |

消したテスト: なし。

## 今は消さずに残したユニット（実装のコミットで開発が直す）
生きているコードのテストを今消すと 無検査になるので、`src/` を直す同じコミットで消す・書きかえる。
- `src/world/gen/startArea.test.ts` の `LOAD_BOUNDS`・`edgeDistance`・`edgeHeight`・`generateLoaded`・`mouthsInBounds`（海のふち・読みこみ範囲の口）を使う所（行 6, 29, 141〜223）→ 消す。理由: 海のふちは VOX-D でやめた。新しい形は基準 1〜4・20・22。
- `src/world/gen/populate.test.ts`「山の頂上は 読みこみ範囲（はしから 16 より内）」「読みこんだ列 64」→ R（G1）に読みかえ。
- `src/world/gen/farmPlacement.test.ts`（`populateWorld` の 64 列で調べる）→ 高さだけの `placement(seed)` に。
- `src/save/backend.test.ts` の `readAll` は backend が残る間はそのまま。起動で `readAll` を使わない確認は基準 11（開発が書く）。`restore.ts` の専用ユニットは今は無い。
- `populateWorld(w, seed)` をにせの世界に使うユニット（`exposure`・`seeThrough`・`sectionLight`・`lightPerf`・`meshVoxel`・`meshBoundary`・`SaveManager`）は 関数が残る限りそのまま。

## こわれそうな既存 E2E（洗い出し: `grep -rn "size()\.\(x\|z\)\|127\|128\|loadedChunks\|edgeHeight\|LOAD_BOUNDS" e2e`）
- `e2e/helpers/aim.ts` `standOnGround`: `size().x/z` で床を切る。x0 を 0 で切るのでスタートの近く（x<12）だけ床が欠ける。ストリーミングで負の座標も読みこまれるので、`size` の切りを外すのがよい（今は直さない・結果は変わらない見込み）。
- `e2e/helpers/shadow.ts:51`: `0〜size().x−1` の範囲で走査。x・z が負のまわりを見なくなるだけ。
- `e2e/voxB-terrain.spec.ts` AC19 と `m5.spec.ts` の古い保存（`size: [128, 48, 128]`）: 古い形の保存を置く入力なので そのまま。
- `__rikkun.ready` を待たずに `__rikkun` を使う spec は見つからなかった（全 spec が `ready === true` を待つ）。
- 起動の 289 列は ready の時点では そろわない（半径 6 まで）。`loadedChunks()` や全体の `hash()` を ready 直後に使う spec があれば 落ちる見込み（見つけたのは voxF-save AC1 だけ・直した）。`voxE-mesh.spec.ts`・`light2-empty.spec.ts` の `world.hash()` 全体や `sectionStats()` 合計は CI で確認。

## 赤の確認（実装なし）
`npx playwright test e2e/voxD-stream.spec.ts`: 24 本中 24 本が赤。理由は窓口が無いこと（`world.teleport/stream/settle/setStreamWork/wall is not a function`・`__rikkun.world.stream` が置かれない）。
書きかえた既存: m1 AC14（teleport）・m5 AC1(歩き)（wall）・voxB AC16（settle）・voxF-save AC1・AC5（settle）が赤。m1 AC1/AC12/AC15・voxB AC15・smoke ほかは緑のまま（m1・m5・voxB・voxF・smoke の関係テスト 31 本中 26 緑・5 赤）。

## 仕様で分からなかった所
1. **R（±64）の中に海が無い**。seed 既定で スタートからいちばん近い海は約 226 ブロック。仕様の「m1 AC14 は R の中から `sea===true` の列をさがす」は成り立たない → teleport で行く形に変えた（デザインへ）。
2. **じゅんびちゅうの DOM の名前が仕様に無い**。`.prep-text`・`.prep-block`（できた物は `data-done="true"`）・`.prep-card` と決めて `e2e/helpers/stream.ts` の `PREP` に書いた。開発はこれに合わせる（変えるなら PREP を直す）。
3. 基準 8 の「足の高さ = groundHeight + 1」は P の列の中央のマス（x = cx×16+8.5）で見る。基準 5 の「本当の段」は `sectionInfo().dist` と `sectionStats().microR`（32）・箱 48 から出した（境目のずらし ±2 は起動直後は無い前提）。
4. 基準 21 の `rebuildLog` の x・y・z は セクション番号と読んだ（違えば テスト側を直す）。
5. 基準 23 の「妖怪は壁の外へ歩かない」は E2E に入れていない（ユニットに任せる。壁ぎわで妖怪が壁へ歩く場面を作りにくい）。
6. 基準 16 は ふくろの のこり時間を「経過した `tick()` ぶん」で比べた（W step ＋ settle の step）。
