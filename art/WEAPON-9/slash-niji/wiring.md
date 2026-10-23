# 虹の 斬撃 v3 の つなぎ目（developer 向け・art-director 2026-10-23）

絵の 元 `build.py`（回すと 同じ 絵）。見本 `docs/art/WEAPON-9/v3-slash.png`・`v3-slash.gif`（3 段こうげき）・`combo_slow.gif（docs にも v3-slash-slow.gif）`。**オーナーの OK 前（試作用）**。

## ファイル
| ファイル | 中身 |
|---|---|
| `niji_slash3_1x.png` 384×264 | 1 コマ 64×44、よこ 6 コマ。たて 行: 0 つき よこ / 1 つき ねかせ / 2 きりあげ よこ / 3 きりあげ ねかせ / 4 けさ よこ / 5 けさ ねかせ。板は 今と 同じ 6 マス（1 点 = 6/64 ブロック） |
| `niji_hit_1x.png` 64×96 | 火花の すじ: 8×8 の 升。よこ 0〜7 = 向き 0°,45°…315°（画面の 上 = 90°。白い 先が 進む 向き）、たて 行 = 色 × 2 ＋（0 長い / 1 短い）、色は W・Y・G・Bl・M。y 80〜95 = まん中の 光 16×16 × 3 コマ。点は 1/16 ブロック |
| `niji_slash3_reduced_1x.png` 384×264 | 「うごきを へらす」用。**ならびは 上と 同じ**（行 0〜5・コマ 0〜5）で 残像の 網だけ ない。json の `reducedTexture` |
| `slash3.json` | 下の 形（ゲームの 写し `src/fx/nijiSlash3.json`） |

ゲームの 写し: `public/models/fx/niji_slash3.png`（= niji_slash3_1x）・`public/models/fx/niji_slash3_reduced.png`（= reduced_1x）。

## 2026-10-23 試作の スクショ（art/WEAPON-9/v3-shots）を 見た 直し
- つき: 決めで 高さ 11 点（やりの 形: もと 細く → 先 太く → 先 8% で とがる）。先 3 割を 白・水色、よこの 行に 先の 星（コマ 0〜2）。長さは 24 点 = 2.2 マスの まま。
- きりあげ: 細めの 三日月（両はしが とがる・太さ 5.5 点）。**ねかせ（行 3）を 作り直し**: うしろから 見ると 前で 下から 上へ 振る 弧は たての 細い 三日月（旗の 形を やめた）。
- けさ・きりあげ: 帯の 太さ 2/3（けさ 9 → 6 点）。帯の まん中（外の へりと 内の へりの 間）を 網で ぬいて 向こうが 見える。つき と 紫の 線は べた。
- 行・コマの 番号、centroid の 形は かわらない（数は 新しい json）。コード側の 変更は reducedTexture を 読む ことだけ。

## slash3.json の 形
```
{ texture, frameSize:[64,44], frames:6, rows:{thrust|kiriage|kesa:{side,flat}}, plateBlocks:6,
  techs: { <tech>: { steps:[6 こ], total, keyFrame:1, activeSteps,
                     spawnDelay:{ firstStage, comboStage }, centroid:{ side:[[x,y]×6], flat:[[x,y]×6] } } },
  variation:{ angleDeg:5, lifeSteps:1, scale:0.05 }, mirror, reducedMotion,
  spark:{ count:[6,8], speed0 (マス/秒), speedJitter, dragPerStep, life, lifeJitter, spreadDeg, backCount, backSpreadDeg,
          gravity, shortAt, flashSteps:[2,2,3], flashBlocks, streakBlocks, texture, streakCells, flashCells } }
```

## 配線の 約束
1. **出す 時**: `techStart` から `spawnDelay` ステップ 待って 出す（1 段目 = firstStage、2・3 段目 = comboStage）。すると 白い 出る 2 ステップの つぎの 決め（keyFrame 1）が 当たる 区間の 1 ステップ目に 重なり、決めの 長さ = activeSteps（つき 2・きりあげ 3・けさ 6）。
2. **コマ**: steps の とおりに 切りかえ（今の 4×4 を やめる）。uv は repeat (1/6, 1/6)、offset.x = コマ/6、offset.y = 行（flipY なら 1 − (行+1)/6）。
3. **よこ／ねかせ**: 今の `slashViewFor` の まま。行は rows で えらぶ。
4. **左右**: カメラから 見て 左へ 振る ときは 板の uv を 左右 反転し、centroid の x を 64 − x に（slashAngleDeg に 左右の 符号を 足す）。
5. **位置**: 今の SLASH_CENTROID と 同じ 使い方で、コマごとの centroid を 刀の さきに 合わせる。決めの まん中: つき (32.5,22)・きりあげ・けさは json。
6. **ばらつき**（シード付き乱数）: 角度 ±5°・大きさ ±5%・消える コマ（2〜4）の どれか 1 つを ±1 ステップ。
7. **火花**: 当たった 妖怪 1 体ごとに、決めの はじめ（当たりの 1 ステップ目）に 1 回。数 6〜8、うち backCount 2 は 振った 向きの 逆へ（速さ 0.6 倍）。向きは 振った 向き ±spreadDeg。毎ステップ v *= dragPerStep、寿命 life ± lifeJitter、寿命の shortAt（半分）から 短い すじ。すじは 速さの 向きに いちばん 近い 45° の 升を 使う（回さない）。まん中の 光は flashSteps の 3 コマ。描画は 点 1 回か 板の まとめ 1 回（1 種類 1 つ）。
8. **うごきを へらす**: 絵を `reducedTexture`（残像 なし・同じ ならび）に かえる。うしろの 火花 2 こを 出さない。まん中の 光は 1 コマ目 だけ。
9. **一人称**（未確認）: 板が 画面の まん中を 横切るので、妖怪を かくすなら ねかせの 行を 使う などを ためして スクショで 見せる。

## 自己採点（EFFECT-KNOWLEDGE 5。ゲーム 未確認は 合格に しない）
| 観点（重み） | 点 | わけ |
|---|---|---|
| 1 当たりと 見た目（30） | 3 | けさの はば 45 点 ≒ 4.2 マス（弦 4.25）・きりあげ 約 29 点 ≒ 2.7 マス（3.1 より 少し 短い）・つき 24 点 = 2.2 マス。決め = 当たる 区間。**出す 時の 配線は 未確認** |
| 2 見やすさ（25） | 3 | 紺の ふち（出る コマ 2 点）で 昼も 夜も 出る（シートの 夜の 空）。一人称・雪・砂・妖怪と 重なる 所は 未確認 |
| 3 見分け（20） | 3 | 3 段で 形が ちがう（一本線／「/」／「く」）。後半は 紫 1 本で「もう 当たらない」。ゲームで 未確認 |
| 4 手ごたえ（15） | 3 | 先の 光の くさび・先へ 流れて 消える・はじめ 速く 止まる 火花。はじき と セットは 未確認 |
| 5 あきない（10） | 3 | 火花の 乱数・角度・寿命・大きさの ばらつき。配線は 未確認 |
| **合計** | **75（見こみ）** | 80 に とどかない ＋ 未確認 あり → ゲームに 入れて 1〜4 を 確かめてから 再採点 |
