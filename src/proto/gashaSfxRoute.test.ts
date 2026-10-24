import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWebAudioPlayerBase } from './gashaBigSfxPlayer';
import { createWebAudioPlayer } from './gashaGirlSfx';
import { createBigWebAudioPlayer } from './gashaBigSfx';

/** 効果音は ゲームの ミキサー(効果音バス)を 通す。自前の AudioContext・destination 直結は しない（FIX-BRIEF-2 §3-3） */
class Node2 { to: unknown[] = []; connect(n: unknown): void { this.to.push(n); } disconnect(): void {} gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }; }
class Src extends Node2 { buffer: unknown; loop = false; playbackRate = { value: 1 }; started: number | null = null; stoppedAt: number | null = null; onended: (() => void) | null = null; start(t: number): void { this.started = t; } stop(t: number): void { this.stoppedAt = t; } }
class Ctx {
  currentTime = 0; state = 'running'; destination = { tag: 'ctx.destination' };
  made: (Src | Node2)[] = [];
  createBufferSource(): Src { const s = new Src(); this.made.push(s); return s; }
  createGain(): Node2 { const g = new Node2(); this.made.push(g); return g; }
  decodeAudioData = async () => ({ duration: 2 });
  resume = async () => {};
}

const g = globalThis as unknown as Record<string, unknown>;
let ownCtxMade = 0;
let old: Record<string, unknown>;
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

beforeEach(() => {
  ownCtxMade = 0;
  old = { window: g.window, fetch: g.fetch };
  g.window = { AudioContext: class { constructor() { ownCtxMade++; } }, addEventListener() {}, removeEventListener() {} };
  g.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
});
afterEach(() => { g.window = old.window; g.fetch = old.fetch; });

describe('効果音の ミキサー経由', () => {
  it('out を わたすと 自前の AudioContext は 作らず、音は 効果音バスに つなぐ(ctx.destination 直結しない)', async () => {
    const ctx = new Ctx(), bus = { tag: 'sfxBus' };
    const p = createWebAudioPlayerBase(() => ['a.ogg'], () => ({ ctx: ctx as unknown as AudioContext, destination: bus as unknown as AudioNode }));
    p.preload();
    await flush();
    expect(p.play('a.ogg', { gain: 0.5, rate: 1, delaySec: 0 })).toBeGreaterThan(0);
    expect(ownCtxMade).toBe(0);
    const gain = ctx.made.find((n) => n instanceof Node2 && !(n instanceof Src))!;
    expect(gain.to).toEqual([bus]);
    expect(gain.to).not.toContain(ctx.destination);
  });

  it('ミキサーの 音が まだ 使えない(null)間は 鳴らさず、自前の ctx も 作らない。使えるように なったら 読みこんで 鳴る', async () => {
    const ctx = new Ctx();
    let avail = false;
    const p = createWebAudioPlayerBase(() => ['a.ogg'], () => (avail ? { ctx: ctx as unknown as AudioContext, destination: {} as AudioNode } : null));
    p.preload();
    await flush();
    expect(p.play('a.ogg', { gain: 1, rate: 1, delaySec: 0 })).toBe(0);
    expect(ownCtxMade).toBe(0);
    avail = true;
    p.play('a.ogg', { gain: 1, rate: 1, delaySec: 0 }); // この 呼びで 読みこみが はじまる
    await flush();
    expect(p.play('a.ogg', { gain: 1, rate: 1, delaySec: 0 })).toBeGreaterThan(0);
    expect(ownCtxMade).toBe(0);
  });

  it('stopAll(): 遅れて 鳴らす 予約の 音も 止める', async () => {
    const ctx = new Ctx();
    const p = createWebAudioPlayerBase(() => ['a.ogg'], () => ({ ctx: ctx as unknown as AudioContext, destination: {} as AudioNode }));
    p.preload();
    await flush();
    p.play('a.ogg', { gain: 1, rate: 1, delaySec: 5 });
    p.play('a.ogg', { gain: 1, rate: 1, delaySec: 0 });
    const srcs = ctx.made.filter((n): n is Src => n instanceof Src);
    expect(srcs.length).toBe(2);
    ctx.currentTime = 1;
    p.stopAll();
    for (const s of srcs) expect(s.stoppedAt).not.toBeNull();
    // 止めた あとに 鳴らす 予約は 残らない: 予約の 音は 始まる 前に 止まる
    expect(srcs[0]!.stoppedAt!).toBeLessThanOrEqual(srcs[0]!.started!);
  });

  it('少女・大きな姿の 本物の 口も out を 受けとり、ctx.destination に つながない', async () => {
    for (const make of [createWebAudioPlayer, createBigWebAudioPlayer]) {
      const ctx = new Ctx(), bus = { tag: 'sfxBus' };
      const out = () => ({ ctx: ctx as unknown as AudioContext, destination: bus as unknown as AudioNode });
      const p = (make as (o: typeof out) => { preload(): void; play(u: string, o: { gain: number; rate: number; delaySec: number }): number })(out);
      p.preload();
      await flush();
      const url = (await import('./gashaGirlSfx')).allSfxUrls()[0]!;
      const big = (await import('./gashaBigSfx')).allBigSfxUrls()[0]!;
      expect(p.play(make === createWebAudioPlayer ? url : big, { gain: 1, rate: 1, delaySec: 0 })).toBeGreaterThan(0);
      expect(ownCtxMade).toBe(0);
      const gains = ctx.made.filter((n) => !(n instanceof Src));
      expect(gains.every((n) => !n.to.includes(ctx.destination))).toBe(true);
      expect(gains.some((n) => n.to.includes(bus))).toBe(true);
    }
  });
});
