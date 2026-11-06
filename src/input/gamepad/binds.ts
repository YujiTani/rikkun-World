import type { Action } from '../actions';
import { GAMEPAD_CONFIG } from './config';
import { DEFAULT_PLAY_BINDS, PAD_FACES, type PadFace } from './mapping';

export type BindMap = Partial<Record<PadFace, Action | null>>;

/**
 * 古い初期値（＋ = もちもの、左の面も もちもの）だけ ＋ をスタートメニューにする。
 * ほかのボタンを変えてある保存は、＋ の値もそのまま残す。
 */
export function migrateBinds(raw: BindMap, merged: BindMap): BindMap {
  if (raw.start !== 'toggleInventory') return merged;
  if (raw.faceLeft !== undefined && raw.faceLeft !== 'toggleInventory') return merged;
  for (const face of PAD_FACES) {
    if (face === 'start' || face === 'faceLeft') continue;
    if (raw[face] !== undefined && raw[face] !== DEFAULT_PLAY_BINDS[face]) return merged;
  }
  return { ...merged, start: 'openStartMenu' };
}

export function loadBinds(storage: Storage | null): BindMap {
  if (!storage) return { ...DEFAULT_PLAY_BINDS };
  try {
    const raw = storage.getItem(GAMEPAD_CONFIG.bindsKey);
    if (!raw) return { ...DEFAULT_PLAY_BINDS };
    const o = JSON.parse(raw) as BindMap;
    return migrateBinds(o, { ...DEFAULT_PLAY_BINDS, ...o });
  } catch {
    return { ...DEFAULT_PLAY_BINDS };
  }
}

/** ユーザーが割り当てを保存したことがあるか */
export function hasSavedBinds(storage: Storage | null): boolean {
  if (!storage) return false;
  try {
    return !!storage.getItem(GAMEPAD_CONFIG.bindsKey);
  } catch {
    return false;
  }
}

export function saveBinds(storage: Storage | null, binds: BindMap): void {
  if (!storage) return;
  try {
    storage.setItem(GAMEPAD_CONFIG.bindsKey, JSON.stringify(binds));
  } catch {
    /* quota */
  }
}


export type Calib = { lx: number; ly: number; rx: number; ry: number };

export function loadCalib(storage: Storage | null): Calib {
  const z = { lx: 0, ly: 0, rx: 0, ry: 0 };
  if (!storage) return z;
  try {
    const raw = storage.getItem(GAMEPAD_CONFIG.calibKey);
    if (!raw) return z;
    return { ...z, ...(JSON.parse(raw) as Calib) };
  } catch {
    return z;
  }
}

export function saveCalib(storage: Storage | null, c: Calib): void {
  if (!storage) return;
  try {
    storage.setItem(GAMEPAD_CONFIG.calibKey, JSON.stringify(c));
  } catch {
    /* */
  }
}

export function applyDeadZone(v: number, dead: number): number {
  if (!Number.isFinite(v)) return 0;
  const a = Math.abs(v);
  if (a <= dead) return 0;
  const t = (a - dead) / (1 - dead);
  return Math.sign(v) * Math.min(1, t);
}
