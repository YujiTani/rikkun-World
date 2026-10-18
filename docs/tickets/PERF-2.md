# PERF-2: 小ブロックのメッシュ 1 セクションを 途中で止められる仕事に分ける（歩く間の 1 コマ p95 を 8 ms 以下に）

| 項目 | 内容 |
|---|---|
| マイルストーン | 性能（#201。#98 の一部） |
| 状態 | 開発待ち |
| 周回数（全ループ合計） | 0 / 10 |

## 目的（オーナーの言葉で）
issue #201「歩いている間の 1 コマ p95 が 50〜64 ms（目標 8 ms）。小ブロックのメッシュ 1 セクションが中央値 44〜51 ms で、途中で止められない」。
受け入れ（目安）: 歩いている間の 1 コマ p95 が 8 ms 以下（クラウドの perf で）。見た目は変わらない。

## なぜ（数。/mnt/project-files/perf-budget/REPORT.md・perf-results/budget-scene-*-off.json）
- 歩く 600 コマ（はらっぱ・もり・よる）で、小ブロックの作り直しは 77 / 88 / 111 回。中央値は 43〜45 ms、p95 は 101〜113 ms、合計は 3.7〜5.2 s。全部が「箱 → 小ブロック」の差しかえ（`upgrade`）。
- `WorldRenderer.build` は 1 回で 1 セクションを作り切る。ChunkStream の「予算 0 でも 1 つは進める」決まりのため、1 つが 8 ms より大きいと止められない。
- 1 セクションの中身: `fillBlockLook` 約 34%、`meshMicro` の面づくり 約 37%、`packOccupancy` 約 14%、残り（読む・地形・extras）約 15%。
- ほかの 1 コマの仕事: 箱 1 つは p50 1〜2 ms・最大 13.5 ms。`lightColumn` は p50 6〜7 ms・8 ms 超えが 600 コマ中 9〜18 回（これはこの票では分けない）。
- PERF-1（#200）のマージで段はプレイヤーの位置から決まり、小ブロックの半径は 28 になったので、上の数は少し変わっているはず。**作業 0 で今の main を測り直して、前の値とする**。

## 方針（A を選んだ）
- **A: 1 セクションの作り直しを、続きから再開できる仕事（ジョブ）にする。** コマの締め切りが来たら止めて、次のコマに続きを作る。出力は止める所によらず、今の `build()` とバイト単位で同じにする。
- **B（Worker、#98）はこの票ではやらない。** 理由:
  - (1) `budget.perf.ts` の歩く測りは同期の `step(1)` を 600 回回すので、Worker の結果が届かず p95 が測れなくなる。
  - (2) `page.route` で足している計測と `window.__prof` が Worker の中に届かない。
  - (3) count の時計（E2E）のためにメインスレッドで作る道が残る。
  - (4) スナップショット・`MeshData` の型付き配列への直し・古くなった結果の捨て方・settle の await と、変える所が多い。
  - B の効き目（着いた時の 5〜9 s を並列で約 1/3）は、この票のあとに Mac で測った数を見て PERF-3 で決める。この票の「段（phase）」の切れ目が、そのまま Worker に出す単位になる。

## やること

### 0. 前の値を測る（性能）
`npx playwright test --config playwright.perf.config.ts e2e-perf/budget.perf.ts`、`PART=scenes`、SCENE=harappa・mori・yoru（かげ オン／オフ）。今の main の数を `docs/perf-reports/PERF-2.md` の「前」に書く。

### 1. `src/world/render/voxel/sectionMesher.ts`（開発）
`build()` の中身を、続きから再開できる段（phase）に分ける。`build()` は「始める → 締め切りなしで最後まで進める」の 1 行にする（**作る道を 1 本にする。build 専用の別の道を残さない**）。

```ts
export class SectionMesher {
  /** 今までどおり（= start のあと resume(Infinity)） */
  build(cx: number, sy: number, cz: number, tier: MeshTier, opts?: BuildOptions): SectionMeshData;
  /** 作り直しを始める（前の仕事が残っていれば捨てる） */
  start(cx: number, sy: number, cz: number, tier: MeshTier, opts?: BuildOptions): void;
  /** 締め切り（now() の値）まで進める。できたらデータ、まだなら null。少なくとも 1 単位は進める */
  resume(deadline: number, now?: () => number): SectionMeshData | null;
  /** 途中の仕事を捨てる */
  cancel(): void;
  get busy(): boolean;
}
```

