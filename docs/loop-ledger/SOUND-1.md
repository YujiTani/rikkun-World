# SOUND-1 ループ台帳

- 2026-10-16 方向: sound-director が 3 案（A/B/C）→ audio-reviewer 合格（連打のピークを -0.4 → -1.9 dBFS に直した）→ オーナーが B を選んだ。
- 2026-10-16 仕様: SOUND.md・SOUND-1-bgm.md・SOUND-1-sfx.md → design-reviewer 合格。直した所: 音の画面の配置（§7）、`holdDuck` を足した。軽微: 「こうかおん」は 6 歳に難しいかも（オーナー確認で聞く）、fxVolume の保存先を票に明記。
- 2026-10-16 dev/code-reviewer（BGM 側）: 合格。【軽微】songBus.ts のこだま（delay↔feedback の輪）を曲の片付けで disconnect していない（BgmPlayer.ts tick の片付け）。【軽微】タブが隠れると setInterval(25ms) が 1 秒おきに間引かれ、先読み 0.2 秒が尽きて 0.8 秒のフェード前に音が切れうる（BgmPlayer.ts TIMER_MS / lookahead）。
- 2026-10-16 実装レビュー: code-reviewer（効果音）合格・軽微 6（comboIdx を名前ごとに、落とす判定を variation の前に など）。ui-reviewer 不合格: 音量の枠と「おとの おおきさ」ボタンが主ボタンに重なる（重大 2）、「おと」が右端ぎりぎり、「こうかおん」が分かりにくい（軽微）→ composer に差し戻し。
