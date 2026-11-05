# ICON-32: アイテムアイコンを 32x32 で 描きなおす（設計・見積もり）

> **2026-11-05 オーナー: 64 の プロトは「ふんいきが よくない」→ 32x32 に 変更。** 本文の 数は 32 に 書きかえた。64 の プロトは 消した（git の 前の コミットに ある）。

状態: 設計＋プロトタイプ（8 点）。本番の 差しかえは まだ（オーナーの 絵柄 OK 待ち）。
大きさは 1 つの 定数 `ICON_SIZE = 32`（最初は 128 の 案 → オーナーの 指示で 64 に）。あとで 変えるときは この 定数と 絵を 作りなおす。

## 1. いまの アイコン（インベントリ）

`itemIconPixels(id)`（src/ui/itemIcon.ts）が 16x16 の RGBA 配列を 返す。ItemId は **139 個**。作り方の 内わけ:

| ファイル | 関数 | 数 | ItemId |
|---|---|---|---|
| textures.ts（ブロックの タイル 16x16 を そのまま） | `blockTile` | 30 | grass dirt stone sand log leaves coal_ore iron_ore furnace kawara brick geyser_dirt snow momiji_leaves matsu_leaves flower_y flower_o flower_p bamboo nobana nukunuku sekkaiseki hotaruishi kin_ore shikkui wakimizu magma_wakimizu kokuyouseki takitsubo magma_takitsubo |
| itemArtM4.ts | `m4ItemPixels` | 22 | torch wood_pickaxe stone_pickaxe iron_pickaxe iron_ingot bokuto katana naginata crystal_katana yumi ya kabuto yoroi kote suneate lantern kite futon omamori omamori_torn waraji haniwa |
| itemArtGold.ts | `goldItemPixels` | 10 | harapan_mimizu kin kin_katana kin_yumi kin_pickaxe kin_axe kin_kabuto kin_yoroi kin_kote kin_suneate |
| itemArtM7.ts | `m7ItemPixels` | 9 | seed_onion seed_tomato seed_pumpkin seed_eggplant onion tomato pumpkin eggplant kuwa |
| itemArtKongo.ts | `kongoItemPixels` | 9 | diamond kongo_katana kongo_yumi kongo_pickaxe kongo_axe kongo_kabuto kongo_yoroi kongo_kote kongo_suneate |
| itemArtHouseEditor.ts | `houseEditorItemPixels` | 9 | table chair andon shelf ofuro long_table round_table stool sekkeizu |
| itemArt.ts | `materialPixels` | 8 | paper oil string cloth clay crystal sumi hemp |
| bucketArt.ts | `bucketItemPixels` | 5 | bucket water_bucket magma_bucket wakimizu_bucket magma_wakimizu_bucket |
| itemArtHouseBlocks.ts | `houseBlockItemPixels` | 5 | house_floor house_wall house_roof shoji house_door |
| itemArtNinja.ts | `ninjaItemPixels` | 4 | ninja_zukin ninja_shozoku ninja_tekko ninja_tabi |
| itemArtSamurai.ts | `samuraiItemPixels` | 4 | samurai_jingasa samurai_haori samurai_tekko samurai_geta |
| itemArtBal.ts | `axeItemPixels` | 3 | wood_axe stone_axe iron_axe |
| itemArtM72.ts | `m72ItemPixels` | 3 | watering_can long_watering_can sprinkler |
| itemArtW7.ts | `w7ItemPixels` | 3 | raijin_ken fujin_ken niji |
| itemArtLive3.ts | `live3ItemPixels` | 2 | momo_nama momo_yaki |
| itemArtHouse.ts | `houseToolPixels` | 2 | mizumori dotsuki |
| itemArtMine.ts | `mineItemPixels` | 2 | chalk ishibai |
| itemIcon.ts | `orbPixels` | 1 | yokai_orb |
| storage/tansuArt.ts | `tansuPixels` | 1 | tansu |
| itemArtTako.ts | `takoItemPixels` | 1 | fude |
| itemArtLive1.ts | `eggPixels` | 1 | egg |
| itemArtLive1.ts | `mushiPixels` | 1 | mushi |
| itemArtLive1.ts | `mushiAmiPixels` | 1 | mushi_ami |
| itemArtLive2.ts | `toriyaPixels` | 1 | toriya |
| itemArtLive2.ts | `kinTamagoPixels` | 1 | kin_tamago |
| itemArtRope.ts | `ropeItemPixels` | 1 | rope |

ほかに ItemId で ない アイコン: `signalIconPixels`（合図）・`extraIconUrl`（hammer・clock・畑の おまけ）・`orbPixels`。これも 64 版の 対象（約 10 点）。

