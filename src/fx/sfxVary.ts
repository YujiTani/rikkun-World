/**
 * ゆらぎ・和音合わせ・大きさの表（SOUND.md §6.1・§6.2。preview の `VARY` と同じ考え方）。
 *  cents = 高さを ±何セント（100 = 半音）  gain = 大きさを ±何割  dur = 長さを ±何割
 *  chord = 'none' 合わせない／'root' 根音に合わせる（短調なら「ミ」を半音下げる）／
 *          'tones' 根音・3 度・5 度から直前とちがう音
 * 高さのある音は「ド（C）を根音」として作ってあり、鳴らすときにここで動かす。
 */
export type ChordMode = 'none' | 'root' | 'tones';

export interface Vary {
  cents: number;
  gain: number;
  dur: number;
  chord: ChordMode;
  /** 大きく祝う音（BGM を duck する合図。同時に 1 つまで） */
  big?: true;
}

/** 書いていない音（SOUND.md §6.2: 40 / 0.10 / 0.10） */
const PLAIN: Vary = { cents: 40, gain: 0.1, dur: 0.1, chord: 'none' };
/** 和音に合わせる音は、BGM と音程がずれないよう高さはゆらさない（SOUND.md との違い。報告に書く） */
const TUNED: Vary = { cents: 0, gain: 0.08, dur: 0.05, chord: 'root' };

const root = (over: Partial<Vary> = {}): Vary => ({ ...TUNED, ...over });
const tones = (over: Partial<Vary> = {}): Vary => ({ ...TUNED, chord: 'tones', ...over });
const plain = (over: Partial<Vary> = {}): Vary => ({ ...PLAIN, ...over });

export const VARY: Readonly<Record<string, Vary>> = {
  // ほる・おく
  dig: plain({ cents: 70, gain: 0.15, dur: 0.12 }),
  crack: plain(),
  crackFinal: plain(),
  ready: root({ cents: 0, gain: 0.05, dur: 0 }),
  break: root({ cents: 50, gain: 0.1, dur: 0.1 }),
  place: plain({ cents: 50 }),
  clink: plain({ cents: 30, dur: 0 }),
  pickup: tones({ cents: 0, gain: 0.08, dur: 0 }),
  levelUp: root({ cents: 0, gain: 0, dur: 0, big: true }),
  whiff: plain({ cents: 60, gain: 0.15 }),
  // たたかう・妖怪・時間
  hit: plain({ cents: 80, gain: 0.15 }),
  defeat: root(),
  orb: tones(),
  faint: root(),
  respawn: root(),
  guard: root(),
  wearLow: root(),
  toolBreak: root(),
  bell: root(),
  dropCommon: tones(),
  dropUncommon: tones(),
  dropRare: tones(),
  dropSuperRare: tones(),
  // 段 1・2・3 は ド・ミ・ソ で作り、根音に合わせる（C なら ド・ミ・ソ、Am なら ラ・ド・ミ）。ゆらがない
  drawStage1: root({ cents: 0, gain: 0, dur: 0 }),
  drawStage2: root({ cents: 0, gain: 0, dur: 0 }),
  drawStage3: root({ cents: 0, gain: 0, dur: 0 }),
  // つくる・実績
  craft: root(),
  bakeDone: root(),
  sparkle: tones(),
  badge: root(),
  closeReady: root(),
  banzai: root(),
  chime1: root(),
  chime2: root(),
  chime3: root(),
  chime4: root(),
  bannerSpin: root(),
  modalSparkle: root(),
  fanfare: root({ cents: 0, gain: 0, dur: 0, big: true }),
  modal: root({ cents: 0, gain: 0, dur: 0, big: true }),
  // はたけ・みず・どうぶつ
  harvest: tones(),
  wild: tones(),
  seedFound: tones(),
  pet: tones(),
  petAgain: tones(),
  fill: plain({ cents: 120, gain: 0.15, dur: 0.15 }),
};

export function varyOf(name: string): Vary {
  return VARY[name] ?? PLAIN;
}

/** 大きく祝う音（3 つだけ） */
export const BIG_NAMES: readonly string[] = Object.entries(VARY)
  .filter(([, v]) => v.big)
  .map(([n]) => n);

/**
 * 音の大きさの倍率（名前ごと）。ミキサーの効果音バス 1.0・fxVolume 0.5（はじめの値）で、
 * preview の案 B と ±2 dB になるよう OfflineAudioContext で測って合わせた値。
 * 測り方: `docs/audio/SOUND.md` §8 の「数で見る」と同じ（いちばん大きい 50ms の RMS）。
 */
