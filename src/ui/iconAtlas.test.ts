import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import index from '../assets/icons32.json';
import { ICON_SIZE, hasAtlasIcon } from './iconAtlas';
import { itemIconPixels } from './itemIcon';
import { ITEM_DEFS } from '../content/items/registry';
import type { ItemId } from '../contracts/items';

describe('ICON-32 アトラス', () => {
  it('大きさは 32、表の id は 全部 アイテム', () => {
    expect(ICON_SIZE).toBe(32);
    expect(index.size).toBe(ICON_SIZE);
    for (const id of index.ids) expect(id in ITEM_DEFS, id).toBe(true);
  });
  it('PNG の 大きさが 表と あう', () => {
    const png = readFileSync('src/assets/icons32.png');
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    expect(w).toBe(index.cols * ICON_SIZE);
    expect(h).toBe(Math.ceil(index.ids.length / index.cols) * ICON_SIZE);
  });
  it('どの アイテムも 32×32 か 16×16 の 代わりが ある', () => {
    for (const id of Object.keys(ITEM_DEFS) as ItemId[]) {
      if (!hasAtlasIcon(id)) expect(itemIconPixels(id).length, id).toBe(256);
    }
  });
});
