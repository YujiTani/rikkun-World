import { describe, expect, it } from 'vitest';
import { fakeWallet } from '../../dama/walletTestKit';
import { InventoryImpl } from '../../inventory/Inventory';
import { FoodService } from './food';
import { KaitoriService } from './kaitori';
import { SmithService } from './smith';
import { VendorDesk, vendorFreezesWorld } from './vendorDesk';
import { MEAL_TEXT, SMITH_TEXT, STALL_TEXT, VENDOR_TEXT } from './vendorText';
import { FOOD_TUNING, KAITORI_TUNING, VENDOR_SAY_STEPS } from './vendorTable';

/**
 * TOWN-1 1E: かじや・やたい・食事の 画面の 状態（人ごと。DOM なし。§2.11〜§2.13・§3.2・AC20〔1.3〕・AC37）。
 * 開く・えらぶ・押す・とじる・やられたら とじる・街を 出たら とじる・1 人で 止める／2 人 止めない。
 */

function rig() {
  const inv = { 1: new InventoryImpl(), 2: new InventoryImpl() };
  const wallet = fakeWallet(); // 1.6〔1F〕: さいふ
  const hp = { 1: 10, 2: 20 };
  const vit = (w: 1 | 2) => ({ hp: () => hp[w], maxHp: () => 20, dead: () => hp[w] <= 0, heal: (n: number) => ((hp[w] = Math.min(20, hp[w] + n)), n) });
  const opened: string[] = [];
  const closed: number[] = [];
  const sfx: string[] = [];
  const desk = new VendorDesk({
    smith: new SmithService({ inventory: (w) => inv[w], wallet, armor: () => null }),
    kaitori: new KaitoriService({ inventory: (w) => inv[w], wallet, day: () => 0 }),
    food: new FoodService({ inventory: (w) => inv[w], wallet, vitals: vit }),
    onOpen: (w, k) => void opened.push(`${w}:${k}`),
    onClose: (w) => void closed.push(w),
    play: (e) => void sfx.push(e.k),
  });
  return { inv, wallet, hp, desk, opened, closed, sfx };
}

describe('かじやさんの 画面', () => {
  it('なおす 物が 1 つも ない ときは 画面を 開かず ふきだし「どれも ピカピカ だね！」だけ', () => {
    const r = rig();
    expect(r.desk.talk(1, 'smith')).toBe(false);
    expect(r.desk.view(1).kind).toBeNull();
    expect(r.desk.saying(1)).toBe(SMITH_TEXT.none);
    for (let i = 0; i < VENDOR_SAY_STEPS; i++) r.desk.tickSay();
    expect(r.desk.saying(1)).toBeNull();
  });

  it('へった 物が あれば 開く → えらぶ → なおす（ダマ へる・カードから きえる）。たりない ときは ふきだし', () => {
    const r = rig();
    r.inv[1].setSlot(1, { item: 'katana', count: 1 });
    r.inv[1].setDurability(1, 5);
    expect(r.desk.talk(1, 'smith')).toBe(true);
    expect(r.opened).toEqual(['1:smith']);
    expect(r.desk.view(1)).toMatchObject({ kind: 'smith', selected: null, bubble: SMITH_TEXT.greet });
    r.desk.select(1, '1');
    expect(r.desk.press(1)).toBe('short');
    expect(r.desk.view(1).bubble).toMatch(/ようかいダマが あと \d+ こ たりないよ/);
    expect(r.sfx).toContain('short');
    r.wallet.add(1, 10);
    expect(r.desk.press(1)).toBe('ok');
    expect(r.desk.view(1)).toMatchObject({ kind: 'smith', selected: null, bubble: SMITH_TEXT.fixed });
    expect(r.inv[1].durability(1)!.left).toBe(r.inv[1].durability(1)!.max);
    expect(r.desk.press(1)).toBeNull();
  });
});

