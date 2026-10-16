# SOUND-1-bgm: BGM（案 B）をゲームに入れる・場面で切り替える ＋ 音量の設定 ＋ つなぎ込み

| 項目 | 内容 |
|---|---|
| マイルストーン | SOUND-1 |
| 担当 | `composer`（この票）／ 効果音は `sfx-designer`（`docs/tickets/SOUND-1-sfx.md`）と並列 |
| 状態 | 開発中（テストを先に） |
| 周回数（全ループ合計） | 0 / 10 |

## 目的（オーナーの言葉で）
試聴ページで選んだ案 B「木のおもちゃとオルゴール」の音で遊びたい。ひる・よる・たたかいで曲がふわっと変わる。

## 読むもの
`docs/audio/SOUND.md`（全部。正本）、`docs/fun.md`、`docs/audio/preview.html` の案 B・`MIX`・再生のしくみ（`compileSong`・`playVoice`・`makeMasterChain`・`startSong`・`tick`）。`CLAUDE.md` のコードのきまり。

## やること
1. preview の案 B の楽器・曲・再生のしくみを TypeScript にして `src/fx/` に移す（音の聞こえ方は preview と同じ）。
2. 曲の長さを足す（SOUND.md §2。頭の 8 小節は preview のまま。足した所はオーナー確認）。
3. 全体の音のつなぎ（ミキサー: 全体・ミュート・リミッター・天井・BGM バス・効果音バス・duck）を作る。AudioContext は**このミキサーだけ**が作る。
4. 場面の判定（SOUND.md §2）と、画面ごとの BGM の倍率（§5）、タブを見ていないとき。
5. 音量・ミュートの画面（§7）と保存。**いまゲームに音量・ミュートの画面は無い**（`fxVolume` は `settings` からしか変えられない）ので、この票で作る。
6. 試聴ページ `sound.html`（ゲームのコードで鳴らす）。BGM 3 曲・切り替え・ミュートと音量。効果音の欄は `sfx-designer` の `SFX_CATALOG` を読んで並べる（つなぎ込みのときに足す）。
7. **つなぎ込み**（この票の最後。`sfx-designer` の作業が入ったあと）: `src/main.ts`・`src/debug/testHook.ts`。

## 担当ファイル（これ以外は触らない）
| ファイル | 中身 |
|---|---|
| `src/fx/audioConfig.ts`（新） | `MIX`（SOUND.md §3・§4 の数）、`AudioSettings`・`createAudioSettings()` |
| `src/fx/audioMixer.ts`（新） | `AudioMixer` |
| `src/fx/bgm/`（新）`instruments.ts`・`songs.ts`・`compile.ts`・`BgmPlayer.ts`・`scene.ts`・`hook.ts`・`*.test.ts` | 楽器・曲データ・音符の読みとり・再生・場面・テストの窓口 |
| `src/fx/audioMixer.test.ts`（新） | |
| `src/ui/soundSettings.ts`・`soundSettings.css`（新） | ミュートのボタンと音量のつまみ（案内画面の `playOverlay.el` に入れる。`playOverlay.ts` は触らない） |
| `sound.html`・`src/audioPreview/main.ts`（新）・`vite.config.ts`（入口を 1 つ足すだけ） | 試聴ページ |
| つなぎ込み: `src/main.ts`・`src/debug/testHook.ts` | 下の「つなぎ込み」 |

`src/fx/sound.ts` ほか効果音のファイルは `sfx-designer` の担当。`src/contracts.ts` は変えない（要るときは PO に言う）。

