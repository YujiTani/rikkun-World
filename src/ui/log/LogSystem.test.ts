import { describe, expect, it } from 'vitest';
import { createCraft2Settings, type ItemId } from '../../contracts';
import { LOG_VISIBLE_ROWS, LogSystem, type LogHost, type LogTab } from './LogSystem';

const names: Record<string, string> = { dirt: 'つち', log: 'き', iron_ore: 'てつこうせき', coal_ore: 'せきたん', paper: 'かみ', stone: 'いし', sand: 'すな', grass: 'くさ' };
const nameOf = (i: ItemId): string => names[i] ?? i;
const mk = (settings = createCraft2Settings()): LogSystem => new LogSystem({ nameOf, settings });
const steps = (l: LogSystem, n: number): void => {
  for (let i = 0; i < n; i++) l.step();
};

describe('履歴のまとめ方（AC17）', () => {
  it('60 ステップおきに 3 回 → 1 件で count 3。181 あけると 2 件', () => {
    const l = mk();
    for (let i = 0; i < 3; i++) {
      l.pickup('dirt', 1);
      steps(l, 60);
    }
    expect(l.history()).toHaveLength(1);
    expect(l.history()[0]).toMatchObject({ kind: 'pickup', category: 'pickup', item: 'dirt', count: 3, text: 'つち ×3' });
    steps(l, 181);
    l.pickup('dirt', 1);
    expect(l.history()).toHaveLength(2);
    expect(l.history()[0].count).toBe(1);
  });

  it('ちがうアイテムが間に入ると 新しい件', () => {
    const l = mk();
    l.pickup('dirt', 1);
    l.pickup('paper', 1);
    l.pickup('dirt', 1);
    expect(l.history().map((e) => e.item)).toEqual(['dirt', 'paper', 'dirt']);
  });

  it('数のない件は ×2 を足す。edge は 出ていない状態から 出たときだけ', () => {
    const l = mk();
    l.signal('full');
    l.signal('full');
    expect(l.history()).toHaveLength(1);
    expect(l.history()[0]).toMatchObject({ kind: 'signal', category: 'warn', count: null, text: 'もちもの が いっぱい！ ×2' });
    const e = mk();
    for (const a of [true, true, false, true]) e.edge('k', a, () => e.farmHint('はたけ にしよう'));
    expect(e.history()[0].text).toBe('はたけ にしよう ×2');
    const f = mk();
    for (const a of [true, true, true]) f.edge('k', a, () => f.farmHint('x'));
    expect(f.history()).toHaveLength(1);
    expect(f.history()[0].text).toBe('x');
  });

  it('100 件まで。古いものが消える。logHistoryMax で変えられる', () => {
    const l = mk();
    for (let i = 0; i < 101; i++) {
      l.pickup(`item${i}` as ItemId, 1);
    }
    expect(l.history()).toHaveLength(100);
    expect(l.history().some((e) => (e.item as string) === 'item0')).toBe(false);
    expect(l.history()[0].item).toBe('item100');
    const s = createCraft2Settings();
    const m = mk(s);
    s.logHistoryMax = 10;
    for (let i = 0; i < 30; i++) m.pickup(`i${i}` as ItemId, 1);
    expect(m.history()).toHaveLength(10);
  });
});

describe('たんす から つかった（AC13）', () => {
  it('アイテムごとに 1 件。位置は たんす ごと。左のログに craft の行が出る', () => {
    const l = mk();
    l.fromTansu([
      { x: 1, y: 2, z: 3, item: 'iron_ore', count: 1 },
      { x: 1, y: 2, z: 3, item: 'log', count: 2 },
      { x: 4, y: 2, z: 3, item: 'log', count: 1 },
    ]);
    const h = l.history();
    expect(h).toHaveLength(2);
    const wood = h.find((e) => e.item === 'log')!;
    expect(wood).toMatchObject({ kind: 'fromTansu', category: 'craft', count: 3, text: 'たんす から き ×3' });
    expect(wood.positions).toEqual([
      { x: 1, y: 2, z: 3, count: 2 },
      { x: 4, y: 2, z: 3, count: 1 },
    ]);
    expect(l.live().map((r) => r.text)).toEqual(['たんす から てつこうせき ×1', 'たんす から き ×3']);
    expect(l.live()[0]).toMatchObject({ kind: 'fromTansu', category: 'craft', ticksLeft: 180 });
  });

  it('60 ステップ後に もう一度 → 同じ行の count が足され ticksLeft 180。180 ステップで消える', () => {
    const l = mk();
    l.fromTansu([{ x: 0, y: 0, z: 0, item: 'log', count: 1 }]);
    steps(l, 60);
    l.fromTansu([{ x: 0, y: 0, z: 0, item: 'log', count: 2 }]);
    expect(l.live()).toHaveLength(1);
    expect(l.live()[0]).toMatchObject({ count: 3, ticksLeft: 180 });
    expect(l.history()).toHaveLength(1);
    expect(l.history()[0].positions).toEqual([{ x: 0, y: 0, z: 0, count: 3 }]);
    steps(l, 180);
    expect(l.live()).toEqual([]);
  });

  it('省いた・空の fromTansu は 何も足さない', () => {
    const l = mk();
    l.fromTansu(undefined);
    l.fromTansu([]);
    expect(l.history()).toEqual([]);
    expect(l.live()).toEqual([]);
  });
});