段と、止めてよい切れ目（どこで止めても出力が同じになる所だけ）:

| 段 | 中身 | 切れ目（続きの印） |
|---|---|---|
| read | `readBlocks`・`readLight` | ブロックの行 byi（18） |
| terrainScan | `prepareTerrain`（`scanColumn` 400） | j（20） |
| terrainSample | `sampleTerrain` | gz |
| expose | `fillGrid` の 1.（見える面の印）＋ `gap` | byi |
| fill | `fillGrid` の 2.（`fillBlockLook`・`copyBlock`） | **ブロック 1 つ（i）**。1 行に地面が集まると 30 ms をこえるので、行では切らない |
| terrainFill | `fillTerrain` | gz |
| planes | `meshMicro` の（面 f, 層 l） | (f, l) 1 つ。平面ごとに `mask` は使い切って 0 に戻るので、平面どうしは独立 |
| finish | `QuadBuilder.finish`・`meshSectionExtras` | 分けない（重ければ y ごとに分けてよい。出力の順は同じ） |
| occupancy | `packOccupancy` | 行 ty（`packOccupancy` に行の範囲を渡す形に足す。書き先は同じ配列） |

- box の段は今のまま 1 回で作る（分けない）。`resume` を呼ぶと最後まで進む。
- 締め切りは ブロック 16 個・平面 4 枚など、数単位ごとに `now()` で見る（`performance.now()` を呼びすぎない）。
- 途中の状態（`useMin`・`useMax`・`active`・`builder` など）は、今と同じくインスタンスの中に持つ。

### 2. `src/world/render/WorldRenderer.ts`（開発）
- **作るもの（`SectionMesher`）を 2 つにする**:
  - `this.mesher`: 今までどおり 1 回で作る。箱・プレイヤーが変えた所・count の時計・`attach` の一気。
  - `this.sliceMesher`: 分けて作る小ブロックの仕事 1 つ（約 13 MB 増える）。
- `SecState` に `gen: number` を足す。`markDirty` で 1 増やす。
- 仕事を `private job: { st: SecState; gen: number; cpuMs: number; slices: number } | null` で持つ。
- `build(st, boxOnly, deadline?: number)`: 次の全部を満たすときだけ `sliceMesher.start` して `resume(deadline)` する。
  - `clock === 'time'`
  - `deadline` が有限
  - 作る段が `'micro'`
  - `!st.player`
  - `cls === CLS_NORMAL`
  - `config.meshSlice !== false`
  
  それ以外は今の 1 回で作る道。
- **dirty は できたとき（install のとき）に `st.dirty = st.gen !== job.gen` にする**。始めたときには消さない。だから作っている間も `needsWork(st)` は true のまま、queue・`pendingJobs()`・`meshStats().pending` に残り、settle は今のままでよい。
- **取りつけの前と resume の前に、仕事がまだ有効かを見る**（`jobValid`）。次のどれかなら `cancel` する。
  - 列が `cols` に無い（`noteUnloaded`）
  - `col.tier !== 'micro'`（`retier`・半径の変更）
  - ストリーミングで `!col.inDraw`（`setRing`）
  - `st.evicted`
  - `st.player` になった
  
  プレイヤーが変えた所は、その場で `this.mesher` で作る。
- 選び方（`pickJob` / `pickNext`）: 仕事があるときに次のものは、今までの順で先に 1 回で作ってよい。
  - 箱の段のもの
  - p=0（プレイヤー）
  
  ほかの小ブロックは、今の仕事が終わるまで待つ（分けて作る仕事は同時に 1 つだけ）。それ以外は今の仕事の続き（resume）を選ぶ。
- `runJob(deadline?: number)` と `process(budgetMs)` は締め切りを `build` に渡す（`process` は `t0 + budgetMs`）。count の時計（`processCount` と ChunkStream の count の道）は締め切りを渡さない = 今のまま作り切る。
- できたときの記録は今と同じ: `install`・`pushLog`（できたコマの番号）・`logged` / `loggedMicro`。`rebuildStats().lastMs` は、分けた全部の CPU の ms の合計にする。
- `dispose()` で `cancel`。
- 設定: `WorldRenderConfig` に `meshSlice?: boolean`（既定 true）。`main.ts` で URL の `?meshSlice=off` のとき false にする（見くらべと perf 用。遊ぶ人には出さない）。
- 時刻: コンストラクタに `now: () => number = () => performance.now()` を足す（ユニットテストで時計を偽物にする）。