## 2. 16x16 を 使っている ところ

- **2D の UI（64 に する）**: `itemIconUrl / anyIconUrl / drawPixels` を 使う 30 ファイル — hotbar・inventoryScreen・storageScreen・craftPanel・tooltip・notice・prep・deathScreen・achievementsPage・各 Hint など。どれも `<img>` / canvas に 出して CSS で 大きく している（`image-rendering: pixelated`）。64 に しても 表示の 大きさ（CSS px）は 変えない ので、レイアウトは こわれない。
- **3D（16x16 の まま）**: `fx/bagVisuals.ts`（落ちている アイテム）・`fx/furnaceFx.ts`・`fx/weaponFxModel.ts`・`game/wire/save.ts`（サムネ）。1 px = 1 ボクセル なので 64 に すると 16 倍の 箱・テクスチャに なり 重い。**ここは 今の 16x16 コードを そのまま 使う**。持っている 道具（camera/heldTools.ts）は 自前の 箱モデルで アイコンを 使わない → 影響なし。
- テスト: 16x16 の 配列を 見る ユニットテスト・スナップショットは そのまま 生きる（16 の 関数を 消さない ため）。

## 3. 設計

- 16 の API（`itemIconPixels` など）は 残す = 3D 用。
- 新しく `itemIcon32Url(id)` を 作り、2D の UI は こちらへ。64 の 絵が まだ ない id は **16x16 を 2 倍（ニアレスト）した もの** を 返す → 少しずつ 差しかえ られ、とちゅうでも ゲームは こわれない。
- 表示: 64 の 絵を 48〜96 CSS px で 出す。DPR 2 では いつも 拡大 なので `pixelated`。DPR 1 で 64 未満に 縮める ところ（インベントリの 小さい マス）は 線が 欠けない ように `image-rendering: auto`。できる ところは 表示を 32/64 px に そろえる。

## 4. 32x32 を PNG で もつか、コードで もつか（比較）

| | PNG ファイル（`art/icons32/<id>.png` → まとめて アトラス 1 枚） | コードの 配列（今の 16x16 と 同じ やり方） |
|---|---|---|
| 直しやすさ | ◎ オーナーが Aseprite / Piskel / LibreSprite で ひらいて そのまま 直せる。差分も 画像で 見られる | ✕ 32x32 = 4096 マス。文字の 配列や 描画コードを 直すのは 人には ほぼ 無理 |
| 大きさ（バンドル） | ◎ アトラス 1 枚（12x12 マス = 384x384）で およそ 40〜80 KB（PNG 圧縮・パレット少なめ）。画像は JS と べつに キャッシュ | △〜✕ 文字の 配列なら 1 点 約 1〜2 KB → 150 点で 250 KB 前後の JS。手続き コード なら 小さいが「絵を 直す」=「コードを 直す」に なる |
| 決まった 結果・テスト | ○ PNG が 正（source of truth）。テストは「全 ItemId に 絵が あるか（なければ 4 倍の 代わり）」「32x32 か」「アトラスの 表と ずれて ないか」を Node で PNG の ヘッダ・表を 読んで 見る。画素の スナップショットは いらない | ○ Node で 画素を そのまま テスト できる |
| CI | ○ アトラスを 作る スクリプトを `npm run icons` に して、CI では「作りなおしても 差分が でない」ことを 見る（作り忘れの 検出）。Vite が PNG を `?url` で 取りこむ | ◎ 追加 なし |
| 読みこみ | △ 画像 1 枚を 非同期で 読む。読めるまでは 16 の 2 倍を 出す | ◎ すぐ 使える |
| ratchet / knip | ○ 影響 ほぼ なし | △ 大きな ファイルが 増え 行数の ratchet に かかる |

**おすすめ: PNG**。理由は オーナーが 自分で 直せる こと（今回の 目的）と JS が ふくらまない こと。
作り方は 2 段: (1) `art/ICON-32/build.py`（このPRの 生成器）で **下書き PNG** を 作る → (2) 人が ピクセルエディタで 仕上げて `art/icons32/` に おく。いちど 仕上げた PNG は 生成器で 上書き しない（生成器は `art/ICON-32/proto/` に しか 書かない）。

## 5. 絵の きまり（プロトで ためした もの）

- 光は 左上。部品ごとに 3 段（こい・ふつう・明るい）＋ 白の きらり。
- 外の ふちは 1px、今と 同じ `#2a1e14`。部品の さかいは その 部品の こい 色（sel-out）。
- 色の 家族は 素材で そろえる（鉄・はがね・金・木・なわ…）。めずらしさは 今の 色の 感じを つづける。
- ブロックの アイテムは タイル（16x16）を 斜めの 箱に はる（上 1.0・左 0.8・右 0.6）→ ブロック 約 40 点は ほぼ 自動。
- 見本: `art/ICON-32/proto/*.png`、シート（上 = 今の 16、下 = 新しい 64）は `python3 art/ICON-32/build.py <出力>`。

