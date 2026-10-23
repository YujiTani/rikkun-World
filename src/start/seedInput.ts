// START-1 §2.2・§4.2: シードの 入力（9 けたまで・先の 0 は のこさない・ランダム 1〜9999）。
import { GEN_CONFIG } from '../world/gen/config';

export const SEED_MAX_DIGITS = 9;

export function appendSeedDigit(text: string, digit: string): { text: string; rejected: boolean } {
  if (!/^[0-9]$/.test(digit)) return { text, rejected: false };
  if (text === '' || text === '0') return { text: digit, rejected: false };
  if (text.length >= SEED_MAX_DIGITS) return { text, rejected: true };
  return { text: text + digit, rejected: false };
}

export function backspaceSeed(text: string): string {
  return text.slice(0, -1);
}

export function seedFromText(text: string): number {
  return text === '' ? GEN_CONFIG.defaultSeed : Number(text);
}

/** 1〜9999 の 整数 */
export function randomSeed(rng: () => number): number {
  return 1 + Math.min(9998, Math.floor(rng() * 9999));
}

/** ?seed=5 → '5'。ない・整数でない・負・9 けたを こえる → '' */
export function seedTextFromUrl(search: string): string {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^[0-9]+$/.test(raw.trim())) return '';
  const n = String(Number(raw.trim()));
  return n.length > SEED_MAX_DIGITS ? '' : n;
}
