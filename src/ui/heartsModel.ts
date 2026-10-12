import type { Rgba } from '../world/blocks/textures';

export type HeartState = 'full' | 'half' | 'empty';

/** ハートの数値（M3 §3.3） */
export const HEART_CONFIG = {
  /** ハートの数（体力 20 = 10 こ。1 = 半分） */
  count: 10,
  /** へったハートがはじけて消えるまで（秒）・列のぷるっ（秒） */
  burstSeconds: 0.4,
  shakeSeconds: 0.2,
  /** 回復で「ぽわん」とふくらむ倍率・秒 */
  popScale: 1.2,
  popSeconds: 0.3,
  /** この体力以下で ぴょこぴょこ（周期は秒。1 秒に 1 回） */
  lowHp: 3,
  lowPeriodSeconds: 1,
  /** ぴょこの高さ（ハートの大きさに対する割合） */
  lowHop: 0.18,
  /** ぷるっの横ゆれ（ハートの大きさに対する割合） */
  shakeAmount: 0.08,
} as const;

/** 体力 → ハートの並び。半分は左半分だけ赤 */
export function heartStates(hp: number, count: number = HEART_CONFIG.count): HeartState[] {
  const h = Math.max(0, Math.min(count * 2, Math.round(hp)));
  const out: HeartState[] = [];
  for (let i = 0; i < count; i++) {
    const v = h - i * 2;
    out.push(v >= 2 ? 'full' : v === 1 ? 'half' : 'empty');
  }
  return out;
}

// ---------------------------------------------------------------- ドット絵（16x16）

const HEART_ROWS = [
  '................',
  '..KKKK....KKKK..',
  '.KRRRRK..KRRRRK.',
  'KRWWRRRKKRRRRRRK',
  'KRWRRRRRRRRRRRRK',
  'KRRRRRRRRRRRRRRK',
  'KRRRRRRRRRRRRRRK',
  '.KRRRRRRRRRRRRK.',
  '.KRRRRRRRRRRRRK.',
  '..KRRRRRRRRRRK..',
  '...KRRRRRRRRK...',
  '....KRRRRRRK....',
  '.....KRRRRK.....',
  '......KRRK......',
  '.......KK.......',
  '................',
];

const RED: Rgba = [0xe5, 0x39, 0x35, 255];
const GRAY: Rgba = [0x55, 0x55, 0x55, 255];
const WHITE: Rgba = [255, 255, 255, 255];
const BLACK: Rgba = [0, 0, 0, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

/** ハート 1 こ分の 16x16。赤 #E53935・白いつや・黒いふち。からは灰色 #555555 */
export function heartPixels(state: HeartState): Rgba[] {
  const out: Rgba[] = [];
  HEART_ROWS.forEach((row) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') out.push(CLEAR);
      else if (ch === 'K') out.push(BLACK);
      else if (state === 'empty') out.push(GRAY);
      else if (state === 'half' && x >= 8) out.push(GRAY);
      else out.push(ch === 'W' ? WHITE : RED);
    });
  });
  return out;
}

// ---------------------------------------------------------------- 動き

export interface HeartCell {
  state: HeartState;
  /** はじけている経過秒（-1 = はじけていない） */
  burstT: number;
  /** ぽわんの経過秒（-1 = なし） */
  popT: number;
}

/** ハートの動き（DOM なしでテストできる）。set() で体力を渡し、update(dt) で進める */
export class HeartsModel {
  hp: number;
  invincible = false;
  readonly cells: HeartCell[] = [];
  shakeT = -1;
  private lowT = 0;
  private started = false;

  constructor(
    readonly count: number = HEART_CONFIG.count,
    private readonly cfg = HEART_CONFIG,
  ) {
    this.hp = count * 2;
    for (const state of heartStates(this.hp, count)) this.cells.push({ state, burstT: -1, popT: -1 });
  }

  /** 体力を渡す。へったら はじけて列がぷるっ、1 回復したら そのハートがぽわん */
  set(hp: number, invincible: boolean): void {
    this.invincible = invincible;
    const next = Math.max(0, Math.min(this.count * 2, Math.round(hp)));
    const states = heartStates(next, this.count);
    if (this.started && next < this.hp) {
      this.shakeT = 0;
      states.forEach((s, i) => {
        if (s !== this.cells[i].state) this.cells[i].burstT = 0;
      });
    } else if (this.started && next > this.hp) {
      const i = Math.min(this.count - 1, Math.ceil(next / 2) - 1);
      this.cells[i].popT = 0;
    }
    states.forEach((s, i) => (this.cells[i].state = s));
    this.hp = next;
    this.started = true;
  }

  update(dt: number): void {
    const c = this.cfg;
    for (const cell of this.cells) {
      if (cell.burstT >= 0 && (cell.burstT += dt) >= c.burstSeconds) cell.burstT = -1;
      if (cell.popT >= 0 && (cell.popT += dt) >= c.popSeconds) cell.popT = -1;
    }
    if (this.shakeT >= 0 && (this.shakeT += dt) >= c.shakeSeconds) this.shakeT = -1;
    this.lowT += dt;
  }

  /** 体力が少ない（ぴょこぴょこ） */
  low(): boolean {
    return this.hp > 0 && this.hp <= this.cfg.lowHp;
  }

  /** 列の横ゆれ（ハートの大きさに対する割合） */
  rowOffsetX(): number {
    if (this.shakeT < 0) return 0;
    const k = 1 - this.shakeT / this.cfg.shakeSeconds;
    return Math.sin(this.shakeT * 90) * this.cfg.shakeAmount * k;
  }

  /** i 番目のハートの上下（割合。上がマイナス） */
  cellOffsetY(i: number): number {
    if (!this.low()) return 0;
    const p = (this.lowT + i * 0.06) / this.cfg.lowPeriodSeconds;
    const f = p - Math.floor(p);
    // 周期の前半だけぴょこんと跳ぶ
    return f < 0.4 ? -Math.sin((f / 0.4) * Math.PI) * this.cfg.lowHop : 0;
  }

  /** i 番目のハートの拡大（回復の ぽわん） */
  cellScale(i: number): number {
    const t = this.cells[i].popT;
    if (t < 0) return 1;
    return 1 + (this.cfg.popScale - 1) * Math.sin((Math.PI * t) / this.cfg.popSeconds);
  }
}