## 6. 見積もり

| まとまり | 数 | やり方 | 手間 |
|---|---|---|---|
| ブロックの アイテム（タイルから） | 約 40 | 斜めの 箱で 自動 | 小（1 回） |
| 道具・武器（つるはし・斧・刀・忍具…） | 約 30 | 部品の 組み合わせ＋手直し | 中 |
| 材料・食べもの・畑 | 約 35 | 下書き＋手直し | 中 |
| 防具・家・いきもの・その他 | 約 35 | 下書き＋手直し（形が ばらばら） | 大 |
| ItemId で ない アイコン | 約 10 | 下書き＋手直し | 小 |

バッチ: 1) 土台（`itemIcon32Url`・アトラス・テスト・CSS）＋ブロック → 2) 道具・武器 → 3) 材料・食べもの → 4) のこり。1 バッチ 1 PR。

## 7. リスク

- 小さい マス（DPR 1 で 48 px など）で 縮めると 細い 線が 消える → 線は 2px 以上、プロトの 48px 表示で 確認ずみ（`proto-ingame.png`）。
- 16 と 64 で 見た目が ずれる（3D の 落ちもの は 16 の まま）→ 色の 家族を そろえて 同じ ものに 見える ように する。
- 画像の 非同期 読みこみの 一瞬 → 16 の 2 倍で うめる。
- 139＋ 点の 手直しは 時間が かかる → バッチに わけ、とちゅうでも 4 倍の 代わりで 出せる。

## 8. オーナーに 決めて ほしい こと

1. 絵柄（プロトの 8 点）で よいか。
2. PNG 方式で よいか（自分で 直す ときの エディタ）。
3. ブロックの アイテムは 斜めの 箱で よいか（今は 正面の タイル）。

## 9. PixelLab で 作る（オーナー指示 2026-11-05）

手で 描く 代わりに PixelLab の 下絵 → 掃除 → PNG → アトラス。4 章の PNG 方式と そのまま つながる。

```
families.json（なかまごとの 文と 共通の 絵柄の 文）→ gen.py（PixelLab v2・32x32・背景なし）→ raw/<id>.png
→ clean.py（透明・きっちり 32x32・色を 16 色に・ふち 1px #2a1e14）→ 人の 手直し（ピクセルエディタ）→ art/icons32/<id>.png → アトラス
```

- ブロックの アイテム（約 40）は PixelLab を 使わない（タイルから 斜めの 箱、`build.py`）。
- 呼ぶ 前後に `/balance` を `log.json` へ（PIPELINE 1.1 の きまり）。`--max` で 回数の 上限、既定 0 は 呼ばない。
- **止まって いる 所**: この箱には `PIXELLAB_SECRET` が ない（`GET /v2/balance` は 401）。ART-PIPE-1 は クラウドの 自動認証（`Bearer dummy`）で 動いて いたが、ここでは 使えない。
- オーナーに 決めて ほしい こと:
  1. API トークン（https://pixellab.ai の アカウント ページ）を 安全な 入力で `PIXELLAB_SECRET` に。
  2. 使う 呼び方と 予算。PIPELINE の 決まりは「1 回 1 generation より 高い 物は 使わない」。32x32 の アイテムに 向くのは `create-image-pixflux` / `bitforge` / `pro-flash`。値段は 呼ぶ 前に `/pro-flash/cost` や 説明で たしかめる。お試しの 残りは 34 generations（2026-10-21 時点）。全部（約 110 点 ＋ 作りなおし）では 足りない 見こみ → 有料プランか、なかまの 代表だけ PixelLab で 作り のこりは 手直しで 広げるか。
  3. PixelLab の 規約（作った 絵を ゲームで 公開して よいか、PIPELINE 6 章 5）。

## 10. 32x32 プロト（絵柄 2 案）

