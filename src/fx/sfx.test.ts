import { describe, expect, it } from 'vitest';
import { COMBAT_SOUNDS, playCombat } from './combatSounds';
import { CRAFT_SOUNDS, playCraft } from './craftSounds';
import { FARM_SOUNDS } from './farmSounds';
import { FX_SETTINGS, type FxSettings } from './config';
import { ComboTracker } from './combo';
import { SFX_CATALOG } from './sfxCatalog';
import { BIG_NAMES, VARY, newVaryState, variation, varyOf } from './sfxVary';

function newVaryStateWith(name: string, idx: number) {
  const s = newVaryState();
  s.comboIdx.set(name, idx);
  return s;
}
import { hz } from './sfxVoices';
import { SoundFx, SOUNDS, type AudioLike, type Chord, type Tone } from './sound';
import { drainSounds } from './soundLog';
import { STORAGE_SOUNDS } from './storageSounds';
import { WEAPON_SOUNDS } from './weaponSounds';

// ---- にせ AudioContext（鳴らす部品の高さ・大きさ・つなぎ先を記録する） ----
interface FakeNode {
  out?: unknown;
  peak?: number;
}
interface FakeVoice {
  kind: 'osc' | 'noise';
  type: string;
  f0: number;
  f1: number;
  start: number;
  stop: number;
  src: FakeNode;
}
function fakeCtx() {
  const clock = { t: 0 };
  const dest = { id: 'dest' };
  const voices: FakeVoice[] = [];
  const follow = (n: FakeNode) => {
    let peak = 0;
    let cur: unknown = n;
    for (let i = 0; i < 8 && cur && cur !== dest; i++) {
      const node = cur as FakeNode;
      if (node.peak !== undefined) peak = node.peak;
      cur = node.out;
    }
    return { peak, dest: cur };
  };
  const mk = (kind: 'osc' | 'noise') => {
    const src: FakeNode & Record<string, unknown> = {};
    const v: FakeVoice = { kind, type: '', f0: 0, f1: 0, start: 0, stop: 0, src };
    voices.push(v);
    src.connect = (n: FakeNode) => void (src.out = n);
    src.start = (t = 0) => void (v.start = t);
    src.stop = (t = 0) => void (v.stop = t);
    return { src, v };
  };
  const ctx = {
    get currentTime() {
      return clock.t;
    },
    destination: dest,
    sampleRate: 44100,
    createOscillator: () => {
      const { src, v } = mk('osc');
      Object.defineProperty(src, 'type', { get: () => v.type, set: (x: string) => void (v.type = x) });
      src.frequency = {
        value: 0,
        setValueAtTime: (f: number) => void (v.f0 = f),
        exponentialRampToValueAtTime: (f: number) => void (v.f1 = f),
      };
      return src as never;
    },
    createGain: () => {
      const g: FakeNode & Record<string, unknown> = {};
      g.gain = {
        value: 0,
        setValueAtTime: () => undefined,
        linearRampToValueAtTime: (p: number) => void (g.peak = Math.max(g.peak ?? 0, p)),
        exponentialRampToValueAtTime: () => undefined,
      };
      g.connect = (n: FakeNode) => void (g.out = n);
      return g as never;
    },
    createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
    createBufferSource: () => {
      const { src, v } = mk('noise');
      v.type = 'noise';
      src.buffer = null;
      src.loop = false;
      return src as never;
    },
    createBiquadFilter: () => {
      const f: FakeNode & Record<string, unknown> = {};
      f.type = 'lowpass';
      f.frequency = { value: 0, setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined };
      f.Q = { value: 0 };
      f.connect = (n: FakeNode) => void (f.out = n);
      return f as never;
    },
  } as unknown as AudioLike;
  const info = (v: FakeVoice) => follow(v.src);
  return { ctx, dest, clock, voices, info };
}

const AM: Chord = { name: 'Am', root: 9, minor: true };
const CM: Chord = { name: 'C', root: 0, minor: false };

