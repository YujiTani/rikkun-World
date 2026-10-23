# pixel-artist への依頼: LIVE-2 こたつ（`nukunuku`）2×2 の ななめ ふとん

2026-10-23 art-director。オーナー（yuzu）: 「こたつは 2×2・高さ 1」「お布団部分が もう少し、斜めの ディティールで ないと わかりにくい」「PixelLab を 使った 方が いいかも」。
今の 見た目: `docs/screenshots/LIVE-2/01-kotatsu-egg.png`（1×1 の 箱。横は 藍の 四角で、ふとんに 見えにくい）。今の 絵: `src/world/blocks/liveTextures.ts` の `kotatsuTop`・`kotatsuSide`。

## 読むもの
- `docs/art/DESIGN.md` 16.15（I3 たまご こたつ）・3.1（面の 明るさ）、`docs/art/PIPELINE.md`（build.py・置き場所・4 章の チェック）、`docs/decisions/2026-10-18-livestock-look-v3.md`（I3）。
- 形は developer が 作る（天板の 面・4 つの ななめ ふとん・角）。下の 寸法は 目安。developer の 数と ちがったら developer に あわせる。

## 決定（2026-10-23 オーナー）
- **C ふくらむ すそ**（A から 選びなおし）。絵: `art/LIVE-2-kotatsu/kotatsu/`（build.py）、くらべ `docs/art/LIVE-2/kotatsu-C.png`。

## 形（1/16 ブロック = 1 点。`src/world/blocks/kotatsu.ts` に 合わせた）
- 足もと 32×32（2×2）、高さ 16。`KOTATSU_RUN` は 6 点（0.375）を すすめる（今の 0.4 = 6.4 点だと 点が ずれる）。
- 天板 20×20（まわり 6 点 内がわ、高さ 16）。ふとん = 台形 4 まい（上 20・下 32・高さ 16）。
- すそ（C）: 絵の 下 **4 点**（今の 2 点の 倍）。形は 変えない。
- 角の たまり（C、メッシュに 足す）: 角ごとに 三角 2 まい。頂上 P = 足もとの 角の 真上 **1.5 点**、先 T = 角から 外へ ななめ **3 点**（x・z とも 3）、へり A・B = 角から 足もとの へりに そって 内へ **6 点**（高さ 0）。三角 PTA・PTB に `kotatsu_corner`（UV: P=(0,0)・T=(0,8)・A/B=(8,0)）。三角 +8（4 角 × 2）。地面と かさならない よう 0.05 点 浮かす。

## いる テクスチャ（1 倍・Nearest・ふち線 なし・影を 描きこまない）
| 名前 | 大きさ | 中身 |
|---|---|---|
| `kotatsu_top` | 20×20（上から 見た 32×32 版 `kotatsu_top_32` も。16×16 の 4 まいに 切れる） | 天板。木目・こい木の ふち 1 点・みかん（右おく） |
| `kotatsu_slope` | 32×16（台形で 使う。外も 同じ 絵で うめて あり すけない） | ななめ ふとん。上 1 点 = 天板の かげ（`#2F4780`）、もようは 今の 6 点に 1 つ、下 4 点 = すそ（上の ふちが 8 点ごとに ふくらむ） |
| `kotatsu_corner` | 8×8（三角 2 まいで 使う） | 角の たまり。外がわ（x+y≥4）が すその 生成り、背すじに こい 藍 |
| `kotatsu_hem` | 32×4（`slope` の 下 4 行と 同じ。別の 面に する とき だけ） | 生成りの すそ ＋ ぬい目 |
| `kotatsu_egg_peek`（＋`_crack`） | 8×8 | すその 前から 下半分が のぞく たまご。ひびの 版も。3D の たまごで 出すなら いらない |
| アイコン（`itemArtLive2`） | 16×16 | 今は 横の 面を そのまま 使う → ななめから 見た 小さな こたつに 変える 案（オーナー確認待ち） |

