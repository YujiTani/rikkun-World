# VOX-I-1: 12 の国の地形（#184）

| 項目 | 内容 |
|---|---|
| マイルストーン | VOX（親 #99） |
| issue | #184 |
| 状態 | テストの準備（赤）→ 開発へ |
| 周回数（全ループ合計） | 0 / 10 |

## 関連
- 仕様書: `docs/design/VOX-I.md`（5 版）§3・§5・§8.1・§8.2・§9 の `#184-AC*`。試作の数（参考。期待の数は仕様から取る）: `/mnt/project-files/biome/README-W.md`
- 指摘台帳: `docs/loop-ledger/VOX-I-1.md`

## 受け入れ基準と層・テストの場所
ユニット = `src/world/gen/biome.test.ts`（3 シード 20261012・1・777、8192 四方）。ブロック = `src/world/blocks/biomeBlocks.test.ts`。E2E = `e2e/voxI1-biome.spec.ts`（準備は `e2e/helpers/biome.ts`）。

| AC | 層 | テスト |
|---|---|---|
| #184-AC1 作る順に関係なく同じ | ユニット | biome.test.ts「AC1」（覚えを捨てて逆順）＋ config の数（升目 112・点 28〜84・blend 14・順位表 101 こ・startForce 80） |
| #184-AC2 8 国 12.5% | ユニット | 「AC2」（シードごと ±4・3 つの平均 ±2） |
| #184-AC3 山のわく | ユニット | 「AC3」（わく・こうほ・まわり 12 升目・4 種 15〜35%） |
| #184-AC4 山 12%・すな・ゆき | ユニット | 「AC4」（陸の列・境目 e<blend は のぞく） |
| #184-AC5 はじまりの国 | ユニット | 「AC5」（328 以上・fallback false） |
| #184-AC6 境目 | ユニット | 「AC6」（持ち上げ 0・高さの差 4 以下） |
| #184-AC7 / AC7b 山の頂上・形 | ユニット | 「AC7」「AC7b」 |
| #184-AC8 720 ブロック | ユニット | 「AC8」 |
| #184-AC9 1 列の数・いけ | ユニット | 「AC9」3 本 |
| #184-AC10 ブロックの役わり | ユニット | biomeBlocks.test.ts |
| #184-AC11 木の はっぱ | ユニット | 「AC11」 |
| #184-AC12 たけやぶ の道 | ユニット | 「AC12」 |
| #184-AC13 すなはま 5 割 | ユニット | 「AC13」 |
| #184-AC14 12 国へ行く | E2E 1 本 | voxI1-biome.spec.ts |
| #184-AC15 三角形 903,036 以下 | E2E（`npm run perf`） | 性能ループで PO が数える（ここでは書かない） |
| #184-AC16 見た目 | UI 検査＋オーナー | テストの準備では書かない（試作スクショはオーナー確認済み） |
| #184-AC17 ふだ | E2E 1 本 | `test.fixme`（オーナーが「入れる」と決めたら test にする。VOX-I §11-3） |
| #184-AC18 ふだ 1 行 | UI 検査 | 同上 |

## つなぎ目（developer がこの名前・形で作る）
**純粋な関数（新しい `src/world/gen/biome.ts`）**。`seed` を第 1 引数に。`clearTerrainCache()` で覚えを捨てても同じ答えになること。
- `type CountryKind = 'harappa'|'mori'|'ookina'|'hana'|'sunahama'|'susuki'|'take'|'kappa'|'iwayama'|'tengu'|'momiji'|'yuki'`、`COUNTRY_KINDS`（12 こ）、`MOUNTAIN_KINDS`（iwayama・tengu・momiji・yuki）。
- `countryAt(seed,x,z) → { kind, cx, cz, e, mountain }`（cx,cz = 升目の番号。e = 2 番目に近い点までの距離 − いちばん近い点までの距離）。
- `countryCell(seed,i,j) → { px, pz, kind, mountain, startForced }`（`startForced` = はじまり（§3.5）で はらっぱ に かえた升目。山の升目の点は 山の点）。
- `mountainFrame(seed,fx,fz) → { start, candidates: {i,j,above}[4], mountain: null | {i,j,px,pz,kind} }`（fx = floor((i+2)/4)。`i,j` = 山の 2×2 の左上の升目、`above` = こうほ の点の大陸の高さ − 海面）。
- `groundAt(seed,x,z) → { h, base, lift, top }`（h = 生成の高さ。base = ふつうの高さ〈山の形・かっぱの持ち上げの前〉。lift = かっぱの持ち上げの量。top = 地面のいちばん上の `BlockId`〈木・たけ は含めない〉）。
- `mountainShapeAt(seed,x,z) → null | { m, d, kind, px, pz }`（いちばん近い山の点から 200 以内。m = 山の形 M の高さ〈y。ざらざら込み・整数〉、d = 点からの距離）。
- `pondsOf(seed,i,j) → { pointOnLand, ponds: {x0,z0,x1,z1,mandatory}[] }`（かっぱ以外は `ponds: []`。x1,z1 を含む）。
- `takePath(seed,cx,cz) → {x,z}[]`、`columnCounts(seed,cx,cz) → { trees, bigTrees, take, flower, susuki }`（trees は 大木をふくむ数）。
- `Tree`（`trees.ts`）に `leaves: 'leaves'|'momiji_leaves'|'matsu_leaves'` を足す。
- `GEN_CONFIG.biome` に `cell 112`・`pointMin 28`・`pointSpan 56`・`blend 14`・`startForce 80`・`rankTable`（101 こ）。
- `terrain.ts` の `terrainAt().biome`・`WorldHook.terrainAt` の型は `CountryKind`（`BiomeKind` を置きかえ）。`spawnOf(seed).fallback` は今のまま使う。