function make(over: { chord?: Chord; seed?: number; onBig?: (n: string) => void; vol?: number } = {}) {
  const f = fakeCtx();
  const settings: FxSettings = { ...FX_SETTINGS, fxVolume: over.vol ?? FX_SETTINGS.fxVolume };
  const fx = new SoundFx({
    output: () => ({ ctx: f.ctx, destination: f.dest }),
    chord: over.chord ? () => over.chord! : undefined,
    onBig: over.onBig,
    seed: over.seed,
    settings,
  });
  return { fx, f, settings };
}
const pc = (hzv: number) => (((Math.round(12 * Math.log2(hzv / 261.6256)) % 12) + 12) % 12);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

// 今ある音の名前（減らさない）
const EXPECTED = {
  dig: ['dig', 'crack', 'crackFinal', 'break', 'place', 'clink', 'ready', 'pickup', 'levelUp'],
  combat: ['punch', 'hit', 'miss', 'defeat', 'orb', 'hurt', 'faint', 'respawn', 'spawn', 'bell', 'birds', 'dropCommon', 'dropUncommon', 'dropRare', 'dropSuperRare'],
  craft: ['craft', 'craftFail', 'bakeStart', 'crackle', 'bakeDone', 'slash', 'naginata', 'bowDraw', 'bowRelease', 'arrowThud', 'noArrow', 'sparkle', 'equip', 'guard', 'banzai', 'tab', 'chime1', 'chime2', 'chime3', 'chime4', 'bannerSpin', 'fanfare', 'modal', 'modalSparkle', 'badge', 'closeReady'],
  farm: ['till', 'tillPress', 'plant', 'harvest', 'wild', 'notRipe', 'seedFound', 'eat', 'fill', 'fullCan', 'pour', 'empty', 'sprinklerPlace', 'pet', 'petAgain'],
  storage: ['throw', 'drawerOpen', 'drawerClose'],
  weapon: ['stance', 'thrust', 'kesa', 'kesaHit', 'kiriage', 'wearLow', 'toolBreak', 'drawStage1', 'drawStage2', 'drawStage3', 'dry', 'shoot1', 'shoot2', 'shoot3', 'arrowHit', 'arrowStick'],
};
const TABLES: Record<string, Record<string, readonly Tone[]>> = {
  dig: SOUNDS,
  combat: COMBAT_SOUNDS,
  craft: CRAFT_SOUNDS,
  farm: FARM_SOUNDS,
  storage: STORAGE_SOUNDS,
  weapon: WEAPON_SOUNDS,
};

describe('S1 名前・音色', () => {
  it('表の名前が今と全部同じ（減っていない）', () => {
    for (const [k, names] of Object.entries(EXPECTED)) {
      for (const n of names) expect(TABLES[k]![n], `${k}.${n}`).toBeDefined();
    }
  });
  it('どの Tone も square を使わない・立ち上がり 0.002 秒以上・大きさは 0.8 以下', () => {
    for (const t of Object.values(TABLES)) {
      for (const [name, tones] of Object.entries(t)) {
        expect(tones.length, name).toBeGreaterThan(0);
        for (const tn of tones) {
          expect(tn.type as string, name).not.toBe('square');
          expect(tn.gain, name).toBeGreaterThan(0);
          expect(tn.gain, name).toBeLessThanOrEqual(0.8);
          expect(tn.attack ?? 0.004, name).toBeGreaterThanOrEqual(0.002);
          expect(tn.dur, name).toBeGreaterThan(0);
        }
      }
    }
  });
  it('big は levelUp・fanfare・modal・houseDone（家が できた）の 4 つだけ', () => {
    expect([...BIG_NAMES].sort()).toEqual(['fanfare', 'houseDone', 'levelUp', 'modal']);
    const bigs: string[] = [];
    for (const [k, names] of Object.entries(EXPECTED)) {
      for (const n of names) {
        const { fx } = make();
        fx.playTones(TABLES[k]![n]!);
        const r = fx.drainRecords()[0]!;
        expect(r.name).toBe(n);
        if (r.big) bigs.push(n);
      }
    }
    expect(bigs.sort()).toEqual(['fanfare', 'levelUp', 'modal']);
  });
  it('試聴一覧に全部の名前がある', () => {
    const have = new Set(SFX_CATALOG.map((c) => c.name));
    for (const names of Object.values(EXPECTED)) for (const n of names) expect(have.has(n), n).toBe(true);
    expect(have.has('whiff')).toBe(true);
    for (const c of SFX_CATALOG) expect(c.label).toMatch(/^[぀-ヿー！？、 ・（）0-9]+$/);
  });
  it('試聴一覧から鳴らすと、その名前の記録が残る', () => {
    for (const c of SFX_CATALOG) {
      const { fx } = make();
      c.play(fx);
      const r = fx.drainRecords();
      expect(r.length, c.name).toBeGreaterThan(0);
      expect(r[0]!.name, c.name).toBe(c.name);
      expect(r[0]!.dropped, c.name).toBe(false);
    }
  });
});