### 3. `src/world/stream/ChunkStream.ts`（開発）
- `StreamMesh.runJob(deadline?: number): boolean`。時間の道では `this.d.mesh.runJob(t0 + totalMs)` と呼ぶ。count の道と `work` 指定の道は今のまま引数なし。
- 「done > 0 で予算を使い切ったら止める」は今のまま。締め切りを過ぎても resume は 1 単位だけ進むので、1 コマの最大は「予算 ＋ 1 単位（1 ms 以下）」になる。

### 4. テストフック（開発）
- `world.meshJob(): { active: { cx: number; sy: number; cz: number } | null; finished: number; cancelled: number; slices: number; maxSliceMs: number }`。WorldRenderer の `meshJobStats()` を、`src/world/hook.ts` から出す。
- `render.meshDigest(): { sections: number; hash: string }`。見えているセクションのメッシュ（voxel・extras・water の全部の attribute と index のバイト、うまり）を、セクションの鍵の順に FNV-1a でまとめた値。`src/world/render/renderHook.ts`。

### 5. 計測の書き足し（性能。`e2e-perf/budget.perf.ts`）
- `MESHER_ADD` に `SectionMesher.prototype.start` / `resume` の包みを足す。分けて作った 1 セクションぶん（start から結果が返るまで）の resume の ms の合計と、分けた回数を `P.mesh` に入れる。`build` の包みは今のまま。
- 歩く 600 コマで、8 ms を超えたコマを原因ごとに数える（mesh の続き / 箱 / 取りつけ / `lightColumn` / 生成 / そのほか）。
- `?meshSlice=off` で、前と同じ道（分けない）も測れるようにする。

## テストでの決定性の守り方
- **E2E のサーバーは count の時計なので、分けない（今と同じく 1 コマで作り切る）**。e2e179-clock の AC2（1 コマに小ブロックは 1 個まで）・AC3（同じ手順なら コマ数・rebuildLog・drawCalls・triangles が同じ）、voxE-mesh、texA などの結果は変わらない。test.fail()・skip を足さない。
- 分ける道を通すテストは、次の 2 つだけにする。
  - (a) ユニットテスト（偽物の時計で 止める所を決める）
  - (b) 新しい E2E 1 本（`?clock=time`。合否は「落ちついたあとの最後の状態」だけで見る。コマ数は見ない）
- settle は今のまま: 作り途中のセクションは queue に残り、`meshStats().pending > 0`。

## テスト（tester が先に書く。実装の前は赤）
1. `src/world/render/voxel/sectionMesher.slice.test.ts`（ユニット）
   - **前の値の表（golden）**: 実装の前の main で作る。対象は `populateWorld` の seed 3 とおり、光あり（`WorldLight`）で、地面・木（葉）・水・たいまつ・作物・洞くつ・崖の段・世界の上のはし をふくむセクション 40 以上（micro と box の両方）。それぞれの `build()` の出力の FNV ハッシュを表にしてコミットする。
   - 実装のあとも `build()` のハッシュが表と全部同じ。
   - `start` のあと `resume` を、偽物の時計（呼ぶたびに 1 進む）で 1 単位ずつ・3 単位ずつ・乱数（seed 固定）で 50 とおり進めると、毎回 `build()` とバイトが同じ。比べるもの: `pieces` の 4 配列、`extras`・`water` の全部の配列、`faces`、`triangles`、`occupancy`。
   - 途中の `cancel` → 別のセクションを `start` → 最後まで: その結果が `build()` と同じ（前の仕事の残りがまざらない）。
