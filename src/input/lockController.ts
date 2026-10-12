import type { LockStatus, LookSource } from '../contracts';
import { INPUT_CONFIG } from './config';

/**
 * ポインターロックの状態（DOM なし）。
 * simulate の値があれば本物の値より優先する（M1-02 §6.1 lock.simulate）。
 * ロックの状態が変わったら onChange を呼ぶ（呼び出し側が releaseAll する）。
 */
export class LockController implements LockStatus {
  private real = false;
  private simulated: boolean | null = null;
  private everLocked = false;
  private listeners: Array<(locked: boolean) => void> = [];

  /** 本物のポインターロックの状態を伝える */
  setReal(locked: boolean): void {
    const before = this.locked();
    this.real = locked;
    this.afterChange(before);
  }

  /** テスト用。呼んだあとはこの値を優先する */
  simulate(locked: boolean): void {
    const before = this.locked();
    this.simulated = locked;
    this.afterChange(before);
  }

  onChange(fn: (locked: boolean) => void): void {
    this.listeners.push(fn);
  }

  locked(): boolean {
    return this.simulated ?? this.real;
  }
  overlayVisible(): boolean {
    return !this.locked();
  }
  realtimeAllowed(): boolean {
    return this.locked();
  }
  playInputEnabled(): boolean {
    return this.locked();
  }
  overlayText(): string {
    return this.everLocked ? INPUT_CONFIG.textResume : INPUT_CONFIG.textFirst;
  }

  private afterChange(before: boolean): void {
    const now = this.locked();
    if (now) this.everLocked = true;
    if (before !== now) for (const fn of this.listeners) fn(now);
  }
}

/**
 * マウスの動きをためる。ロックが外れているあいだは受け付けず、常に 0 を返す。
 */
export class MouseLook implements LookSource {
  private dx = 0;
  private dy = 0;

  constructor(private readonly lock: LockStatus) {}

  /** マウスが動いた（実際のマウスも input.look も同じ入口） */
  push(dx: number, dy: number): void {
    if (!this.lock.locked()) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.dx += dx;
    this.dy += dy;
  }

  reset(): void {
    this.dx = 0;
    this.dy = 0;
  }

  consume(): { dx: number; dy: number } {
    if (!this.lock.locked()) {
      this.reset();
      return { dx: 0, dy: 0 };
    }
    const r = { dx: this.dx, dy: this.dy };
    this.reset();
    return r;
  }
}