- 見るもの: 世界の タイル・今の 16x16・キャラの 絵（art/char-sheets: ちびの アニメ調、白っぽい 髪・赤い 目・あたたかい 肌）。
- きまり: 6 さいでも 何か 分かる 大きな 形・太い 線（2px 以上）・あたたかい 色（色の 段は 暗い ほど 青むらさき、明るい ほど 黄色）。真っ黒・真っ白は 使わない。乱数の もようを 入れない（「AI っぽさ」を さける）。
- **A**: こげ茶（#3b2420）の ふち 8 方向 ＋ 3 段の かげ ＋ 光。小さくても くっきり。
- **B**: 部品の こい 色の ふち（4 方向、角が 丸く 見える）＋ 光を ふちに 細く ＋ クリーム色の きらり。やわらかい アニメ調。
- 作り方: `python3 art/ICON-32/build.py <出力.png>` → `art/ICON-32/proto/{a,b}/*.png`、拡大シートと ゲームの 大きさの シート（茶色の マスに 1x・1.5x・2x）。
- おすすめ: **A**（茶色の マス・草や 夜の 背景でも 形が 消えない。B は 地の 色に よっては ふちが 沈む）。キャラの やわらかさに 寄せたい なら、A の ふち色を 部品ごとに 少し 色づけする 中間も できる。
- Pixel Lab（9 章）は キーが ない ので 使って いない。生成器は 32 に あわせて あとで 直す（gen.py の image_size）。

## 11. v3（オーナー「もっと クオリティーを あげられる」→ 絵の 作りなおし、12 点）

- やり方を かえた: 帯の かげ → **形ごとの 法線で かげ**（球・円柱・ゆがんだ 球・面の 決まった 多角形）。光は 左上 手前、5 段の 色（`art/ICON-32/v3/lib.py` の 素材ごとの 表: 木・鉄・はがね・金・うるし/革・紺の 布・果物・葉・水・なわ・宝石・肉・骨。暗い ほど 青むらさき、明るい ほど 黄み）。
- 1 マスを 3x3 で しらべて 半分 以上で 入れる（形の ふちが なめらか）。
- ふち: 上・左は その 部品の いちばん こい 色（sel-out）、**下・右だけ** こい ふち色。部品の さかいは うしろの 部品を こい 段に。
- 光の 点（クリーム色）・刃の ふちの 光・巻き・なわの より・焼き目 などは 手で おく。乱数は 使わない。
- 12 点: 8 点 ＋ 焼きもも（食べもの）・弓・よろい・ダイヤ（なかまが ちがっても 同じ 道具で 描けるか の 確認）。
- 見直し 3 回（1 回目: 全体が 暗い・つるはしの 頭が 細い・かぶとの 角が 棒・トマトが 暗い → 明るさの 底上げ・太さ・角を 三日月に。2 回目: よろいが うすい ピンク・インゴットが 小さい → 直し。3 回目: 茶・草・夜の マスで 確認）。
- 作り方: `python3 art/ICON-32/v3/build.py <出力 dir>` → `art/ICON-32/v3/png/*.png`・`v3-proto.png`・`v3-ingame.png`。
- のこる 弱さ: 夜の マスで 弓・刀の つかが 沈む（下・右の こい ふちが 背景と 近い）／よろいが 少し うすい／なわの よりが こまかくて 1 倍では ざらつく／まだ 手で 1 点ずつ 直す 余地あり（とくに 小さな 金具）。

## 12. v4（オーナー: 見下ろしの クォータービュー・刀身を 長く・LoL の 武器/防具アイコンの 感じ）

- `art/ICON-32/v4/`（`python3 art/ICON-32/v4/build.py <出力>` → `png/`・`v4-proto.png`（上 v3・下 v4）・`v4-ingame.png`（茶・草・夜、3x と 1x））。
- 見下ろし: 道具・武器・肉・弓は 右下に ずらした こい 形を 先に おいて **厚み**（`Canvas.extrude`）。インゴットは 上・左・右の 3 面、トマトは へたを 上から、バケツは 口を 大きく、なわは 上から 見た 輪、かぶとは 上から 見た はち、よろいは 正面 3/4（右に 横の 面）。
- 刀: 刀身を 左下の すみから 右上の すみまで（つか・つばを 小さく）。
- LoL の 「感じ」だけ（絵は 写して いない・自作）: 明暗の しきいを つよく、右下の ふちに **逆光**（夜でも 形が 消えない）、金具と 玉に 強い 光、よろい・かぶとは 深い 赤（CRIMSON）。
- こまかい もよう を へらした（なわの より・金の 点）。
- 見直し 3 回: 1) 刀身が まだ 短い・よろいが 朱色・なわが ざらつく → 2) 刀身を 対角 いっぱい・CRIMSON・よりを まばらに → 3) 夜で 弓が しずむ → 弓を 明るく＋光。
- のこる 弱さ: 本物の 等角（同じ 角度）では なく「見下ろし ぎみ」で 統一は ゆるい／LoL ほどの 絵画的な ぼかしは 32 px の ドットでは 出ない／よろいの 肩が 丸い かたまり／かぶとの 角が 胴の 前に 重なる／草ブロックは v3 の まま。
