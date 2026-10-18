import { describe, expect, it } from 'vitest';
import { LEVEL_DEFAULTS } from '../level/config';
import { COMBAT_DEFAULTS } from '../combat/config';
import { LevelSystem } from '../level/LevelSystem';
import { techDamage } from '../tools/blade/BladeSystem';
import { TOOL_DEFAULTS } from '../tools/config';
import { ATTACK_DAMAGE, AI_CONST, createYokaiConfig } from './ai/config';
import { YOKAI_STATS, yokaiStrength } from './stats';
import { createW2Settings } from '../contracts';
import type { YokaiKind } from '../contracts';

const KINDS: YokaiKind[] = ['karakasa', 'chochin', 'rokurokubi', 'nurikabe'];

describe('BAL-A AC1: M=1・二つ名なしの 4 種', () => {
  it('体力・攻撃力・経験値・強さ', () => {
    const want = {
      karakasa: { hp: 8, attack: 2, xp: 3, strength: 1, contact: 1 },
      chochin: { hp: 5, attack: 2, xp: 2, strength: 1.25, contact: 1 },
      rokurokubi: { hp: 12, attack: 2, xp: 3, strength: 1.5, contact: 1 },
      nurikabe: { hp: 40, attack: 16, xp: 6, strength: 5, contact: 4 },
    } as const;
    for (const k of KINDS) {
      const s = yokaiStrength(k);
      expect(s.hp, k).toBe(want[k].hp);
      expect(s.attack, k).toBe(want[k].attack);
      expect(s.xp, k).toBe(want[k].xp);
      expect(s.strength, k).toBeCloseTo(want[k].strength, 9);
      expect(YOKAI_STATS[k].hp).toBe(want[k].hp);
      expect(ATTACK_DAMAGE[k]).toBe(want[k].attack);
      expect(LEVEL_DEFAULTS.xp[k]).toBe(want[k].xp);
      const contact = createYokaiConfig().contactDamage * (k === 'nurikabe' ? AI_CONST.nurikabeContactMul : 1);
      expect(contact).toBe(want[k].contact);
    }
  });
  it('こわさ: からかさ 1・ちょうちん 2・ろくろくび 1・ぬりかべ 1', () => {
    expect(KINDS.map((k) => yokaiStrength(k).fear)).toEqual([1, 2, 1, 1]);
  });
});

describe('BAL-A AC5 / WEAPON-4 AC2: わざのダメージ（四捨五入しない・0.01 の位）', () => {
  const mul = createW2Settings().bladeDamageMul;
  it('刀: 突き ×0.75・切り上げ ×1.15・大けさぎり ×2.5', () => {
    const f = (b: number) => [mul.thrust, mul.kiriage, mul.kesa].map((m) => techDamage(b, m));
    expect(f(2)).toEqual([1.5, 2.3, 5]);
    expect(f(4)).toEqual([3, 4.6, 10]);
    expect(f(6)).toEqual([4.5, 6.9, 15]);
  });
  it('四捨五入も 最低 1 も しない。0.01 の位に まるめる', () => {
    expect(techDamage(2, 0.25)).toBe(0.5);
    expect(techDamage(1, 0.1)).toBe(0.1);
    expect(techDamage(2, 1.25)).toBe(2.5);
    expect(techDamage(6, 1.15)).toBe(6.9);
    expect(techDamage(3, 0.333)).toBe(1);
    expect(techDamage(3, 0.3349)).toBe(1); // 小数第 3 位を 四捨五入（1.0047 → 1）
  });
  it('なぎなた 3・すで 1・ゆみ 1〜3 は変わらない', () => {
    expect(TOOL_DEFAULTS.weaponDamage.naginata).toBe(3);
    expect(COMBAT_DEFAULTS.punchDamage).toBe(1);
  });
});

