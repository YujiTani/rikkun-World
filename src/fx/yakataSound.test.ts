import { describe, expect, it } from 'vitest';
import { SEEDS_20 } from '../world/gen/mineShaftKit';
import { hookF, needYakataHook } from '../world/gen/mineYakataKit';

/**
 * MINE-1F F16 ④〔音量・読みこみ〕（docs/design/MINE-1F.md §3.4）。お手本は titleSound.test.ts〔二つ名の 出現音〕。窓口〔テスト側の 読み。developer は この 形で 作る〕:
 *  - `src/fx/yakataSound.ts`: `YAKATA_SOUND_URLS`〔名前 → `/sound/yakata/<name>.ogg`。4 つ〕・`YAKATA_GAIN_MAX`〔かける 音量の 倍率の いちばん 大きい 数。1 以下〕
 *  - `new YakataSound({ audio, load, volume })`〔titleSound と 同じ 口〕・`preload()`〔失敗しても reject しない〕・`ready()`
 *  - `playOnce(name: 'gate_close' | 'gate_open'): boolean`・`startLoop(name: 'ambience' | 'challenge', db: number): boolean`・`stopLoop(name, fadeSec): void`・
 *    `loops(): { name; db }[]`〔今 頼んで いる ループ〕・`played: Record<name, number>`・`gains(): number[]`〔これまでに かけた 倍率〕
 *  読めて いない・失敗・音量 0・AudioContext なしは 鳴らさず 止まらない。
 */
const mods = import.meta.glob<Record<string, unknown>>('./yakataSound.ts', { eager: true });
const mod = (): Record<string, unknown> => {
  const m = Object.values(mods)[0];
  if (!m) throw new Error('窓口が まだ ない: src/fx/yakataSound.ts');
  return m;
};
type Names = 'ambience' | 'challenge' | 'gate_close' | 'gate_open';
interface YS {
  preload(): Promise<void>;
  ready(): boolean;
  playOnce(n: 'gate_close' | 'gate_open'): boolean;
  startLoop(n: 'ambience' | 'challenge', db: number): boolean;
  stopLoop(n: 'ambience' | 'challenge', fadeSec: number): void;
  loops(): { name: string; db: number }[];
  played: Record<Names, number>;
  gains(): number[];
}
function fake() {
  const log = { started: 0, gains: [] as number[] };
  const node = () => ({ connect: (n: unknown) => n, disconnect: () => {} });
  const param = () => {
    let v = 1;
    const p = { get value() { return v; }, set value(x: number) { v = x; log.gains.push(x); }, setValueAtTime: (x: number) => (log.gains.push(x), p), linearRampToValueAtTime: (x: number) => (log.gains.push(x), p), exponentialRampToValueAtTime: (x: number) => (log.gains.push(x), p), setTargetAtTime: (x: number) => (log.gains.push(x), p), cancelScheduledValues: () => p };
    return p;
  };
  const audio = {
    currentTime: 0, destination: {}, state: 'running', resume: async () => {},
    decodeAudioData: async () => ({ fake: true, duration: 1 }),
    createBufferSource: () => ({ ...node(), buffer: null, loop: false, onended: null, start: () => void log.started++, stop: () => {} }),
    createGain: () => ({ ...node(), gain: param() }),
    createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
  };
  return { audio, log };
}
const okLoad = async () => new ArrayBuffer(8);
const make = (o: { audio?: unknown; load?: (u: string) => Promise<ArrayBuffer>; volume?: () => number } = {}) => {
  const f = fake();
  const Cls = mod()['YakataSound'] as new (o: unknown) => YS;
  const s = new Cls({ audio: () => o.audio ?? f.audio, load: o.load ?? okLoad, volume: o.volume ?? (() => 0.5) });
  return { s, f };
};

describe('F16 ④ YakataSound', () => {
  it('音ファイルの 場所は 4 つ・かける 倍率の 上限は 1 以下', () => {
    const u = mod()['YAKATA_SOUND_URLS'] as Record<string, string>;
    expect(Object.keys(u).sort()).toEqual(['ambience', 'challenge', 'gate_close', 'gate_open']);
    for (const [k, v] of Object.entries(u)) expect(v).toMatch(new RegExp(`/sound/yakata/${k}\\.ogg$`));
    expect(mod()['YAKATA_GAIN_MAX'] as number).toBeLessThanOrEqual(1);
  });

  it('読めたら 鳴る・かける 倍率は ぜんぶ 1 以下', async () => {
    const { s, f } = make();
    await s.preload();
    expect(s.ready()).toBe(true);
    expect(s.playOnce('gate_close')).toBe(true);
    expect(s.startLoop('ambience', 0)).toBe(true);
    expect(s.startLoop('challenge', 0)).toBe(true);
    expect(s.played.gate_close).toBe(1);
    expect(f.log.started).toBe(3);
    for (const g of [...f.log.gains, ...s.gains()]) expect(g).toBeLessThanOrEqual(1);
    expect(s.loops().map((l) => l.name).sort()).toEqual(['ambience', 'challenge']);
    s.stopLoop('challenge', 0.8);
    expect(s.loops().map((l) => l.name)).toEqual(['ambience']);
  });

  it('音量 0 なら 鳴らさない〔上げれば 鳴る〕', async () => {
    let v = 0;
    const { s, f } = make({ volume: () => v });
    await s.preload();
    expect(s.playOnce('gate_open')).toBe(false);
    expect(s.startLoop('ambience', 0)).toBe(false);
    expect(f.log.started).toBe(0);
    v = 0.5;
    expect(s.playOnce('gate_open')).toBe(true);
  });

  it('まだ 読めて いない・読みこみ失敗・AudioContext なしは 鳴らさず 止まらない', async () => {
    const a = make();
    expect(a.s.ready()).toBe(false);
    expect(() => a.s.playOnce('gate_close')).not.toThrow();
    expect(a.s.playOnce('gate_close')).toBe(false);
    const b = make({ load: () => Promise.reject(new Error('404')) });
    await expect(b.s.preload()).resolves.toBeUndefined();
    expect(b.s.ready()).toBe(false);
    expect(b.s.startLoop('challenge', 0)).toBe(false);
    const Cls = mod()['YakataSound'] as new (o: unknown) => YS;
    const d = new Cls({ audio: () => null, load: okLoad, volume: () => 1 });
    await d.preload();
    expect(() => d.playOnce('gate_open')).not.toThrow();
    expect(d.playOnce('gate_open')).toBe(false);
  });

  it('表の ふんいきの 下げ幅〔ambienceUnderDb〕は マイナス〔小さく する〕', () => {
    const h = hookF(SEEDS_20[0]!);
    needYakataHook(h, ['yakataSoundTable']);
    expect(h.yakataSoundTable().ambienceUnderDb).toBeLessThan(0);
  });
});
