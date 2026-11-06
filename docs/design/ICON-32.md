# ICON-32: アイテムアイコンを 32x32 で 描きなおす（設計・見積もり）


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

## 5. 絵柄（v5 に 決定）と きまり

### なぜ v5 か（経緯 みじかく）
- 64×64・128×128 案 → オーナー「ふんいきが よくない」で 32×32 に。
- 横から 見た 絵（A/B・v3）→「もっと よく できる」。見下ろしの クォータービューと、LoL の 武器・防具アイコンの 感じ（明暗・逆光・金属の つや）を 参考に v4・v5。
- **v5 で オーナー OK（2026-11-05「この 方向で、残りを 全部 描いて」）**。不採用の 案の 絵と スクリプトは リポジトリから 消した（git の 履歴には ある）。PixelLab は キーが なく 使って いない（下絵の パイプラインも 消した）。

### きまり（くわしくは `.claude/agents/pixel-artist.md` の「アイテムアイコン 32×32 のきまり」）
- カメラ 1 つ: 上から 約 35〜45 度・光は 左上・地面に うすい かげ・厚みは 下へ。道具・武器は 斜め。
- 色は 素材ごとの 5〜6 段（`art/ICON-32/lib.py`）。暗い ほど 青むらさき、明るい ほど 黄み。真っ黒・真っ白なし。
- ふち: 上・左は 部品の いちばん こい 色、下・右だけ こい ふち色、下・右の 内がわに 逆光。
- 線は 2px 以上、乱数なし、こまかい もようは へらす。めずらしい 物（金・金剛）は きらり。
- 形は 法線で かげを つける 形（球・円柱・多角形）＋ 手で おく 点（`art/ICON-32/build.py`・`gear.py`・`misc.py`）。ブロックは タイルから 箱を 自動で。

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

## 9. 本番 バッチ 1（2026-11-05、オーナー「この 方向で 残りを 全部」）

### しくみ（ゲームへの つなぎ）
- 絵の 元: `art/icons32/<id>.png`（32×32・透明）。下絵は `python3 art/ICON-32/build.py` が 書く（乱数なし。手で 直した id は `art/ICON-32/keep.txt` に 書けば 上書き しない）。
- アトラス: `python3 art/ICON-32/pack.py` → `src/assets/icons32.png`（16 列）＋ `icons32.json`（`size`・`cols`・`ids`）。CI は `pack.py --check`（画素と 表を くらべる。Pillow の 版で PNG の バイトが 変わっても 落ちない）。
- 読みこみ: `src/ui/iconAtlas.ts`（`ICON_SIZE = 32`・`loadIconAtlas()` を `main.ts` の さいしょで 1 回・`atlasIconUrl(id)`）。`itemIconUrl()` が アトラスに ある 物は 32×32 を、ない 物は 今の 16×16 を かえす（CSS の 大きさは 同じ = 2 倍）。読みこみに 失敗 しても 16×16 で 動く。
- 3D（落ちもの・手に 持つ・かまど・武器の エフェクト・サムネ）は `itemIconPixels()`（16×16）の まま。UI の CSS は もともと `image-rendering: pixelated`。
- テスト: `src/ui/iconAtlas.test.ts`（大きさ 32・表の id が 全部 アイテム・PNG の 大きさ・全 アイテムに 32 か 16 の 絵）。

### できた 数（91 / 139）
| なかま | できた | のこり |
|---|---|---|
| 道具 | 23 / 23 | 0 |
| 武器 | 13 / 13 | 0 |
| 防具 | 20 / 20 | 0 |
| ブロックの 箱（タイルから 自動、草花 4 つは 板の 絵を 2 倍） | 30 / 30 | 0 |
| プロトの のこり（インゴット・ダイヤ・なわ・焼きもも・トマト） | 5 | ― |
| 食べもの・材料・金属・家具・家の ブロック・あかり・植物の のこり | 0 | 48 |

