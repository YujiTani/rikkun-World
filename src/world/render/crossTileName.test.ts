import { describe, expect, it } from 'vitest';
import { blockIndexOf } from '../blocks/blockTypes';
import { crossTileName } from './meshChunk';

describe('crossTileName（十字の板の 絵の 名前）', () => {
  it('ひまわりは 2 段で 別々の 絵（下 = くき、上 = 花）。id と おなじ 名前の 絵は ない', () => {
    expect(crossTileName(blockIndexOf('himawari'), 3)).toBe('himawari_shita');
    expect(crossTileName(blockIndexOf('himawari_top'), 3)).toBe('himawari_ue');
  });
});
