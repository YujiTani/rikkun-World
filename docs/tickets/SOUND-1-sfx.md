# SOUND-1-sfx: 効果音を案 B の音色に育てる（ゆらぎ・和音合わせ・数の上限）

| 項目 | 内容 |
|---|---|
| マイルストーン | SOUND-1 |
| 担当 | `sfx-designer`（この票）／ BGM・ミキサー・つなぎ込みは `composer`（`docs/tickets/SOUND-1-bgm.md`）と並列 |
| 状態 | 開発中（テストを先に） |
| 周回数（全ループ合計） | 0 / 10 |

## 目的（オーナーの言葉で）
案 B「木のおもちゃとオルゴール」の音にしたい。いまの効果音の「ほっている途中・ひびの最後・こわれる で音が変わる、一定でない」ところはお気に入りなので残す。

## 読むもの
`docs/audio/SOUND.md`（§1・§3・§6 を中心に。正本）、`docs/fun.md`、`docs/audio/preview.html` の案 B の `sfx`・`VARY`・`variation()`・`playTones()`・`noiseBuffer()`、`src/fx/sound.ts` と効果音の表のファイル。

## やること
1. `SoundFx` を育てる: 外から出口（ミキサーの効果音バス）と「いまの和音」をもらえるようにし、ノイズ・フィルター・倍音（木・オルゴール）を鳴らせるようにする。四角い波はやめる。
2. 全部の効果音（SOUND.md §6.2 の表。名前は 1 つも減らさない）を B の音色にする。音の形（上がる・下がる・長さ・段階の違い）は今のまま。
3. ゆらぎ・和音合わせ（§6.1）、同時に鳴る数の上限（§6.3）、大きく祝う音（big）の合図。
4. 鳴らした記録（テスト用）と、試聴ページ用の一覧 `SFX_CATALOG`。
5. 大きさを測る（§3 の目安。preview の案 B と ±2 dB）。

## 担当ファイル（これ以外は触らない）
| ファイル | 中身 |
|---|---|
| `src/fx/sound.ts` | `SoundFx`・`Tone`（足すだけ。今の形はそのまま使える）・`AudioLike`（足すものは省略可にする）・`Chord`・`SfxOutput`・`SfxRecord` |
| `src/fx/sfxVoices.ts`（新） | 部品: 木・オルゴール・木琴・シャカ・ザク・ぽわん（Tone の並びを作る小さな関数） |
| `src/fx/sfxVary.ts`（新） | `VARY` の表（§6.2 の数）、シード付き乱数、`variation()`（preview と同じ考え方） |
| `src/fx/sfxCatalog.ts`（新） | `SFX_CATALOG`（試聴ページが読む） |
| `src/fx/combatSounds.ts`・`craftSounds.ts`・`farmSounds.ts`・`storageSounds.ts`・`weaponSounds.ts` | 中の Tone を B にする。関数名・音の名前・`logSound` の名前は変えない |
| `src/fx/DigFx.ts` | `WHIFF_SOUND` と、`sound.play(...)` の呼び方（ひろうの続けて取る段）だけ |
| `src/fx/combo.ts` | 要るなら「何回目か」を返す所だけ |
| `src/fx/config.ts` | `fxVolume` のはじめの値だけ（変えるなら） |
| `src/fx/fx.test.ts`（音の所）・`src/fx/sfx*.test.ts`（新） | |

`src/main.ts`・`src/debug/testHook.ts`・`src/ui/`・`vite.config.ts`・`src/fx/audio*`・`src/fx/bgm/` は `composer` の担当なので触らない。`celebrate/index.ts`・`craftUi.ts` は表の配列をそのまま `playTones` に渡しているので、触らずに済むようにする（下の「表の登録」）。

## つなぎ目の約束（関数名・型）
**この票が出すもの（`src/fx/sound.ts`）**
```ts
export interface Chord { name: string; root: number /* 0〜11, C=0 */; minor: boolean } // composer の BgmChord と同じ形
export interface SfxOutput { ctx: AudioLike; destination: unknown }
export interface SfxRecord { name: string; semis: number; cents: number; chord: string; big: boolean; dropped: boolean }
export interface SoundFxOptions {
  output?: () => SfxOutput | null; // 渡されたらこれに鳴らす（null なら鳴らさない）。無ければ今どおり自分で AudioContext を作る
  chord?: () => Chord;             // 無ければ C
  onBig?: (name: string) => void;  // levelUp・fanfare・modal を鳴らしたとき 1 回
  seed?: number;                   // ゆらぎの乱数（はじめ 20261016）
  factory?: () => AudioLike | null; settings?: FxSettings; // 今と同じ
}
export class SoundFx {
  constructor(opts?: SoundFxOptions); // 今の new SoundFx(factory, settings) の呼び方も受ける
  play(name: SoundName, semitones?: number, opt?: { comboStep?: number }): void;
  playTones(tones: readonly Tone[], semitones?: number): void; // 今と同じ
  drainRecords(): SfxRecord[];  // 読むと空。長さは 256 まで
  activeVoices(): number;
  played: number;
}
```
- **表の登録**: 効果音の表（`SOUNDS`・`COMBAT_SOUNDS`・`CRAFT_SOUNDS`・`FARM_SOUNDS`・`STORAGE_SOUNDS`・`WEAPON_SOUNDS`）の配列を、名前・ゆらぎ・和音・big と結びつけて覚える（配列そのもので引く `WeakMap` など）。`playTones` に表の配列がそのまま来たら、名前つきとして扱う。表に無い並び（`craftUi.ts` が足し合わせた並びなど）は名前 `''`・ゆらぎも和音合わせもなしで今どおり鳴らす。
- 和音は鳴らす瞬間に `chord()` を 1 回呼んで決める。音の時計は `output().ctx.currentTime`。
- `fxVolume` は今どおり `SoundFx` の中でかける（ミキサーの効果音バスは 1.0）。0 なら何も作らない。全体の音量・ミュートはミキサーの担当。
- `SFX_CATALOG: readonly { group: 'dig' | 'combat' | 'weapon' | 'craft' | 'farm' | 'storage'; name: string; label: string /* ひらがな */; play(s: SoundFx): void }[]`