describe('左のログは 拾った行と 5 行を分け合う（AC14）', () => {
  it('4 種 拾う + たんす 1 種 = 5 行。もう 1 種で いちばん古いのが消える。拾った行だけの list は M4 のまま', () => {
    const l = mk();
    for (const i of ['dirt', 'paper', 'stone', 'sand'] as ItemId[]) l.pickup(i, 1);
    l.fromTansu([{ x: 0, y: 0, z: 0, item: 'log', count: 1 }]);
    expect(l.live()).toHaveLength(5);
    l.pickup('grass', 1);
    expect(l.live()).toHaveLength(5);
    expect(l.live()[0].item).toBe('paper');
    expect(l.live().map((r) => r.kind)).toEqual(['pickup', 'pickup', 'pickup', 'fromTansu', 'pickup']);
    expect(l.liveModel.list().every((r) => r.item !== 'log')).toBe(true);
    expect(l.liveModel.list()).toHaveLength(4);
  });

  it('同じアイテムでも 拾った行と たんす の行は 別の行', () => {
    const l = mk();
    l.pickup('log', 1);
    l.fromTansu([{ x: 0, y: 0, z: 0, item: 'log', count: 1 }]);
    expect(l.live().map((r) => r.text)).toEqual(['き ×1', 'たんす から き ×1']);
  });
});

describe('できごとの種類（AC16）', () => {
  it('履歴だけの 3 つは 左のログに出ない。文・カテゴリーが 表のとおり', () => {
    const l = mk();
    l.craftMade('paper', 2);
    l.bakeStart('paper');
    l.defeat('からかさ');
    expect(l.live()).toEqual([]);
    const [d, b, c] = l.history();
    expect(c).toMatchObject({ kind: 'craft', category: 'craft', item: 'paper', count: 2, text: 'かみ ×2 を つくった' });
    expect(b).toMatchObject({ kind: 'bakeStart', category: 'craft', item: 'paper', count: null, text: 'かまど で かみ を やく' });
    expect(d).toMatchObject({ kind: 'defeat', category: 'fight', item: null, text: 'からかさ を たおした' });
  });

  it('合図・おしらせ・たたかい・じっせき', () => {
    const l = mk();
    l.signal('needTool');
    expect(l.history()[0]).toMatchObject({ kind: 'signal', category: 'warn', item: 'stone_pickaxe', text: 'つるはし が いるよ' });
    l.signal('noArrow');
    expect(l.history()[0]).toMatchObject({ item: 'ya', text: 'や が いるよ' });
    l.signal('tansuFull');
    expect(l.history()[0].text).toBe('たんす が いっぱい！');
    l.farmHint('たがやそう', 'farmland');
    expect(l.history()[0]).toMatchObject({ kind: 'farmHint', category: 'info', item: 'farmland' });
    l.wearLow('paper');
    expect(l.history()[0]).toMatchObject({ kind: 'wearLow', category: 'info', item: 'paper', text: 'かみ が もうすぐ こわれるよ' });
    l.wearBroken('paper');
    expect(l.history()[0]).toMatchObject({ kind: 'wearBroken', text: 'かみ が こわれた' });
    l.home();
    expect(l.history()[0]).toMatchObject({ kind: 'home', category: 'fight', text: 'スタートに もどったよ' });
    l.achievement('どろんこ');
    expect(l.history()[0]).toMatchObject({ kind: 'achievement', category: 'achieve', text: '「どろんこ」 を とった' });
    l.level(3);
    expect(l.history()[0]).toMatchObject({ kind: 'level', category: 'achieve', text: 'レベル 3 に なった' });
    expect(l.live()).toEqual([]);
  });

  it('clear で 履歴も左のログも 空', () => {
    const l = mk();
    l.pickup('dirt', 1);
    l.clear();
    expect(l.history()).toEqual([]);
    expect(l.live()).toEqual([]);
  });
});

describe('ページのスクロール（AC20）', () => {
  const fill = (l: LogSystem, n: number): void => {
    for (let i = 0; i < n; i++) l.pickup(`item${i}` as ItemId, 1);
  };

  it('20 件: ▼ で 3 行ずつ。いちばん下で canDown false。いちばん上で canUp false', () => {
    const l = mk();
    fill(l, 20);
    expect(l.ui()).toMatchObject({ rows: 20, scrollRow: 0, canUp: false, canDown: true });
    l.scroll(1);
    expect(l.ui().scrollRow).toBe(3);
    for (let i = 0; i < 10; i++) l.scroll(1);
    expect(l.ui()).toMatchObject({ scrollRow: 20 - LOG_VISIBLE_ROWS, canDown: false, canUp: true });
    for (let i = 0; i < 10; i++) l.scroll(-1);
    expect(l.ui()).toMatchObject({ scrollRow: 0, canUp: false });
  });

  it('下を見ていて 新しい件が 増えても 見ている行は 動かない。resetScroll / open で いちばん上', () => {
    const l = mk();
    fill(l, 20);
    l.scroll(1);
    const seen = l.history()[3].item;
    l.pickup('fresh' as ItemId, 1);
    expect(l.history()[l.ui().scrollRow].item).toBe(seen);
    l.resetScroll();
    expect(l.ui().scrollRow).toBe(0);
    l.scroll(1);
    l.open();
    expect(l.ui().scrollRow).toBe(0);
  });

  it('同じ件への 足し算では 位置は 動かない', () => {
    const l = mk();
    fill(l, 20);
    l.scroll(1);
    l.pickup('item19' as ItemId, 1);
    expect(l.ui().scrollRow).toBe(3);
  });

  it('host: open で タブ。ui().open は できごと タブのときだけ', () => {
    const l = mk();
    let tab: LogTab = 'items';
    let isOpen = false;
    const host: LogHost = { isOpen: () => isOpen, tab: () => tab, open: () => { isOpen = true; tab = 'log'; } };
    l.bindHost(host);
    expect(l.ui()).toMatchObject({ open: false, tab: 'items' });
    l.open();
    expect(l.ui()).toMatchObject({ open: true, tab: 'log' });
    tab = 'achievements';
    expect(l.ui().open).toBe(false);
  });
});