const dmgOf: Record<string, number> = {
  すで: 1,
  'ぼくとう つき': 1.5,
  'ぼくとう きりあげ': 2.3,
  'ぼくとう けさぎり': 5,
  'かたな つき': 3,
  'かたな きりあげ': 4.6,
  'かたな けさぎり': 10,
  なぎなた: 3,
  'きらきら つき': 4.5,
  'きらきら きりあげ': 6.9,
  'きらきら けさぎり': 15,
  '段1': 1,
  '段2': 2,
  '段3': 3,
};
// [からかさ, ちょうちん, ろくろくび, ぬりかべ]（WEAPON-4 §4.3 の 表）
const HITS: Record<string, number[]> = {
  すで: [8, 5, 12, 40],
  'ぼくとう つき': [6, 4, 8, 27],
  'ぼくとう きりあげ': [4, 3, 6, 18],
  'ぼくとう けさぎり': [2, 1, 3, 8],
  'かたな つき': [3, 2, 4, 14],
  'かたな きりあげ': [2, 2, 3, 9],
  'かたな けさぎり': [1, 1, 2, 4],
  なぎなた: [3, 2, 4, 14],
  'きらきら つき': [2, 2, 3, 9],
  'きらきら きりあげ': [2, 1, 2, 6],
  'きらきら けさぎり': [1, 1, 1, 3],
  '段1': [8, 5, 12, 40],
  '段2': [4, 3, 6, 20],
  '段3': [3, 2, 4, 14],
};

describe('BAL-A AC6: たおす回数 56 こ（WEAPON-4 で 切り上げの 3 行を 足した）・やられる回数 8 こ', () => {
  it('たおす回数', () => {
    const order: YokaiKind[] = ['karakasa', 'chochin', 'rokurokubi', 'nurikabe'];
    let n = 0;
    for (const [name, row] of Object.entries(HITS)) {
      order.forEach((k, i) => {
        expect(Math.ceil(yokaiStrength(k).hp / dmgOf[name]! - 1e-9), `${name} ${k}`).toBe(row[i]);
        n++;
      });
    }
    expect(n).toBe(56);
  });
  it('やられる回数', () => {
    const want: Record<YokaiKind, [number, number]> = {
      karakasa: [10, 20],
      chochin: [10, 20],
      rokurokubi: [10, 20],
      nurikabe: [2, 2],
    };
    for (const k of KINDS) {
      const a = yokaiStrength(k).attack;
      const armored = Math.max(1, a - (k === 'chochin' ? 2 : 3));
      expect([Math.ceil(20 / a), Math.ceil(20 / armored)], k).toEqual(want[k]);
    }
  });
});

describe('BAL-A AC7: 安全のきまり（M=1・二つ名なし）', () => {
  it('すでで 12 回以下・やられる 8 回以上（ぬりかべ以外）', () => {
    for (const k of KINDS.filter((x) => x !== 'nurikabe')) {
      expect(yokaiStrength(k).hp).toBeLessThanOrEqual(12);
      expect(Math.ceil(20 / yokaiStrength(k).attack)).toBeGreaterThanOrEqual(8);
    }
  });
  it('どこでも: はやさ 2 以下・合図 0.5 以上・攻撃の合計＋次まで 2 秒以上・攻撃力 16 以下', () => {
    for (const k of KINDS) {
      const s = YOKAI_STATS[k];
      expect(s.speed).toBeLessThanOrEqual(2);
      expect(s.hitSeconds).toBeGreaterThanOrEqual(0.5);
      expect(s.attackSeconds + s.cooldownSeconds).toBeGreaterThanOrEqual(2);
      expect(yokaiStrength(k).attack).toBeLessThanOrEqual(16);
    }
  });
  it('ぬりかべ: 合図 1.5 以上・はやさ 0.5 以下', () => {
    expect(YOKAI_STATS.nurikabe.hitSeconds).toBeGreaterThanOrEqual(1.5);
    expect(YOKAI_STATS.nurikabe.speed).toBeLessThanOrEqual(0.5);
  });
});

describe('BAL-A AC13: レベルアップで体力満タン・最大は 20 のまま', () => {
  it('経験値の元は計算した数', () => {
    let up = 0;
    const l = new LevelSystem({ onLevelUp: () => up++ });
    l.addXp(yokaiStrength('karakasa').xp + yokaiStrength('rokurokubi').xp);
    expect(up).toBe(1);
    expect(l.level()).toBe(2);
    expect(COMBAT_DEFAULTS.playerMaxHp).toBe(20);
    expect(l.level()).toBe(2); // レベルが上がっても最大体力の設定は 1 つだけ（ふえない）
  });
});
