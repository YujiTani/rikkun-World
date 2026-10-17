# CALM: ブロックの絵の「ざわざわ」をへらす（issue #194）

| 項目 | 内容 |
|---|---|
| マイルストーン | 見た目の磨き（#191 良いデザインのものさし） |
| 状態 | テスト準備中 |
| 周回数（全ループ合計） | 0 / 10 |

## 目的（オーナーの言葉で）
「私たちのブロックのグラフィックはかなりざわざわしやすいので、色をもっとパステルなものとか抑えめにした方がいいかもしれませんね」→ 見比べで E「点をへらす＋少しおさえる」に決定。ゲーム内の試作を 2026-10-17 17:08 に OK（決定 `docs/decisions/2026-10-17-block-noise.md`）。

## やること
`src/world/blocks/textures.ts` で、自然のブロックの絵を「おさえた絵」にする（DESIGN.md 4.3b）。

- 色の式（1 画素、sRGB の 0〜255 のまま計算）: 地の色 b、もとの色 c に対して
  1. 明暗を半分: `v = b + (c - b) × 0.5`（r・g・b ごと）
  2. 彩度を 8 割: `L = 0.2126 v.r + 0.7152 v.g + 0.0722 v.b`、`out = L + (v - L) × 0.8`
  3. 四捨五入して 0〜255 におさめる。透明度はそのまま。
- 数は `export const TILE_CALM = { contrast: 0.5, saturation: 0.8 }`、1 色の式は `export function calmColor(c: Rgba, base: Rgba): Rgba`（どちらも textures.ts）。
- おさえる絵と地の色:

| 絵 | 地の色 |
|---|---|
| grass_top | `#5DBB3F` |
| dirt | `#8B5A2B` |
| grass_side | 上 4 行 = grass_top と同じ（地 `#5DBB3F`）、下 = dirt と同じ（地 `#8B5A2B`） |
| stone | `#8E8E8E` |
| sand | `#E8D9A0` |
| log_side・log_top | `#8A5A2E` |
| leaves | `#3E9B2F` |
| bedrock | `#3A3A3A` |
| coal_ore・iron_ore | 地の石だけ `#8E8E8E` でおさえる。つぶ（`#222222`・`#E0A872`）はそのまま |

- 変えない絵: water・furnace_top/side・kawara・brick・torch・start_torch・tansu_front/top・農業の作物・やせい・かかし・さく・スプリンクラーの絵。farmland の 4 枚は土の部分が dirt と同じ（おさえた土）になり、それ以外の画素は今のまま。
- 点の場所・形は変えない（どの画素が地でどの画素が点かは今と同じ）。
- アイテムのアイコン（`itemIcon.ts`）と遠くの LOD の平均色（`tileAverage`）は同じ絵から作るので、いっしょに変わる（別の色の表を作らない）。
- 試作の `?calm=0`（もとの絵にもどす）は入れない。
- 面の明るさ（`FACE_SHADE_BY_INDEX`）・AO・光・影は変えない。

## 受け入れ基準
1. `TILE_CALM` が `{ contrast: 0.5, saturation: 0.8 }`、`calmColor` が上の式どおり（例を 3 つ以上、±0）。
2. おさえる絵の各画素 = もとの絵（main の 2eec063 の色の表とたね）の同じ場所の画素に `calmColor(…, 地の色)` をかけた色（±0）。grass_side は行で地の色を分ける。
3. 2 の結果、おさえる絵の中の「いちばん明るい画素といちばん暗い画素の明るさの差」がもとの 55% 以下（鉱石はつぶを除いた地の石で。grass_side は上 4 行の草と下 12 行の土を別々に測る。地の色どうしの差は式で縮まないため）。
4. 鉱石のつぶは `#222222`・`#E0A872` のまま、5 かたまりの場所も同じ。
5. 変えない絵は main と 1 画素も変わらない（farmland は dirt の画素以外が同じ）。
6. アイテムのアイコンの草・土・石の画素と LOD の平均色が新しい絵から作られている（新しい絵の平均 = `tileAverage`）。
7. `location` を読む切りかえ（`calm=`）がない。
8. 既存の E2E（texA・voxB-terrain・seam など。画面の色は hook の絵から期待を作る）が CI で緑。
9. （オーナー）見た目が試作の `compare-e.png` と同じ（OK 済み）。

## 関連
- 決定: `docs/decisions/2026-10-17-block-noise.md`
- スタイルガイド: `docs/art/DESIGN.md` 4.3b
- 試作のスクショの撮り方: `npx playwright test --config playwright.calm.config.ts`（`e2e-perf/calmShots.perf.ts`）

## 経過（PO が追記）
| 日付 | ループ | 結果 | メモ |
|---|---|---|---|
| 2026-10-17 | アート | OK | ゲーム内試作をオーナー OK |