2. `src/world/render/WorldRendererStream.test.ts` に足す（ユニット。`now` を偽物にして clock='time'）
   - 歩く代わりに `setRing` を動かしていくと、締め切りを 8 にした `runJob` 1 回が進める単位の時間（偽物の時計で数える）が、締め切りを 1 単位より大きく超えない。
   - 途中でそのセクションに `setBlock`: できたあとも dirty が残り、もう一度作られる。最後のメッシュは、まっさらに作ったものと同じ。
   - 途中で列を捨てる（`noteUnloaded`）・輪の外へ出る・段が box に変わる: 取りつけず（`group` にメッシュが増えない）、`cancelled` が 1 増える。
   - clock='count' では `slices` が 0 のまま（今と同じ道）。
3. `e2e/perf2-slice.spec.ts`（E2E。`test.setTimeout(120_000)`）
   - `?nosave=1&microR=16&clock=time` と `?nosave=1&microR=16&clock=time&meshSlice=off` を開く。
   - それぞれ `settle({ full: true })` → `meshStats().pending === 0` まで step。
   - `render.meshDigest()` が同じ。
   - 時刻（`time.set`）・カメラ・妖怪なしをそろえて `renderNow()` → 画面全部の `readPixels` が 1 画素もちがわない。
   - 分けた方は `world.meshJob().slices > 0`（本当に分けた道を通った）。

## 受け入れ基準（数で確かめる）
1. **1 画素も変わらない**:
   - ユニット 1 の golden ハッシュが全部同じ。
   - 止める所を変えた 50 とおりがバイトで同じ。
   - E2E 3 の `meshDigest` が同じで、画面の画素のちがいが 0。
2. **歩く間の 1 コマ**（`budget.perf.ts PART=scenes`、はらっぱ・もり・よる × かげ オン／オフ、クラウド）:
   - 歩く 600 コマの `walk.step.p95 ≤ 8 ms`（`over8 ≤ 30`）。
   - 最大と、8 ms を超えたコマの原因別の数は記録する。
   - 超えた原因がメッシュ以外（`lightColumn`・生成）だけのときは、その数を書いて PO に上げる（この票では分けない）。
3. **立っている間は悪くならない**: 立つ 300 コマの p95 が前の値 ＋0.5 ms 以内。三角形・描画回数（`trisMedian`・`drawCallsMedian`）が前と同じ値。
4. **着いた時（テレポートで輪をそろえる）が悪くならない**: `arrive.ms` が前の値の 115% 以内。合計の CPU は同じで、分ける手間は小さいはず。
5. **差しかえが遅れすぎない**:
   - 歩く 600 コマの終わりのコマで、プレイヤーから 16 ブロック以内にある「段が micro」のセクションが全部 micro で出ている（`sectionInfo` の tier）。
   - 歩く間にできた小ブロックの数（前は 77/88/111）と、歩き終わりで差しかえ待ちの数を記録する。
6. **E2E は変わらない**: CI の E2E が全部緑（count の道は今と同じ）。`npm run check:fast` が通る。
7. メモリ: jsHeap の増えは +20 MB 以内（2 つ目の `SectionMesher` は約 13 MB）。

## やらないこと
- Worker（#98）。この票のあと PERF-3 で決める（着いた時の時間と Mac の F3 の数を見てから）。
- `lightColumn`・列の生成を分けること（8 ms をこえるコマが残れば、数を書いて次の票にする）。
- 型の見本帳（`fillBlockLook` の K 通り。見た目が変わるのでオーナーが決める）・WebAssembly・メッシュの取りおき・木のクロス板。
- プレイヤーが変えた所（掘る・置く）の小ブロックを分けること（今のまま、そのコマで作り切る）。
- 箱の段を分けること。
- 段の決め方・半径・ずらし（PERF-1 で済み）。

## 関連
- issue: #201（この票）・#98（Worker。この票では一部だけ）・#200 / PERF-1（段をプレイヤーの位置で決める）・#179（count の時計）・#180 / E2E-180（E2E は microR=0、`fine()`）
- 設計: `docs/design/VOX-plan.md` §5（1 コマ 8 ms、Worker はあと）・§10（1 コマの作り直し・生成の合計 8 ms 以下）・§11（VOX-H）
- 計測: `/mnt/project-files/perf-budget/REPORT.md` §1・§3・「直す案の効く順」2・3、`e2e-perf/budget.perf.ts`
- 指摘台帳: `docs/loop-ledger/PERF-2.md`

## 経過（PO が追記）
| 日付 | ループ | 結果 | メモ |
|---|---|---|---|