describe('S2 ゆらぎ', () => {
  const run = (seed?: number) => {
    const { fx, f } = make({ seed });
    const peaks: number[] = [];
    const freqs: number[] = [];
    for (let i = 0; i < 20; i++) {
      f.clock.t = i * 1;
      const before = f.voices.length;
      fx.play('dig');
      peaks.push(f.info(f.voices[before]!).peak);
      freqs.push(f.voices[before]!.f0);
    }
    return { rec: fx.drainRecords(), peaks, freqs };
  };
  it('同じ seed なら記録が同じ並び・ちがう seed なら変わる', () => {
    expect(run(7).rec).toEqual(run(7).rec);
    expect(run(7).rec).not.toEqual(run(8).rec);
  });
  it('dig 20 回: cents は ±70 の中・全部同じではない', () => {
    const { rec } = run();
    expect(rec).toHaveLength(20);
    for (const r of rec) expect(Math.abs(r.cents)).toBeLessThanOrEqual(70);
    expect(new Set(rec.map((r) => r.cents)).size).toBeGreaterThan(10);
  });
  it('後ろ 10 回の大きさ・高さは前 10 回より上がっていない', () => {
    const { peaks, freqs } = run();
    expect(mean(peaks.slice(10))).toBeLessThanOrEqual(mean(peaks.slice(0, 10)) * 1.1);
    expect(mean(freqs.slice(10))).toBeLessThanOrEqual(mean(freqs.slice(0, 10)) * 1.03);
    // ゆらぎの幅の中（±15% / ±70 cents）
    const base = Math.max(...peaks) / 1.15;
    for (const p of peaks) expect(p).toBeGreaterThan(base * 0.8);
  });
  it('ゆらぎの表は SOUND.md §6.2 の数', () => {
    expect(VARY.dig).toMatchObject({ cents: 70, gain: 0.15, dur: 0.12 });
    expect(VARY.place).toMatchObject({ cents: 50, gain: 0.1, dur: 0.1 });
    expect(VARY.break).toMatchObject({ cents: 50, gain: 0.1, dur: 0.1, chord: 'root' });
    expect(VARY.clink).toMatchObject({ cents: 30, gain: 0.1, dur: 0 });
    expect(VARY.ready).toMatchObject({ cents: 0, gain: 0.05, dur: 0, chord: 'root' });
    expect(VARY.pickup).toMatchObject({ cents: 0, gain: 0.08, dur: 0, chord: 'tones' });
    expect(VARY.whiff).toMatchObject({ cents: 60, gain: 0.15, dur: 0.1 });
    expect(VARY.fill).toMatchObject({ cents: 120, gain: 0.15, dur: 0.15 });
    expect(varyOf('crack')).toMatchObject({ cents: 40, gain: 0.1, dur: 0.1, chord: 'none' });
    expect(VARY.levelUp).toMatchObject({ cents: 0, gain: 0, dur: 0, chord: 'root', big: true });
  });
});