export const LEVEL: Readonly<Record<string, number>> = {
  dig: 1.21, crack: 1.68, crackFinal: 0.76, ready: 0.98, break: 0.54, place: 0.69,
  clink: 1.54, pickup: 1.13, levelUp: 0.73, whiff: 0.69, punch: 1.44, hit: 1.1,
  miss: 1.57, defeat: 0.64, orb: 1.15, hurt: 0.4, faint: 0.65, respawn: 0.72,
  spawn: 0.41, bell: 0.5, birds: 1.42, dropCommon: 0.82, dropUncommon: 0.95, dropRare: 1.21,
  dropSuperRare: 1.16, stance: 1.68, thrust: 1.42, kesa: 0.84, kesaHit: 0.56, kiriage: 1.47,
  wearLow: 1.23, toolBreak: 1.1, drawStage1: 0.88, drawStage2: 0.88, drawStage3: 0.67, dry: 0.58,
  shoot1: 1.15, shoot2: 0.79, shoot3: 0.62, arrowHit: 1.15, arrowStick: 0.97, slash: 1.39,
  naginata: 1.02, bowDraw: 1.95, bowRelease: 0.79, arrowThud: 1.24, noArrow: 1.48, equip: 0.95,
  guard: 0.85, sparkle: 1.21, craft: 0.62, craftFail: 0.95, bakeStart: 0.57, crackle: 0.7,
  bakeDone: 0.71, banzai: 0.92, tab: 0.96, chime1: 1.14, chime2: 1.14, chime3: 1.14,
  chime4: 1.14, bannerSpin: 1.62, fanfare: 0.7, modal: 0.77, modalSparkle: 1.95, badge: 0.98,
  closeReady: 0.87, till: 0.87, tillPress: 2.04, plant: 0.87, harvest: 0.81, wild: 0.81,
  notRipe: 0.52, seedFound: 1.08, eat: 1.21, fill: 1.15, fullCan: 1.52, pour: 0.47,
  empty: 1.22, sprinklerPlace: 0.45, pet: 1.15, petAgain: 1.22, throw: 1.02, drawerOpen: 1.53,
  drawerClose: 0.9,
};

export function levelOf(name: string): number {
  return LEVEL[name] ?? 1;
}

/** シード付きの乱数（mulberry32 系。preview の makeRng と同じ） */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** -5〜+6 半音のうち、高さの種類が pc になるずらし幅 */
export function nearestShift(pc: number): number {
  const v = ((pc % 12) + 12) % 12;
  return v > 6 ? v - 12 : v;
}

export interface ChordLike {
  root: number;
  minor: boolean;
}

/** 根音・3 度・5 度の高さ（半音の数。根音からの差） */
export function chordOffsets(chord: ChordLike): [number, number, number, number] {
  return [0, chord.minor ? 3 : 4, 7, 12];
}

export interface Variation {
  /** 記録に残す、和音へのずれ（-5〜+6 の半音） */
  semis: number;
  /** 実際に動かす半音（続けて取るときは 1 オクターブ足すので -5〜+18） */
  shift: number;
  cents: number;
  gain: number;
  dur: number;
  /** 短調の根音合わせ: 「ミ」を半音下げる */
  minor: boolean;
}

export interface VaryState {
  /** 名前ごとの「直前に選んだ和音の音」 */
  last: Map<string, number>;
  /** 続けて取る段のはじめに選んだ和音の音（0 = 根音、1 = 3 度、2 = 5 度） */
  comboIdx: number;
}

export function newVaryState(): VaryState {
  return { last: new Map(), comboIdx: 0 };
}

/**
 * 効果音 1 回ぶんのずらし方を決める。乱数は rng() から、決まった順（和音の音 → cents → gain → dur）で引く。
 * 名前の無い音（name が空）は何も引かず、ずらさない。
 */
export function variation(
  name: string,
  chord: ChordLike,
  rng: () => number,
  state: VaryState,
  comboStep?: number,
): Variation {
  const out: Variation = { semis: 0, shift: 0, cents: 0, gain: 1, dur: 1, minor: false };
  if (!name) return out;
  const v = varyOf(name);
  const offs = chordOffsets(chord);
  if (v.chord === 'root') {
    out.semis = out.shift = nearestShift(chord.root);
    out.minor = chord.minor;
  } else if (v.chord === 'tones') {
    const cands = [0, 1, 2].map((i) => nearestShift(chord.root + offs[i]!));
    if (comboStep !== undefined && comboStep > 0) {
      // 続けて取る: はじめの音から、和音の音を 1 つずつ上がる。1 オクターブで止まる
      const i0 = state.comboIdx;
      const idx = Math.min(i0 + comboStep, 3);
      out.shift = cands[i0]! + offs[idx]! - offs[i0]!;
      out.semis = nearestShift(out.shift);
    } else {
      const prev = state.last.get(name);
      const choices = [0, 1, 2].filter((i) => cands[i] !== prev);
      const i = choices[Math.floor(rng() * choices.length)]!;
      state.last.set(name, cands[i]!);
      state.comboIdx = i;
      out.semis = out.shift = cands[i]!;
    }
  }
  if (v.cents) out.cents = (rng() * 2 - 1) * v.cents;
  if (v.gain) out.gain = 1 + (rng() * 2 - 1) * v.gain;
  if (v.dur) out.dur = 1 + (rng() * 2 - 1) * v.dur;
  return out;
}
