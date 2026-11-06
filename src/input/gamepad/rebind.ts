import type { Action } from '../actions';
import type { BindMap } from './binds';
import { PAD_FACES, type PadFace } from './mapping';

/** 1 つの面を 1 つの Action に付ける。前に付いていた Action は外れる（黙って消さないよう、名前を返す） */
export function assignFaceToAction(
  binds: BindMap,
  face: PadFace,
  action: Action,
): { next: BindMap; displaced: Action | null } {
  const prev = binds[face] ?? null;
  if (prev === action) return { next: { ...binds }, displaced: null };
  const displaced = prev !== null && prev !== action ? prev : null;
  return { next: { ...binds, [face]: action }, displaced };
}

export function facesForAction(binds: BindMap, action: Action): PadFace[] {
  return PAD_FACES.filter((f) => binds[f] === action);
}