### 見直し
- 1 回目: 斧の 頭が かたまり・刀の 刃が 太い・雷/風/虹が 見えない・こてが 棒・すねあてが 本 → 2 回目: 斧に 刃の 光・刀を 細く・雷は 金の ジグザグ・風は うず・虹は 6 色の 帯・こては 板の すきま・すねあては ひざの 金具 → 3 回目: 斧が 暗い・わきどころの うずが 見えない → 明るく・うずを こい 色に。茶・草・夜で 確認（`/workspace/icon32-shots/batch1-3bg-*.png`）。
- ゲームの 中: ホットバー・持ち物・クラフトで 32×32 が 出る ことを Playwright で 確認（`batch1-hotbar/inventory/craft.png`）。

## 10. でんせつ（legendary）の 11 点（元に なった 物と 絵の とくちょう）

元の 物は しらべて 形・色・もようを 参考に した（絵は 写して いない。すべて 自分で ドットを おいた）。生成は `art/ICON-32/legend.py`。

| id | 元に なった 物 | 出典 URL | 絵に 使った とくちょう |
|---|---|---|---|
| raijin_ken | 雷神（風神雷神図屏風・俵屋宗達、建仁寺）: 太鼓の 輪を せおい、巴の もようの 太鼓を ばちで 打つ | https://thedeityproject.com/pages/deities/raijin-and-fujin ・ https://japonista.com/fujin-raijin | つばを 太鼓の 輪（6 つ・金の 巴の 点）、むらさきの 刀身に 金の いなずま |
| fujin_ken | 風神: みどりの 体、ふくらんだ 風ぶくろ（口を ひもで しばる） | 同上 | つばを みどりの 風ぶくろ＋金の ひも、青みどりの 刀身、白い 風の うず |
| niji | 天浮橋（あめのうきはし）: 天と 地を つなぐ はし、にじと 考えられる。絵柄は オーナーの 見本（`/workspace/refs/rainbow-katana-ref.png`、玉虫色の 刀）の 感じ だけ 参考 | https://en.wikipedia.org/wiki/Ame-no-ukihashi | 強く そった 刀身・玉虫色の うず（マゼンタ・ピンク・むらさき・青・水色・みどり）・刃に 白い 光・黒い つば（金の すかし）・黒い つか巻き |
| samurai_jingasa | 陣笠: 平たい 円すいの 笠、黒うるし、金の 家紋、てっぺんの 八幡座、うらは 朱 | https://www.meihaku.jp/art-knowledge/about-jingasa/ ・ https://searchcollection.asianart.org/objects/18647 | 黒うるしの 円すい・金の ふち・三つ星の 家紋・金の 八幡座・ふちの 下に 朱 |
| samurai_haori | 陣羽織: そでなし・広い うでの 穴・えりと ふちに 金・家紋 | https://samuraimuseum.de/en/learn/jinbaori/ | そでなしの 深い 赤・金の ふち・黒の 合わせ・かたに 白丸の 家紋 |
| samurai_tekko | 明珍（みょうちん）: 鉄の 板を 筋で つなぐ 名人の 家、金の 金具 | https://samuraimuseum.de/en/learn/kabuto-the-helmet-of-the-samurai-history-anatomy/ | 黒鉄（くろがね）の 板＋金の 帯・手の 甲に 金の びょう 4 つ |
| samurai_geta | 下駄: 木の 台・下に 2 まいの 歯・鼻緒（指の 間を 通る V 字） | https://en.wikipedia.org/wiki/Geta_(footwear) | 1 つの 下駄を ななめに、下に 歯 2 まい、赤い 鼻緒、金の 前つぼ |
| ninja_zukin | 伊賀の 頭巾（オーナーの 見本 https://ff14.norirow.com/note/84844 の 「角の ある 頭巾・首の スカーフ・青むらさきの 差し色」を 感じ だけ 参考）／ 忍び頭巾: 頭・首を おおい 目だけ 出す。じっさいは 黒より 藍 | https://www.ninja-museum.com/ninja-database-en/?p=517 | 藍の ずきん・角の ような 2 つの とんがり・目の 帯・青むらさきの えりまき |
| ninja_shozoku | 忍び装束: 前を 合わせる うわぎ・おび（道具を さす） | https://www.ninjutsushop.com/en/ninjutsu-equipment/ninjutsu-guide/shinobi-shozoku/how-to-choose-your-traditional-ninja-uniform-shinobi-shozoku.html | 藍の うわぎ・むねに くさりかたびら・青むらさきの えりまきと おび・せなかの 小太刀・長い 半マント（伊賀の 見本: 鎖帷子・小太刀・半マント） |
| ninja_tekko | 手甲: うで・手の 甲を おおう 布、こはぜ。ゲームでは かくした 小太刀が 出る | https://www.ninja-museum.com/ninja-database-en/?p=529 | ごつい 鉄の 板（伊賀の 見本: ごつめの 籠手）・青むらさきの まき・手首から 出る 小太刀 |
| ninja_tabi | 足袋: 親ゆびが わかれた たび、こはぜで とめる | https://en.wikipedia.org/wiki/Geta_(footwear)（たびと 鼻緒）・上の 忍び装束の 出典 | 1 つの 藍の たび・すねの 脚絆・ななめの 青むらさきの かざり（伊賀の 見本: 左右ちがいの かざり）・親ゆびの われめ |

