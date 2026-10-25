import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_DEFS } from '../../achievements/defs';
import { YOKAI_NAME as YOKAI_NAME_VIA_TABLE } from '../../craft/info/table';
import { buildNickMarks } from '../../yokai/nickMarks';
import { COUNTRY_TABLE } from '../../world/gen/countryTable';
import { ATTACK_DAMAGE, KIND_AI, YOKAI_DROPS, createYokaiConfig } from '../../yokai/ai/config';
import { SENSE } from '../../yokai/ai/senseTuning';
import { YOKAI_DRAW_ORDER } from '../../yokai/countryPick';
import { YOKAI_ORDER } from '../../yokai';
import { YOKAI_NAME, YOKAI_STATS, yokaiStrength } from '../../yokai/stats';
import { YOKAI_VARIANT_COLORS, baseColorOf, variantColor } from '../../yokai/variants';
import { MARK_KINDS } from '../../ui/medalArt';
import { YOKAI_IDS, type YokaiKind } from './ids';
import { YOKAI_DEFS, mapKinds, yokaiAchievementNames, yokaiAi, yokaiBasis, yokaiCountryBase, yokaiDrops, yokaiHeads, yokaiMotion, yokaiNames, yokaiSense, yokaiVariantColors } from './registry';

// #307: 登録表（妖怪）から作った「見せ方」が、これまでの表と同じ値になること。
// 期待は これまでの表（2026-10-25 の写し JSON）から 手で 写した 値。登録表を 直すと ここが 落ちる。

interface Expect {
  name: string;
  basis: { target: number; attack: number; xp: number; projectile: boolean; frontOnly: boolean };
  motion: { hitSeconds: number; attackSeconds: number; reach: number; speed: number; cooldownSeconds: number; avoidsWater: boolean };
  ai: { stepUp: number; radius: number; height: number; eyeHeight: number; turnDegPerSec: number; marksHeight: number; flies: boolean };
  sense: { sight: number; giveUp: number; shinobi: boolean };
  drops: Array<[string, number, number]>;
  colors: { 2: Record<number, number>; 3: Record<number, number> };
  head: { bandY: number; bandW: number; bandD: number; crownY: number; crownW: number; crownD: number; z?: number; k?: number };
  base: number;
}

