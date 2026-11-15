import { describe, expect, it } from 'vitest';
import type { BlockId } from '../../contracts';
import { SHOP_BOXES, SHOP_TUNING } from './shopTable';
import { GROUND, SPOTS, gained, rig, sum, want } from './shopTestKit';

/**
 * TOWN-1-shop 1.5（§2.7 の 6〜13・§4.3b）: お店の 前の たからばこ。AC57（置き場）・AC58（のこる・きえる・保存と ブロックの ずれ）・AC60（だれが あけるか）。
 * 数は 表（SHOP_TUNING・SHOP_BOXES）から 読む。
 */

const box = (r: ReturnType<typeof rig>, who: 1 | 2 = 1) => r.shop.buy(who, 'kobako');

describe('AC57: 置き場', () => {
  it('1 こずつ 4 回 こうかん すると ①②③④ の 順。5 回目は full（ダマ・回数・箱 かわらない・いっぱいの わけ）', () => {
    const r = rig();
    r.give(1, 200);
    expect([0, 1, 2, 3].map(() => box(r).placed!.spot)).toEqual([0, 1, 2, 3]);
    const d = r.shop.dama(1);
    const before = r.shop.boxes!.list();
    const res = box(r);
    expect(res.status).toBe('full');
    expect(res.why).toBe('full');
    expect(r.shop.dama(1)).toBe(d);
    expect(r.shop.opens(1).kobako).toBe(4);
    expect(r.shop.boxes!.list()).toEqual(before);
  });
  it('① に 人が 立って いる・① の 下の 地面が ない・① の マスに 石 → ② に 出る', () => {
    const s0 = SPOTS[0]!;
    const cases: [string, (r: ReturnType<typeof rig>) => void][] = [
      ['人', (r) => r.bodies.add(r.key(s0.main.x, s0.main.y, s0.main.z))],
      ['地面が 空気', (r) => void r.world.setBlock(s0.cells[1].x, GROUND, s0.cells[1].z, 'air' as BlockId)],
      ['妖怪の 石', (r) => void r.world.setBlock(s0.main.x, s0.main.y, s0.main.z, 'stone' as BlockId)],
      ['なおしの 記録', (r) => r.recorded.add(r.key(s0.main.x, GROUND, s0.main.z))],
    ];
    for (const [name, prep] of cases) {
      const r = rig();
      r.give(1, 50);
      prep(r);
      expect(box(r).placed?.spot, name).toBe(1);
    }
  });
  it('4 か所 とも 人で 置けない → full（わけは blocked ＝ いっぱい とは ちがう 文）・ダマ・回数 かわらない', () => {
    const r = rig();
    r.give(1, 50);
    for (const s of SPOTS) r.bodies.add(r.key(s.main.x, s.main.y + 1, s.main.z));
    const res = box(r);
    expect([res.status, res.why]).toEqual(['full', 'blocked']);
    expect(r.shop.dama(1)).toBe(50);
    expect(r.shop.opens(1).kobako).toBe(0);
  });
  it('どの 2 この 箱の マスも 4 方向で となりあわない', () => {
    const cells = SPOTS.map((s) => s.cells);
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++)
        for (const a of cells[i]!) for (const b of cells[j]!) expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z) > 1 || a.y !== b.y, `${i} と ${j}`).toBe(true);
  });
});

