import { describe, expect, it } from 'vitest';
import { TITLE_SOUND_URLS, TitleSound, type TitleAudio } from './titleSound';

/**
 * 二つ名の出現音（BALANCE.md §5・§6、AC20 (3)）。窓口（tester が決めた名前。開発はこの形で作る）:
 *  - `src/fx/titleSound.ts`: `TITLE_SOUND_URLS`（title → 音ファイルの URL。`/sound/nick/appear_<title>.mp3`）
 *  - `new TitleSound({ audio, load, volume })`
 *      audio: () => TitleAudio | null（AudioContext の代わり。うその物を渡せる）
 *      load: (url) => Promise<ArrayBuffer>（fetch の代わり）
 *      volume: () => number（「効果音の音量」0〜1）
 *  - `preload(): Promise<void>`（3 つを読みこむ。失敗しても reject しない）、`ready(): boolean`（3 つとも読めた）
 *  - `play(title): boolean`（実際に鳴らしはじめたら true。読めていない・音量 0・AudioContext なしは false。例外を投げない）
 *  - `played: Record<title, number>`（実際に鳴らしはじめた回数）
 * 「鳴らす頼み」の記録と、鳴っている間 2 体目を鳴らさない時間は CombatFx（combatFx.test.ts）が見る。
 */
/**
 * うその AudioContext が 受けつける口（実装は この中だけで 書く。ほかの口が要るときは tester に頼んで ここを足す）:
 *  context: currentTime・destination・state・resume()・decodeAudioData・createBufferSource・createGain・createDynamicsCompressor
 *  BufferSource: buffer・connect・disconnect・start・stop・onended
 *  Gain: gain.value・gain.setValueAtTime・linearRampToValueAtTime・exponentialRampToValueAtTime・setTargetAtTime・cancelScheduledValues、connect・disconnect
 *  DynamicsCompressor（−1 dBFS で止める用）: threshold・knee・ratio・attack・release（どれも { value }）、connect・disconnect
 */
function fakeAudio() {
  const log = { sources: 0, started: 0, decoded: 0, gains: [] as number[], limiter: 0 };
  const node = () => ({ connect: (n: unknown) => n, disconnect: () => {} });
  const param = (record = false) => {
    let v = 1;
    const p = {
      get value() { return v; },
      set value(x: number) { v = x; if (record) log.gains.push(x); },
      setValueAtTime: (x: number) => { if (record) log.gains.push(x); return p; },
      linearRampToValueAtTime: (x: number) => { if (record) log.gains.push(x); return p; },
      exponentialRampToValueAtTime: (x: number) => { if (record) log.gains.push(x); return p; },
      setTargetAtTime: (x: number) => { if (record) log.gains.push(x); return p; },
      cancelScheduledValues: () => p,
    };
    return p;
  };
  const audio = {
    currentTime: 0,
    destination: {},
    state: 'running',
    resume: async () => {},
    decodeAudioData: async () => {
      log.decoded++;
      return { fake: true, duration: 1 };
    },
    createBufferSource: () => {
      log.sources++;
      const src = { ...node(), buffer: null as unknown, onended: null as null | (() => void), start: () => void log.started++, stop: () => {} };
      return src;
    },
    createGain: () => ({ ...node(), gain: param(true) }),
    createDynamicsCompressor: () => {
      log.limiter++;
      return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() };
    },
  } as unknown as TitleAudio;
  return { audio, log };
}
const okLoad = async () => new ArrayBuffer(8);

describe('TitleSound（AC20 (3)）', () => {
  it('音ファイルの場所は 3 つ（おやぶん・たいしょう・ヌシ）', () => {
    expect(Object.keys(TITLE_SOUND_URLS).sort()).toEqual(['nushi', 'oyabun', 'taisho']);
    for (const t of ['oyabun', 'taisho', 'nushi'] as const) expect(TITLE_SOUND_URLS[t]).toMatch(new RegExp(`appear_${t}\\.mp3$`));
  });

  it('読みこめたら 1 回の play で 1 回だけ 鳴らしはじめる', async () => {
    const f = fakeAudio();
    const s = new TitleSound({ audio: () => f.audio, load: okLoad, volume: () => 0.5 });
    await s.preload();
    expect(s.ready()).toBe(true);
    expect(s.play('taisho')).toBe(true);
    expect(f.log.started).toBe(1);
    expect(s.played.taisho).toBe(1);
    expect(s.played.nushi).toBe(0);
  });

  it('音量 0 なら 鳴らさない（音量を上げれば鳴る）', async () => {
    const f = fakeAudio();
    let v = 0;
    const s = new TitleSound({ audio: () => f.audio, load: okLoad, volume: () => v });
    await s.preload();
    expect(s.play('nushi')).toBe(false);
    expect(f.log.sources).toBe(0);
    v = 0.5;
    expect(s.play('nushi')).toBe(true);
  });

  it('まだ読みこめていない（preload の前）は 鳴らさず、止まらない', () => {
    const f = fakeAudio();
    const s = new TitleSound({ audio: () => f.audio, load: okLoad, volume: () => 1 });
    expect(s.ready()).toBe(false);
    expect(() => s.play('oyabun')).not.toThrow();
    expect(s.play('oyabun')).toBe(false);
    expect(f.log.sources).toBe(0);
  });

  it('読みこみに失敗（fetch が reject・音が読めない）しても preload は止まらず、鳴らさない', async () => {
    const f = fakeAudio();
    const bad = new TitleSound({ audio: () => f.audio, load: () => Promise.reject(new Error('404')), volume: () => 1 });
    await expect(bad.preload()).resolves.toBeUndefined();
    expect(bad.ready()).toBe(false);
    expect(() => bad.play('nushi')).not.toThrow();
    expect(bad.play('nushi')).toBe(false);

    const audio2 = Object.assign(Object.create(null), f.audio, { decodeAudioData: () => Promise.reject(new Error('decode')) }) as TitleAudio;
    const bad2 = new TitleSound({ audio: () => audio2, load: okLoad, volume: () => 1 });
    await expect(bad2.preload()).resolves.toBeUndefined();
    expect(bad2.play('taisho')).toBe(false);
    expect(f.log.started).toBe(0);
  });

  it('1 つだけ読めなかったときは、読めた物は鳴る・読めない物は鳴らない', async () => {
    const f = fakeAudio();
    const load = async (url: string) => {
      if (url.includes('nushi')) throw new Error('x');
      return new ArrayBuffer(8);
    };
    const s = new TitleSound({ audio: () => f.audio, load, volume: () => 1 });
    await s.preload();
    expect(s.play('oyabun')).toBe(true);
    expect(s.play('nushi')).toBe(false);
  });

  it('AudioContext が作れない（null）でも 止まらない', async () => {
    const s = new TitleSound({ audio: () => null, load: okLoad, volume: () => 1 });
    await expect(s.preload()).resolves.toBeUndefined();
    expect(() => s.play('nushi')).not.toThrow();
    expect(s.play('nushi')).toBe(false);
  });

  it('鳴らす音の大きさの倍率は 1 以下（音量の設定をかけるだけで、大きくしない）', async () => {
    const f = fakeAudio();
    const s = new TitleSound({ audio: () => f.audio, load: okLoad, volume: () => 1 });
    await s.preload();
    s.play('nushi');
    expect(f.log.gains.length).toBeGreaterThan(0);
    for (const g of f.log.gains) expect(g).toBeLessThanOrEqual(1);
  });
});
