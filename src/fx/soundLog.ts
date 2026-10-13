/** 鳴らした 音の 名前の 列（テストの窓口 `combat.sounds()` 用。読んでも 空にならない版と 空にする版）。長さは おさえる */
const LOG: string[] = [];
const MAX = 256;

export function logSound(...names: string[]): void {
  for (const n of names) LOG.push(n);
  if (LOG.length > MAX) LOG.splice(0, LOG.length - MAX);
}
export function peekSounds(): string[] {
  return [...LOG];
}
export function drainSounds(): string[] {
  return LOG.splice(0, LOG.length);
}
