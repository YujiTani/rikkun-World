# public/sound/legend/ 風神剣・雷神剣の 音（WEAPON-8 #239）

加工した 音の ファイルだけ（元の 素材は リポジトリに 置かない）。ogg（Vorbis・モノ・48 kHz・約 100 kbps）14 個、合計 約 170KB。

| ファイル | 何の 音 | 作り |
|---|---|---|
| `windWave_0〜2.ogg` | 風神剣の 真空波（小さな 風の 刃）3 とおり | 合成（`docs/audio/WEAPON-8/attack2_render.py`） |
| `thunderSlash_0〜2.ogg` | 雷神剣の 斬撃に まざる 雷 3 とおり | 合成（同上。粒の 立ち上がりを 0.003 秒 以上に） |
| `spiralWind.ogg` | ためわざ「らせんの かぜ」 | 合成（同上） |
| `chargeRise*.ogg` | ため（1.0 秒。味なし / `_fujin` / `_raijin`） | B2「ひかりの うた（しずか版）」。VCSL 録音 ＋ 合成 |
| `chargeReady.ogg` | いっぱいの 合図（約 1.9 秒の 余韻） | 同上 |
| `chargeHold*.ogg` | ため続け（ループ 1.2 秒。つなぎ目なし） | 同上 |

## 出どころとライセンス

- 録音は **Versilian Community Sample Library（VCSL）**、**CC0 1.0**（パブリックドメイン。ゲームに 入れて よい・クレジット 不要・再配布も 可）。https://github.com/sgossner/VCSL
  - 弓の ビブラフォン `Idiophones/Struck Idiophones/Vibraphone/Bowed/Vibes_bowed_D4_rr1_Main.wav`・`Vibes_bowed_A4_rr1_Main.wav`
  - ハンドチャイム `Idiophones/Struck Idiophones/Hand Chimes/sus_C5_r01_main.wav`・`sus_C6_r01_main.wav`
  - フィンガーシンバル `Idiophones/Struck Idiophones/Finger Cymbals/Fing_Cymb.wav`
  - グロッケン `Idiophones/Struck Idiophones/Glockenspiel/glock_soft_C6_01.wav`
- 風・ばちばち・土の 粒・低い 押しは コードで 作った 合成音（権利の 問題なし）。
- オーナー提供の 素材（u1〜u5）は 使って いない。

## 作り直し方

`docs/audio/WEAPON-8/` の `render.py`・`b2_render.py`・`attack2_render.py` から 部品ごとに 書き出し（シード 7・21・107）、`ffmpeg -c:a libvorbis -q:a 3` で ogg に した。
ゲームの ものさしに そろえて ある: 攻撃音は 台本の 大きさ ÷ 0.6（ミキサーの master が かけ戻す）、ため音は WAV より −2.1 dB（−6.5 dB ＋ 0.6 の 戻し）。`fxVolume` 0.5 で 倍率 1。

## 虹（WEAPON-9）の 音（B 案「はがねの にじ」・斬撃は C3）

`shiningStart`・`shiningEnd`・`shiningReady`・`shiningHit_0〜2`・`domeErase_0〜2`・`domePull`（ループ 2 秒）・`nijiSlash_段_0〜2`（9 個）。元は `docs/audio/WEAPON-9/` の wav（`B_hagane_*`・`C3_cut_slash*`）を `ffmpeg -c:a libvorbis -q:a 3 -ac 1 -ar 48000` で ogg に した。
`nijiSlash` は オーナー提供の 見本（on-jin）を 切りはりした 物。**配る・公開する 前に 差しかえか 規約の 確認**（決定 `2026-10-21-niji-sound-b.md`）。
