import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS, W2_SETTING_DEFAULTS, createW2Settings } from './contracts';
import { ITEM_TYPES } from './inventory/items';
import { itemRarity } from './drops/rarity';
import { ACHIEVEMENT_DEFS } from './achievements/defs';
import { BLADE_ITEMS } from './tools/blade/BladeSystem';
import { bladeReachOf } from './tools/blade/advance';
import { findUnrubiedKanji, ruby } from './ui/text';

/**
 * WEAPON-7 PR1（docs/design/WEAPON-7.md）の データの 初期値。実装の 前は 名前が ないので 赤になる。
 * 設定の 置き場所の 仮定: `legendary`・`nushiDrops`・`legendaryChargeWalk`・`toolDurability` は W2 の 設定の 入れ物、
 * `achieveToastTicks`・`legendTelopTicks` は M6 の 設定の 入れ物（どちらも `settings.get/set` の 名前は 仕様 §9 のまま）。
 */
type Def = {
  item: string;
  power: number | [number, number];
  charge: Record<string, unknown> | null;
  onAttack: Record<string, unknown>[];
  passive: Record<string, unknown>[];
};
const S = () => createW2Settings() as unknown as Record<string, unknown> & { toolDurability: Record<string, number> };
const legendary = (): Def[] => (S().legendary ?? []) as Def[];
const NAME = '［雷神剣｜らいじんけん］';

describe('WEAPON-7 AC1: legendary の 初期値（PR1 は 雷神剣 だけ）', () => {
  it('雷神剣が §3.1 どおり', () => {
    const defs = legendary();
    expect(defs.map((d) => d.item)).toEqual(['raijin_ken']);
    const d = defs[0]!;
    expect(d.power).toBe(8);
    expect(d.charge).toEqual({ kind: 'lightning', chargeTicks: 60, range: 20, radius: 5, damageMul: 2.0, knock: [2, 4], strikeF: 8, boltSteps: 12, recovery: 40 });
    expect(d.onAttack).toEqual([{ kind: 'trail', style: 'thunder' }]);
    expect(d.passive).toEqual([]);
  });
  it('nushiDrops の 初期値 = legendary の ぜんぶ・weight 1', () => {
    expect(S().nushiDrops).toEqual([{ item: 'raijin_ken', weight: 1 }]);
  });
  it('そのほかの 設定 §9', () => {
    expect(S().legendaryChargeWalk).toBe(0.5);
    const m6 = M6_SETTING_DEFAULTS as unknown as Record<string, number>;
    expect(m6.achieveToastTicks).toBe(240);
    expect(m6.legendTelopTicks).toBe(300);
  });
  it('createW2Settings は 毎回 ふかい コピー（legendary・nushiDrops）', () => {
    const a = S() as unknown as { legendary: Def[]; nushiDrops: { weight: number }[] };
    a.legendary[0]!.power = 99;
    a.nushiDrops[0]!.weight = 99;
    const b = S() as unknown as { legendary: Def[]; nushiDrops: { weight: number }[] };
    expect(b.legendary[0]!.power).toBe(8);
    expect(b.nushiDrops[0]!.weight).toBe(1);
    expect((W2_SETTING_DEFAULTS as unknown as { legendary: Def[] }).legendary[0]!.power).toBe(8);
  });
});

describe('WEAPON-7 アイテム（雷神剣）', () => {
  it('アイテムの 表: 名前は ［漢字｜よみ］・1 つ だけ・めずらしさ legendary', () => {
    const t = ITEM_TYPES.find((x) => x.id === ('raijin_ken' as never));
    expect(t, 'ITEM_TYPES に raijin_ken').toBeDefined();
    expect(t!.name).toBe(NAME);
    expect(t!.maxStack).toBe(1);
    expect(itemRarity('raijin_ken' as never)).toBe('legendary');
  });
  it('刀の なかま: BLADE_ITEMS に 入る・射程 2.2・3 段攻撃（bladeCombo）には 入らない', () => {
    expect(BLADE_ITEMS.has('raijin_ken' as never)).toBe(true);
    expect(bladeReachOf(createW2Settings(), 'raijin_ken' as never)).toBe(2.2);
    expect(createW2Settings().bladeCombo.items as string[]).not.toContain('raijin_ken');
  });
  it('名前の 漢字は ruby() で ふりがなが つく（§2.7 (1)）', () => {
    expect(ruby('雷神剣', 'らいじんけん')).toBe('<ruby>雷神剣<rt>らいじんけん</rt></ruby>');
    expect(findUnrubiedKanji(ruby('雷神剣', 'らいじんけん'))).toEqual([]);
  });
});

describe('WEAPON-7 AC8: たいきゅう 10000', () => {
  it('toolDurability.raijin_ken = 10000（のこり わずか 10% = 1000）', () => {
    expect(S().toolDurability.raijin_ken).toBe(10000);
    expect(createW2Settings().wearLowRatio * 10000).toBe(1000);
  });
});

describe('WEAPON-7 AC12: 実績', () => {
  const def = (id: string) => ACHIEVEMENT_DEFS.find((d) => d.id === id);
  it('get.raijin_ken.1 と legend.kinds.1 の 名前・分類・小で ない', () => {
    const a = def('get.raijin_ken.1');
    const b = def('legend.kinds.1');
    expect(a, 'get.raijin_ken.1').toBeDefined();
    expect(b, 'legend.kinds.1').toBeDefined();
    expect(a!.name).toBe('はじめて ［雷神剣｜らいじんけん］ を てにいれた！');
    expect(b!.name).toBe('レジェンダリー を てにいれた！');
    expect(a!.category).toBe('fight');
    expect(b!.category).toBe('fight');
    expect(a!.small).toBe(false);
    expect(b!.small).toBe(false);
  });
  it('PR1 では 2 つだけ（get.* は 雷神剣、legend.kinds は 1 だけ）', () => {
    expect(ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('get.')).map((d) => d.id)).toEqual(['get.raijin_ken.1']);
    expect(ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('legend.kinds.')).map((d) => d.id)).toEqual(['legend.kinds.1']);
  });
  it('名前の はば（空白 0.5・ルビは 漢字の 字数）が いちばん 広い 実績 20 字ぶん 以下', () => {
    const width = (name: string) => {
      const plain = name.replace(/［([^｜］]+)｜([^］]+)］/g, (_, k: string, y: string) => (y.length * 0.5 <= k.length ? k : y));
      return [...plain].reduce((w, c) => w + (c === ' ' ? 0.5 : /[0-9]/.test(c) ? 0.5 : 1), 0);
    };
    expect(width('はじめて ［雷神剣｜らいじんけん］ を てにいれた！')).toBeCloseTo(15.5, 5);
    expect(width('レジェンダリー を てにいれた！')).toBeCloseTo(15, 5);
    expect(width('やせいの やさい を 4 しゅるい みつけた！')).toBeLessThanOrEqual(20);
  });
});
