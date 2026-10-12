import type { YokaiKind } from '../contracts';
import { createLevelConfig, type LevelConfig } from './config';

export interface LevelState {
  level: number;
  xp: number;
  /** 次のレベルまでに必要な経験値 */
  next: number;
}

export type LevelEvent =
  | { type: 'xp'; tick: number; amount: number; level: number; xp: number }
  | { type: 'levelUp'; tick: number; level: number };

export interface LevelDeps {
  config?: LevelConfig;
  /** レベルアップのとき: ハートを全回復する */
  onLevelUp?: (level: number) => void;
  tick?: () => number;
  requestSave?: () => void;
}

const MAX_QUEUE = 64;

/** 経験値とレベル。やられても減らない（何も呼ばなければそのまま）。保存される */
export class LevelSystem {
  readonly config: LevelConfig;
  private lv = 1;
  private points = 0;
  private events: LevelEvent[] = [];
  private hookEvents: LevelEvent[] = [];

  constructor(private readonly d: LevelDeps = {}) {
    this.config = d.config ?? createLevelConfig();
  }

  level(): number {
    return this.lv;
  }
  xp(): number {
    return this.points;
  }
  nextXp(level = this.lv): number {
    return this.config.perLevel * level;
  }
  get(): LevelState {
    return { level: this.lv, xp: this.points, next: this.nextXp() };
  }

  /** 妖怪をたおした。入った経験値を返す */
  onDefeat(kind: YokaiKind): number {
    const n = this.config.xp[kind] ?? 0;
    this.addXp(n);
    return n;
  }

  /** 経験値を足す。上がったレベルの数を返す（まとめて上がることもある） */
  addXp(amount: number): number {
    if (!(amount > 0)) return 0;
    this.points += Math.floor(amount);
    let ups = 0;
    while (this.lv < this.config.maxLevel && this.points >= this.nextXp()) {
      this.points -= this.nextXp();
      this.lv++;
      ups++;
    }
    if (this.lv >= this.config.maxLevel) this.points = Math.min(this.points, this.nextXp() - 1);
    const tick = this.d.tick?.() ?? 0;
    this.push({ type: 'xp', tick, amount, level: this.lv, xp: this.points });
    if (ups > 0) {
      this.push({ type: 'levelUp', tick, level: this.lv });
      this.d.onLevelUp?.(this.lv);
    }
    this.d.requestSave?.();
    return ups;
  }

  /** テスト用: レベルと経験値を決める（演出・回復は出さない） */
  set(level: number, xp = 0): void {
    this.lv = Math.max(1, Math.min(this.config.maxLevel, Math.floor(level)));
    this.points = Math.max(0, Math.min(this.nextXp() - 1, Math.floor(xp)));
  }

  /** 画面と音用（呼ぶと空になる） */
  drainEvents(): LevelEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
  /** テストの窓口用（呼ぶと空になる） */
  takeHookEvents(): LevelEvent[] {
    const out = this.hookEvents;
    this.hookEvents = [];
    return out;
  }

  serialize(): { level: number; xp: number } {
    return { level: this.lv, xp: this.points };
  }

  deserialize(data: unknown): void {
    const d = data as { level?: unknown; xp?: unknown } | null;
    if (d && typeof d === 'object' && Number.isFinite(d.level) && Number.isFinite(d.xp)) this.set(d.level as number, d.xp as number);
    else this.set(1, 0);
  }

  private push(e: LevelEvent): void {
    this.events.push(e);
    this.hookEvents.push(e);
    if (this.events.length > MAX_QUEUE) this.events.shift();
    if (this.hookEvents.length > MAX_QUEUE) this.hookEvents.shift();
  }
}
