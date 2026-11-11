import { describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import { HouseBook } from './book';
import { houseShape, recordHouse } from './shape';
import { dugItemAt, kindBlocks, kindItem, lookBp, withKind, type LookBook } from './recipes/lookKit';

/** HOUSE-2B レビュー指摘: 形の 記録は 戸が こわれても のこる・新しい 家が かち・保存・知らない しゅるいは いつもの 物 */
const AT = { x: 40, y: 10, z: 50 };
const BASE = { w: 7 as const, d: 7 as const, windows: 2 };

describe('形の 記録（spec）', () => {
  it('おしろの 家の 戸を こわしても、やねを ほると おしろの アイテム', () => {
    const bp = withKind('roof', 'kawara_shiro', BASE);
    const book = new HouseBook() as LookBook;
    const rec = recordHouse(book, bp, 1, AT);
    const roof = houseShape(bp).cells.find((c) => c.look === 'kawara_shiro')!;
    const id = roof.id as BlockId;
    const item = kindItem('roof', 'kawara_shiro');
    expect(item).not.toBeNull();
    expect(kindBlocks('roof', 'kawara_shiro')).toContain(id);
    book.cellChanged(rec.door.x, rec.door.y, rec.door.z, 'air'); // 戸が こわれた
    expect(book.count()).toBe(0);
    expect(dugItemAt(book, id, AT.x + roof.x, AT.y + roof.y, AT.z + roof.z)).toBe(item);
  });

  it('戸が こわれた あとの 形も 保存して 読みこめる', () => {
    const bp = withKind('roof', 'kawara_kozan', BASE);
    const a = new HouseBook() as LookBook;
    const rec = recordHouse(a, bp, 1, AT);
    a.cellChanged(rec.door.x, rec.door.y, rec.door.z, 'air');
    const b = new HouseBook() as LookBook;
    b.restore(JSON.parse(JSON.stringify(a.serialize())));
    const c = houseShape(bp).cells.find((x) => x.look === 'kawara_kozan')!;
    expect(b.lookAt(AT.x + c.x, AT.y + c.y, AT.z + c.z)).toBe('kawara_kozan');
    expect(b.count()).toBe(0);
  });

  it('同じ 箱に あとから 建てた 家の しゅるいが かち', () => {
    const old = new HouseBook() as LookBook;
    const rec = recordHouse(old, withKind('roof', 'kawara_mura', BASE), 1, AT);
    old.cellChanged(rec.door.x, rec.door.y, rec.door.z, 'air'); // 古い 家は 戸だけ のこって いた のち 消えた
    recordHouse(old, withKind('roof', 'kawara_shiro', BASE), 2, AT);
    const c = houseShape(withKind('roof', 'kawara_shiro', BASE)).cells.find((x) => x.look === 'kawara_shiro')!;
    expect(old.lookAt(AT.x + c.x, AT.y + c.y, AT.z + c.z)).toBe('kawara_shiro');
  });

  it('知らない しゅるいを 保存で 読むと いつもの 物（AC7）', () => {
    const a = new HouseBook() as LookBook;
    recordHouse(a, lookBp(BASE), 1, AT);
    const saved = JSON.parse(JSON.stringify(a.serialize())) as Array<{ spec: Record<string, unknown> }>;
    saved[0]!.spec.roof = 'kawara_unknown';
    saved[0]!.spec.light = 'zzz';
    const b = new HouseBook() as LookBook;
    b.restore(saved);
    const s = b.specList()[0]!;
    expect(s.roof).toBe('flat');
    expect(s.light).toBe('lantern');
  });
});