const EXPECT: Record<YokaiKind, Expect> = {
  karakasa: {
    name: 'からかさ',
    basis: { target: 1, attack: 2, xp: 3, projectile: false, frontOnly: false },
    motion: { hitSeconds: 0.5, attackSeconds: 1.2, reach: 2.5, speed: 1.5, cooldownSeconds: 2.0, avoidsWater: true },
    ai: { stepUp: 2, radius: 0.6, height: 1.6, eyeHeight: 1.1, turnDegPerSec: 360, marksHeight: 2.1, flies: false },
    sense: { sight: 18, giveUp: 24, shinobi: true },
    drops: [['paper', 0.7, 4], ['string', 0.7, 4], ['log', 0.4, 3], ['oil', 0.15, 2], ['iron_ore', 0.05, 1], ['seed_tomato', 0.05, 1], ['seed_pumpkin', 0.05, 1]],
    colors: {
      2: { 0xe0503a: 0x9aaaff, 0x8b4a2b: 0x4b56b8, 0xf2c14e: 0xe2eaff, 0xa0703c: 0x7a86cc },
      3: { 0xe0503a: 0xffc83d, 0x8b4a2b: 0xff6a3d, 0xf2c14e: 0xfff2b0, 0xa0703c: 0xe89a30 },
    },
    head: { bandY: 1.43, bandW: 0.74, bandD: 0.74, crownY: 1.6, crownW: 0.4, crownD: 0.4 },
    base: 30,
  },
  chochin: {
    name: 'ちょうちん',
    basis: { target: 1.25, attack: 2, xp: 2, projectile: true, frontOnly: false },
    motion: { hitSeconds: 0.5, attackSeconds: 0.8, reach: 8, speed: 1.0, cooldownSeconds: 3.0, avoidsWater: true },
    ai: { stepUp: 0, radius: 0.4, height: 1.7, eyeHeight: 0.95, turnDegPerSec: 180, marksHeight: 2.3, flies: true },
    sense: { sight: 21, giveUp: 27, shinobi: true },
    drops: [['paper', 0.7, 4], ['string', 0.4, 3], ['coal_ore', 0.15, 2]],
    colors: {
      2: { 0xffb347: 0xbcd2ff, 0xfff2a0: 0xe4eeff, 0xc46a1e: 0x5f7be6, 0x3a3a4a: 0x343d8c },
      3: { 0xffb347: 0xfff05a, 0xfff2a0: 0xfff8c8, 0xc46a1e: 0xff5a3c, 0x3a3a4a: 0xd99a1a },
    },
    head: { bandY: -0.27, bandW: 0.5, bandD: 0.5, crownY: -0.3, crownW: 0.44, crownD: 0.44 },
    base: 25,
  },
  nurikabe: {
    name: 'ぬりかべ',
    basis: { target: 5, attack: 16, xp: 6, projectile: false, frontOnly: true },
    motion: { hitSeconds: 1.5, attackSeconds: 4.0, reach: 3, speed: 0.5, cooldownSeconds: 2.0, avoidsWater: false },
    ai: { stepUp: 1, radius: 0.9, height: 3.0, eyeHeight: 1.9, turnDegPerSec: 45, marksHeight: 3.5, flies: false },
    sense: { sight: 12, giveUp: 18, shinobi: true },
    drops: [['dirt', 0.7, 4], ['stone', 0.7, 4], ['clay', 0.15, 2]],
    colors: {
      2: { 0xa39b8b: 0xb2bce6, 0x8a8273: 0x8e99cc, 0x8e8676: 0x8c97cc, 0x6dbe45: 0xb0ecff, 0x5aa83a: 0x7fd2f2 },
      3: { 0xa39b8b: 0xf2cc6a, 0x8a8273: 0xd9a940, 0x8e8676: 0xddae48, 0x6dbe45: 0xff9a50, 0x5aa83a: 0xff8040 },
    },
    head: { bandY: 1.25, bandW: 1.34, bandD: 0.44, crownY: 1.35, crownW: 0.45, crownD: 0.3, z: 0.4, k: 2 },
    base: 20,
  },
  rokurokubi: {
    name: 'ろくろくび',
    basis: { target: 1.5, attack: 2, xp: 3, projectile: false, frontOnly: false },
    motion: { hitSeconds: 0.5, attackSeconds: 1.6, reach: 8, speed: 1.0, cooldownSeconds: 2.5, avoidsWater: false },
    ai: { stepUp: 1, radius: 0.4, height: 2.9, eyeHeight: 1.6, turnDegPerSec: 240, marksHeight: 3.3, flies: false },
    sense: { sight: 18, giveUp: 24, shinobi: true },
    drops: [['cloth', 0.7, 4], ['crystal', 0.05, 1], ['seed_onion', 0.05, 1], ['seed_eggplant', 0.05, 1]],
    colors: {
      2: { 0x6f84e8: 0xc29cf2, 0x5b6fd6: 0x9f78e0, 0xf2c14e: 0xe8eeff },
      3: { 0x6f84e8: 0xffc83d, 0x5b6fd6: 0xf0a830, 0xf2c14e: 0xff6a3d },
    },
    head: { bandY: 0.465, bandW: 0.55, bandD: 0.55, crownY: 0.7, crownW: 0.4, crownD: 0.4 },
    base: 25,
  },
};

const dropsOf = (e: Expect) => e.drops.map(([item, chance, max]) => ({ item, chance, max }));
const pickOf = <T>(f: (e: Expect) => T): Record<YokaiKind, T> => mapKinds((k) => f(EXPECT[k]));