describe('かいとりの やたいの 画面', () => {
  it('わたせる 物が なければ ふきだし だけ。トマト 9 → short、10 → ok・ありがとう', () => {
    const r = rig();
    expect(r.desk.talk(1, 'stall')).toBe(false);
    expect(r.desk.saying(1)).toBe(STALL_TEXT.none);
    r.inv[1].add('tomato', 9);
    expect(r.desk.talk(1, 'stall')).toBe(true);
    r.desk.select(1, 'tomato');
    expect(r.desk.press(1)).toBe('short');
    expect(r.desk.view(1).bubble).toBe(STALL_TEXT.short(1));
    r.inv[1].add('tomato', 1);
    expect(r.desk.press(1)).toBe('ok');
    expect(r.desk.view(1).bubble).toBe(STALL_TEXT.thanks);
    expect(r.wallet.count(1)).toBe(1);
  });
  it('上限: cap の ふきだし', () => {
    const r = rig();
    r.inv[1].add('crystal', 20);
    r.desk.talk(1, 'stall');
    r.desk.select(1, 'crystal');
    for (let i = 0; i < KAITORI_TUNING.dailyCap; i++) expect(r.desk.press(1)).toBe('ok');
    expect(r.desk.press(1)).toBe('cap');
    expect(r.desk.view(1).bubble).toBe(STALL_TEXT.cap);
  });
});

describe('食事の 画面', () => {
  it('話す → 開く（kind つき）→ たべる で ダマが へり 画面が とじる → もぐもぐ の あと 体力が ふえる', () => {
    const r = rig();
    r.wallet.add(1, 5);
    expect(r.desk.talk(1, 'dango')).toBe(true);
    expect(r.desk.view(1)).toMatchObject({ kind: 'meal', meal: 'dango', bubble: MEAL_TEXT.greet });
    expect(r.desk.press(1)).toBe('ok');
    expect(r.desk.view(1).kind).toBeNull();
    expect(r.closed).toEqual([1]);
    expect(r.wallet.count(1)).toBe(4);
    for (let i = 0; i < FOOD_TUNING.munchSteps + 40; i++) r.desk.stepWorld();
    expect(r.hp[1]).toBe(16);
  });
  it('まんたん → full・ふきだし「おなか いっぱい だね！」・画面は 開いた まま。たりない → ようかいダマが あと □ こ', () => {
    const r = rig();
    r.wallet.add(2, 1);
    r.desk.talk(2, 'gohan');
    expect(r.desk.press(2)).toBe('full');
    expect(r.desk.view(2)).toMatchObject({ kind: 'meal', bubble: MEAL_TEXT.full });
    r.hp[2] = 5;
    expect(r.desk.press(2)).toBe('short');
    expect(r.desk.view(2).bubble).toBe(VENDOR_TEXT.short(2));
  });
});

describe('きまり（よろずやと 同じ。§2.6 の 7・AC20 1.3）', () => {
  it('1 人で 1P が 開くと 止める。2 人は 1P でも 2P でも 止めない', () => {
    expect(vendorFreezesWorld({ open1: true, joined: false })).toBe(true);
    expect(vendorFreezesWorld({ open1: true, joined: true })).toBe(false);
    expect(vendorFreezesWorld({ open1: false, joined: false })).toBe(false);
  });
  it('やられたら とじる・街の 中から 外へ 出たら とじる・当たっても とじない', () => {
    const r = rig();
    r.inv[1].add('tomato', 10);
    r.desk.talk(1, 'stall', true);
    r.desk.step(1, { alive: true, inTown: true });
    expect(r.desk.view(1).kind).toBe('stall');
    r.desk.step(1, { alive: false, inTown: true });
    expect(r.desk.view(1).kind).toBeNull();
    r.desk.talk(1, 'stall', true);
    r.desk.step(1, { alive: true, inTown: false });
    expect(r.desk.view(1).kind).toBeNull();
  });
  it('パッド: 右で つぎの カード・A で 押す・B で とじる', () => {
    const r = rig();
    r.inv[1].add('tomato', 10);
    r.inv[1].add('egg', 4);
    r.desk.talk(1, 'stall');
    r.desk.pad(1, 'right', 3);
    expect(r.desk.view(1).selected).toBe('tomato');
    r.desk.pad(1, 'right', 3);
    expect(r.desk.view(1).selected).toBe('egg');
    r.desk.pad(1, 'confirm', 3);
    expect(r.inv[1].count('egg')).toBe(0);
    r.desk.pad(1, 'back', 3);
    expect(r.desk.view(1).kind).toBeNull();
  });
  it('1P と 2P は 別々に 開ける', () => {
    const r = rig();
    r.inv[1].add('tomato', 10);
    r.wallet.add(2, 3);
    r.hp[2] = 4;
    r.desk.talk(1, 'stall');
    r.desk.talk(2, 'gohan');
    expect(r.desk.view(1).kind).toBe('stall');
    expect(r.desk.view(2).kind).toBe('meal');
  });
});