- はきもの（下駄・足袋・すねあて 3 つ）は 1 つ だけ に 描きなおした（オーナー 2026-11-05）。
- まえ・あと: `/workspace/icon32-shots/batch1-legendary-before-after.png`・`batch1-footwear-before-after.png`・`batch1-niji-before-after.png`・`batch1-iga-before-after.png`。
- 2 回目の 描きなおし（オーナー: 「カッコ悪すぎる」）: 剣 3 本は art/ICON-32/hero.py（画面の 対角 いっぱいの 大きな 刀身・こい 芯と 白い 刃の 強い 差・光る みぞ・大きな 金の つばと 宝玉・属性の 半とうめいの 光・切っ先の きらめき）、伊賀 4 点と 明珍 4 点は art/ICON-32/armor_hero.py（こい 芯＋明るい ふち、差し色を はっきり、金属に 白い 光。頭巾に 鉢金と 光る 目、忍着に ななめの 小太刀と かた当て、手甲に 手甲鉤、陣笠は 黒うるし＋太い 金の ふち）。LoL・パズドラの 武器絵の 考え方（大きな シルエット・ななめ 構図・強い 明暗・差し色の 光）だけ 参考、絵は 写さない。
- 風神剣は オーナーの 見本 画像（refs/fujin-ken-ref.png: 細い まっすぐな 銀の 刀身・金と 黒の つば・刀身に まきつく うすい みどりの 風の リボン）の 感じ だけ 参考: 雷神剣と 同じ 形の 兄弟に して、銀の 刀身＋白い 刃、刀身の うしろと まえを 通る うすい みどりの 風の 輪、黒い 風ぶくろの つばに 金の ひも。
- 雷神剣は オーナーの 見本 画像（refs/raijin-ken-ref.png: 細長い 黒い 刀身と 銀の 刃・かざりの ある つば・刀身の まわりで はじける 黄色と 白の いなずま・うすい うずの オーラ）の 感じ だけ 参考: 黒い 刀身＋銀の 刃、左右に 金と 白の いなずま、うすい むらさきの うず。太鼓の 輪の つばは 由来（雷神の 太鼓）なので のこす。
- 侍（明珍）4 点は オーナーの 見本 https://connietarte.com/2018/03/18/post-2414/ （明珍シリーズ: 深みの ある 赤の 羽織・着物の ししゅう・ところどころの 金属の かざり・陣笠・手甲・下駄・幕末の 志士の ふんいき）の 感じ だけ 参考: 羽織に 金の ししゅうと かたの 鉄の 金具、手甲の 布を 深い 赤に、下駄の 鼻緒も 深い 赤。
- 見本の 絵（ゲームの 絵・イラスト）は 形・色の 感じ だけ 参考に し、絵そのもの・キャラは 写して いない。

## 11. バッチ 2（のこり 48 点 → 139/139）

