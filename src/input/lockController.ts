import type { LockStatus, LookSource } from '../contracts';
import { INPUT_CONFIG } from './config';

/**
 * ポインターロックの状態（DOM なし）。
 * simulate の値があれば本物の値より優先する（M1-02 §6.1 lock.simulate）。
 * 状態が変わったら onChange を呼ぶ（呼び出し側が releaseAll する）。
 *
 * M2 で足したもの:
 * - もちもの画面が開いている間（inventoryOpen）は、ロックが外れていても案内画面を出さず、
 *   時間はゆっくり進める（realtimeAllowed）。遊びの入力は受け付けない。
 * - 閉じてロックをかけ直している間（relocking）も案内画面は出さない。返事が来なければ endRelock で出す。
 */
export class LockController implements LockStatus {
  private real = false;
  private simulated: boolean | null = null;
  private everLocked = false;
  private inventoryOpen = false;
  private relocking = false;
  private listeners: Array<(locked: boolean) => void> = [];

  /** 本物のポインターロックの状態を伝える */
  setReal(locked: boolean): void {
    const before = this.snapshot();
    this.real = locked;
    if (locked) this.relocking = false;
    this.afterChange(before);
  }

  /** テスト用。呼んだあとはこの値を優先する */
  simulate(locked: boolean): void {
    const before = this.snapshot();
    this.simulated = locked;
    if (locked) this.relocking = false;
    this.afterChange(before);
  }

  /** simulate を一度でも呼んだか（M2 §2.5: 画面の開け閉めで擬似の状態も動かす） */
  isSimulated(): boolean {
    return this.simulated !== null;
  }

  /** もちもの画面の開閉を伝える（ScreenController が呼ぶ） */
  setInventoryOpen(open: boolean): void {
    const before = this.snapshot();
    this.inventoryOpen = open;
    this.afterChange(before);
  }

  /** ロックをかけ直しはじめた（返事が来るまで案内画面を出さない） */
  beginRelock(): void {
    const before = this.snapshot();
    this.relocking = !this.locked();
    this.afterChange(before);
  }

  /** かけ直しがだめだった（案内画面を出す）。成功のときは setReal(true) で自動的に終わる */
  endRelock(): void {
    const before = this.snapshot();
    this.relocking = false;
    this.afterChange(before);
  }

  onChange(fn: (locked: boolean) => void): void {
    this.listeners.push(fn);
  }

  locked(): boolean {
    return this.simulated ?? this.real;
  }
  overlayVisible(): boolean {
    return !this.locked() && !this.inventoryOpen && !this.relocking;
  }
  realtimeAllowed(): boolean {
    return this.locked() || this.inventoryOpen || this.relocking;
  }
  playInputEnabled(): boolean {
    return this.locked() && !this.inventoryOpen;
  }
  overlayText(): string {
    return this.everLocked ? INPUT_CONFIG.textResume : INPUT_CONFIG.textFirst;
  }

  private snapshot(): number {
    return (this.locked() ? 1 : 0) | (this.inventoryOpen ? 2 : 0) | (this.relocking ? 4 : 0);
  }

  private afterChange(before: number): void {
    const now = this.locked();
    if (now) this.everLocked = true;
    if (before !== this.snapshot()) for (const fn of this.listeners) fn(now);
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
    if (!this.lock.playInputEnabled()) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.dx += dx;
    this.dy += dy;
  }

  reset(): void {
    this.dx = 0;
    this.dy = 0;
  }

  consume(): { dx: number; dy: number } {
    if (!this.lock.playInputEnabled()) {
      this.reset();
      return { dx: 0, dy: 0 };
    }
    const r = { dx: this.dx, dy: this.dy };
    this.reset();
    return r;
  }
}