describe('S3 和音合わせ', () => {
  it('Am: pickup の高さは A・C・E のどれかで、直前と違う', () => {
    const { fx, f } = make({ chord: AM, seed: 3 });
    const semis: number[] = [];
    for (let i = 0; i < 12; i++) {
      f.clock.t = i;
      const before = f.voices.length;
      fx.play('pickup');
      expect([9, 0, 4]).toContain(pc(f.voices[before]!.f0));
      semis.push(fx.drainRecords()[0]!.semis);
    }
    for (let i = 1; i < semis.length; i++) expect(semis[i]).not.toBe(semis[i - 1]);
    for (const s of semis) expect([-3, 0, 4]).toContain(s);
  });
  it('Am: root の音は A に動き、短調で「ミ」が半音下がる（ド ミ ソ → ラ ド ミ）', () => {
    const { fx, f } = make({ chord: AM });
    fx.playTones(CRAFT_SOUNDS.banzai);
    const r = fx.drainRecords()[0]!;
    expect(r.semis).toBe(-3);
    expect(r.chord).toBe('Am');
    // 部品は「基音・倍音」の 2 つずつ
    expect([0, 2, 4].map((i) => pc(f.voices[i]!.f0))).toEqual([9, 0, 4]);
  });
  it('chord が無ければ C（動かない）', () => {
    const { fx, f } = make();
    fx.playTones(CRAFT_SOUNDS.banzai);
    const r = fx.drainRecords()[0]!;
    expect(r).toMatchObject({ semis: 0, chord: 'C' });
    expect([0, 2, 4].map((i) => pc(f.voices[i]!.f0))).toEqual([0, 4, 7]);
  });
  it('和音は鳴らす瞬間に 1 回だけ読む', () => {
    let n = 0;
    const f = fakeCtx();
    const fx = new SoundFx({ output: () => ({ ctx: f.ctx, destination: f.dest }), chord: () => (n++, CM) });
    fx.play('pickup');
    expect(n).toBe(1);
  });
});

describe('S4 段階', () => {
  it('dig・crack・crackFinal・ready・break の Tone の並びがどれも違う', () => {
    const keys = ['dig', 'crack', 'crackFinal', 'ready', 'break'] as const;
    const s = keys.map((k) => JSON.stringify(SOUNDS[k]));
    expect(new Set(s).size).toBe(5);
  });
  it('drawStage1・2・3 は和音の根音・3 度・5 度（上がっていく）', () => {
    for (const [chord, expectPcs] of [
      [CM, [0, 4, 7]],
      [AM, [9, 0, 4]],
      [{ name: 'F', root: 5, minor: false }, [5, 9, 0]],
    ] as const) {
      const { fx, f } = make({ chord });
      const hzs: number[] = [];
      for (let i = 1; i <= 3; i++) {
        f.clock.t = i;
        const before = f.voices.length;
        fx.playTones(WEAPON_SOUNDS[`drawStage${i as 1 | 2 | 3}`]);
        hzs.push(f.voices[before]!.f0);
      }
      expect(hzs.map(pc)).toEqual([...expectPcs]);
      expect(hzs[1]!).toBeGreaterThan(hzs[0]!);
      expect(hzs[2]!).toBeGreaterThan(hzs[1]!);
    }
  });
  it('drawStage はゆらがない（同じ和音なら同じ高さ・大きさ）', () => {
    const { fx, f } = make({ chord: CM });
    const peaks: number[] = [];
    const freqs: number[] = [];
    for (let i = 0; i < 4; i++) {
      f.clock.t = i;
      const before = f.voices.length;
      fx.playTones(WEAPON_SOUNDS.drawStage2);
      peaks.push(f.info(f.voices[before]!).peak);
      freqs.push(f.voices[before]!.f0);
    }
    expect(new Set(peaks).size).toBe(1);
    expect(new Set(freqs).size).toBe(1);
  });
  it('dropCommon〜SuperRare の音の数は 1・2・3・6', () => {
    const n = (k: keyof typeof COMBAT_SOUNDS) => new Set(COMBAT_SOUNDS[k].map((t) => t.delay)).size;
    expect([n('dropCommon'), n('dropUncommon'), n('dropRare'), n('dropSuperRare')]).toEqual([1, 2, 3, 6]);
  });
});

