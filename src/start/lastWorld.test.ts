// START-1 AC2: 前に 遊んだ 世界（「つづきから」）と 同じ シードの 保存を 調べる（仕様 §4.1・§4.2・§5）。
// 窓口の 名前（実装は これに 合わせる）: src/start/lastWorld.ts の
//   START_STORAGE_KEY = 'rikkun.start.v1'                  値は JSON `{"lastSeed": 5}`
//   readLastSeed(store: KeyValueStore | null): number | null   整数でない・こわれた JSON・例外 → null
//   saveLastSeed(store: KeyValueStore | null, seed: number): void   例外でも 止まらない。ほかの キーは そのまま
//   saveIdFor(seed: number): string                         ふだんの シード → 'vox-main'、ほかは `vox-seed-${seed}`
//   findSavedWorld(o: { db: PersistBackend | null; seed: number; nSections: number; timeoutMs?: number }):
//        Promise<{ strength: StrengthLevel } | null>
//        そのシードの 保存が「今の 読みこみと 同じ 決まりで 読める」とき だけ。決まり:
//          列が 1 つ以上 あり、最初の 列の gen が「読める 版」（3 以上 SAVE_GEN 以下。MINE-1A §4.8 で「SAVE_GEN と 同じ」から 広げた。
//          3 より 前〔2 まで〕と 今の 版より 新しい 保存は 読まない）・h（セクション数）が nSections と 同じ。
//          （meta の つよさ が あれば それ、なければ 'normal'）
//        db が null・返事が timeoutMs（既定 3000）ない・例外 → null（reject しない）
//   findContinue(o: { db; store; search: string; nSections: number; timeoutMs?: number }):
//        Promise<{ seed: number; strength: StrengthLevel } | null>
//        `?nosave=1`（search）→ db を 読まず null。lastSeed の 保存が あれば それ、なければ（または 読めなければ）
//        ふだんの シード（vox-main）を 見る。どちらも ない → null。全体で timeoutMs（既定 3000）。
import { describe, expect, it } from 'vitest';
import type { ChunkColumn } from '../contracts';
import { uniformSection } from '../world/sections';
import { GEN_CONFIG } from '../world/gen/config';
import { MemoryBackend, packColumn, SAVE_ID, type PersistBackend } from '../save/backend';
import { encodeSections } from '../save/chunkCodec';
import { SAVE_GEN, SAVE_VERSION } from '../save/SaveManager';
import { START_STORAGE_KEY, findContinue, findSavedWorld, readLastSeed, saveIdFor, saveLastSeed } from './lastWorld';

const NS = 2;
const DEFAULT = GEN_CONFIG.defaultSeed;

class Store {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
}

const col = (cx: number, cz: number): ChunkColumn => ({ cx, cz, sections: [uniformSection(1), uniformSection(0)] });

interface PutOpts {
  gen?: number;
  h?: number;
  strength?: string;
  noMeta?: boolean;
  metaSeed?: number;
  metaGen?: number;
  /** 最初の 列〔0, 0〕の ほかの 列（版が まざった 世界） */
  more?: Array<{ cx: number; cz: number; gen: number }>;
}
/** 保存を 1 つ 入れる（列 1 つ ＋ meta）。ふだんの 形 */
async function put(db: PersistBackend, seed: number, o: PutOpts = {}): Promise<void> {
  const id = saveIdFor(seed);
  const rec = await packColumn(0, 0, encodeSections(col(0, 0).sections), o.gen ?? SAVE_GEN, o.h ?? NS);
  const more = await Promise.all((o.more ?? []).map((c) => packColumn(c.cx, c.cz, encodeSections(col(c.cx, c.cz).sections), c.gen, o.h ?? NS)));
  const meta = o.noMeta ? null : { v: SAVE_VERSION, gen: o.metaGen ?? o.gen ?? SAVE_GEN, seed: o.metaSeed ?? seed, ...(o.strength ? { strength: o.strength } : {}) };
  await db.write(id, [rec, ...more], meta);
}

/** 読めない 古い 版（MINE-1A 前の 高さ 48 の 島。今も 読まない）。読める いちばん 古い 版は 3、MINE-1A で 作る 版は 4 */
const UNREADABLE_OLD = 2;
const OLDEST_READABLE = 3;
const MINE_1A_GEN = 4;

