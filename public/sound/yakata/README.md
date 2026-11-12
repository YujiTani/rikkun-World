# ようかいの やかたの 音（MINE-1F #403。B「よるの おてら」）

`ambience.ogg`（やかたの ふんいき・ループ）・`challenge.ogg`（挑戦の 曲・ループ）・`gate_close.ogg`（門が ふさがる「ずずん」）・`gate_open.ogg`（門が ひらく）の 4 つです。
音の 中身・はかった 数（長さ・ピーク・立ち上がり）は `docs/audio/MINE-1F.md` に あります。場面の つなぎ方は `docs/design/MINE-1F.md` §3.4。

## 出どころ
- 和太鼓（ドン・ドドン・カカッ）・お寺の 鐘は **効果音ラボ** https://soundeffect-lab.info/ の 録音を 加工した 物です（二つ名の 出現音 `public/sound/nick/` と 同じ 素材）。
- 規約: 加工して ゲームに 入れて よい・商用 可・クレジット 任意・**素材 そのものと 加工した 物の 再配布は できません**（アプリの 中の 音として 組み込むのは 再配布に あたりません）。AI の 学習には 使いません。
- そのため この リポジトリには **加工した ogg 4 つだけ** 入れ、元の 素材（太鼓・鐘の 1 打）は 入れません。
- 風・しずく・尺八・うなり・石の ずりずり・響きは コードで 合成した 音です（権利の 問題は ありません）。

## 作り方
作った 道具と 手順は 共有フォルダの `mine-sound/yakata/`（`README.md`・`tools/`）。ゲームの 大きさに そろえた wav を、次の ように ogg に しました（vorbis q3）:
- ループ 2 つ: `ffmpeg -i B1-fun-iki.wav -af volume=12.40dB -c:a libvorbis -q:a 3 ambience.ogg`（挑戦の 曲も 同じ: `B3-chosen.wav` → `challenge.ogg`）
- 門の 2 つ: `ffmpeg -i B2-zuzun.wav -af volume=4.44dB -c:a libvorbis -q:a 3 gate_close.ogg`（`B2-hiraku.wav` → `gate_open.ogg`）
- ループは ファイル ぜんぶを くり返します（おわりの 余韻は 頭に たたんで あり、つなぎ目で ぷつっと 鳴りません）。

## 試聴
`listen.html`（開発サーバーで `/sound/yakata/listen.html`）で 4 つを 鳴らせます。ループは とめるまで くり返します。
