# VOX-I-4b: 国だけの物 その 2（山の物）（#187）

| 項目 | 内容 |
|---|---|
| マイルストーン | VOX（親 #99） |
| issue | #187（3 つの PR の 2 つめ。1 つめは #459 = `docs/tickets/VOX-I-4a.md`） |
| 状態 | テストの準備（赤）→ 開発へ |
| 周回数（全ループ合計） | 0 / 10 |

## 関連
- 仕様書: `docs/design/VOX-I.md` §2.2・§2.3（suisho・touro・kaidan・oomomiji・yukidaruma・おちば の行）・§2.4（光と妖怪）・§5・§8.3・§9 の `#187-AC*`。
- 絵: `docs/art/biome-final.md`「国だけの物」の表（すいしょう・おちば・とうろう）と申し送り 3・5・7。まばたき・いき・つぶ は #186 なので **止まった絵と光だけ**。
- 4a で入った しくみ: `src/world/gen/countryFeatures.ts`（`BUILDERS`・`KIND_REACH`・`FEATURE_TUNE`。足し方は `src/content/CLAUDE.md`）、`countryFeatureBlocks.ts`、テスト `src/world/gen/countryFeatures.test.ts`。はじまりの範囲には置かない きまり も そのまま使う。

## この PR で入れる物
| `type` | 山 | 新しいブロック |
|---|---|---|
| `suisho` | いわやま | **すいしょう**（`suisho`。固い・こわせる・持てる・置ける・光 9） |
| `touro` | てんぐの やま の頂上 | **とうろう**（`touro`。固い・光 14・こわせない・持てない） |
| `kaidan` | てんぐの やま（頂上 → すそ） | なし（いし） |
| `oomomiji` | もみじやま の頂上 | なし（き＋もみじの はっぱ） |
| おちば | もみじやま の もみじの木の まわり | **おちば**（`ochiba`。地面。固い・こわせる・持てる・置ける） |
| `yukidaruma` | ゆきやま の頂上 | なし（ゆき＋目の いし。高さ 3 の だるま形） |

- ブロックの番号は 登録表の うしろに 足すだけ（上限 1024。番号を入れる配列は `BlockArray`）。`suisho_ore`（炭鉱の すいしょうの いし）とは べつの物。アイテムの `crystal`（炭鉱の すいしょう）とも べつ: 山の すいしょうは ブロック `suisho` を そのまま 持てる。
- あとの PR: 4c = ぬしの木・うろ・はすの は・しま。

## PO の決め（yuzu に 11-11 に聞いて 返事なし → 仕様どおり）
- とうろう は こわせない。光る物は たいまつ と同じ きまり（`isDarkForSpawn` は変えない）。

## 受け入れ基準（この PR の分）と層
| AC | この PR で見る所 | 層 |
|---|---|---|
| #187-AC1 | 山ごとに とうろう・おおもみじ・ゆきだるま が 1、すいしょう が 2〜4、かいだん が 0〜1（3 シード・各山 20 こ。山は `biome` の 山の点から） | ユニット |
| #187-AC2 | 5 種が その山の外・境目に 0 こ。おちば は もみじやま の外に 0 こ | ユニット |
| #187-AC3 | 作る順に関係なく同じ | ユニット |
| #187-AC4 | かいだん: となりあう 2 マスの高さの差 1 以下・上に 空気 3・うめる／けずるは 4 まで・頂上から すそ まで つながる | ユニット |
| #187-AC7 | おちば・すいしょう の役わり（§5）。とうろう は こわせない・持てない。すいしょう 光 9・とうろう 光 14（`EMISSION`） | ユニット |
| §2.4 | すいしょうから 3 マス以内・とうろうから 8 マス以内は `isDarkForSpawn` が false（夜でも） | ユニット |
| 生成とのずれ | `features` の場所に 本当に ある（とうろう・すいしょう のブロック、かいだんの 道、おおもみじの みき 2×2、ゆきだるまの 高さ 3） | ユニット |
| 見える | E2E 1 本: てんぐの やま の とうろう へワープして、とうろう のブロックと 光が 読める | E2E（CI で回す。手元では回さない） |

