// START-1 §4.3: つよさの 保存と 読み。
// 決める 順: URL `?strength=easy|normal|hard`（その 起動だけ）＞ 保存の meta の つよさ ＞ chosen（メニューで えらんだ 物。新しい 世界）＞ 'normal'。
import { STRENGTH_LEVELS, type StrengthLevel } from './stats';

const isLevel = (v: unknown): v is StrengthLevel => typeof v === 'string' && (STRENGTH_LEVELS as readonly string[]).includes(v);

/** 保存の meta の `strength`。meta が ない・変・古い 保存（つよさなし）→ null */
export function readSavedStrength(meta: unknown): StrengthLevel | null {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return null;
  const v = (meta as Record<string, unknown>).strength;
  return isLevel(v) ? v : null;
}

/** URL の ?strength=。ない・変 → null */
export function strengthFromUrl(search: string): StrengthLevel | null {
  const v = new URLSearchParams(search).get('strength');
  return isLevel(v) ? v : null;
}

export function decideStrength(search: string, meta: unknown, chosen?: StrengthLevel | null): StrengthLevel {
  const url = strengthFromUrl(search);
  if (url) return url;
  const saved = readSavedStrength(meta);
  if (saved) return saved;
  // meta が ある（古い 保存）→ ふつう。メニューで えらんだ 値は 新しい 世界（meta なし）だけ
  const hasMeta = typeof meta === 'object' && meta !== null && !Array.isArray(meta);
  if (hasMeta) return 'normal';
  return chosen ?? 'normal';
}

/** 保存に 書く 値: 保存が あれば その つよさ（なければ ふつう）、新しい 世界なら URL ＞ えらんだ 値（T7） */
export function strengthToSave(search: string, meta: unknown, chosen?: StrengthLevel | null): StrengthLevel {
  const hasMeta = typeof meta === 'object' && meta !== null && !Array.isArray(meta);
  if (hasMeta) return readSavedStrength(meta) ?? 'normal';
  return strengthFromUrl(search) ?? chosen ?? 'normal';
}