## つなぎ目の約束（関数名・型）
**この票が出すもの**
```ts
// src/fx/audioConfig.ts
export interface AudioSettings { masterVolume: number; bgmVolume: number; audioMuted: boolean; battleRange: number; battleEnterTicks: number; battleExitTicks: number }
export function createAudioSettings(): AudioSettings; // 0.6・0.4・false・16・30・240。settings の extras に入れる

// src/fx/audioMixer.ts
export class AudioMixer {
  constructor(s: AudioSettings, factory?: () => AudioContext | null);
  unlock(): void;                    // プレイヤーが押した・クリックした後に呼ぶ。ここで初めて AudioContext を作る
  output(): { ctx: AudioContext; destination: AudioNode } | null; // 効果音バス。unlock 前・作れないときは null
  bgmInput(): AudioNode | null;
  apply(): void;                     // 設定（音量・ミュート）を読み直して 0.05 秒以上かけて反映
  duck(): void;                      // MIX.duck の形で BGM を下げてもどす
  setScreenLevel(x: number): void;   // §5 の倍率。0.3 秒かけて
  setHidden(hidden: boolean): void;  // §5 のタブを見ていないとき
  contextState(): 'none' | 'suspended' | 'running' | 'closed';
}

// src/fx/bgm/BgmPlayer.ts
export type BgmSong = 'day' | 'night' | 'battle';
export interface BgmChord { name: string; root: number /* 0〜11, C=0 */; minor: boolean } // sound.ts の Chord と同じ形
export class BgmPlayer {
  constructor(mixer: AudioMixer);
  play(song: BgmSong | null): void;  // 同じ曲なら何もしない。null は fadeOut
  chord(): BgmChord;                 // いま鳴っている和音（音の時計で）。曲が無ければ { name:'C', root:0, minor:false }
  current(): BgmSong | null; songCount(): number; voices(): number;
}

// src/fx/bgm/scene.ts（DOM・WebAudio なし。固定ステップで決定的）
export interface BgmSceneInput { tick: number; phase: DayPhase; player: Vec3; yokai: readonly { state: YokaiState; position: Vec3 }[]; dead: boolean }
export class BgmSceneTracker { constructor(s: AudioSettings); update(i: BgmSceneInput): BgmSong; scene(): BgmSong }
export function screenLevel(mode: ScreenMode, dead: boolean): number; // §5 の表（`screen.mode()` は guide も返す。celebrate は 1 を返し、duck は別）
```
**`sfx-designer` が出すもの（この票はそれを使う。中身は SOUND-1-sfx を見る）**
- `new SoundFx({ output, chord, onBig, seed? })`、`soundFx.drainRecords(): SfxRecord[]`、`soundFx.activeVoices(): number`、`SFX_CATALOG`（`src/fx/sfxCatalog.ts`）。
- `output` に `() => mixer.output()`、`chord` に `() => bgm.chord()`、`onBig` に `() => mixer.duck()` を渡す。

## つなぎ込み（`src/main.ts`・`src/debug/testHook.ts`）
- `AudioMixer`・`BgmPlayer` を `SoundFx` より先に作り、上のとおり `SoundFx` に渡す。`unlock()` は最初の pointerdown / keydown / 案内画面のクリックで呼ぶ。
- 毎ステップ: `tracker.update(...)` → `bgm.play(scene)`。妖怪の一覧は今の `yokaiSample`（10 ステップごと）でよい（判定は `tick` の差で数える）。`mixer.setScreenLevel(screenLevel(screen.mode(), combat.dead()))`。おめでとう画面のあいだは duck を保つ。
- `visibilitychange` → `mixer.setHidden(document.hidden)`。
- `createAudioSettings()` を `createSettingsHook` の extras に足す。`settings.set` のあと `mixer.apply()` が効くようにする（毎ステップ `apply()` でも、変わったときだけでもよい）。
- `window.__rikkun.audio`（SOUND.md §8 の形）を `TestHook` に足す。`audio.sfx()` は `soundFx.drainRecords()`。
- `soundSettings` を `playOverlay.el` に入れる。`sound.html` に効果音の欄を足す。
- 今のテスト（`combat.sounds()`・`craft.sounds()`・`achievements.sounds()` の名前）がこわれないこと。

