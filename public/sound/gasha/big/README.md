# がしゃどくろ 大きな姿の効果音 v1（issue #293）
オーナー OK 済み（2026-10-24）の `gashadokuro/sfx-big-v1/` から、いま組み込んでいる音だけ。ふつうの音は ogg、**ループ（a1_quake・a3_beam_loop・a4_embers・a4_embers_b）は wav**（ogg は先頭に無音が入ってつなぎ目で切れる）。tired_* は使わない。
出どころ・作り方・素材のライセンスは `sfx-big-v1/README.md`（効果音ラボの鐘・太鼓・雷・炎を加工、ほかは合成）。
鳴らす場面と数は `src/proto/gashaBigSfx.ts`、音量・ゆらぎ・フェードは `src/proto/gashaBigTuning.ts` の `sfx`。
