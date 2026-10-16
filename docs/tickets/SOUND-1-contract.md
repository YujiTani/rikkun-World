# SOUND-1 つなぎ目の追加の約束（PO、2026-10-16）

tester が E2E を書いて出た不足を、ここで決める。2 枚の票とこのファイルが食い違うときは、このファイルが正しい。

1. 設定の名前: `battleEnterTicks`（既定 30 = 0.5 秒）と `battleExitTicks`（既定 240 = 4 秒）。`settings.get/set` で読み書きできる（composer が足す）。
2. 音の画面の部品には `data-testid` を付ける: `sound-mute`（「おと」ボタン）、`sound-open`（「おとの おおきさ」ボタン）、`sound-panel`（枠）、`sound-master` / `sound-bgm` / `sound-fx`（つまみ）。表示の文字は SOUND.md §7 のまま。
3. `audio.sfx()` が返す記録 1 件の形: `{ name: string, semis: number, chord: { root: number, minor: boolean }, t: number }`。`semis` は C を根音として作った音からのずらし（半音、-5〜+6）。`chord` は **鳴らした瞬間** の和音（`root` は 0〜11、C=0）。和音に合わせない音は `semis` 0・ゆらぎぶんは入れない。
4. `?nosave=1` は世界の保存だけを止める。音の設定（localStorage `rikkun.audio.v1`）はいつも保存する。
5. `audio.state().screenLevel` は目標の倍率（ならしている途中の値ではない）。

E2E（`e2e/sound1.spec.ts`）は、つなぎ込みのときに composer がこの約束に合わせて直してよい（期待する中身は変えない）。