**ブロック**（`BLOCK_TYPES` のうしろに足す。保存の番号を変えない）: `snow`・`momiji_leaves`・`matsu_leaves`・`flower_*`（ちょうど 3 つ。色の名前は art に任せる）・`bamboo`・`susuki`。役わりは VOX-I §5。`src/dig/config.ts` に `NO_DROP_BLOCKS: ReadonlySet<BlockId>`（中身は `susuki` だけ。こわすと 持ち物がふえない）。`itemType(id).placeBlock === id` になるのは snow・momiji_leaves・matsu_leaves・flower_*・bamboo。

**`window.__rikkun.biome`**（§8.1・§8.2）: `at(x,z)`・`here()`・`find(kind, from?) → {x,z}`・`take.path(cx,cz)`。ふだ（入れるなら）: `found()`・`setFound(kinds)`・`plate() → {visible,kind,shownCount}`・`celebrated()`。

## 気づいたこと（実装が決めてよい・PO へ）
- 仕様の書きもれ（軽微）: すな の「ほかの国に 0 こ」は 陸の列（海から +2 以上）で見ている。海の底の すな（今は どの国も すな）は 対象にしていない。
- AC14 は 12 の国へ歩かずに運ぶ。いまのゲームは 読みこみが 128×128 の固定（VOX-D のストリーミング前）なので、遠い国の列が読みこまれない（`isLoaded` が false のまま）。VOX-D が先でなければ、developer は PO に知らせる（テストは 600 回 step して待ち、`loaded` が false なら赤）。
- AC15（三角形）・AC16（見た目）は 性能ループ・UI 検査・オーナー確認。

## 直した既存テスト
| テスト | 直し方・理由 |
|---|---|
| `src/world/gen/terrain.test.ts` 基準 10（4 本 → 2 本）、基準 3/11 の `'grassland'` | 森 25〜45%・森が 1 つ以上・森の重みが なめらか（2 本）は 国が 12 になって意味がなくなったので **消した**（代わりに AC2・AC5・AC6）。升目の点は 16〜111 → 28〜84（升目 112）に直した。`'grassland'` → `'harappa'` |
| `src/world/gen/generateChunk.test.ts` 基準 4・9 | 木の数え方を `countryAt` の はらっぱ／もり（境目をのぞく）に。地層は 陸の上が くさ・すな・ゆき・いし のどれでもよい形に（山の上 SEA+70 の決めうちを消した） |
| `src/world/world.test.ts` | `blockTypes()` の数 31 → `BLOCK_TYPES.length`。偽の hook の biome を `'harappa'` |
| `src/save/blockIdsV1.test.ts` | 「BLOCK_TYPES と同じ並び」→「はじめの 31 こ が同じ」（新しいブロックは うしろに足す） |
| `e2e/m1.spec.ts`・`e2e/voxB-terrain.spec.ts` | スタートの国 `'grassland'` → `'harappa'`、遠くの国は 12 の名前のどれか |
| 見ておく（直していない） | `e2e/m5.spec.ts` の `reg.mountain.peak`（`mountain.peak` 50 → 20 で山の高さが変わる。regions は 仮のまま〈populate.ts〉。落ちたら開発が regions の選び方を直す）。新しいブロックは 絵〈タイル〉がないと 落ちる既存テスト（`world.test.ts` の BLOCK_TILES など）があるかも → #185 とのつなぎ目 |

## 経過（PO が追記）
| 日付 | ループ | 結果 | メモ |
|---|---|---|---|
| 2026-10-17 | test 準備 | 赤を確認 | ユニット 2 ファイル（biome.test.ts・biomeBlocks.test.ts）と E2E 1 本が、実装なしで落ちる |
