import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DUO_COLORS } from './tuning';

/**
 * COOP-1 作業 2（#399）の 先行テスト（赤）。仕様 §11.1 の 色(案 B。2026-11-06 オーナー決定)を 数の 表(tuning.ts の DUO_COLORS)に 写す。
 * 1P = --rk-xp、2P = --rk-rarity-3、段 = --rk-text → --rk-accent → --rk-accent-2。値は src/ui/theme/tokens.css の ものと 同じ(1 か所の 決まり: 写しを 作るなら 同じ 値)。
 * 画面の 部品(ルーペのわく・メーターの 棒・ホットバーのふち)が CSS の 変数を 使っているかは UI 検査(e2e/helpers/duoUi.ts)で 見る。
 */

const css = readFileSync(new URL('../ui/theme/tokens.css', import.meta.url), 'utf8');
const token = (name: string): string => {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!m) throw new Error(`${name} が tokens.css に ない`);
  return m[1]!.toLowerCase();
};

describe('§11.1: 1P・2P と 段の 色(案 B)', () => {
  it('1P は --rk-xp(ライム)・2P は --rk-rarity-3(むらさき)', () => {
    expect(DUO_COLORS.p1.toLowerCase()).toBe(token('--rk-xp'));
    expect(DUO_COLORS.p2.toLowerCase()).toBe(token('--rk-rarity-3'));
  });
  it('段は --rk-text → --rk-accent → --rk-accent-2(赤は 使わない)', () => {
    expect(DUO_COLORS.tier.map((c) => c.toLowerCase())).toEqual([token('--rk-text'), token('--rk-accent'), token('--rk-accent-2')]);
  });
});
