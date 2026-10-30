// START-1 §4.1・§4.2: 前に 遊んだ 世界（「つづきから」）と 同じ シードの 保存を 調べる。読むだけ（保存は 消さない・書かない）。
import { GEN_CONFIG } from '../world/gen/config';
import { SAVE_ID, type PersistBackend } from '../save/backend';
import { isReadableGen } from '../save/SaveManager';
import { readSavedStrength } from '../yokai/strengthPref';
import type { StrengthLevel } from '../yokai/stats';

export const START_STORAGE_KEY = 'rikkun.start.v1';
export const SAVE_BOOT_TIMEOUT_MS = 3000;

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** ふだんの シード → 'vox-main'、ほかは `vox-seed-N`（main.ts の saveId と 同じ） */
export const saveIdFor = (seed: number): string => (seed === GEN_CONFIG.defaultSeed ? SAVE_ID : `vox-seed-${seed}`);

function readStartObject(store: Store | null): Record<string, unknown> {
  try {
    const raw = store?.getItem(START_STORAGE_KEY) ?? null;
    if (raw === null) return {};
    const v: unknown = JSON.parse(raw);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function readLastSeed(store: Store | null): number | null {
  const v = readStartObject(store).lastSeed;
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

export function saveLastSeed(store: Store | null, seed: number): void {
  try {
    if (!store) return;
    store.setItem(START_STORAGE_KEY, JSON.stringify({ ...readStartObject(store), lastSeed: seed }));
  } catch {
    // 書けなくても 遊べる
  }
}

const TIMED_OUT = Symbol('timeout');

/** promise を timeoutMs まで 待つ。時間切れ・例外 → null */
export async function within<T>(p: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const r = await Promise.race([p, new Promise<typeof TIMED_OUT>((ok) => (timer = setTimeout(() => ok(TIMED_OUT), timeoutMs)))]);
    return r === TIMED_OUT ? null : r;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function findSavedInner(db: PersistBackend, seed: number, nSections: number): Promise<{ strength: StrengthLevel } | null> {
  const id = saveIdFor(seed);
  const all = await db.readKeys(id);
  const first = all.keys[0];
  if (!first) return null; // 列が 1 つも ない 保存は 読める 保存に 入れない（T5）
  const rec = await db.readChunk(id, first.cx, first.cz);
  // 最初の 列の 版が 読める 版（3 から 今の 版まで。版 3 と 4 の 列が まざった 世界は どちらが 最初でも 出る）なら 読める 保存
  if (!rec || !isReadableGen(rec.gen) || rec.h !== nSections) return null;
  return { strength: readSavedStrength(all.meta) ?? 'normal' };
}

export async function findSavedWorld(o: { db: PersistBackend | null; seed: number; nSections: number; timeoutMs?: number }): Promise<{ strength: StrengthLevel } | null> {
  if (!o.db) return null;
  return within(findSavedInner(o.db, o.seed, o.nSections), o.timeoutMs ?? SAVE_BOOT_TIMEOUT_MS);
}

export async function findContinue(o: {
  db: PersistBackend | null;
  store: Store | null;
  search: string;
  nSections: number;
  timeoutMs?: number;
}): Promise<{ seed: number; strength: StrengthLevel } | null> {
  if (!o.db || new URLSearchParams(o.search).get('nosave') === '1') return null;
  const db = o.db;
  const run = async (): Promise<{ seed: number; strength: StrengthLevel } | null> => {
    const last = readLastSeed(o.store);
    if (last !== null) {
      const hit = await findSavedInner(db, last, o.nSections).catch(() => null);
      if (hit) return { seed: last, strength: hit.strength };
    }
    if (last !== GEN_CONFIG.defaultSeed) {
      const hit = await findSavedInner(db, GEN_CONFIG.defaultSeed, o.nSections).catch(() => null);
      if (hit) return { seed: GEN_CONFIG.defaultSeed, strength: hit.strength };
    }
    return null;
  };
  return within(run(), o.timeoutMs ?? SAVE_BOOT_TIMEOUT_MS);
}
