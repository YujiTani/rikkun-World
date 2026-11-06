import { describe, expect, it } from 'vitest';
import { PickupLogModel, liveRowText } from './pickupLogModel';
import { LogSystem } from './log/LogSystem';
import { signalText } from './noticeModel';

describe('左の ログの 宝箱の 行〔重大 1〕', () => {
  it('liveRowText: chest は 文を そのまま', () => {
    expect(liveRowText('chest', 'x', 1, 'たからばこ から A を てにいれた！')).toBe('たからばこ から A を てにいれた！');
  });
  it('宝箱の 行は まとめない・ほかの 行と まざらない', () => {
    const m = new PickupLogModel();
    m.push('dirt', 2);
    m.push('diamond', 1, 'chest', '文 1');
    m.push('diamond', 1, 'chest', '文 2');
    expect(m.rows().map((r) => [r.kind, r.text])).toEqual([['pickup', undefined], ['chest', '文 1'], ['chest', '文 2']]);
    expect(m.list().map((r) => r.item)).toEqual(['dirt']);
  });
  it('log.chestGot: live() に kind chest の 行が 1 つ・文は 履歴と 同じ', () => {
    const l = new LogSystem();
    l.chestGot('たからばこ から ダイヤ を てにいれた！', 'diamond');
    const live = l.live().filter((r) => r.kind === 'chest');
    expect(live).toHaveLength(1);
    expect(live[0]!.text).toBe(l.history()[0]!.text);
  });
});

describe('「からっぽ だよ」の 字', () => {
  it('合図 chestEmpty は 字で 出る', () => {
    expect(signalText('chestEmpty')).toBe('からっぽ だよ');
  });
});