- 絵: `art/ICON-32/batch2.py`（あかり 3・たねと 植物 10・食べもの 3・素材 11・家具と くらし 16・家の ブロック 5）。v5 の きまり（見下ろし・5 段の 色・ふち線＋リム光・1x で 3 つの 背景）。
- 家具は 同じ 見下ろしの 箱（`box`）で そろえる（兄弟の 形を そろえる）。家の ブロック（ゆか・かべ・やね）は 16×16 の 面の 絵を はった 箱、しょうじ・戸は たてた 板。もとの 16×16 は `ref/old48.json`。
- 兄弟: なまもも＝やきももと 同じ 形で 色だけ、きん＝鉄の 延べ棒と 同じ 形、きんの たまご＝たまごと 同じ 形＋きらり、たねの ふくろ 4 つは 同じ ふくろに 中の 野菜だけ ちがう。
- わらじは はきもの なので 1 つ だけ 大きく。
- はらぱんみみず（epic・おなかが ぱんぱんの まぼろしの みみず。図鑑の 文から）: 頭から しっぽまで ぜんぶ 枠に 入る S 字、まん中の おなかを ふくらませ、頭の 近くに うすい 環帯、にこにこ顔と きらり。
- ついでに 直した 弱い ところ: くわ（斧に 見えた → 下へ たれる 平たい 刃）、どうつき（とって を 横に）、ふつうの 刀 4 本の つか・つばの 色を ちがえる、風神剣の 風を 明るく（草の 背景で 見える）。
- テスト: すべての アイテムに 32×32 が ある（`iconAtlas.test.ts`）。

## 12. はみ出し なし（オーナー: 「枠で 切れて いる」）

- しらべ: 139 点 中 76 点が ふち線ごと 0 か 31 の 列・行に かかって いた（`/workspace/icon32-shots/batch2-nocrop-before-after.png`）。
- なおし: `lib.Canvas` と `hero.Hero` は よゆう 8 マスの 大きな 紙に 描き、`lib.fit` が ふち線ごと 1..30 に おさまるよう 動かす。30 を こえる 物（長い 刀・なぎなた・たこ など）だけ 最近傍で すこし ちぢめる。
- テスト: `iconAtlas.test.ts`「はみ出し なし」（アトラスの どの アイコンも ふちに 不とうめいの 点が ない）。例外 なし。
- レビュー: `art-reviewer.md` に「はみ出し なし」と「スクショは さいごの 絵の コミットの あと」。

## 13. おまもり・やぶれた おまもり（見本: 大英博物館の 収蔵品の 説明）

- https://www.britishmuseum.org/collection/object/A_As2001-16-72 ・ https://www.britishmuseum.org/collection/object/A_As2001-16-112 ・ https://www.britishmuseum.org/collection/object/A_As2001-16-39-a-c ・ https://www.britishmuseum.org/collection/object/A_As2001-16-40
  - たて長で 平たい（高さ 15〜20cm・はば 2〜5cm）にしき（金糸の 織り）の ふくろ、まん中に たての 字（社寺の 名・ごりやく）と 紋、口を ひもの 結び目で とじ、同じ ひもで わを 作って つるす。ひもは 白か むらさき。
- https://kotomix.hatenablog.com/entry/2026/08/20/070000 ・ https://a-gyo.dreamlog.jp/archives/1240605.html （古く なった おまもり: ひもが 切れる・けば立つ、ふくろの ぬい目が ほつれる・さける、中の 紙が 見える、色あせ・すれ・しみ）
- 絵: ふつうは 深い 赤の にしきに 金の ふち・ひし形の 点・金の 紋と たての 字、むらさきの 結び目（左右の わ＋たれ）と つるす わ。やぶれは 同じ 形・色を 色あせ させ、右下が さけて 白い 紙、ひもが 切れて ほつれ、糸くず、しみ。写真は 写さず 特ちょう だけ。

## 14. 参考を 先に（reference-first・オーナーの きまり）

1. 描く・描きなおす 前に ウェブで よい 参考（写真・イラスト）を さがす。でんせつ・昔話・実在の 物は 由来も。角度・出どころは できれば 複数。オーナーの 見本が あれば それを いちばん 先に。
2. 参考を 見る。
3. 参考の URL と 見た目の 特ちょう 3〜5 こ（形・色・かざり・その物 らしい ところ）を この 文書の 出典メモ（§10・§13 など）か アイテムの 設計メモに 書く。
4. 形・デザインの 参考 だけに して 描く。写さない。
5. できた アイコンを 参考と 3 倍・8 倍で ならべて くらべる。
- レビュー（`art-reviewer.md`）: URL と 特ちょうが 書いて あるか・特ちょうが アイコンに 出て いるか・写して いないか。
