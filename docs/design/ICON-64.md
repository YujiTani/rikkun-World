# ICON-64: アイテムアイコンを 64x64 で 描きなおす（設計・見積もり）

状態: 設計＋プロトタイプ（8 点）。本番の 差しかえは まだ（オーナーの 絵柄 OK 待ち）。
大きさは 1 つの 定数 `ICON_SIZE = 64`（最初は 128 の 案 → オーナーの 指示で 64 に）。あとで 変えるときは この 定数と 絵を 作りなおす。

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
- 新しく `itemIcon64Url(id)` を 作り、2D の UI は こちらへ。64 の 絵が まだ ない id は **16x16 を 4 倍（ニアレスト）した もの** を 返す → 少しずつ 差しかえ られ、とちゅうでも ゲームは こわれない。
- 表示: 64 の 絵を 48〜96 CSS px で 出す。DPR 2 では いつも 拡大 なので `pixelated`。DPR 1 で 64 未満に 縮める ところ（インベントリの 小さい マス）は 線が 欠けない ように `image-rendering: auto`。できる ところは 表示を 32/64 px に そろえる。

## 4. 64x64 を PNG で もつか、コードで もつか（比較）

| | PNG ファイル（`art/icons64/<id>.png` → まとめて アトラス 1 枚） | コードの 配列（今の 16x16 と 同じ やり方） |
|---|---|---|
| 直しやすさ | ◎ オーナーが Aseprite / Piskel / LibreSprite で ひらいて そのまま 直せる。差分も 画像で 見られる | ✕ 64x64 = 4096 マス。文字の 配列や 描画コードを 直すのは 人には ほぼ 無理 |
| 大きさ（バンドル） | ◎ アトラス 1 枚（12x12 マス = 768x768）で およそ 150〜300 KB（PNG 圧縮・パレット少なめ）。画像は JS と べつに キャッシュ | △〜✕ 文字の 配列なら 1 点 約 4〜8 KB → 150 点で 1 MB 前後の JS。手続き コード なら 小さいが「絵を 直す」=「コードを 直す」に なる |
| 決まった 結果・テスト | ○ PNG が 正（source of truth）。テストは「全 ItemId に 絵が あるか（なければ 4 倍の 代わり）」「64x64 か」「アトラスの 表と ずれて ないか」を Node で PNG の ヘッダ・表を 読んで 見る。画素の スナップショットは いらない | ○ Node で 画素を そのまま テスト できる |
| CI | ○ アトラスを 作る スクリプトを `npm run icons` に して、CI では「作りなおしても 差分が でない」ことを 見る（作り忘れの 検出）。Vite が PNG を `?url` で 取りこむ | ◎ 追加 なし |
| 読みこみ | △ 画像 1 枚を 非同期で 読む。読めるまでは 16 の 4 倍を 出す | ◎ すぐ 使える |
| ratchet / knip | ○ 影響 ほぼ なし | △ 大きな ファイルが 増え 行数の ratchet に かかる |

**おすすめ: PNG**。理由は オーナーが 自分で 直せる こと（今回の 目的）と JS が ふくらまない こと。
作り方は 2 段: (1) `art/ICON-64/build.py`（このPRの 生成器）で **下書き PNG** を 作る → (2) 人が ピクセルエディタで 仕上げて `art/icons64/` に おく。いちど 仕上げた PNG は 生成器で 上書き しない（生成器は `art/ICON-64/proto/` に しか 書かない）。

## 5. 絵の きまり（プロトで ためした もの）

- 光は 左上。部品ごとに 3 段（こい・ふつう・明るい）＋ 白の きらり。
- 外の ふちは 1px、今と 同じ `#2a1e14`。部品の さかいは その 部品の こい 色（sel-out）。
- 色の 家族は 素材で そろえる（鉄・はがね・金・木・なわ…）。めずらしさは 今の 色の 感じを つづける。
- ブロックの アイテムは タイル（16x16）を 斜めの 箱に はる（上 1.0・左 0.8・右 0.6）→ ブロック 約 40 点は ほぼ 自動。
- 見本: `art/ICON-64/proto/*.png`、シート（上 = 今の 16、下 = 新しい 64）は `python3 art/ICON-64/build.py <出力>`。

## 6. 見積もり

| まとまり | 数 | やり方 | 手間 |
|---|---|---|---|
| ブロックの アイテム（タイルから） | 約 40 | 斜めの 箱で 自動 | 小（1 回） |
| 道具・武器（つるはし・斧・刀・忍具…） | 約 30 | 部品の 組み合わせ＋手直し | 中 |
| 材料・食べもの・畑 | 約 35 | 下書き＋手直し | 中 |
| 防具・家・いきもの・その他 | 約 35 | 下書き＋手直し（形が ばらばら） | 大 |
| ItemId で ない アイコン | 約 10 | 下書き＋手直し | 小 |

バッチ: 1) 土台（`itemIcon64Url`・アトラス・テスト・CSS）＋ブロック → 2) 道具・武器 → 3) 材料・食べもの → 4) のこり。1 バッチ 1 PR。

## 7. リスク

- 小さい マス（DPR 1 で 48 px など）で 縮めると 細い 線が 消える → 線は 2px 以上、プロトの 48px 表示で 確認ずみ（`proto-ingame.png`）。
- 16 と 64 で 見た目が ずれる（3D の 落ちもの は 16 の まま）→ 色の 家族を そろえて 同じ ものに 見える ように する。
- 画像の 非同期 読みこみの 一瞬 → 16 の 4 倍で うめる。
- 139＋ 点の 手直しは 時間が かかる → バッチに わけ、とちゅうでも 4 倍の 代わりで 出せる。

## 8. オーナーに 決めて ほしい こと

1. 絵柄（プロトの 8 点）で よいか。
2. PNG 方式で よいか（自分で 直す ときの エディタ）。
3. ブロックの アイテムは 斜めの 箱で よいか（今は 正面の タイル）。