describe('S5 続けてひろう', () => {
  const ladder = (chord: Chord, steps: number[]) => {
    const { fx, f } = make({ chord, seed: 5 });
    const hzs: number[] = [];
    for (const s of steps) {
      f.clock.t += 0.5;
      const before = f.voices.length;
      fx.play('pickup', 0, { comboStep: s });
      hzs.push(f.voices[before]!.f0);
    }
    return hzs;
  };
  it('和音の音を 1 つずつ上がり、1 オクターブで止まる', () => {
    const h = ladder(CM, [0, 1, 2, 3, 4, 5, 8, 12]);
    // 上がっていく（下がらない）
    expect(h[1]!).toBeGreaterThan(h[0]!);
    for (let i = 1; i < 4; i++) expect(h[i]!).toBeGreaterThanOrEqual(h[i - 1]! - 1e-9);
    // 止まる: 4 つ目より先は同じ
    for (let i = 4; i < h.length; i++) expect(h[i]).toBeCloseTo(h[3]!, 5);
    // 1 オクターブをこえない
    expect(h[3]! / h[0]!).toBeLessThanOrEqual(2 + 1e-9);
  });
  it('はじめが根音のとき ド・ミ・ソ・ド（Am なら ラ・ド・ミ・ラ）', () => {
    let found = false;
    for (let seed = 1; seed < 80 && !found; seed++) {
      const { fx, f } = make({ chord: AM, seed });
      const hzs: number[] = [];
      for (let s = 0; s <= 3; s++) {
        f.clock.t += 0.5;
        const b = f.voices.length;
        fx.play('pickup', 0, { comboStep: s });
        hzs.push(f.voices[b]!.f0);
      }
      if (pc(hzs[0]!) === 9) {
        expect(hzs.map(pc)).toEqual([9, 0, 4, 9]);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
  it('comboStep が 0 にもどる（2.5 秒あく）と、また和音からえらびなおし', () => {
    const c = new ComboTracker(() => 1, () => 12, () => 2.5);
    c.hit('dirt');
    c.hit('dirt');
    expect(c.chain).toBe(1);
    c.update(2.6);
    expect(c.chain).toBe(0);
    c.hit('dirt');
    expect(c.chain).toBe(0);
  });
});

describe('S6 数の上限', () => {
  it('落とした音は ゆらぎの乱数を使わない（あとの音の並びが変わらない）', () => {
    const a = make({ seed: 7 });
    const b = make({ seed: 7 });
    for (let i = 0; i < 4; i++) a.fx.play('pickup'); // 4 つ目は落ちる
    for (let i = 0; i < 3; i++) b.fx.play('pickup');
    a.f.clock.t = 10;
    b.f.clock.t = 10;
    a.fx.drainRecords();
    b.fx.drainRecords();
    for (let i = 0; i < 3; i++) {
      a.fx.play('dig');
      b.fx.play('dig');
    }
    const ra = a.fx.drainRecords().map((r) => [r.semis, r.cents]);
    const rb = b.fx.drainRecords().map((r) => [r.semis, r.cents]);
    expect(ra).toEqual(rb);
  });
  it('続けて取る段のはじめの音は 名前ごと（ほかの tones 音に上書きされない）', () => {
    const st = newVaryState();
    const chord = { root: 0, minor: false };
    const rng = () => 0; // いつも 先頭の候補
    variation('pickup', chord, rng, st);
    const first = st.comboIdx.get('pickup');
    variation('dropRare', chord, () => 0.99, st);
    expect(st.comboIdx.get('pickup')).toBe(first);
    expect(st.comboIdx.get('dropRare')).not.toBeUndefined();
    const v = variation('pickup', chord, rng, st, 1);
    const w = variation('pickup', chord, rng, newVaryStateWith('pickup', first!), 1);
    expect(v.shift).toBe(w.shift);
  });
  it('同じ名前が鳴っているうちに 4 つ目 → 鳴らさず dropped: true', () => {
    const { fx, f } = make();
    for (let i = 0; i < 4; i++) fx.play('pickup');
    const r = fx.drainRecords();
    expect(r.map((x) => x.dropped)).toEqual([false, false, false, true]);
    expect(fx.played).toBe(3);
    expect(f.voices.length).toBeGreaterThan(0);
    // 鳴り終われば また鳴らせる
    f.clock.t = 10;
    fx.play('pickup');
    expect(fx.drainRecords()[0]!.dropped).toBe(false);
  });
  it('部品が 48 をこえる → big 以外は鳴らさない。big は 1 つまで', () => {
    const { fx, f } = make();
    const names = ['bannerSpin', 'chime4', 'dropSuperRare', 'modalSparkle', 'harvest', 'wild', 'craft', 'toolBreak'] as const;
    const cat = new Map(SFX_CATALOG.map((c) => [c.name, c]));
    let active = 0;
    for (const n of names) {
      cat.get(n)!.play(fx);
      const r = fx.drainRecords()[0]!;
      if (!r.dropped) active = fx.activeVoices();
      expect(fx.activeVoices(), n).toBeLessThanOrEqual(48);
    }
    for (const n of names) cat.get(n)!.play(fx); // 2 周目
    const rec = fx.drainRecords();
    expect(rec.some((r) => r.dropped)).toBe(true);
    expect(active).toBeGreaterThan(0);
    // big は部品の上限をこえても鳴る
    const before = f.voices.length;
    fx.playTones(CRAFT_SOUNDS.fanfare);
    const big1 = fx.drainRecords()[0]!;
    expect(big1).toMatchObject({ name: 'fanfare', big: true, dropped: false });
    expect(f.voices.length).toBeGreaterThan(before);
    // 2 つ目の big は鳴らさない
    fx.play('levelUp');
    expect(fx.drainRecords()[0]).toMatchObject({ name: 'levelUp', big: true, dropped: true });
    // 鳴り終われば また鳴る
    f.clock.t = 20;
    fx.play('levelUp');
    expect(fx.drainRecords()[0]!.dropped).toBe(false);
  });
  it('記録は 256 まで・読むと空', () => {
    const { fx, f } = make();
    for (let i = 0; i < 300; i++) {
      f.clock.t = i;
      fx.play('place');
    }
    expect(fx.drainRecords()).toHaveLength(256);
    expect(fx.drainRecords()).toHaveLength(0);
  });
  it('同じ音を 0.1 秒ごとに 10 回: 同時に鳴る部品が 48 をこえない', () => {
    const { fx, f } = make();
    let peak = 0;
    let one = 0;
    for (let i = 0; i < 10; i++) {
      f.clock.t = i * 0.1;
      fx.play('break');
      if (i === 0) one = fx.activeVoices();
      peak = Math.max(peak, fx.activeVoices());
    }
    expect(peak).toBeLessThanOrEqual(48);
    expect(peak).toBeLessThanOrEqual(3 * one);
  });
});

describe('S7 出口', () => {
  it('output を渡すと、その destination につなぎ、その時計で鳴らす', () => {
    const { fx, f } = make();
    f.clock.t = 5;
    fx.play('place');
    expect(f.voices.length).toBeGreaterThan(0);
    for (const v of f.voices) {
      expect(f.info(v).dest).toBe(f.dest);
      expect(v.start).toBeGreaterThanOrEqual(5);
    }
    expect(fx.played).toBe(1);
  });
  it('output が null なら鳴らさず、こわれない', () => {
    const fx = new SoundFx({ output: () => null });
    expect(() => fx.play('break')).not.toThrow();
    expect(() => fx.playTones(CRAFT_SOUNDS.fanfare)).not.toThrow();
    expect(fx.played).toBe(0);
    expect(fx.drainRecords()).toHaveLength(0);
  });
  it('fxVolume 0 で何も作らない', () => {
    const { fx, f } = make({ vol: 0 });
    fx.play('break');
    fx.playTones(CRAFT_SOUNDS.fanfare);
    expect(f.voices).toHaveLength(0);
    expect(fx.played).toBe(0);
    expect(fx.drainRecords()).toHaveLength(0);
  });
  it('fxVolume を上げると大きくなる（設定は鳴らすたびに読む）', () => {
    const { fx, f, settings } = make({ vol: 0.2 });
    fx.play('place');
    const small = f.info(f.voices[0]!).peak;
    settings.fxVolume = 0.5;
    f.clock.t = 3;
    const b = f.voices.length;
    fx.play('place');
    expect(f.info(f.voices[b]!).peak).toBeGreaterThan(small);
  });
  it('古い呼び方 new SoundFx(factory, settings) も動く', () => {
    const f = fakeCtx();
    const fx = new SoundFx(() => f.ctx, { ...FX_SETTINGS });
    fx.play('pickup', 12);
    expect(fx.played).toBe(1);
    expect(f.info(f.voices[0]!).dest).toBe(f.dest);
    expect(() => new SoundFx(() => null, { ...FX_SETTINGS }).play('break')).not.toThrow();
  });
  it('onBig は big の 3 つのときだけ 1 回', () => {
    const calls: string[] = [];
    const { fx, f } = make({ onBig: (n) => calls.push(n) });
    fx.play('dig');
    fx.play('pickup');
    expect(calls).toEqual([]);
    fx.play('levelUp');
    expect(calls).toEqual(['levelUp']);
    f.clock.t = 10;
    fx.playTones(CRAFT_SOUNDS.fanfare);
    f.clock.t = 20;
    fx.playTones(CRAFT_SOUNDS.modal);
    expect(calls).toEqual(['levelUp', 'fanfare', 'modal']);
  });
  it('playTones(CRAFT_SOUNDS.fanfare) の記録は name: fanfare, big: true', () => {
    const { fx } = make();
    fx.playTones(CRAFT_SOUNDS.fanfare);
    expect(fx.drainRecords()[0]).toMatchObject({ name: 'fanfare', big: true, dropped: false });
  });
  it('表に無い並びは名前 \'\'・ゆらぎも和音合わせもなし', () => {
    const { fx, f } = make({ chord: AM });
    const mixed = [...CRAFT_SOUNDS.craft, ...CRAFT_SOUNDS.banzai];
    fx.playTones(mixed);
    const r = fx.drainRecords()[0]!;
    expect(r).toMatchObject({ name: '', semis: 0, cents: 0, big: false });
    const v0 = f.voices[0]!.f0;
    fx.playTones(mixed);
    fx.drainRecords();
    expect(f.voices[f.voices.length - mixed.length]!.f0).toBeGreaterThan(0);
    expect(v0).toBeCloseTo(mixed[0]!.f0, 5);
  });
  it('semitones を渡すと、その分高くなる', () => {
    const a = make({ seed: 1 });
    const b = make({ seed: 1 });
    a.fx.play('place', 0);
    b.fx.play('place', 12);
    expect(b.f.voices[0]!.f0 / a.f.voices[0]!.f0).toBeCloseTo(2, 5);
  });
  it('ノイズを作れない AudioContext でもこわれない', () => {
    const f = fakeCtx();
    const bare = f.ctx as unknown as Record<string, unknown>;
    delete bare.createBufferSource;
    delete bare.createBuffer;
    delete bare.createBiquadFilter;
    const fx = new SoundFx({ output: () => ({ ctx: f.ctx, destination: f.dest }) });
    expect(() => fx.play('dig')).not.toThrow();
    expect(fx.played).toBe(1);
  });
});

describe('S8 窓口の名前', () => {
  it('playCombat・playCraft は今までの名前を logSound に出す', () => {
    drainSounds();
    const { fx, f } = make();
    playCombat(fx, 'hit');
    f.clock.t = 1;
    playCombat(fx, 'defeat');
    f.clock.t = 2;
    playCraft(fx, 'craft');
    expect(fx.drainRecords().map((r) => r.name)).toEqual(['hit', 'defeat', 'craft']);
    expect(drainSounds()).toEqual(['hit', 'defeat']);
  });
});

describe('表の中身', () => {
  it('hz は平均律', () => {
    expect(hz('A4')).toBeCloseTo(440, 5);
    expect(hz('C6')).toBeCloseTo(1046.502, 2);
    expect(hz('Bb3')).toBeCloseTo(233.082, 2);
  });
  it('音の長さは 2 秒以内（モーダルなどの長い音は 2.5 秒）', () => {
    for (const t of Object.values(TABLES)) {
      for (const [name, tones] of Object.entries(t)) {
        const end = Math.max(...tones.map((x) => x.delay + x.dur));
        expect(end, name).toBeLessThanOrEqual(name === 'modalSparkle' ? 2.5 : 2);
      }
    }
  });
  it('部品の数: ふつうの音は 24 まで・big は 24 まで', () => {
    for (const t of Object.values(TABLES)) {
      for (const [name, tones] of Object.entries(t)) expect(tones.length, name).toBeLessThanOrEqual(24);
    }
  });
});
