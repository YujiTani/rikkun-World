import { beforeEach, describe, expect, it } from 'vitest';
import { GashaBgm, sharedGashaBgm, type GashaBgmEnv } from './gashaBgm';
import { TUNE as BIG } from './gashaBigTuning';
import { TUNE as GIRL } from './gashaGirlTuning';

/** 音の 偽物（時刻と、つないだ 物の 記録だけ） */
class Param {
  value = 0;
  ramps: [number, number][] = [];
  setValueAtTime(v: number): void { this.value = v; }
  linearRampToValueAtTime(v: number, t: number): void { this.ramps.push([v, t]); }
  cancelScheduledValues(): void { this.ramps = []; }
}
interface Src { buffer: unknown; loop: boolean; context: Ctx; started: number | null; stoppedAt: number | null; onended: (() => void) | null; connect(): void; start(t: number): void; stop(t: number): void; tag: string }
class Ctx {
  currentTime = 0;
  state = 'running';
  gains: { gain: Param }[] = [];
  sources: Src[] = [];
  createGain(): { gain: Param; connect(): void; disconnect(): void } { const g = { gain: new Param(), connect() {}, disconnect() {} }; this.gains.push(g); return g; }
  createBufferSource(): Src {
    const s: Src = { buffer: null, loop: false, context: this, started: null, stoppedAt: null, onended: null, tag: '', connect() {}, start(t) { s.started = t; }, stop(t) { s.stoppedAt = t; } };
    this.sources.push(s);
    return s;
  }
  async decodeAudioData(ab: ArrayBuffer): Promise<{ duration: number; tag: string }> { return { duration: 100, tag: String(ab.byteLength) }; }
}

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

function rig(missing: string[] = []) {
  const ctx = new Ctx();
  const log: boolean[] = [];
  const env: GashaBgmEnv = {
    bgmOut: () => ({ ctx: ctx as unknown as AudioContext, bus: {} as AudioNode }),
    suppressBgm: (on) => { log.push(on); },
    // 曲ごとに ちがう 長さの バッファを 返す（どの 曲の 音か 見わけられる）
    loadFile: async (url) => (missing.some((m) => url.includes(m)) ? Promise.reject(new Error('no file')) : new ArrayBuffer(url.includes('kamigami') ? 2 : 1)),
  };
  const bgm = new GashaBgm(env);
  const sync = async () => { bgm.step(); await flush(); bgm.step(); };
  return { ctx, env, log, bgm, sync };
}
/** いま 流れて いる 曲の 音源（フェードアウト中は 数えない） */
const liveTag = (ctx: Ctx): number[] => ctx.sources.filter((s) => s.stoppedAt === null).map((s) => (s.buffer as { tag: string }).tag).map(Number);

