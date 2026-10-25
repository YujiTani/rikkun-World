# がしゃどくろ 少女形態の効果音 v1（issue #293）
オーナー OK 済みの 13 音 17 ファイル（Vorbis q5）＋ 1 ファイル（笑い声）。出どころ・作り方・素材のライセンスは共有フォルダ `gashadokuro/sfx-v1/README.md`（効果音ラボの鐘・太鼓を加工。炎・風などは合成）。
鳴らす場面と数は `src/gasha/gashaGirlSfx.ts`、音量・間引き・ゆらぎは `src/gasha/gashaGirlTuning.ts` の `sfx`。

## bgm/（#293 リリース、オーナー決定 2026-10-24）
- `saiyaku.ogg`「災厄」（少女、Heitaro Ashibe）・`kamigami.ogg`「神々の戯れ」（大きな姿、作曲 こおろぎ）。もとの mp3（共有フォルダ gashadokuro/bgm/）は ogg（Vorbis q3、44.1kHz ステレオ）に 変換して、ループ用に 切った もの。mp3 は リポジトリに 入れない。
- ループの 切り方: 神々の戯れは 曲の おわりの 余韻（108.0 秒より あと 1.06 秒）を 頭に 重ねて 108.0 秒で 切る。災厄は おわりが 急に 切れて いるので、おわり 2 秒と 頭 2 秒を 等パワーで クロスフェードして 115.33 秒に した。どちらも つなぎ目の 段差は ふつうの 隣あう サンプルの 差（99%）より 小さい（デコード後に はかった）。
- 読む 先は `src/gasha/gashaBgm.ts` の `BGM_FILE`（相対パス）。

## 笑い声（FIX-BRIEF-2 §4、オーナー選定 2026-10-24 15:59）
- `girl_laugh_a.ogg`（少女の 笑い声）。共有フォルダ `gashadokuro/sfx-laugh/ogg/` の 候補（girl_laugh_a/b/c）から オーナーが 選んだ もの。
- 差しかえかた: 選んだ ogg を ここに 入れて、`src/gasha/gashaGirlSfx.ts` の `SFX_FILES`（girl_laugh）の ファイル名を 書きかえる だけ。
- とどめ（finish_blow_a）・くずれる（crumble_b）の 音は 大きな 姿の もの なので `big/` に ある。