## 受け入れ基準（テストを先に: ユニットは自分で先に書いて赤を確かめる。E2E は `tester` が `e2e/sound1.spec.ts` に先に書く）
| AC | 中身 | 層 |
|---|---|---|
| B1 | 3 曲を読みとると、1 小節のステップ数 = 拍子 × 2、全部の行の小節数が同じ、和音の数 = 小節数。長さ: ひる・よる 40 秒以上、たたかい 25 秒以上。頭の 8 小節（よるは 4 小節）の音符が preview の案 B と同じ | 【ユニット】 |
| B2 | `chord()`: 曲の始まりから t 秒の和音が表どおり（ひる 0 秒 = G、5 小節目 = Em、1 周したら頭にもどる）。曲が無ければ C | 【ユニット】 |
| B3 | 場面: day・dawn → day、dusk・night → night。`chase` の妖怪が 16 以内に 29 ステップ → まだ、30 ステップ → battle。いなくなって 239 → battle のまま、240 → もどる。17 ブロック先・`wander` は数えない。やられているあいだは変えない | 【ユニット】 |
| B4 | 切り替え（にせの AudioContext）: 鳴っている曲から別の曲 → 古い曲は 1.5 秒で 0、新しい曲は 0 → 1 を 1.5 秒。はじめは 1.5 秒で入る。止めるは 0.8 秒。3 曲目が来たらいちばん古い曲を 0.1 秒で消し、`songCount()` は 2 をこえない。同じ曲の `play` は何もしない | 【ユニット】 |
| B5 | ミキサー: `unlock()` の前は AudioContext を作らない。全体 0.6・BGM 0.4・リミッターと天井と duck が SOUND.md §3 の値。音量・ミュートを変えると 0.05 秒以上かけて変わる。AudioContext が作れなくても こわれない | 【ユニット】 |
| B6 | `screenLevel`: play 1・inventory 0.7・guide 0.4・やられた 1。0.3 秒かけて変わる。タブを見ていない → 0.8 秒で 0 → suspend、もどる → resume ＋ 1.5 秒 | 【ユニット】 |
| B7 | 保存: `rikkun.audio.v1` に 3 つの音量とミュートを書き、次に読む。こわれた値・範囲外は はじめの値 | 【ユニット】 |
| B8 | 遊ぶ画面でクリック後、`time.set` で よる にすると `audio.state().scene/song` が `night`。妖怪を近くに出して追いかけさせると たたかい、`yokai.clear()` のあと もどる（ステップ数は `settings.get('battleEnterTicks')` などから読む） | 【E2E】 |
| B9 | もちもの画面 → `screenLevel` 0.7、案内画面 → 0.4、おめでとう画面 → `ducking` true、閉じると false | 【E2E】 |
| B10 | 案内画面の「おと」ボタンで `muted` が切りかわる。つまみで `master/bgm/fx` が変わる。`settings.set('audioMuted', true)` も同じ。読みなおしても残る。案内画面のスクショ（ボタンとつまみ）を PR に | 【E2E】＋ UI 検査 |
| B11 | 曲を OfflineAudioContext で書き出して測る: ピーク・いちばん大きい 50ms・平均・ループのつなぎ目の差。SOUND.md §3 の目安の中、preview の案 B と ±2 dB | 数で見る（`audio-reviewer`） |
| B12 | `sound.html` で 3 曲（足した部分を含む）と、ひる → よる → たたかい の切り替え、ミュート・音量を聞いて OK | 【オーナー確認】 |

E2E は関係する spec（`e2e/sound1.spec.ts`）と smoke だけ回す。`npm run check:fast` が通ること。

## 返すもの
作ったファイル・曲の一覧と長さ・測った数・テスト結果・SOUND.md と違う所・`sfx-designer` への申し送り。

## 関連
- 指摘台帳: `docs/loop-ledger/SOUND-1.md`

## 経過（PO が追記）
| 日付 | ループ | 結果 | メモ |
|---|---|---|---|
