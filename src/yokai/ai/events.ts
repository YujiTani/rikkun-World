import type { YokaiEvent } from '../../contracts';
import type { HookYokaiEvent } from './managerTypes';

/**
 * 出来事の配り（画面用の列・テストの窓口用の列・マッチョへの「きっかけ」）。
 * 出来事に付ける「ゲームの何ステップ目か」は、`tick` の窓口があればそれ、なければ update を呼んだ回数。
 */
export class YokaiEvents {
  private screenEvents: YokaiEvent[] = [];
  private hookEvents: HookYokaiEvent[] = [];
  /** LIVE-4: マッチョ に 知らせる「きっかけ」（りっくん が たたいた／たたかれた 妖怪 の id）。`takeCues()` で 取り出す */
  readonly cues: { hit: number[]; hurt: number[] } = { hit: [], hurt: [] };

  constructor(
    private readonly clock: { steps: number },
    private readonly tickFn: (() => number) | null,
  ) {}

  tick(): number {
    return this.tickFn ? this.tickFn() : this.clock.steps;
  }

  emit(ev: HookYokaiEvent, hookOnly = false): void {
    if (!hookOnly && ev.type !== 'remove' && ev.type !== 'drop') this.screenEvents.push(ev);
    this.hookEvents.push(ev);
    if (this.hookEvents.length > 3000) this.hookEvents.splice(0, 1000);
    if (this.screenEvents.length > 3000) this.screenEvents.splice(0, 1000);
  }

  drainEvents(): YokaiEvent[] {
    const out = this.screenEvents;
    this.screenEvents = [];
    return out;
  }

  /** 前に呼んでから起きた出来事（呼ぶと空になる）。画面側の列とは別 */
  takeHookEvents(): HookYokaiEvent[] {
    const out = this.hookEvents;
    this.hookEvents = [];
    return out;
  }

  /** この ステップ の「きっかけ」を 取り出す（呼ぶと 空）。数 は かえない */
  takeCues(): { hit: number[]; hurt: number[] } | null {
    const c = this.cues;
    if (c.hit.length === 0 && c.hurt.length === 0) return null;
    const out = { hit: c.hit.slice(), hurt: c.hurt.slice() };
    c.hit.length = 0;
    c.hurt.length = 0;
    return out;
  }
}