色（I3 の まま。新しい 色は 足さない）: ふとん `#3D5A9E`・明るい 藍 `#5B7BC4`・こい 藍 `#2F4780`（コードに ある。DESIGN 16.15 に 足す）・すそ `#EFE7D4`・天板 `#A87B4F`／ふち `#7A5434`・木目 `#9C7040`・みかん `#F0902A`／`#C86E14`・はっぱ `#6E9A3A`・たまご `#F5ECD8`／`#E2D6B8`。1 まい 8 色まで。
光らない・点滅 しない（16.15 の まま）。ななめの 明るさは 面の 向き（3.1）で 出るので、絵に グラデを 描かない。

## ななめの ディティール 3 案（オーナーが えらぶ）
- **A ひだ線**: 天板の 4 つの 角から すその 角へ こい 藍の ななめの ひだ 1 本ずつ ＋ 各面に 天板から 下へ ひらく しわ 2 本。布が 天板から たれて いる と 1 目で 分かる。
- **B かすりの ななめ じま**: 面ぜんたいに 明るい 藍の ななめ（45°）の しま。今の 点もようを 線に した 形。遠くでも 「ななめ」は 出るが、布の たれ かたは 弱い。
- **C ふくらむ すそ**: 面は 今の 点もよう の まま、すそを 2 点 太く して 角で 外へ ひろげ、角に 三角の 布の たまり。地面に 広がる ふとんの 形で 見せる（シルエット 重視）。
- art-director の おすすめは A だったが、**オーナーは C を えらんだ（2026-10-23）**。A の メモ:オーナーの 「斜めの ディティール」に いちばん 直に こたえ、白黒・ぼかしでも 角の ひだで 「たれた 布」が 残る。もようは 今の 6 点に 1 つ を 12 点に 1 つ へ へらして ひだを 目立たせる。

## PixelLab の 計画
- **いま 使える lite（1 回 1 generation）は `POST /vfx`（`artist: "lite"`）だけ**。これは エフェクトの コマの 下絵 用で、タイルの テクスチャ（台形・つなぎ目・決まった 色）には **合わない**。ほかの 呼び方（Pro Flash 5・object 10〜25）は オーナー決定（2026-10-21「lite で」）により 使わない。
- → **PixelLab は 0 回**。かわりに **Pixel Art Studio で 仕上げ**: `art/LIVE-2-kotatsu/kotatsu/build.py`（パレット 固定・20×20 天板・台形の ふとん・角の たまり）。台形と つなぎ目を ぴったり 合わせるのは コードで 描く 方が そろう（PIPELINE 1 の 表「16×16 の 仕上げは 自分で 描く 方が そろう」）。
- 例外（通信が 通り、オーナーが 「形の 案だけ PixelLab で」と 言った とき）: 先に `/v2/openapi.json` で 1 generation の 止め絵の 呼び方が あるか 値段を たしかめる。あれば **2 回まで**（2 generations）、なければ 0。下絵は `art/LIVE-2-kotatsu/pixellab/`、残りの 記録 `balance_before/after.json`。そのまま ゲームに 入れない。
  - prompt: `pixel art kotatsu table seen from 3/4 top view, square wooden tabletop with one mandarin orange, indigo blue futon draping diagonally from the table edge to the floor on all four sides, cloth folds at the corners, cream hem, flat colors, no outline, cute, for children`
  - negative: `blood, scary, text, gradient, white background glow`

## 出すもの（`art/LIVE-2-kotatsu/kotatsu/`）
- `build.py`・上の テクスチャの `*_1x.png`・`preview.png`（拡大）・`sheet.png`（3 案を 同じ 2×2 の 形に はった ななめ上・横の 見本、今の 1×1 と ならべる）・CRITERIA の 確かめ 4 枚（シルエット・白黒・ぼかし・今と ならべる）＋ ものさし表。
- 三角形: 天板 2 ＋ ふとん 8 ＋ 角の たまり 8 ＝ 約 18（たまご 別）（今の 1,080 より ずっと 少ない）。描画は 今と 同じ（チャンクの 面なら 0 回）。
- 選ばれたら DESIGN 16.15 を 2×2 に 書きかえる（オーナーの OK の あと）。
- 担当外（`src/`・`public/`）は さわらない。コミットしない。
