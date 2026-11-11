import { describe, expect, it } from 'vitest';
import { chestShowsToP1 } from './p2Chest';

describe('宝箱の ログ・ホットバー（COOP-1 5b レビュー: 2P の ログは 出さない）', () => {
  it('1P が あけた ときだけ 1P の ログ・ホットバーに 出す。2P が あけた ときは 出さない', () => {
    expect(chestShowsToP1(1)).toBe(true);
    expect(chestShowsToP1(2)).toBe(false);
  });
});