describe('登録表（妖怪）', () => {
  it('全種類に YokaiDef がある（id は ids.ts の 1 回だけ。登録表のキー = ids.ts）', () => {
    expect(YOKAI_IDS).toHaveLength(4);
    expect(Object.keys(YOKAI_DEFS).sort()).toEqual([...YOKAI_IDS].sort());
    for (const k of YOKAI_IDS) expect(YOKAI_DEFS[k], k).toBeDefined();
  });

  it('見せ方は これまでの表と 同じ値（名前・元の数・動き・AI・感知・ドロップ・色・頭の印・国の土台・実績）', () => {
    expect(yokaiNames()).toEqual(pickOf((e) => e.name));
    expect(yokaiBasis()).toEqual(pickOf((e) => e.basis));
    expect(yokaiMotion()).toEqual(pickOf((e) => e.motion));
    expect(yokaiAi()).toEqual(pickOf((e) => e.ai));
    expect(yokaiSense()).toEqual(pickOf((e) => e.sense));
    expect(yokaiDrops()).toEqual(pickOf(dropsOf));
    expect(yokaiVariantColors()).toEqual(pickOf((e) => e.colors));
    expect(yokaiHeads()).toEqual(pickOf((e) => e.head));
    expect(yokaiCountryBase()).toEqual(pickOf((e) => e.base));
    expect(yokaiAchievementNames()).toEqual(YOKAI_IDS.map((k) => [k, EXPECT[k].name]));
  });

  it('古い表（名前・強さ・AI・感知・ドロップ・色・ダメージ）が 登録表から 作られて いる', () => {
    expect(YOKAI_NAME).toEqual(pickOf((e) => e.name));
    expect(YOKAI_NAME_VIA_TABLE).toBe(YOKAI_NAME);
    expect(KIND_AI).toEqual(pickOf((e) => e.ai));
    expect(SENSE.kinds).toEqual(pickOf((e) => e.sense));
    expect(YOKAI_DROPS).toEqual(pickOf(dropsOf));
    expect(YOKAI_VARIANT_COLORS).toEqual(pickOf((e) => e.colors));
    for (const k of YOKAI_IDS) {
      const { hp: _hp, ...motion } = YOKAI_STATS[k];
      expect(motion, k).toEqual(EXPECT[k].motion);
      expect(YOKAI_STATS[k].hp, k).toBe(yokaiStrength(k).hp);
      expect(ATTACK_DAMAGE[k], k).toBe(yokaiStrength(k).attack);
    }
    // 強さ（体力の 式の 結果。からかさ = 8 が 物さし。値は これまでの ゲームの もの）
    expect(mapKinds((k) => YOKAI_STATS[k].hp)).toEqual({ karakasa: 8, chochin: 5, nurikabe: 40, rokurokubi: 12 });
    expect(mapKinds((k) => ATTACK_DAMAGE[k])).toEqual({ karakasa: 2, chochin: 2, nurikabe: 16, rokurokubi: 2 });
  });

  it('SENSE.kinds は 登録表の 複製（main.ts が その場で 書きかえても 登録表は かわらない）', () => {
    const before = YOKAI_DEFS.karakasa.sense.sight;
    SENSE.kinds.karakasa.sight = 99;
    try {
      expect(YOKAI_DEFS.karakasa.sense.sight).toBe(before);
      expect(yokaiSense().karakasa.sight).toBe(before);
    } finally {
      SENSE.kinds.karakasa.sight = before;
    }
  });

  it('見せ方の 返す 物を 書きかえても 登録表は かわらない（ドロップ・色・AI）', () => {
    const drops = yokaiDrops();
    (drops.karakasa[0] as { chance: number }).chance = 0;
    yokaiAi().karakasa.stepUp = 9;
    yokaiVariantColors().karakasa[2][0xe0503a] = 0;
    expect(YOKAI_DEFS.karakasa.drops[0]!.chance).toBe(0.7);
    expect(YOKAI_DEFS.karakasa.ai.stepUp).toBe(2);
    expect(YOKAI_DEFS.karakasa.colors[2][0xe0503a]).toBe(0x9aaaff);
  });

  it('抽選の順 YOKAI_DRAW_ORDER・見本の並び YOKAI_ORDER に 全種類が 1 回ずつ（抽選の順は 乱数の 結果を きめるので 今のまま）', () => {
    expect([...YOKAI_DRAW_ORDER].sort()).toEqual([...YOKAI_IDS].sort());
    expect([...YOKAI_ORDER].sort()).toEqual([...YOKAI_IDS].sort());
    expect(YOKAI_DRAW_ORDER).toEqual(['karakasa', 'chochin', 'rokurokubi', 'nurikabe']);
    expect(YOKAI_ORDER).toEqual(['karakasa', 'chochin', 'nurikabe', 'rokurokubi']);
  });

  it('どの妖怪も どこかの国で 重み > 0（足し忘れて 一度も 出ない 妖怪を 作らない）', () => {
    for (const k of YOKAI_IDS) {
      expect(COUNTRY_TABLE.some((r) => (r.yokai[k] ?? 0) > 0), `${k} が どの国にも 出ない`).toBe(true);
    }
  });

  it('はらっぱの 行は 登録表の 土台、全体の 倍率の 既定は 全種類 1', () => {
    const harappa = COUNTRY_TABLE.find((r) => r.kind === 'harappa')!;
    expect(harappa.yokai).toEqual(yokaiCountryBase());
    const weights = createYokaiConfig().yokaiWeights;
    for (const k of YOKAI_IDS) expect(weights[k], k).toBe(1);
  });

  it('頭の印・色ちがい・メダル・実績が 全種類に ある（書き忘れが 黙って 落ちない）', () => {
    for (const k of YOKAI_IDS) {
      expect(buildNickMarks(k, 'taisho'), `${k} の はちまき`).not.toBeNull();
      expect(buildNickMarks(k, 'nushi'), `${k} の かんむり`).not.toBeNull();
      for (const st of [2, 3] as const) {
        for (const [from, to] of Object.entries(EXPECT[k].colors[st])) {
          expect(variantColor(k, st, Number(from)), `${k} 段階 ${st}`).toBe(to);
          expect(baseColorOf(k, to), `${k} 段階 ${st} の もどし`).toBe(Number(from));
        }
      }
      expect((MARK_KINDS as readonly string[]).includes(k), `${k} の メダルの印`).toBe(true);
      const defeat = ACHIEVEMENT_DEFS.filter((d) => d.series === `defeat.${k}`);
      expect(defeat.length, `${k} を たおす 実績`).toBeGreaterThan(0);
      expect(defeat[0]!.name, k).toContain(EXPECT[k].name);
    }
  });
});