describe('AC58: のこる・きえる', () => {
  it('あけて いない 箱は 6,000 ステップ・保存して 読みなおしても 同じ・ブロックも 同じ。あけると AC16 と 同じ 中身', () => {
    const r = rig();
    r.give(1, 50);
    box(r);
    r.step(6000);
    const before = r.shop.boxes!.list();
    expect(before.length).toBe(1);
    const data = JSON.parse(JSON.stringify(r.shop.serialize()));
    const r2 = rig();
    r2.shop.deserialize(data);
    r2.step(1); // 開いた 1 ステップ目で 記録の 箱を 置く
    expect(r2.shop.boxes!.list()).toEqual(before);
    expect(r2.blockAt(SPOTS[0]!.main)).toBe(`takarabako_${before[0]!.tier}`);
    expect(r2.blockAt(SPOTS[0]!.cells[1])).toBe(`takarabako_${before[0]!.tier}_r`);
    expect(gained(r2, 1, () => r2.openBox(1, 0))).toEqual(sum(want('kobako', 1, 0).items));
  });
  it(`あけると ${SHOP_TUNING.vanishSteps} ステップ 目で 2 マス とも 空気・boxes から きえ・また 出せる（その 1 つ 前は のこる）`, () => {
    const r = rig();
    r.give(1, 50);
    box(r);
    r.openBox(1, 0);
    r.step(SHOP_TUNING.vanishSteps - 1);
    expect(r.shop.boxes!.list().length).toBe(1);
    expect(r.shop.boxes!.list()[0]).toMatchObject({ opened: true, vanishIn: 1 });
    expect(r.blockAt(SPOTS[0]!.main)).not.toBe('air');
    r.step(1);
    expect(r.shop.boxes!.list().length).toBe(0);
    for (const c of SPOTS[0]!.cells) expect(r.blockAt(c)).toBe('air');
    expect(box(r).placed!.spot, 'あいた 置き場に また 出る').toBe(0);
  });
  it('あけて すぐ 保存 → 読みなおすと 箱は ない（2 回 もらえない）', () => {
    const r = rig();
    r.give(1, 50);
    box(r);
    r.openBox(1, 0);
    r.step(30);
    const r2 = rig();
    r2.shop.deserialize(JSON.parse(JSON.stringify(r.shop.serialize())));
    expect(r2.shop.boxes!.list()).toEqual([]);
  });
  it('保存の 記録と ブロックが ずれた とき 1 ステップ目で 記録に 合わせる', () => {
    // 記録 だけ ある → 箱を 置く
    const r = rig();
    r.give(1, 50);
    box(r);
    for (const c of SPOTS[0]!.cells) r.world.setBlock(c.x, c.y, c.z, 'air' as BlockId);
    r.step(1);
    expect(r.blockAt(SPOTS[0]!.main)).toBe(`takarabako_${r.shop.boxes!.list()[0]!.tier}`);
    // ブロック だけ ある → 消す
    const s1 = SPOTS[1]!;
    r.world.setBlock(s1.main.x, s1.main.y, s1.main.z, 'takarabako_2' as BlockId);
    r.world.setBlock(s1.cells[1].x, s1.cells[1].y, s1.cells[1].z, 'takarabako_2_r' as BlockId);
    r.step(1);
    for (const c of s1.cells) expect(r.blockAt(c)).toBe('air');
  });
  it('箱の 下の 地面が なくなっても 箱は のこり あけられる', () => {
    const r = rig();
    r.give(1, 50);
    box(r);
    for (const c of SPOTS[0]!.cells) r.world.setBlock(c.x, GROUND, c.z, 'air' as BlockId);
    r.step(100);
    expect(r.shop.boxes!.list().length).toBe(1);
    expect(gained(r, 1, () => r.openBox(1, 0))).toEqual(sum(want('kobako', 1, 0).items));
  });
});

describe('AC60: だれが あけるか（どちらでも・中身は あけた 人へ・たねは 買った 人）', () => {
  it('1P が 買った 箱を 2P が あける → 2P に 入る・1P は かわらない。ぎゃくも 同じ', () => {
    for (const [buyer, opener] of [
      [1, 2],
      [2, 1],
    ] as const) {
      const r = rig();
      r.give(buyer, 50);
      box(r, buyer);
      const items = sum(want('kobako', buyer, 0).items);
      const other0 = gained(r, buyer, () => {});
      expect(other0.size).toBe(0);
      expect(gained(r, opener, () => r.openBox(opener, 0)), `${buyer}P の 箱を ${opener}P が`).toEqual(items);
      expect(r.shop.opens(opener).kobako).toBe(0);
    }
  });
  it('2P が 参加して いない 間も 2P の 箱を 1P が あけられる', () => {
    const r = rig();
    r.give(2, 50);
    box(r, 2);
    r.leave2();
    expect(gained(r, 1, () => r.openBox(1, 0))).toEqual(sum(want('kobako', 2, 0).items));
  });
  it('おおばこの 箱は 段 4（ほかの 人が あけても ★6 が 1 こ 以上）', () => {
    const r = rig();
    r.give(1, SHOP_BOXES.obako.price);
    expect(r.shop.buy(1, 'obako').placed!.tier).toBe(4);
    expect(gained(r, 2, () => r.openBox(2, 0))).toEqual(sum(want('obako', 1, 0).items));
  });
});
