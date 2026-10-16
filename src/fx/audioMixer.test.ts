import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioSettings, MIX } from './audioConfig';
import { AudioMixer } from './audioMixer';
import { FakeAudioContext, type FakeNode } from './bgm/fakeAudio';

function mk(initial: 'suspended' | 'running' = 'running') {
  const s = createAudioSettings();
  let made = 0;
  let ctx!: FakeAudioContext;
  const m = new AudioMixer(s, () => {
    made++;
    ctx = new FakeAudioContext(initial);
    return ctx.asContext();
  });
  return { s, m, ctx: () => ctx, made: () => made };
}
const node = (n: unknown) => n as FakeNode;

/** BGM の入口から スピーカーまでの道 */
function path(m: AudioMixer): FakeNode[] {
  const out: FakeNode[] = [];
  let n: FakeNode | undefined = node(m.bgmInput());
  while (n) {
    out.push(n);
    n = n.outputs[0];
  }
  return out;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('B5 ミキサー', () => {
  it('unlock() の前は AudioContext を作らない・output() は null', () => {
    const { m, made } = mk();
    expect(made()).toBe(0);
    expect(m.output()).toBeNull();
    expect(m.bgmInput()).toBeNull();
    expect(m.contextState()).toBe('none');
    m.apply();
    m.duck();
    m.holdDuck(true);
    m.setScreenLevel(0.4);
    m.setHidden(true);
    expect(made()).toBe(0);
    m.unlock();
    expect(made()).toBe(1);
    expect(m.output()).not.toBeNull();
    m.unlock();
    expect(made()).toBe(1);
  });

  it('つなぎ方と値: 全体 0.6・BGM 0.4・リミッター・天井（SOUND.md §3）', () => {
    const { m } = mk();
    m.unlock();
    const p = path(m);
    expect(p.map((n) => n.kind)).toEqual(['gain', 'gain', 'gain', 'gain', 'gain', 'gain', 'compressor', 'shaper', 'destination']);
    const [bgmBus, , , duck, master, mute, lim, safe] = p;
    expect(bgmBus.gain.value).toBeCloseTo(0.4, 5);
    expect(duck.gain.value).toBe(1);
    expect(master.gain.value).toBeCloseTo(0.6, 5);
    expect(mute.gain.value).toBe(1);
    expect(lim.threshold.value).toBe(-14);
    expect(lim.knee.value).toBe(6);
    expect(lim.ratio.value).toBe(4);
    expect(lim.attack.value).toBe(0.005);
    expect(lim.release.value).toBe(0.25);
    // 天井: 0.5 まではそのまま・上は 0.85 でおさえる
    const c = safe.curve!;
    const at = (x: number) => c[Math.round((x + 1) * 2048)];
    expect(at(0.5)).toBeCloseTo(0.5, 4);
    expect(at(0.25)).toBeCloseTo(0.25, 4);
    expect(at(-0.5)).toBeCloseTo(-0.5, 4);
    expect(at(1)).toBeLessThanOrEqual(0.85 + 1e-6);
    expect(at(-1)).toBeGreaterThanOrEqual(-0.85 - 1e-6);
    expect(Math.max(...c)).toBeLessThanOrEqual(0.85 + 1e-6);
    // 効果音は 全体へ
    const out = m.output()!;
    expect(node(out.destination).outputs[0]).toBe(master);
    expect(out.ctx).toBe(node(out.destination).ctx);
  });

  it('MIX の数は preview と同じ', () => {
    expect(MIX.duck).toEqual({ amount: 0.45, attack: 0.08, hold: 1.4, release: 1.0 });
    expect(MIX.limiter).toEqual({ threshold: -14, knee: 6, ratio: 4, attack: 0.005, release: 0.25 });
    expect([MIX.fadeIn, MIX.crossfade, MIX.fadeOut]).toEqual([1.5, 1.5, 0.8]);
  });

  it('音量・ミュートを変えると 0.05 秒以上かけて変わる', () => {
    const { s, m, ctx } = mk();
    m.unlock();
    ctx().currentTime = 10;
    const [bgmBus, , , , master, mute] = path(m);
    s.masterVolume = 0.2;
    s.bgmVolume = 0.9;
    s.audioMuted = true;
    m.apply();
    for (const [n, target] of [
      [master, 0.2],
      [bgmBus, 0.9],
      [mute, 0],
    ] as const) {
      const r = n.gain.lastRamp()!;
      expect(r.value).toBeCloseTo(target, 5);
      expect(r.time - 10).toBeGreaterThanOrEqual(0.05);
      expect(r.time - 10).toBeLessThan(0.5);
    }
    s.audioMuted = false;
    m.apply();
    const r = mute.gain.lastRamp()!;
    expect(r.value).toBe(1);
    expect(r.time - 10).toBeGreaterThanOrEqual(0.05);
  });

  it('範囲外の音量は 0〜1 にまるめる', () => {
    const { s, m } = mk();
    m.unlock();
    s.masterVolume = 5;
    s.bgmVolume = -2;
    m.apply();
    const [bgmBus, , , , master] = path(m);
    expect(master.gain.lastRamp()!.value).toBe(1);
    expect(bgmBus.gain.lastRamp()!.value).toBe(0);
  });

  it('unlock の前に変えた設定は、unlock のときに入る', () => {
    const { s, m } = mk();
    s.masterVolume = 0.3;
    s.audioMuted = true;
    m.unlock();
    const [, , , , master, mute] = path(m);
    expect(master.gain.value).toBeCloseTo(0.3, 5);
    expect(mute.gain.value).toBe(0);
  });

  it('AudioContext が作れなくても こわれない', () => {
    const s = createAudioSettings();
    const m = new AudioMixer(s, () => null);
    expect(() => {
      m.unlock();
      m.apply();
      m.duck();
      m.holdDuck(true);
      m.holdDuck(false);
      m.setScreenLevel(0.4);
      m.setHidden(true);
      m.setHidden(false);
    }).not.toThrow();
    expect(m.output()).toBeNull();
    expect(m.contextState()).toBe('none');
    const m2 = new AudioMixer(s, () => {
      throw new Error('no audio');
    });
    expect(() => m2.unlock()).not.toThrow();
    expect(m2.output()).toBeNull();
  });

  it('suspended で作られたら unlock で resume する', () => {
    const { m, ctx } = mk('suspended');
    m.unlock();
    expect(ctx().resumeCalls).toBeGreaterThanOrEqual(1);
  });
});

describe('duck', () => {
  it('duck(): 0.08 秒で 0.45 まで下げ、1.4 秒保ち、1.0 秒でもどす', () => {
    const { m, ctx } = mk();
    m.unlock();
    ctx().currentTime = 5;
    const duck = path(m)[3];
    expect(m.ducking()).toBe(false);
    m.duck();
    expect(m.ducking()).toBe(true);
    const ev = duck.gain.events.filter((e) => e.type !== 'cancel');
    const ramps = ev.filter((e) => e.type === 'linear');
    expect(ramps[0].value).toBeCloseTo(0.45, 5);
    expect(ramps[0].time).toBeCloseTo(5.08, 5);
    expect(ev.some((e) => e.type === 'set' && e.value === 0.45 && Math.abs(e.time - 6.48) < 1e-6)).toBe(true);
    expect(ramps[1].value).toBe(1);
    expect(ramps[1].time).toBeCloseTo(7.48, 5);
    ctx().currentTime = 5 + 0.08 + 1.4 + 0.01;
    expect(m.ducking()).toBe(false);
  });

  it('holdDuck(true) のあいだは下げたまま、false で 1.0 秒でもどす', () => {
    const { m, ctx } = mk();
    m.unlock();
    ctx().currentTime = 3;
    const duck = path(m)[3];
    m.holdDuck(true);
    expect(m.ducking()).toBe(true);
    expect(duck.gain.lastRamp()!.value).toBeCloseTo(0.45, 5);
    ctx().currentTime = 60;
    expect(m.ducking()).toBe(true);
    m.holdDuck(false);
    expect(m.ducking()).toBe(false);
    const r = duck.gain.lastRamp()!;
    expect(r.value).toBe(1);
    expect(r.time - 60).toBeCloseTo(1.0, 5);
  });

  it('holdDuck 中に duck() が来ても下げたまま・ducking は true', () => {
    const { m, ctx } = mk();
    m.unlock();
    const duck = path(m)[3];
    m.holdDuck(true);
    ctx().currentTime = 0.5;
    m.duck();
    expect(m.ducking()).toBe(true);
    // 1 にもどす予約を duck() が入れてはいけない
    expect(duck.gain.events.some((e) => e.type === 'linear' && e.value === 1)).toBe(false);
  });
});

describe('B6 画面とタブ', () => {
  it('setScreenLevel: 0.3 秒かけて変わる・screenLevel は目標の値', () => {
    const { m, ctx } = mk();
    m.unlock();
    ctx().currentTime = 2;
    expect(m.screenLevel()).toBe(1);
    m.setScreenLevel(0.4);
    expect(m.screenLevel()).toBe(0.4);
    const screen = path(m)[1];
    const r = screen.gain.lastRamp()!;
    expect(r.value).toBeCloseTo(0.4, 5);
    expect(r.time - 2).toBeCloseTo(0.3, 5);
  });

  it('unlock の前に決めた画面の倍率も、unlock で入る', () => {
    const { m } = mk();
    m.setScreenLevel(0.7);
    m.unlock();
    expect(path(m)[1].gain.value).toBeCloseTo(0.7, 5);
    expect(m.screenLevel()).toBe(0.7);
  });

  it('同じ倍率をくり返し渡しても 予約をふやさない', () => {
    const { m } = mk();
    m.unlock();
    m.setScreenLevel(0.4);
    const n = path(m)[1].gain.events.length;
    for (let i = 0; i < 100; i++) m.setScreenLevel(0.4);
    expect(path(m)[1].gain.events.length).toBe(n);
  });

  it('タブを見ていない → 0.8 秒で 0 → suspend、もどる → resume ＋ 1.5 秒で入る', () => {
    vi.useFakeTimers();
    const { m, ctx } = mk();
    m.unlock();
    ctx().currentTime = 4;
    const hidden = path(m)[2];
    m.setHidden(true);
    const r = hidden.gain.lastRamp()!;
    expect(r.value).toBe(0);
    expect(r.time - 4).toBeCloseTo(0.8, 5);
    expect(ctx().suspendCalls).toBe(0);
    vi.advanceTimersByTime(900);
    expect(ctx().suspendCalls).toBe(1);
    expect(m.contextState()).toBe('suspended');

    m.setHidden(false);
    expect(ctx().resumeCalls).toBeGreaterThanOrEqual(1);
    const r2 = hidden.gain.lastRamp()!;
    expect(r2.value).toBe(1);
    expect(r2.time - 4).toBeCloseTo(1.5, 5);
  });

  it('すぐもどったら suspend しない', () => {
    vi.useFakeTimers();
    const { m, ctx } = mk();
    m.unlock();
    m.setHidden(true);
    vi.advanceTimersByTime(300);
    m.setHidden(false);
    vi.advanceTimersByTime(2000);
    expect(ctx().suspendCalls).toBe(0);
  });

  it('見ていないあいだに unlock されても 起こさない', () => {
    const { m, ctx } = mk('suspended');
    m.setHidden(true);
    m.unlock();
    expect(ctx().resumeCalls).toBe(0);
  });
});
