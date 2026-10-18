import { describe, expect, it } from 'vitest';
import { NO_DROP_BLOCKS } from '../../dig/config';
import { itemType } from '../../inventory/items';
import { BLOCK_TYPES } from './blockTypes';

/**
 * #184-AC10: 新しい地形のブロック 6 種（ゆき・もみじの はっぱ・まつの はっぱ・はな 3 色・たけ・すすき）の役わり（VOX-I §5）。
 * ブロックの id は docs/tickets/VOX-I-1.md の「つなぎ目」: snow / momiji_leaves / matsu_leaves / flower_*（3 つ）/ bamboo / susuki。
 * 絵・形は #185。ここは「固い・こわせる・持てる・置ける」だけ。
 */

const type = (id: string) => BLOCK_TYPES.find((t) => t.id === id);
const flowers = BLOCK_TYPES.filter((t) => t.id.startsWith('flower_')).map((t) => t.id);

describe('#184-AC10: 新しいブロックの役わり', () => {
  it('ゆき・もみじの はっぱ・まつの はっぱ は 固くて こわせて 持てて 置ける', () => {
    for (const id of ['snow', 'momiji_leaves', 'matsu_leaves']) {
      expect(type(id), id).toBeDefined();
      expect(type(id)!.solid, id).toBe(true);
      expect(type(id)!.breakable, id).toBe(true);
      expect(NO_DROP_BLOCKS.has(id as never), id).toBe(false);
      expect(itemType(id)?.placeBlock, id).toBe(id);
    }
  });

  it('はな（3 色）は 通れて（固くない）、こわすと 持ち物になり、置ける', () => {
    expect(flowers).toHaveLength(3);
    for (const id of flowers) {
      expect(type(id)!.solid, id).toBe(false);
      expect(type(id)!.breakable, id).toBe(true);
      expect(NO_DROP_BLOCKS.has(id as never), id).toBe(false);
      expect(itemType(id)?.placeBlock, id).toBe(id);
    }
  });

  it('たけ は 固くて（通れない）こわせて 持てて 置ける', () => {
    expect(type('bamboo')).toBeDefined();
    expect(type('bamboo')!.solid).toBe(true);
    expect(type('bamboo')!.breakable).toBe(true);
    expect(NO_DROP_BLOCKS.has('bamboo' as never)).toBe(false);
    expect(itemType('bamboo')?.placeBlock).toBe('bamboo');
  });

  it('すすき は 通れて、こわすと 消えて 持ち物がふえない（置けるものにもならない）', () => {
    expect(type('susuki')).toBeDefined();
    expect(type('susuki')!.solid).toBe(false);
    expect(type('susuki')!.breakable).toBe(true);
    expect(NO_DROP_BLOCKS.has('susuki' as never)).toBe(true);
    expect(itemType('susuki')?.placeBlock ?? null).toBeNull();
  });

  it('ほかのブロックは 持ち物がふえる（NO_DROP_BLOCKS は すすき と くさ だけ。FLORA-75）', () => {
    expect([...NO_DROP_BLOCKS]).toEqual(['susuki', 'kusa']);
  });
});
