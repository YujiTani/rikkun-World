/**
 * GAMEPAD-1: Gamepad API → ActionState / look。DOM なしの核。
 */
import type { Action, ActionState } from '../actions';
import type { LookSource } from '../../contracts';
import { GAMEPAD_CONFIG, type GamepadSettings } from './config';
import { applyDeadZone, loadBinds, loadCalib, saveBinds, saveCalib, type BindMap, type Calib } from './binds';
import {
  DEFAULT_PLAY_BINDS,
  axisLayout,
  detectMappingKind,
  faceTable,
  type MappingKind,
  type PadFace,
} from './mapping';

export type LastInput = 'keyboard' | 'mouse' | 'gamepad';

export interface PadSnapshot {
  index: number;
  id: string;
  mapping: string;
  kind: MappingKind;
  connected: boolean;
  axes: number[];
  buttons: boolean[];
  faces: Partial<Record<PadFace, boolean>>;
}

type GetPads = () => (Gamepad | null)[];

export class GamepadReader {
  private binds: BindMap;
  private calib: Calib;
  private settings: GamepadSettings;
  private prev = new Map<number, boolean[]>();
  private heldFaces = new Map<PadFace, boolean>();
  private dirHeld = new Set<string>();
  private assignedIndex: number | null = null;
  private lastInput: LastInput = 'keyboard';
  private menuOpen = false;
  private hanging = false;
  /** テスト注入用 */
  getPads: GetPads = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : []);

  constructor(
    private readonly actions: ActionState,
    private readonly look: { push(dx: number, dy: number): void },
    private readonly storage: Storage | null,
    settings?: Partial<GamepadSettings>,
  ) {
    this.binds = loadBinds(storage);
    this.calib = loadCalib(storage);
    this.settings = {
      deadZone: settings?.deadZone ?? GAMEPAD_CONFIG.deadZone,
      lookSensitivity: settings?.lookSensitivity ?? GAMEPAD_CONFIG.lookSensitivity,
    };
  }

  getBinds(): BindMap {
    return { ...this.binds };
  }
  setBind(face: PadFace, action: Action | null): void {
    this.binds = { ...this.binds, [face]: action };
  }
  persistBinds(): void {
    saveBinds(this.storage, this.binds);
  }
  resetBinds(): void {
    this.binds = { ...DEFAULT_PLAY_BINDS };
    saveBinds(this.storage, this.binds);
  }

  getSettings(): GamepadSettings {
    return { ...this.settings };
  }
  setSettings(s: Partial<GamepadSettings>): void {
    if (s.deadZone !== undefined) this.settings.deadZone = Math.min(0.5, Math.max(0.05, s.deadZone));
    if (s.lookSensitivity !== undefined) this.settings.lookSensitivity = Math.max(0.1, s.lookSensitivity);
  }

  getCalib(): Calib {
    return { ...this.calib };
  }
  calibrateFromAxes(lx: number, ly: number, rx: number, ry: number): void {
    this.calib = { lx, ly, rx, ry };
    saveCalib(this.storage, this.calib);
  }

  setMenuOpen(on: boolean): void {
    this.menuOpen = on;
  }
  setHanging(on: boolean): void {
    this.hanging = on;
  }

  noteKeyboard(): void {
    this.lastInput = 'keyboard';
  }
  noteMouse(): void {
    this.lastInput = 'mouse';
  }
  getLastInput(): LastInput {
    return this.lastInput;
  }

  /** 割り当て中のパッドがあるか */
  hasPad(): boolean {
    return this.assignedIndex !== null && this.snapshot()?.connected === true;
  }

  assignedPadIndex(): number | null {
    return this.assignedIndex;
  }

  /** 接続イベントから割当 */
  onConnected(index: number): void {
    if (this.assignedIndex === null) this.assignedIndex = index;
  }
  onDisconnected(index: number): void {
    if (this.assignedIndex === index) {
      this.releaseAllPadActions();
      this.assignedIndex = null;
      // 別の接続があれば拾う
      for (const p of this.getPads()) {
        if (p?.connected) {
          this.assignedIndex = p.index;
          break;
        }
      }
    }
    this.prev.delete(index);
  }

  /** 起動時に既に刺さっているパッドを拾う */
  bootstrap(): void {
    for (const p of this.getPads()) {
      if (p?.connected) {
        this.assignedIndex = p.index;
        break;
      }
    }
  }

  snapshot(): PadSnapshot | null {
    const pads = this.getPads();
    const idx = this.assignedIndex;
    const pad = idx === null ? pads.find((p) => p?.connected) ?? null : pads[idx] ?? null;
    if (!pad || !pad.connected) return null;
    const kind = detectMappingKind(pad);
    const table = faceTable(kind);
    const faces: Partial<Record<PadFace, boolean>> = {};
    const buttons = pad.buttons.map((b) => !!b.pressed);
    buttons.forEach((on, i) => {
      const f = table[i];
      if (f) faces[f] = on;
    });
    return {
      index: pad.index,
      id: pad.id,
      mapping: pad.mapping,
      kind,
      connected: true,
      axes: [...pad.axes],
      buttons,
      faces,
    };
  }

  /** 毎フレーム（または固定ステップの前）呼ぶ */
  poll(nowMs: number): void {
    const pads = this.getPads();
    if (this.assignedIndex === null) {
      for (const p of pads) {
        if (p?.connected) {
          this.assignedIndex = p.index;
          break;
        }
      }
    }
    const pad = this.assignedIndex === null ? null : pads[this.assignedIndex];
    if (!pad || !pad.connected) {
      if (this.assignedIndex !== null) this.onDisconnected(this.assignedIndex);
      return;
    }

    const kind = detectMappingKind(pad);
    const table = faceTable(kind);
    const axes = axisLayout(kind);
    const dz = this.settings.deadZone;
    const c = this.calib;

    const lx = applyDeadZone((pad.axes[axes.lx] ?? 0) - c.lx, dz);
    const ly = applyDeadZone((pad.axes[axes.ly] ?? 0) - c.ly, dz);
    const rx = applyDeadZone((pad.axes[axes.rx] ?? 0) - c.rx, dz);
    const ry = applyDeadZone((pad.axes[axes.ry] ?? 0) - c.ry, dz);

    // 移動（正規化）
    this.setMove(lx, ly);
    // 視点
    if (rx !== 0 || ry !== 0) {
      this.lastInput = 'gamepad';
      const s = this.settings.lookSensitivity;
      this.look.push(rx * s, ry * s);
    }

    const prev = this.prev.get(pad.index) ?? [];
    const cur = pad.buttons.map((b) => !!b.pressed);
    const n = Math.max(prev.length, cur.length, 16);
    for (let i = 0; i < n; i++) {
      const face = table[i];
      if (!face) continue;
      const was = !!prev[i];
      const on = !!cur[i];
      if (on === was) continue;
      this.lastInput = 'gamepad';
      if (on) this.pressFace(face, nowMs);
      else this.releaseFace(face);
    }
    this.prev.set(pad.index, cur);
  }

  private setMove(lx: number, ly: number): void {
    // ブラウザ: y+ が下。ゲームの前は stick 上 = 負の y
    let mx = lx;
    let my = -ly;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    const thr = 0.35;
    this.syncDir('moveRight', mx > thr);
    this.syncDir('moveLeft', mx < -thr);
    this.syncDir('moveForward', my > thr);
    this.syncDir('moveBack', my < -thr);
    if (mag > thr) this.lastInput = 'gamepad';
  }

  private syncDir(action: 'moveForward' | 'moveBack' | 'moveLeft' | 'moveRight', on: boolean): void {
    const was = this.dirHeld.has(action);
    if (on && !was) {
      this.actions.press(action);
      this.dirHeld.add(action);
    } else if (!on && was) {
      this.actions.release(action);
      this.dirHeld.delete(action);
    }
  }

  private actionForFace(face: PadFace): import('../actions').Action | null {
    if (this.menuOpen) {
      if (face === 'faceBottom') return 'confirm';
      if (face === 'faceRight') return 'closeMenu';
      if (face === 'faceLeft' || face === 'start') return 'toggleInventory';
      if (face === 'dpadUp' || face === 'dpadDown' || face === 'dpadLeft' || face === 'dpadRight') return null; // UI フォーカスは別
    }
    if (this.hanging && face === 'faceRight') return 'ropeDown';
    const b = this.binds[face];
    return b === undefined ? DEFAULT_PLAY_BINDS[face] : b;
  }

  private pressFace(face: PadFace, _nowMs: number): void {
    this.heldFaces.set(face, true);
    const a = this.actionForFace(face);
    if (a) this.actions.press(a);
  }

  private releaseFace(face: PadFace): void {
    this.heldFaces.delete(face);
    const a = this.actionForFace(face);
    if (a) this.actions.release(a);
  }

  releaseAllPadActions(): void {
    for (const face of [...this.heldFaces.keys()]) {
      const a = this.actionForFace(face);
      if (a) this.actions.release(a);
    }
    this.heldFaces.clear();
    for (const act of [...this.dirHeld]) {
      this.actions.release(act as 'moveForward' | 'moveBack' | 'moveLeft' | 'moveRight');
    }
    this.dirHeld.clear();
  }
}

/** look を lock 無しでも受けられる薄いラッパ（パッド用） */
export class AlwaysLook implements LookSource {
  private dx = 0;
  private dy = 0;
  private readonly out = { dx: 0, dy: 0 };
  push(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.dx += dx;
    this.dy += dy;
  }
  reset(): void {
    this.dx = 0;
    this.dy = 0;
  }
  consume(): { dx: number; dy: number } {
    this.out.dx = this.dx;
    this.out.dy = this.dy;
    this.reset();
    return this.out;
  }
}
