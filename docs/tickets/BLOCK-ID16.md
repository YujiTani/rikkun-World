# BLOCK-ID16: ブロックの番号を 2 バイトにする（issue #455）

## どうして
- 1 マス 1 バイトなので ブロックは 256 種類まで。main は 217 種類で、家のレシピ 2B（約 30）と 見どころ #187（約 9）で ほぼ使いきる。
- 遊び・見た目・音は 変えない。古い世界は そのまま読める。古いデータを まとめて書きかえる処理は 入れない。

## 方針（PO の計画）
1. **メモリ**: `SectionData` の `palette` と `full.data` を `Uint16Array` にする。uniform と palette（16 種・4 bit の packed）は そのままなので、メモリがふえるのは full の区画だけ（4,096 → 8,192 B）。
2. **列・生成・窓口**: 番号を入れる配列（`chunk.ts` の scratch / blocks、mine 系の out、`fillFlat`、`WorldLight` の blk、mesher の kinds など）を `Uint16Array` に。型は `BlockArray = Uint16Array` の別名を 1 か所（contracts）に置く。
3. **256 固定の表**: `lightSpread` の OPAQ / EMIT / TRIV、`surface.ts` の KIND_OF、`sections.ts` の seen / pos、`chunkCodec.ts` の used / local を `MAX_BLOCK_KINDS`（下）か `BLOCK_TYPES.length` の大きさに。`WorldLight` の UNKNOWN = 255 は 番号とぶつからない値（0xFFFF）へ。
4. **描画**: mask の種類 8 bit（`MK_ROW = 8`、`sectionGreedy` の `k & 255`）、`sectionBox` の 9 bit、頂点属性 `aData.x`（Uint8）を 広げる。上限は `MAX_BLOCK_KINDS = 1024`（10 bit）を 1 か所に書き、`BLOCK_TYPES.length <= MAX_BLOCK_KINDS` を ユニットテストで落とす。頂点 1 つのバイト数を なるべく増やさない（増えるなら数を PR に書く）。
5. **セーブ**: 列ごとに「使っている番号の一覧＋一覧の中の番号（1 バイト）」で書く形なので、1 列の種類が 255 以下なら **版 2 のバイト列は 1 バイトも変えない**。番号 → 一覧の表（`map`・`j > 255`）だけ 16 bit にする。1 列に 256 種類以上あるときだけ 版 3（一覧の数と 中の番号が 2 バイト）で書く。版 1・2 は 今のまま読む。`backend.ts` の版の判定と `portable.ts` も 版 3 を通す。`SAVE_GEN` は上げない。
6. **コメント**: `houseBlocks.ts`・`chestBlock.ts`・`chalkMark.ts` の「256 まで」を直す。`mineBokenConfig.ts` の `totalBlockIds: 256` は 意味を確かめて直す。

## 受け入れ基準
- AC1: `sectionSet` / `sectionGet` / `compactSection` / `sectionToArray` が 番号 256〜1023 を 正しく往復する（uniform・palette・full の 3 つとも）。
- AC2: `encodeSections` → `decodeSections` が 番号 256 以上をふくむ列を 往復する。種類が 255 以下の列は 版 2 で、今の main と同じバイト列になる（今の fixtures と 写しで確かめる）。256 種類以上の列は 版 3 で往復する。
- AC3: 古いセーブ（版 1・版 2、`src/save/__fixtures__/`）が 今までどおり読める（既存の oldSaveLoad・mine*Save のテストの期待は 変えない）。
- AC4: 光（`lightSpread` / `WorldLight`）が 番号 256 以上の 不透明・光るブロックを 正しくあつかう（表の外を読まない。番号 255 のブロックを UNKNOWN と まちがえない）。
- AC5: mesher が 番号 256 以上の種類を 別の種類に化けさせず 頂点データに出す（greedy と box の両方）。シェーダーへ届く種類が 0〜1023 で正しい。
- AC6: `BLOCK_TYPES.length <= MAX_BLOCK_KINDS` のテストがある。
- AC7: 既存の ユニット・E2E・UI 検査・写し（`src/content/__snapshots__`）は 期待を変えずに 緑。
- AC8（性能、数で）: 同じシードの世界で、区画メモリ（`sectionBytes` の合計）・頂点バッファのバイト数・描画回数・三角形の数を 前後で記録する。描画回数と三角形は 同じ。メモリのふえ方を PR に書く。

## テストの作り方の注意
- 本物の `BLOCK_TYPES` は 217 種類なので、256 以上は 数値を じかに渡せる所（sections・codec・光の表・mesher の入力）で ユニットテストにする。テスト用に 種類の数を ふやす窓口がいるなら、本番の表を よごさない形（引数で表を渡す）にする。
- E2E の新規は なし（遊びが変わらない）。既存の E2E は CI にまかせる。

## ほかの作業との順番
- 家のレシピ 2B（`claude/house-2b`）は 11-11 の時点で ブロック登録・sections・save・描画に さわっていない。ブロックは `BLOCK_TYPES` の後ろに足すだけなので、どちらが先でも ぶつかりにくい。この PR を先に入れる。