const search = (s = '') => s;

describe('AC2 saveIdFor', () => {
  it('ふだんの シード → vox-main、ほかは vox-seed-N', () => {
    expect(saveIdFor(DEFAULT)).toBe(SAVE_ID);
    expect(saveIdFor(DEFAULT)).toBe('vox-main');
    expect(saveIdFor(5)).toBe('vox-seed-5');
    expect(saveIdFor(0)).toBe('vox-seed-0');
  });
});

describe('AC2 lastSeed の 出し入れ', () => {
  it('キーは rikkun.start.v1', () => expect(START_STORAGE_KEY).toBe('rikkun.start.v1'));
  it('書いて 読む', () => {
    const s = new Store();
    saveLastSeed(s, 42);
    expect(JSON.parse(s.data.get(START_STORAGE_KEY)!).lastSeed).toBe(42);
    expect(readLastSeed(s)).toBe(42);
    saveLastSeed(s, 0);
    expect(readLastSeed(s)).toBe(0);
  });
  it('ない・こわれた・変な 値 → null', () => {
    expect(readLastSeed(new Store())).toBeNull();
    expect(readLastSeed(null)).toBeNull();
    for (const bad of ['', 'abc', '{', '[]', '{"lastSeed":"5"}', '{"lastSeed":1.5}', '{"lastSeed":null}', '{}']) {
      const s = new Store();
      s.data.set(START_STORAGE_KEY, bad);
      expect(readLastSeed(s), bad).toBeNull();
    }
  });
  it('読み書きで 例外が 出ても 止まらない', () => {
    const boom = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveLastSeed(boom, 3)).not.toThrow();
    expect(readLastSeed(boom)).toBeNull();
    expect(() => saveLastSeed(null, 3)).not.toThrow();
  });
});