describe('gashaBgm（#293 がしゃどくろの BGM）', () => {
  beforeEach(() => { delete (globalThis as { __gashaBgm?: unknown }).__gashaBgm; });

  it('大きな 姿: 怒ると「神々の 戯れ」を ループで 流し（ふだんの BGM は 止める）、白目に もどると 止める', async () => {
    const { bgm, ctx, log, sync } = rig();
    await sync();
    expect(bgm.status().playing).toBe(null);
    bgm.request('big', true);
    await sync();
    expect(bgm.status().playing).toBe('kamigami');
    expect(log[log.length - 1]).toBe(true);
    expect(liveTag(ctx)).toEqual([2]);
    const s = ctx.sources[0]!;
    expect(s.loop).toBe(true);
    // フェードイン: 0 から 音量まで fadeSec かけて
    const g = ctx.gains[0]!.gain;
    expect(g.value).toBe(0);
    expect(g.ramps[0]).toEqual([BIG.bgm.volume, BIG.bgm.fadeSec]);
    ctx.currentTime = 30;
    bgm.request('big', false);
    bgm.step();
    expect(bgm.status().playing).toBe(null);
    expect(s.stoppedAt).toBeCloseTo(30 + BIG.bgm.fadeSec + 0.05, 6); // フェードアウトの あと 止まる
    expect(ctx.gains[0]!.gain.ramps[0]).toEqual([0, 30 + BIG.bgm.fadeSec]);
    expect(log[log.length - 1]).toBe(false); // ふだんの BGM に もどる
  });

  it('少女が 出ると「災厄」に クロスフェード。そのあと 大きな 姿が 怒っても「神々の 戯れ」は 流れない', async () => {
    const { bgm, ctx, sync } = rig();
    bgm.request('big', true);
    await sync();
    expect(liveTag(ctx)).toEqual([2]);
    ctx.currentTime = 10;
    bgm.request('girl', true);
    await sync();
    expect(bgm.status().playing).toBe('saiyaku');
    expect(liveTag(ctx)).toEqual([1]); // 神々の 戯れは フェードアウトに はいった
    expect(ctx.sources[0]!.stoppedAt).toBeCloseTo(10 + BIG.bgm.fadeSec + 0.05, 6);
    expect(ctx.sources[1]!.started).toBe(10); // 災厄は おなじ 時刻に フェードイン
    expect(ctx.gains[1]!.gain.ramps[0]).toEqual([GIRL.bgm.volume, 10 + GIRL.bgm.fadeSec]);
    // 少女が 消えて（大きな 姿に もどって 休む）も、大きな 姿が 怒って いる 間は 災厄を 流しつづける
    bgm.request('girl', false);
    await sync();
    expect(bgm.status().playing).toBe('saiyaku');
    expect(bgm.status().girlLock).toBe(true);
    // 白目に もどって 止まった あとで また 怒っても「神々の 戯れ」は 流れず、「災厄」が 流れる
    bgm.request('big', false);
    bgm.step();
    expect(bgm.status().playing).toBe(null);
    bgm.request('big', true);
    expect(bgm.status().desired).toBe('saiyaku');
    await sync();
    expect(liveTag(ctx)).toEqual([1]);
    expect(ctx.sources.filter((s) => (s.buffer as { tag: string }).tag === '2').length).toBe(1); // 神々の 戯れを もういちど 作って いない
  });

  it('白目に もどる（少女も 大きな 姿も 頼んで いない）と 止めて、ふだんの BGM に もどる。reset すると また「神々の 戯れ」', async () => {
    const { bgm, ctx, log, sync } = rig();
    bgm.request('big', true); await sync();
    bgm.request('girl', true); await sync();
    bgm.request('girl', false); await sync();
    ctx.currentTime = 50;
    bgm.request('big', false); // 白目に もどった
    bgm.step();
    expect(bgm.status().playing).toBe(null);
    expect(log[log.length - 1]).toBe(false);
    bgm.reset();
    ctx.currentTime = 60;
    bgm.request('big', true); await sync();
    expect(bgm.status().playing).toBe('kamigami');
  });

  it('少女だけ（大きな 姿が 頼んで いない）でも「災厄」を 流し、少女が いなく なると 止める', async () => {
    const { bgm, sync } = rig();
    bgm.request('girl', true); await sync();
    expect(bgm.status().playing).toBe('saiyaku');
    bgm.request('girl', false); bgm.step();
    expect(bgm.status().playing).toBe(null);
  });

  it('白目で 止まる: 怒って いない 間は 何も 流れない。reset で すぐ おわる', async () => {
    const { bgm, sync, log } = rig();
    bgm.request('big', true); await sync();
    bgm.reset(); bgm.step();
    expect(bgm.status().playing).toBe(null);
    expect(log[log.length - 1]).toBe(false);
  });

  it('音の ファイルが なくても こわれない（音なし。ふだんの BGM は 止まる）', async () => {
    const { bgm, sync, log } = rig(['kamigami']);
    bgm.request('big', true);
    await sync();
    expect(bgm.status().playing).toBe(null);
    expect(bgm.info('kamigami').file).toBe('missing');
    expect(log[log.length - 1]).toBe(true);
  });

  it('音が まだ 使えない（ミキサーが null）間は まって、使えると 流す', async () => {
    const ctx = new Ctx();
    let out: { ctx: AudioContext; bus: AudioNode } | null = null;
    const bgm = new GashaBgm({ bgmOut: () => out, suppressBgm: () => {}, loadFile: async () => new ArrayBuffer(2) });
    // デコードに ctx が いる ので、最初だけ 使える ことに して 読みこみ、そのあと 使えなく する
    out = { ctx: ctx as unknown as AudioContext, bus: {} as AudioNode };
    bgm.request('big', true);
    bgm.step(); await flush();
    out = null;
    bgm.step();
    expect(bgm.status().playing).toBe(null);
    out = { ctx: ctx as unknown as AudioContext, bus: {} as AudioNode };
    bgm.step();
    expect(bgm.status().playing).toBe('kamigami');
  });

  it('ページに 1 つだけ（少女と 大きな 姿で 共有）', () => {
    const { env } = rig();
    const a = sharedGashaBgm(env), b = sharedGashaBgm(env);
    expect(a).toBe(b);
  });

  it('調整表に フェードの 秒と 音量が ある（両方）', () => {
    for (const c of [BIG.bgm, GIRL.bgm]) {
      expect(c.fadeSec).toBeGreaterThan(0);
      expect(c.volume).toBeGreaterThan(0);
      expect(c.volume).toBeLessThanOrEqual(1);
    }
  });
});
