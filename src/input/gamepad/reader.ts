/**
 * GAMEPAD-1: Gamepad API → ActionState / look。DOM なしの核。
 */
import type { Action, ActionState } from '../actions';
import type { LookSource } from '../../contracts';
import type { GamepadSettings } from './config';
import { applyDeadZone, hasSavedBinds, loadBinds, loadCalib, saveBinds, saveCalib, type BindMap, type Calib } from './binds';
import { clampLook, loadGamepadSettings, saveGamepadSettings } from './settingsStore';
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
  /** 押したときに出した Action（はなすときはこれをはなす） */
  private heldFaces = new Map<PadFace, Action>();
  private bindsSaved: boolean;
  private kind: MappingKind = 'standard';
  private dirHeld = new Set<string>();
  private assignedIndex: number | null = null;
  private lastInput: LastInput = 'keyboard';
  private menuOpen = false;
  private capturing = false;
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
    this.bindsSaved = hasSavedBinds(storage);
    this.calib = loadCalib(storage);
    const stored = loadGamepadSettings(storage);
    this.settings = {
      deadZone: settings?.deadZone ?? stored.deadZone,
      lookSensitivity: settings?.lookSensitivity ?? stored.lookSensitivity,
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
    this.bindsSaved = true;
  }
  resetBinds(): void {
    this.binds = { ...DEFAULT_PLAY_BINDS };
    saveBinds(this.storage, this.binds);
    this.bindsSaved = true;
  }

  getSettings(): GamepadSettings {
    return { ...this.settings };
  }
  setSettings(s: Partial<GamepadSettings>): void {
    if (s.deadZone !== undefined) this.settings.deadZone = Math.min(0.5, Math.max(0.05, s.deadZone));
    if (s.lookSensitivity !== undefined) this.settings.lookSensitivity = clampLook(s.lookSensitivity);
    saveGamepadSettings(this.storage, this.settings);
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
  /** ボタン待ちのあいだは Action を出さない（画面が 押された面を読む） */
  setCapturing(on: boolean): void {
    this.capturing = on;
  }
  isCapturing(): boolean {
    return this.capturing;
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
    this.kind = kind;
    const table = faceTable(kind);
    const axes = axisLayout(kind);
    const dz = this.settings.deadZone;
    const c = this.calib;

    const lx = applyDeadZone((pad.axes[axes.lx] ?? 0) - c.lx, dz);
    const ly = applyDeadZone((pad.axes[axes.ly] ?? 0) - c.ly, dz);
    const rx = applyDeadZone((pad.axes[axes.rx] ?? 0) - c.rx, dz);
    const ry = applyDeadZone((pad.axes[axes.ry] ?? 0) - c.ry, dz);

    // メニュー中は あるかない・みない（十字は 下の Action だけ）
    // look は poll 1 回 = 固定ステップ 1 回。フレームの実時間では掛けない
    if (this.menuOpen || this.capturing) {
      this.setMove(0, 0);
    } else {
      this.setMove(lx, ly);
      if (rx !== 0 || ry !== 0) {
        this.lastInput = 'gamepad';
        const s = this.settings.lookSensitivity;
        this.look.push(rx * s, ry * s);
      }
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
    if (this.capturing) return null;
    if (this.menuOpen) {
      // メニューの決定・もどる・十字は割り当て表より優先（抜けられないように）
      if (face === 'faceBottom') return 'confirm';
      if (face === 'faceRight') return 'closeMenu';
      if (face === 'start') return 'openStartMenu';
      if (face === 'dpadUp') return 'focusUp';
      if (face === 'dpadDown') return 'focusDown';
      if (face === 'dpadLeft') return 'focusLeft';
      if (face === 'dpadRight') return 'focusRight';
      return null;
    }
    if (this.hanging && face === 'faceRight') return 'ropeDown';
    const b = this.binds[face];
    return b === undefined ? DEFAULT_PLAY_BINDS[face] : b;
  }

  /** 知らない機種で、割り当てもまだのとき、面・肩ボタンは出さない（暴発よけ） */
  private faceBlocked(face: PadFace): boolean {
    if (this.kind !== 'fallback' || this.bindsSaved) return false;
    return face === 'faceBottom' || face === 'faceRight' || face === 'faceLeft' || face === 'faceTop' ||
      face === 'l1' || face === 'r1' || face === 'l2' || face === 'r2';
  }

  private pressFace(face: PadFace, _nowMs: number): void {
    // 遊び中だけ暴発を止める。メニューの決定・もどるは未知の機種でも届ける
    if (!this.menuOpen && !this.capturing && this.faceBlocked(face)) return;
    const a = this.actionForFace(face);
    if (!a) return;
    this.heldFaces.set(face, a);
    this.actions.press(a);
  }

  private releaseFace(face: PadFace): void {
    const a = this.heldFaces.get(face);
    this.heldFaces.delete(face);
    if (a) this.actions.release(a);
  }

  releaseAllPadActions(): void {
    for (const a of this.heldFaces.values()) this.actions.release(a);
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
