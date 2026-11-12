# VOX-I-4a: 国だけの物 その 1（置く仕組み＋ひろえる小物）（#187）

| 項目 | 内容 |
|---|---|
| マイルストーン | VOX（親 #99） |
| issue | #187（3 つの PR に分ける。これは 1 つめ） |
| 状態 | テストの準備（赤）→ 開発へ |
| 周回数（全ループ合計） | 0 / 10 |

## 関連
- 仕様書: `docs/design/VOX-I.md`（6 版）§2.2・§2.3・§2.5・§5・§8.3・§9 の `#187-AC*`。
- 絵: `docs/art/biome-final.md`「国だけの物」の表と申し送り 3・7、見本 `docs/art/biome/final-2.png`。顔の まばたき・ゆれ は #186 なので **ここでは 1 コマめの止まった絵だけ**。
- 今の しくみ: 国の表 `src/world/gen/countryTable.ts`、国を読む `src/world/gen/biome.ts`、テストの窓口 `src/world/gen/biomeHook.ts`、木・はな などの配置 `src/world/gen/placement.ts`・`flora.ts`、作物 `src/world/gen/farmPlacement.ts`（やせいの やさい）。

## この PR で入れる物（6 種）
| `type` | 国 | 新しいブロック |
|---|---|---|
| `hatakeato` | はらっぱ | なし（つち＋今の やせいの やさい） |
| `kinokoNoWa` | もり | **きのこ** |
| `himawari` | はなばたけ | **ひまわり**（2 段） |
| `kaigara` | すなはま | **かいがら** |
| `takenoko` | たけやぶ | **たけのこ** |
| `tsukimiIwa` | すすきの はら | なし（いし） |

あとの PR: 4b = すいしょう・とうろう・かいだん・おおもみじ・おちば・ゆきだるま。4c = ぬしの木・うろ・はすの は・しま。

## 受け入れ基準（この PR の分）と層
| AC | この PR で見る所 | 層 |
|---|---|---|
| #187-AC1 | 上の 6 種の数（§2.3 の表）。はたけあと・きのこの わ・つきみの いわ は 置けない升目 2 割まで、ひまわり は 8 割の升目で 3 以上 | ユニット（3 シード 20261012・1・777、各国 20 升目） |
| #187-AC2 | 6 種が その国の升目の外・境目（`e < blend`）に 0 こ | ユニット |
| #187-AC3 | 作る順に関係なく `biome.features` が同じ（覚えを捨てて逆順） | ユニット |
| #187-AC7 | きのこ・ひまわり・かいがら・たけのこ の役わり（§5）。ひまわり は 2 段で立ち、上がふさがると置けない。どちらの段を こわしても 2 段とも消えて 1 こ | ユニット |
| 生成とのずれ | `biome.features` の場所に、生成した世界で本当に その物がある（チャンクを作って確かめる。数か所でよい） | ユニット |
| 見える | E2E 1 本: はなばたけ の ひまわり の前にワープして、ひまわりの 2 段が ある（`window.__rikkun` で読む） | E2E |

テストの場所: ユニット = `src/world/gen/countryFeatures.test.ts`（新）・ブロックの役わり = `src/world/blocks/` の近くのテスト。E2E = `e2e/voxI4a-features.spec.ts`（新。`e2e/shard-times.json` に足す）。

## いっしょに入れる: たけを細くする（yuzu 2026-11-11）
- #437 の試し `?bamboo=voxel`（`src/world/render/leafBambooMode.ts`・`leafBambooFill.ts`、9 マスのうち 稈の はば 3・ふし つき）を **既定** にする。`?bamboo=current` で 前の太い形も見られるように残す。
- 見た目だけ。当たり（1 ブロック・くぐれない）と ほる・持つ は変えない。見た目の変更で こわれる golden・スナップショットは 意図した変更として更新してよい（期待の遊びは変えない）。

## 見た目
新しい 4 ブロックの絵は biome-final の 1 コマめ。ゲームに入れた試作のスクショで yuzu の OK をもらってからマージ（テストの準備と並べて進める）。

## テストが 前提にした 名前（テストの準備）
- ブロックの id: きのこ = `kinoko`、ひまわり = `himawari`（下の段）と `himawari_top`（上の段）、かいがら = `kaigara`、たけのこ = `takenoko`。アイテムは `kinoko`・`himawari`・`kaigara`・`takenoko`（`himawari_top` という アイテムは 無い。ほると `himawari`）。4 つとも 固くない・こわせる・置ける（`placeBlock` が 自分）。
- 生成の窓口: `src/world/gen/countryFeatures.ts` が `featuresInRect(seed, x0, z0, x1, z1)` を export（`{ type, cx, cz, x, y, z }[]`）。`window.__rikkun.biome.features(x0, z0, x1, z1)` はその 包み（`biomeHook.ts`）。`cx, cz` は 国の升目の番号（`countryAt` の `cx, cz` と同じ）。
- 基準のマス: ひまわり・かいがら・たけのこ は その物の マス（ひまわり は 下の段。上は y+1）、きのこの わ は まん中（8 か所は 半径 3 の たて・よこ と ななめ 2,2 で、y は ±3 の中）、はたけあと・つきみの いわ は 置いた 場所の まわり（やさい 3 本以上／いし 15 こ以上を 近くで数える）。
- 仕様に 書いていない 仮定（テストの 置き方）: たけのこ は 20 升目の 合計で 1 こ以上（陸の升目で 実測したら 7 割は 通らなかった）・たけのこ どうし 8 以上は チェビシェフで はかる。「点から 32・40 以内」もチェビシェフ。ひまわりの 数の上は 5 こ。かいがらは 1 列 4 こまで（2〜4 の下限は 見ない）。はたけあと は やさいの 下が `dirt`、つきみの いわ は まん中の 列に いしが 3 つ以上つながる。
- 「各国 20 升目」は「点が 陸（海面より上）の 升目 20 こ」と 読む（点が 海の升目は 水の上なので 置かない。PO の決め）。
- たけのこ は `takePath` の マスの上。「その国の升目」= `countryAt` が 同じ kind・同じ cx, cz・`e >= blend`。
- ユニット: `src/world/gen/countryFeatures.test.ts`・`src/world/blocks/voxI4aBlocks.test.ts`・`src/dig/himawari.test.ts`。E2E: `e2e/voxI4a-features.spec.ts`。