**`composer` が出すもの（つなぎ込みでつながる。待たずに作れる）**: `AudioMixer.output()` → `SfxOutput` の形、`BgmPlayer.chord()` → `Chord` の形、`AudioMixer.duck()` → `onBig`。テストでは にせ物を渡す。

## 受け入れ基準（テストを先に: ユニットは自分で先に書いて赤を確かめる。E2E は `tester` が `e2e/sound1.spec.ts` に先に書く）
| AC | 中身 | 層 |
|---|---|---|
| S1 | 表の音の名前が今と全部同じ（減っていない）。どの Tone も `square` を使わない。big は levelUp・fanfare・modal の 3 つだけ | 【ユニット】 |
| S2 | ゆらぎ: 同じ seed なら記録が同じ並び。dig を 20 回 → cents が全部 ±70 の中で、全部同じではない。後ろ 10 回の大きさ・高さの平均が、前 10 回より上がっていない（±ゆらぎの中） | 【ユニット】 |
| S3 | 和音: `chord` が Am のとき pickup の高さの種類は A・C・E のどれかで、直前と違う。root の音は A に動き、短調で「ミ」が半音下がる。`chord` が無ければ C | 【ユニット】 |
| S4 | 段階: dig・crack・crackFinal・ready・break の Tone の並びがどれも違う。drawStage1・2・3 は和音の根音・3 度・5 度。dropCommon〜SuperRare の音の数は 1・2・3・6 | 【ユニット】 |
| S5 | 続けてひろう: 同じ物を続けて取ると、和音の音を 1 つずつ上がり、1 オクターブで止まる。2.5 秒あくと もどる | 【ユニット】 |
| S6 | 数の上限: 同じ名前が鳴っているうちに 4 つ目 → 鳴らさず `dropped: true`。部品が 48 をこえる → big 以外は鳴らさない。big は 1 つまで | 【ユニット】 |
| S7 | 出口: `output` を渡すとその `destination` につなぐ。`null` なら鳴らさず こわれない。`fxVolume` 0 で何も作らない。古い呼び方も動く。`onBig` は big の 3 つのときだけ 1 回。`playTones(CRAFT_SOUNDS.fanfare)` の記録は `name: 'fanfare', big: true` | 【ユニット】 |
| S8 | 今のテストの窓口（`combat.sounds()`・`craft.sounds()`・`achievements.sounds()`）に出る名前が変わらない | 【ユニット】＋ 今の E2E |
| S9 | （つなぎ込みのあと）ブロックをほってこわすと `audio.sfx()` に dig → crack → crackFinal → ready → break → pickup の順で出る。pickup の `semis` は、そのときの `audio.chord()` の音 | 【E2E】 |
| S10 | 全部の効果音を OfflineAudioContext で書き出して測る: ピーク・いちばん大きい 50ms・長さ。§3 の目安の中、preview の案 B の 8 こと ±2 dB。同じ音を 0.1 秒ごとに 10 回重ねても天井（-1 dBFS）をこえない | 数で見る（`audio-reviewer`） |
| S11 | `sound.html` で全部の効果音を BGM の上で聞いて OK。とくに ほる → ひび → こわれる → ひろう の変化が今と同じく楽しいか | 【オーナー確認】 |

`npm run check:fast` が通ること。E2E は回さない（S9 は つなぎ込みのあと `composer` と `tester` が回す）。

## 返すもの
作った効果音の一覧（今 → B）、測った数、テスト結果、SOUND.md と違う所、`composer` への申し送り（つなぎ込みで気をつけること）。

## 関連
- 指摘台帳: `docs/loop-ledger/SOUND-1.md`

## 経過（PO が追記）
| 日付 | ループ | 結果 | メモ |
|---|---|---|---|
