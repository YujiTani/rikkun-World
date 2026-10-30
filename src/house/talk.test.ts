import { beforeEach, describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { NOD_STEPS } from './architect';
import { Kura } from './kura';
import { GREET_STEPS, HouseTalk, SAY, type HouseRecord } from './talk';

/** HOUSE-1A AC3・AC41: 話す → うなずき 22 ステップ → メニュー。はじめては 道具 1 こずつ。2 回目は ふえない。なくしたら「どうぐを もらう」 */

interface Rig {
  talk: HouseTalk;
  bag: InventoryImpl;
  kura: Kura;
  record: HouseRecord;
  calls: string[];
}

function rig(record: HouseRecord = { toolsGiven: false, first: null }, owned?: (item: ItemId) => number): Rig {
  const bag = new InventoryImpl();
  const kura = new Kura();
  const calls: string[] = [];
  const talk = new HouseTalk({
    record,
    kura,
    bag,
    ...(owned ? { owned } : {}),
    voice: () => calls.push('voice'),
    onOpen: () => calls.push('open'),
    onClose: () => calls.push('close'),
    endTalk: (id) => calls.push(`end:${id}`),
    gave: (item) => calls.push(`gave:${item}`),
  });
  return { talk, bag, kura, record, calls };
}

/** 話しはじめて から n ステップ（うなずきは 22 ステップで おわる つもりで 進める） */
function run(r: Rig, steps: number, from = 0): void {
  for (let i = 1; i <= steps; i++) r.talk.step(from + i >= NOD_STEPS);
}

const ids = (r: Rig): string[] => r.talk.menu().buttons.map((b) => b.id);

describe('AC3 うなずき 22 ステップのあと メニュー', () => {
  let r: Rig;
  beforeEach(() => {
    r = rig({ toolsGiven: true, first: null }); // 2 回目いこう（あいさつなし）
  });

  it('話しはじめ: 声が 1 回・ふきだしは 出る・メニューは まだ 開かない。21 ステップ目までは false、22 ステップ目で true', () => {
    expect(r.talk.menu()).toEqual({ open: false, page: null, bubble: '', buttons: [] });
    expect(r.talk.start('first')).toBe(true);
    expect(r.calls).toEqual(['voice']);
    expect(r.talk.menu().bubble).toBe(SAY.menu);
    expect(r.talk.menu().open).toBe(false);
    for (let i = 1; i <= 21; i++) {
      r.talk.step(i >= NOD_STEPS);
      expect(r.talk.menu().open, `step ${i}`).toBe(false);
    }
    r.talk.step(true); // 22 ステップ目
    const m = r.talk.menu();
    expect(m.open).toBe(true);
    expect(m.page).toBe('top');
    expect(m.bubble.trim()).not.toBe('');
    expect(r.calls).toEqual(['voice', 'open']);
  });

  it('声は 1 回だけ（話しはじめの とき）。2 回目に 話しても 1 回', () => {
    r.talk.start('first');
    run(r, 22);
    r.talk.press('close');
    r.calls.length = 0;
    r.talk.start('first');
    run(r, 22);
    expect(r.calls.filter((c) => c === 'voice')).toHaveLength(1);
  });

  it('話している 最中・メニューが 開いて いる 間は 話しなおせない', () => {
    expect(r.talk.start('first')).toBe(true);
    expect(r.talk.start('first')).toBe(false);
    run(r, 22);
    expect(r.talk.start('other')).toBe(false);
    expect(r.calls.filter((c) => c === 'voice')).toHaveLength(1);
  });

  it('メニューの ボタンは §2.3 の 順。道具を 持って いるときは「どうぐを もらう」を 出さない。この票で 動くのは くら・とじる', () => {
    r.bag.add('mizumori' as ItemId, 1);
    r.bag.add('dotsuki' as ItemId, 1);
    r.talk.start('first');
    run(r, 22);
    expect(ids(r)).toEqual(['kura', 'editor', 'build', 'rename', 'close']);
    const en = Object.fromEntries(r.talk.menu().buttons.map((b) => [b.id, b.enabled]));
    expect(en.kura).toBe(true);
    expect(en.close).toBe(true);
    // エディター・けんちく・なまえは HOUSE-1B 以降（出すが 押せない）
    expect(en.editor).toBe(false);
    expect(en.build).toBe(false);
    expect(en.rename).toBe(false);
  });

  it('道具が ないときは 6 つ ぜんぶ（どうぐを もらう は 押せる）', () => {
    r.talk.start('first');
    run(r, 22);
    expect(ids(r)).toEqual(['kura', 'editor', 'build', 'rename', 'tools', 'close']);
    expect(r.talk.menu().buttons.find((b) => b.id === 'tools')!.enabled).toBe(true);
  });

  it('押せない ボタンを 押しても 何も おきない', () => {
    r.talk.start('first');
    run(r, 22);
    for (const id of ['editor', 'build', 'rename', 'nothing']) r.talk.press(id);
    expect(r.talk.menu().page).toBe('top');
    expect(r.talk.menu().open).toBe(true);
  });
});

describe('AC3 道具を くれる 条件', () => {
  it('はじめて 話すと みずもり 1・どうづき 1 が ふえる。open が true に なる 前に わたす', () => {
    const r = rig();
    expect(r.bag.count('mizumori' as ItemId)).toBe(0);
    expect(r.talk.start('first')).toBe(true);
    expect(r.talk.menu().bubble).toBe(SAY.hello);
    let givenBeforeOpen: [number, number] | null = null;
    let opened = false;
    for (let i = 1; i <= 400 && !opened; i++) {
      r.talk.step(i >= NOD_STEPS);
      if (r.talk.menu().open) {
        opened = true;
        givenBeforeOpen = [r.bag.count('mizumori' as ItemId), r.bag.count('dotsuki' as ItemId)];
      }
    }
    expect(opened, '400 ステップ いないに メニューが 開く（クリックなしで あいさつが すすむ）').toBe(true);
    expect(givenBeforeOpen).toEqual([1, 1]);
    expect(r.record.toolsGiven).toBe(true);
    // 開いた ときには ボタンまで そろって いる（道具を 持って いるので「どうぐを もらう」なし）
    expect(ids(r)).toEqual(['kura', 'editor', 'build', 'rename', 'close']);
    expect(r.calls.filter((c) => c.startsWith('gave:'))).toEqual(['gave:mizumori', 'gave:dotsuki']);
    // 声は 1 回だけ（あいさつ 2 行でも）
    expect(r.calls.filter((c) => c === 'voice')).toHaveLength(1);
  });

  it('あいさつの 順: うなずきの あいだ「こんにちは…」→ うなずきの あと「これを あげる…」→ メニュー「なにを する？」。道具は 2 行目で わたす', () => {
    const r = rig();
    r.talk.start('first');
    const seen: string[] = [];
    let givenAt = '';
    for (let i = 1; i <= 400; i++) {
      r.talk.step(i >= NOD_STEPS);
      const b = r.talk.menu().bubble;
      if (seen[seen.length - 1] !== b) seen.push(b);
      if (!givenAt && r.bag.count('mizumori' as ItemId) === 1) givenAt = b;
      if (r.talk.menu().open) break;
    }
    expect(seen).toEqual([SAY.hello, SAY.gift, SAY.menu]);
    expect(givenAt).toBe(SAY.gift);
    expect(GREET_STEPS).toBeGreaterThan(30);
    expect(NOD_STEPS + GREET_STEPS * 2).toBeLessThan(300); // E2E の talkTo は 300 ステップまで 待つ
  });

  it('2 回目は ふえない（もう 持って いても いなくても あいさつは なし）', () => {
    const r = rig();
    r.talk.start('first');
    run(r, 400);
    expect(r.talk.menu().open).toBe(true);
    r.talk.press('close');
    r.talk.start('first');
    run(r, 22);
    expect(r.talk.menu().bubble).toBe(SAY.menu);
    expect(r.bag.count('mizumori' as ItemId)).toBe(1);
    expect(r.bag.count('dotsuki' as ItemId)).toBe(1);
    // 道具を なくしても 話した だけでは もどらない
    r.talk.press('close');
    r.bag.clear();
    r.talk.start('first');
    run(r, 22);
    expect(r.bag.count('mizumori' as ItemId)).toBe(0);
    expect(r.bag.count('dotsuki' as ItemId)).toBe(0);
  });

  it('両方 なくした あと「どうぐを もらう」で 1 こずつ もどる。もらった あとは ボタンが きえる', () => {
    const r = rig({ toolsGiven: true, first: null });
    r.talk.start('first');
    run(r, 22);
    expect(ids(r)).toContain('tools');
    r.talk.press('tools');
    expect(r.bag.count('mizumori' as ItemId)).toBe(1);
    expect(r.bag.count('dotsuki' as ItemId)).toBe(1);
    expect(ids(r)).not.toContain('tools');
    expect(r.talk.menu().page).toBe('top');
    expect(r.talk.menu().open).toBe(true);
    // もう もらえない（持って いるので）
    r.talk.press('tools');
    expect(r.bag.count('mizumori' as ItemId)).toBe(1);
  });

  it('片方だけ なくしても そちらだけ もどる（持って いる 方は ふえない）', () => {
    const r = rig({ toolsGiven: true, first: null });
    r.bag.add('mizumori' as ItemId, 1);
    r.talk.start('first');
    run(r, 22);
    expect(ids(r)).toContain('tools');
    r.talk.press('tools');
    expect(r.bag.count('mizumori' as ItemId)).toBe(1);
    expect(r.bag.count('dotsuki' as ItemId)).toBe(1);
  });

  it('たんすの 中に ある 道具は 持って いる ことに する（その 道具だけ「どうぐを もらう」から はずれる）', () => {
    const inTansu = new Set<string>(['mizumori']);
    const r = rig({ toolsGiven: true, first: null }, (item) => (inTansu.has(item) ? 1 : 0));
    r.talk.start('first');
    run(r, 22);
    expect(ids(r)).toContain('tools'); // どうづきは どこにも ない
    r.talk.press('tools');
    expect(r.bag.count('mizumori' as ItemId), 'たんすに ある みずもりは ふやさない').toBe(0);
    expect(r.bag.count('dotsuki' as ItemId)).toBe(1);
    expect(ids(r), '両方 そろった（たんす ＋ 持ち物）ので ボタンが きえる').not.toContain('tools');
  });

  it('両方 たんすに あれば「どうぐを もらう」は 出ない。はじめての あいさつでも ふやさない', () => {
    const owned = (): number => 1;
    const r = rig({ toolsGiven: true, first: null }, owned);
    r.talk.start('first');
    run(r, 22);
    expect(ids(r)).not.toContain('tools');
    const first = rig({ toolsGiven: false, first: null }, owned);
    first.talk.start('first');
    run(first, 22 + GREET_STEPS * 2);
    expect(first.bag.count('mizumori' as ItemId)).toBe(0);
    expect(first.bag.count('dotsuki' as ItemId)).toBe(0);
    expect(first.talk.menu().open).toBe(true);
  });

  it('持ち物が いっぱいで わたせないときは あずからない（どうぐを もらう は のこる）', () => {
    const r = rig({ toolsGiven: true, first: null });
    for (let i = 0; i < r.bag.size; i++) r.bag.setSlot(i, { item: 'dirt', count: 64 });
    r.talk.start('first');
    run(r, 22);
    r.talk.press('tools');
    expect(r.bag.count('mizumori' as ItemId)).toBe(0);
    expect(ids(r)).toContain('tools');
    expect(r.talk.menu().bubble).toBe(SAY.bagFull);
  });
});

describe('とじる・くら', () => {
  it('press(close) で 全部 とじる。onClose と 建築士さんの 話し おわりを 1 回ずつ', () => {
    const r = rig({ toolsGiven: true, first: null });
    r.talk.start('first');
    run(r, 22);
    r.calls.length = 0;
    r.talk.press('close');
    expect(r.talk.menu()).toEqual({ open: false, page: null, bubble: '', buttons: [] });
    expect(r.calls).toEqual(['close', 'end:first']);
    r.talk.press('close'); // もう とじて いる
    expect(r.calls).toEqual(['close', 'end:first']);
  });

  it('くらの 画面: press(kura) で page が kura。ボタンは ✕ だけ。press(close) は くらからでも 全部 とじる', () => {
    const r = rig({ toolsGiven: true, first: null });
    r.talk.start('first');
    run(r, 22);
    r.talk.press('kura');
    expect(r.talk.menu().page).toBe('kura');
    expect(ids(r)).toEqual(['close']);
    expect(r.talk.menu().bubble.trim()).not.toBe('');
    r.talk.press('close');
    expect(r.talk.menu().open).toBe(false);
    expect(r.talk.menu().page).toBeNull();
  });

  it('うなずき・あいさつの 途中で やめる（cancel）と メニューは 開かず、onClose も 呼ばない', () => {
    const r = rig();
    r.talk.start('first');
    run(r, 30);
    expect(r.talk.menu().open).toBe(false);
    r.calls.length = 0;
    r.talk.close();
    expect(r.talk.menu().bubble).toBe('');
    expect(r.calls).toEqual(['end:first']);
    // 道具は まだ わたして いない（あいさつの 2 行目に 行く 前）→ 次に 話すと またの あいさつ
    expect(r.record.toolsGiven).toBe(false);
    expect(r.talk.start('first')).toBe(true);
    expect(r.talk.menu().bubble).toBe(SAY.hello);
  });

  it('くらの 出し入れ（メニューが とじていても 使える）: deposit・withdraw は 動いた 数。いっぱい / 持ち物いっぱい の ふきだし', () => {
    const r = rig({ toolsGiven: true, first: null });
    r.bag.add('log', 20);
    expect(r.talk.deposit('log', 10)).toBe(10);
    expect(r.bag.count('log')).toBe(10);
    expect(r.kura.count('log')).toBe(10);
    expect(r.talk.withdraw('log', 4)).toBe(4);
    expect(r.bag.count('log')).toBe(14);
    expect(r.kura.count('log')).toBe(6);
    // 999 こ まで
    r.kura.restore({ dirt: 998 });
    r.bag.add('dirt', 5);
    r.talk.start('first');
    run(r, 22);
    r.talk.press('kura');
    expect(r.talk.deposit('dirt', 5)).toBe(1);
    expect(r.talk.menu().bubble).toBe(SAY.kuraFull);
    // 持ち物が いっぱい
    for (let i = 0; i < r.bag.size; i++) r.bag.setSlot(i, { item: 'stone', count: 64 });
    expect(r.talk.withdraw('dirt', 3)).toBe(0);
    expect(r.kura.count('dirt')).toBe(999);
    expect(r.talk.menu().bubble).toBe(SAY.bagFull);
  });
});

describe('AC41 メニュー・くらが 開いて いる 間は 時間を 止める', () => {
  it('frozen() は メニューが 開いて いる 間 だけ true（うなずき・あいさつの 間は false）', () => {
    const r = rig();
    expect(r.talk.frozen()).toBe(false);
    r.talk.start('first');
    for (let i = 1; i <= 300 && !r.talk.menu().open; i++) {
      r.talk.step(i >= NOD_STEPS);
      if (!r.talk.menu().open) expect(r.talk.frozen(), `step ${i}`).toBe(false);
    }
    expect(r.talk.frozen()).toBe(true);
    r.talk.press('kura');
    expect(r.talk.frozen(), 'くらの 画面でも').toBe(true);
    r.talk.press('close');
    expect(r.talk.frozen()).toBe(false);
  });
});