テストの場所: `src/world/gen/countryFeatures4b.test.ts`（新。4a のテストファイルは 800 行に近づけない）、ブロックと光は `src/world/blocks/`・`src/world/light/` の近く、E2E は `e2e/voxI4b-features.spec.ts`（新。`e2e/shard-times.json` に足す）。

## 気をつけること（4a の学び）
- 生成を変えると 列の写しテストが落ちる（`mineOres.test.ts` A4・`mine1dSave.test.ts` D9・`sectionMesher.slice.golden.json`）。**push の前に `npx vitest run` を全部**回す。
- 手元の E2E は回さない（CI にまかせる）。
- 山の頂上は はじまりから 328 以上 はなれているので、M7 の やせいの やさい の数には かからない。

## 見た目
新しい 3 ブロックの絵は biome-final の 1 コマめ。ゆきだるま・おおもみじ・かいだん の形は art（VOX-I §10）。ゲームに入れた スクショで yuzu の OK をもらってからマージ。

## テストが 前提にした 名前（テストの準備）
- ブロックの id: `suisho`・`touro`・`ochiba`。アイテムは `suisho`・`ochiba`（`placeBlock` が 自分。`dugItemOf` も 自分）。`touro` は アイテムが 無い（持てない）・`breakable: false`。`EMISSION`: suisho 9・touro 14（たいまつ と 同じ）・ochiba 0。
- `featuresInRect` の `type` に `suisho`・`touro`・`kaidan`・`oomomiji`・`yukidaruma` が ふえる（`CountryFeature` と 4a と 同じ形）。
- かいだんの 道（仕様に 道の 窓口が 無いので 足す）: `src/world/gen/countryFeatures.ts` が `kaidanPath(seed, feature)` を export。返す物は 道の 床の ブロックの `{ x, y, z }[]`（y = 床。立つのは y + 1）。頂上がわの はしの 1 歩から すそへ 1 歩ずつ ならべ、1 歩に 2 マス（はば 2）。最初の マスは feature の `x, z` の そば（チェビシェフ 1 以内）。
- 基準のマス（仕様に 書いていない 所の 読み方）: とうろう・すいしょう = その ブロックの マス。おおもみじ = みきの 北西の 根もと（そこから 2×2・高さ 10 以上の `log`、まわりの 上に `momiji_leaves`）。ゆきだるま = いちばん 下の マス（まん中の 列の 高さ 3 が `snow`、その上は 空気、近くに 目の `stone`）。
- 「山」= `mountainFrame(seed, fx, fz).mountain` の 点が 陸（海面より上）の ものを 各国 20 こまで。山ごとの 数は 山の点の まわり ±150 の `featuresInRect` で 数える（山の点どうしは 320 以上）。頂上の 置き場所は 山の点から とうろう・ゆきだるま 9 以内・おおもみじ 12 以内（§2.3 の「頂上は 点から 6 以内」＋「ない時は まわり 3 / 6」）。すいしょうは 点から 40 以内・海から +40 以上・どうし 4 以上。
- かいだん: 床は 固い・上 3 マスは `air`・床の 高さは `terrain.height` から ±4 以内・4 方向の となりの 床との 差 1 以下・たどって ぜんぶ つながる・長さ 10 歩以上・すその 床は 頂上がわより ひくい。
- 光（§2.4）の 「マス」= 光の 歩数（たて・よこ・上下 1 マス = 1 歩）。夜は `LIGHT_CONFIG.nightDarken`、判定は `isDarkForSpawn(skyLight, darken, blockLight)`。すいしょう 3 歩以内・とうろう 8 歩以内は false、次の 1 歩は true。
- おちば: もみじやま の もみじの木（`plantsInRect` の `momiji`）の みきから チェビシェフ 2 以内に おちばが 10 こ以上、そこに 「上が 空気の くさ」が のこらない。おちばは もみじやま（`countryAt` が `momiji`）の 外に 0 こ（シード 20261012 の 1 つの 山の まわり ±96）。
- ユニット: `src/world/gen/countryFeatures4b.test.ts`・`src/world/blocks/voxI4bBlocks.test.ts`・`src/world/light/voxI4bLight.test.ts`。E2E: `e2e/voxI4b-features.spec.ts`（手元では 回さない）。