describe('AC2 つづきから（findContinue）', () => {
  it('lastSeed 5 と vox-seed-5 の 保存 → つづきから seed 5（つよさも）', async () => {
    const db = new MemoryBackend();
    const store = new Store();
    await put(db, 5, { strength: 'hard' });
    saveLastSeed(store, 5);
    expect(await findContinue({ db, store, search: search(), nSections: NS })).toEqual({ seed: 5, strength: 'hard' });
  });
  it('つよさの ない 保存 → normal', async () => {
    const db = new MemoryBackend();
    const store = new Store();
    await put(db, 5);
    saveLastSeed(store, 5);
    expect(await findContinue({ db, store, search: search(), nSections: NS })).toEqual({ seed: 5, strength: 'normal' });
  });
  it('lastSeed 5 で 保存なし・vox-main あり → 20261012', async () => {
    const db = new MemoryBackend();
    const store = new Store();
    await put(db, DEFAULT, { strength: 'easy' });
    saveLastSeed(store, 5);
    expect(await findContinue({ db, store, search: search(), nSections: NS })).toEqual({ seed: DEFAULT, strength: 'easy' });
  });
  it('lastSeed なし・vox-main あり → 20261012', async () => {
    const db = new MemoryBackend();
    await put(db, DEFAULT);
    expect(await findContinue({ db, store: new Store(), search: search(), nSections: NS })).toEqual({ seed: DEFAULT, strength: 'normal' });
  });
  it('lastSeed が ふだんの シード → vox-main を 見る', async () => {
    const db = new MemoryBackend();
    const store = new Store();
    await put(db, DEFAULT, { strength: 'hard' });
    saveLastSeed(store, DEFAULT);
    expect(await findContinue({ db, store, search: search(), nSections: NS })).toEqual({ seed: DEFAULT, strength: 'hard' });
  });
  it('lastSeed も vox-main も 保存なし → null', async () => {
    const store = new Store();
    saveLastSeed(store, 5);
    expect(await findContinue({ db: new MemoryBackend(), store, search: search(), nSections: NS })).toBeNull();
    expect(await findContinue({ db: new MemoryBackend(), store: new Store(), search: search(), nSections: NS })).toBeNull();
  });
  it('lastSeed の 保存と vox-main の 両方 → lastSeed が 先', async () => {
    const db = new MemoryBackend();
    const store = new Store();
    await put(db, 5);
    await put(db, DEFAULT);
    saveLastSeed(store, 5);
    expect((await findContinue({ db, store, search: search(), nSections: NS }))?.seed).toBe(5);
  });
  it('他の シードの 保存だけ あって lastSeed が ない → null（勝手に 選ばない）', async () => {
    const db = new MemoryBackend();
    await put(db, 77);
    expect(await findContinue({ db, store: new Store(), search: search(), nSections: NS })).toBeNull();
  });

  it('gen が 読めない 古い 版（2）の 保存は ない と 同じ（lastSeed の 保存が 古い → vox-main に 移る）', async () => {
    const db = new MemoryBackend();
    const store = new Store();
    await put(db, 5, { gen: UNREADABLE_OLD });
    await put(db, DEFAULT);
    saveLastSeed(store, 5);
    expect((await findContinue({ db, store, search: search(), nSections: NS }))?.seed).toBe(DEFAULT);
  });
  it('gen が ちがう 保存だけ → null', async () => {
    const db = new MemoryBackend();
    const store = new Store();
    await put(db, DEFAULT, { gen: SAVE_GEN + 1, noMeta: true });
    saveLastSeed(store, DEFAULT);
    expect(await findContinue({ db, store, search: search(), nSections: NS })).toBeNull();
  });
  it('size（セクション数）が ちがう 保存は ない と 同じ', async () => {
    const db = new MemoryBackend();
    const store = new Store();
    await put(db, 5, { h: NS + 1, noMeta: true });
    saveLastSeed(store, 5);
    expect(await findContinue({ db, store, search: search(), nSections: NS })).toBeNull();
  });
  it('メニューを 出す あいだ、保存は 消さない・書かない（読めない 古い 版でも）', async () => {
    const db = new MemoryBackend();
    const store = new Store();
    await put(db, 5, { gen: UNREADABLE_OLD });
    saveLastSeed(store, 5);
    const before = db.writes;
    await findContinue({ db, store, search: search(), nSections: NS });
    expect(db.writes).toBe(before);
    expect(db.chunks.size).toBe(1);
  });

  it('?nosave=1 → null。IndexedDB は 読まない', async () => {
    const db = new MemoryBackend();
    const store = new Store();
    await put(db, 5);
    saveLastSeed(store, 5);
    const reads = () => db.readKeysCalls + db.readAllCalls + db.readChunkCalls;
    const before = reads();
    expect(await findContinue({ db, store, search: '?nosave=1&menu=1', nSections: NS })).toBeNull();
    expect(reads()).toBe(before);
  });
  it('db が null（IndexedDB が 使えない）→ null', async () => {
    const store = new Store();
    saveLastSeed(store, 5);
    expect(await findContinue({ db: null, store, search: search(), nSections: NS })).toBeNull();
  });
  it('返事が 3 秒（ここでは timeoutMs）ない → null。待ち続けない', async () => {
    const never = new Promise<never>(() => undefined);
    const hung = {
      readKeys: () => never,
      readAll: () => never,
      readChunk: () => never,
      write: () => never,
      replaceAll: () => never,
      clear: () => never,
    } as unknown as PersistBackend;
    const t0 = Date.now();
    expect(await findContinue({ db: hung, store: new Store(), search: search(), nSections: NS, timeoutMs: 30 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1500);
  });
  it('読んでいて 例外 → null（reject しない）', async () => {
    const bad = {
      readKeys: async () => {
        throw new Error('boom');
      },
      readChunk: async () => {
        throw new Error('boom');
      },
      readAll: async () => {
        throw new Error('boom');
      },
    } as unknown as PersistBackend;
    await expect(findContinue({ db: bad, store: new Store(), search: search(), nSections: NS })).resolves.toBeNull();
  });
});

describe('AC2・AC9 同じ シードの 保存（findSavedWorld）', () => {
  it('あれば つよさが 返る', async () => {
    const db = new MemoryBackend();
    await put(db, 1234, { strength: 'easy' });
    expect(await findSavedWorld({ db, seed: 1234, nSections: NS })).toEqual({ strength: 'easy' });
  });
  it('ない シード → null。ふだんの シードは vox-main を 見る', async () => {
    const db = new MemoryBackend();
    await put(db, DEFAULT, { strength: 'hard' });
    expect(await findSavedWorld({ db, seed: 1234, nSections: NS })).toBeNull();
    expect(await findSavedWorld({ db, seed: DEFAULT, nSections: NS })).toEqual({ strength: 'hard' });
  });
  it('gen（読めない 古い 版）・size が ちがう → null', async () => {
    const db = new MemoryBackend();
    await put(db, 1, { gen: UNREADABLE_OLD, noMeta: true });
    await put(db, 2, { h: NS + 1, noMeta: true });
    expect(await findSavedWorld({ db, seed: 1, nSections: NS })).toBeNull();
    expect(await findSavedWorld({ db, seed: 2, nSections: NS })).toBeNull();
  });
  it('db なし・返事なし → null', async () => {
    expect(await findSavedWorld({ db: null, seed: 1, nSections: NS })).toBeNull();
    const never = new Promise<never>(() => undefined);
    const hung = { readKeys: () => never, readChunk: () => never, readAll: () => never } as unknown as PersistBackend;
    expect(await findSavedWorld({ db: hung, seed: 1, nSections: NS, timeoutMs: 30 })).toBeNull();
  });
});

describe('MINE-1A A11・§4.8: 読める 版は 3 から 今の 版まで（「つづきから」に 出る）', () => {
  it('いちばん 古い 読める 版 3 の 保存は 出る（今の 版が 4 に なっても）', async () => {
    expect(SAVE_GEN, '版を 上げた あとで 版 3 を 読む').toBeGreaterThan(OLDEST_READABLE);
    const db = new MemoryBackend();
    await put(db, 5, { gen: OLDEST_READABLE, strength: 'hard' });
    expect(await findSavedWorld({ db, seed: 5, nSections: NS })).toEqual({ strength: 'hard' });
    const store = new Store();
    saveLastSeed(store, 5);
    expect(await findContinue({ db, store, search: search(), nSections: NS })).toEqual({ seed: 5, strength: 'hard' });
  });

  it('MINE-1A の 版 4 の 保存も 出る', async () => {
    const db = new MemoryBackend();
    await put(db, 5, { gen: MINE_1A_GEN });
    expect(await findSavedWorld({ db, seed: 5, nSections: NS })).toEqual({ strength: 'normal' });
  });

  it('版 3 と 4 の 列が まざった 世界は 出る（最初の 列が どちらの 版でも）', async () => {
    const db = new MemoryBackend();
    await put(db, 5, { gen: OLDEST_READABLE, more: [{ cx: 1, cz: 0, gen: MINE_1A_GEN }, { cx: 2, cz: 0, gen: OLDEST_READABLE }] });
    await put(db, 6, { gen: MINE_1A_GEN, more: [{ cx: 1, cz: 0, gen: OLDEST_READABLE }, { cx: 2, cz: 0, gen: MINE_1A_GEN }] });
    expect(await findSavedWorld({ db, seed: 5, nSections: NS }), '最初の 列が 版 3').not.toBeNull();
    expect(await findSavedWorld({ db, seed: 6, nSections: NS }), '最初の 列が 版 4').not.toBeNull();
  });

  it('版 2 は 読まない・今の 版より 新しい 保存も 読まない（今どおり）', async () => {
    const db = new MemoryBackend();
    await put(db, 5, { gen: UNREADABLE_OLD, noMeta: true });
    await put(db, 6, { gen: SAVE_GEN + 1, noMeta: true });
    expect(await findSavedWorld({ db, seed: 5, nSections: NS })).toBeNull();
    expect(await findSavedWorld({ db, seed: 6, nSections: NS })).toBeNull();
  });

  it('読める 版でも size（セクション数）が ちがえば 読まない', async () => {
    const db = new MemoryBackend();
    await put(db, 5, { gen: OLDEST_READABLE, h: NS + 1 });
    expect(await findSavedWorld({ db, seed: 5, nSections: NS })).toBeNull();
  });
});
