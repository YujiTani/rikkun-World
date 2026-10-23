import type { AnimalEvent, NatsukiView } from '../contracts';

/**
 * GOLD-1 §3.2: なかよし パネル の 見せかた（DOM なし。ユニット で 確かめる）。
 * ハート 10 こ（切り捨て）・70 の 区切り の 上 の きん の たまご の しるし・まち時計 2 つ（むし・手）。
 * 数（%）は 画面 に 出さない（メーター だけ）。
 */
export const NATSUKI_HEARTS = 10;
/** たまご の しるし を 置く 区切り（ハート 7 こ の あと）。70 の 区切り の 上 */
export const NATSUKI_EGG_AT = 7;
/** パネル の 見出し（ひらがな） */
export const NATSUKI_TITLE = 'なかよし';

export interface NatsukiLook {
  hidden: boolean;
  /** ハート の 色: ピンク か きんいろ */
  tone: 'pink' | 'gold';
  /** 色つき の ハート の 数 0〜10 */
  full: number;
  /** たまご の しるし: 灰色 か 色つき（ゆっくり 光る） */
  egg: 'gray' | 'lit';
  /** まち時計 の うまり 0〜1（時計回り）。ready = ふやせる（みどり の わく） */
  bug: { fill: number; ready: boolean };
  pet: { fill: number; ready: boolean };
}

export function natsukiLook(v: NatsukiView | null): NatsukiLook {
  if (!v || !v.shown) {
    return { hidden: true, tone: 'pink', full: 0, egg: 'gray', bug: { fill: 1, ready: true }, pet: { fill: 1, ready: true } };
  }
  return {
    hidden: false,
    tone: v.gold ? 'gold' : 'pink',
    full: Math.max(0, Math.min(NATSUKI_HEARTS, v.hearts)),
    egg: v.gold ? 'lit' : 'gray',
    bug: { fill: v.bugReady ? 1 : v.bugFill, ready: v.bugReady },
    pet: { fill: v.petReady ? 1 : v.petFill, ready: v.petReady },
  };
}

/** 出来事 から パネル の 動き（時計 が ゆれる・ぽよん・メーター が きんいろ に かわる）を 拾う */
export interface NatsukiPulse {
  shake: Array<'bug' | 'pet'>;
  ready: Array<'bug' | 'pet'>;
  gold: boolean;
}

export function natsukiPulse(events: readonly AnimalEvent[], aimedId: number | null): NatsukiPulse {
  const out: NatsukiPulse = { shake: [], ready: [], gold: false };
  if (aimedId === null) return out;
  for (const e of events) {
    if (e.type === 'natsukiWait' && e.id === aimedId) out.shake.push(e.which);
    else if (e.type === 'natsukiReady' && e.id === aimedId) out.ready.push(e.which);
    else if (e.type === 'natsukiGold' && e.id === aimedId) out.gold = true;
  }
  return out;
}
