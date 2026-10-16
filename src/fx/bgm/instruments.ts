/**
 * 案 B「木のおもちゃとオルゴール」の楽器と、音を鳴らす部品（docs/audio/SOUND.md §1。preview.html の案 B と同じ聞こえ方）。
 * 四角い波は使わない。ノイズはシード付き（毎回同じ並び）。
 */

/** [倍率, 大きさ, 消える長さの倍率] */
export type Partial3 = readonly [ratio: number, gain: number, decay?: number];

export interface InstrumentDef {
  wave: OscillatorType;
  partials?: readonly Partial3[];
  a?: number;
  d?: number;
  s?: number;
  r?: number;
  gain: number;
  /** 音の長さのうち 鳴らしておく割合（hum のように伸ばす楽器） */
  gate?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
}

export interface ToneDef {
  type: OscillatorType | 'noise';
  f0?: number;
  f1?: number;
  delay?: number;
  dur: number;
  gain: number;
  attack?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
}

export type InstrumentName = 'musicbox' | 'marimba' | 'mbass' | 'xylo' | 'hum';

export const BGM_INSTRUMENTS: Record<InstrumentName, InstrumentDef> = {
  musicbox: { wave: 'sine', partials: [[1, 1, 1], [2, 0.15, 0.5], [5.4, 0.06, 0.2]], a: 0.002, d: 1.4, s: 0, gain: 0.15 },
  marimba: { wave: 'sine', partials: [[1, 1, 1], [4, 0.18, 0.12], [10, 0.04, 0.05]], a: 0.003, d: 0.45, s: 0, gain: 0.16 },
  mbass: { wave: 'sine', partials: [[1, 1, 1], [4, 0.15, 0.12], [2, 0.2, 0.5]], a: 0.004, d: 0.6, s: 0, gain: 0.34 },
  xylo: { wave: 'sine', partials: [[1, 1, 1], [3, 0.2, 0.2], [6, 0.08, 0.1]], a: 0.002, d: 0.3, s: 0, gain: 0.15 },
  hum: { wave: 'sine', a: 0.4, d: 0.5, s: 0.7, r: 0.8, gain: 0.04, gate: 1 },
};

/** 木の打楽器: k = 低い木の「ドン」、w = ウッドブロック、h = シャカ（5 kHz より上のノイズ） */
export const BGM_KIT: Record<string, readonly ToneDef[]> = {
  k: [{ type: 'sine', f0: 110, f1: 50, dur: 0.14, gain: 0.35 }],
  w: [
    { type: 'sine', f0: 1100, f1: 900, dur: 0.05, gain: 0.14 },
    { type: 'sine', f0: 1650, dur: 0.03, gain: 0.05 },
  ],
  h: [{ type: 'noise', dur: 0.05, gain: 0.05, attack: 0.012, filter: { type: 'highpass', freq: 5000 } }],
};

/** 鳴らす音の部品を何個つくったか・いつまで鳴るか、を知らせてもらう（voices() 用） */
export type OnSource = (endTime: number) => void;

const noiseCache = new WeakMap<object, AudioBuffer>();
/** シード付きのノイズ 1 秒（毎回同じ並び） */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (b) return b;
  const len = ctx.sampleRate;
  b = ctx.createBuffer(1, len, ctx.sampleRate);
  const x = b.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) >>> 0; // preview と同じ式（同じ並び）
    x[i] = (s / 4294967296) * 2 - 1;
  }
  noiseCache.set(ctx, b);
  return b;
}

function makeFilter(ctx: BaseAudioContext, f: { type: BiquadFilterType; freq: number; q?: number }): BiquadFilterNode {
  const n = ctx.createBiquadFilter();
  n.type = f.type;
  n.frequency.value = f.freq;
  n.Q.value = f.q ?? 0.7;
  return n;
}

/** 打楽器: Tone の並びを鳴らす（gain = 大きさの倍率） */
export function playTones(ctx: BaseAudioContext, dest: AudioNode, tones: readonly ToneDef[], t0: number, gain = 1, onSource?: OnSource): void {
  for (const tn of tones) {
    const t = t0 + (tn.delay ?? 0);
    const dur = tn.dur;
    const a = tn.attack ?? 0.005;
    const end = t + Math.max(dur, a + 0.01);
    const peak = Math.max(0.0002, tn.gain * gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    let src: AudioScheduledSourceNode;
    if (tn.type === 'noise') {
      const b = ctx.createBufferSource();
      b.buffer = noiseBuffer(ctx);
      b.loop = true;
      src = b;
    } else {
      const o = ctx.createOscillator();
      o.type = tn.type;
      const f0 = tn.f0 ?? 440;
      const f1 = tn.f1 ?? f0;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      src = o;
    }
    let node: AudioNode = src;
    if (tn.filter) {
      const f = makeFilter(ctx, tn.filter);
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(dest);
    src.start(t);
    src.stop(end + 0.05);
    onSource?.(end + 0.05);
  }
}

/** 楽器の 1 音。出口のノードを返す（呼んだ側がつなぐ） */
export function playVoice(ctx: BaseAudioContext, inst: InstrumentDef, freq: number, t: number, dur: number, vol: number, onSource?: OnSource): AudioNode {
  const out = ctx.createGain();
  let tail: AudioNode = out;
  if (inst.filter) {
    const f = makeFilter(ctx, inst.filter);
    out.connect(f);
    tail = f;
  }
  const a = inst.a ?? 0.005;
  const d = inst.d ?? 0.2;
  const s = inst.s ?? 0;
  const r = inst.r ?? 0.05;
  const gateEnd = t + Math.max(a + 0.001, dur * (inst.gate ?? 0.92));
  for (const [ratio, pg, ds = 1] of inst.partials ?? [[1, 1, 1] as Partial3]) {
    const o = ctx.createOscillator();
    o.type = inst.wave;
    o.frequency.setValueAtTime(freq * ratio, t);
    const g = ctx.createGain();
    const peak = Math.max(0.0002, inst.gain * vol * pg);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    let stopAt: number;
    if (s <= 0) {
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d * ds);
      stopAt = t + a + d * ds + 0.02;
    } else {
      const sus = peak * s;
      const dEnd = t + a + d * ds;
      if (gateEnd >= dEnd) {
        g.gain.linearRampToValueAtTime(sus, dEnd);
        g.gain.setValueAtTime(sus, gateEnd);
      } else {
        g.gain.linearRampToValueAtTime(peak + (sus - peak) * ((gateEnd - t - a) / (d * ds)), gateEnd);
      }
      g.gain.linearRampToValueAtTime(0, gateEnd + r);
      stopAt = gateEnd + r + 0.02;
    }
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(stopAt);
    onSource?.(stopAt);
  }
  return tail;
}
