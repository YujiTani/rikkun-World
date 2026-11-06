import { describe, expect, it } from 'vitest';
import { box, hz, noise, sine } from './sfxVoices';
import { levelOf, varyOf } from './sfxVary';
import { SoundFx, SOUNDS, tonesOf, type SoundName, type Tone } from './sound';

/**
 * COOP-1 作業 3c（#417）の 先行テスト（赤）。AC69 のうち 音そのもの（案 C「わかれる オルゴール」。yuzu 2026-11-06 に 決まった）。
 * パラメーターは /mnt/project-files/coop/sound-split/README.md の C。AC70（小さい・びっくりしない・「分かれた」と 分かる）は オーナーの 耳（テストは 書かない）。
 * 鳴らす 時（いつ）は src/duo/splitSound.test.ts。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   SOUNDS.duoSplit（src/fx/sound.ts の 表。`SoundName` に 'duoSplit' が 入る。別ファイルの 表に 置いて register してもよい。`tonesOf('duoSplit')` で 引ける こと）
 *     = [ noise(0, 0.28, 0.0375, { type: 'bandpass', freq: 800, freq1: 1600, q: 0.8 }, 0.05),
 *         ...box(hz('E6'), hz('C6'), 0.02, 0.16, 0.094), ...box(hz('E6'), hz('G6'), 0.02, 0.16, 0.094),
 *         sine(hz('C6'), hz('C6'), 0.06, 0.34, 0.0517, 0.03), sine(hz('G6'), hz('G6'), 0.06, 0.34, 0.0423, 0.03) ]   （部品 7 こ）
 *   VARY.duoSplit = root()（高さは ゆらさない・大きさ ±0.08・長さ ±0.05・和音の 根音に 合わせる）。big に しない（BGM を 下げない）。
 *   LEVEL.duoSplit は 足さない（大きさは 上の gain に 入れてある = 1）。
 *   SFX_CATALOG（試聴一覧）に 1 行 足す・docs/audio/SOUND.md §6.2 に 1 行 足す のは 実装の 係（このテストは 見ない）。
 */

/** 型に まだ 無い 名前を 通す */
const NAME = 'duoSplit' as string as SoundName;
const table = (SOUNDS as Record<string, readonly Tone[]>)['duoSplit'];

/** 小数 5 けたで 丸めて くらべる（0.094 × 0.55 などの 浮動小数の ずれを 気にしない） */
const norm = (t: readonly Tone[]): unknown => JSON.parse(JSON.stringify(t, (_k, v: unknown) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v)));

const EXPECTED: readonly Tone[] = [
  noise(0, 0.28, 0.0375, { type: 'bandpass', freq: 800, freq1: 1600, q: 0.8 }, 0.05),
  ...box(hz('E6'), hz('C6'), 0.02, 0.16, 0.094),
  ...box(hz('E6'), hz('G6'), 0.02, 0.16, 0.094),
  sine(hz('C6'), hz('C6'), 0.06, 0.34, 0.0517, 0.03),
  sine(hz('G6'), hz('G6'), 0.06, 0.34, 0.0423, 0.03),
];

function fakeOutput() {
  const clock = { t: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, gain: param(), frequency: param(), Q: param(), start() {}, stop() {}, type: '', buffer: null, loop: false });
  const ctx = {
    get currentTime() {
      return clock.t;
    },
    sampleRate: 44100,
    destination: {},
    createGain: node,
    createOscillator: node,
    createBufferSource: node,
    createBiquadFilter: node,
    createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
  };
  return { clock, output: () => ({ ctx: ctx as never, destination: ctx.destination }) };
}

describe('AC69: duoSplit の 音の 表（案 C）', () => {
  it('SOUNDS に あり、tonesOf で 引ける', () => {
    expect(table).toBeDefined();
    expect(tonesOf('duoSplit')).toBe(table);
  });

  it('README の C の とおり（風 ＋ オルゴール 2 本 ＋ 行き先の sine 2 本 = 部品 7 こ）', () => {
    expect(table).toBeDefined();
    const parts = table!.reduce((n, t) => n + 1 + (t.partials?.length ?? 0), 0);
    expect(parts).toBe(7);
    expect(norm(table!)).toEqual(norm(EXPECTED));
  });

  it('最後の 部品が 1 秒より 前に 終わる（1 秒に 1 回 鳴っても 前の 音と かさならない）', () => {
    expect(table).toBeDefined();
    for (const t of table!) expect(t.delay + t.dur).toBeLessThan(1);
  });

  it('ゆらぎは 根音に 合わせる（高さは ゆらさない）・big では ない・LEVEL は 足さない', () => {
    const v = varyOf('duoSplit');
    expect(v).toMatchObject({ cents: 0, gain: 0.08, dur: 0.05, chord: 'root' });
    expect(v.big).toBeUndefined();
    expect(levelOf('duoSplit')).toBe(1);
  });
});

describe('AC69: SoundFx で 鳴らすと 記録に duoSplit が 入る', () => {
  it('name・big=false・dropped=false', () => {
    const f = fakeOutput();
    const fx = new SoundFx({ output: f.output, seed: 1 });
    fx.play(NAME);
    expect(fx.drainRecords()).toMatchObject([{ name: 'duoSplit', big: false, dropped: false }]);
  });

  it('1 秒に 1 回（いちばん 多く 鳴る とき）を 3 回 つづけても 数の 上限に 当たらない', () => {
    const f = fakeOutput();
    const fx = new SoundFx({ output: f.output, seed: 2 });
    for (let i = 0; i < 3; i++) {
      f.clock.t = i;
      fx.play(NAME);
    }
    const r = fx.drainRecords();
    expect(r.map((x) => [x.name, x.dropped])).toEqual([['duoSplit', false], ['duoSplit', false], ['duoSplit', false]]);
  });

  it('短調（BGM が Am）でも 根音に 合わせて 鳴る（記録の chord が 今の 和音）', () => {
    const f = fakeOutput();
    const fx = new SoundFx({ output: f.output, seed: 3, chord: () => ({ name: 'Am', root: 9, minor: true }) });
    fx.play(NAME);
    const r = fx.drainRecords()[0]!;
    expect(r.chord).toBe('Am');
    expect(r.cents).toBe(0);
  });
});
