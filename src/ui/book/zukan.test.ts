import { describe, expect, it } from 'vitest';
import { ITEM_DEFS } from '../../content/items/registry';
import { rarityIndex } from '../../drops/rarityTable';
import { findUnrubiedKanji, withRuby } from '../text';
import { BookModel } from './bookModel';
import { buildBook } from './bookNav';
import { ZUKAN_GROUPS, ZUKAN_SHADOW_INDEX, ZUKAN_SPREAD, filterZukan, normalizeKana, zukanBodyHtml, zukanEntries, zukanPages } from './zukanData';

/** ZUKAN-1: 本の アイテム ずかん（データと 流れ。画面なし） */
const book = buildBook([{ id: 'a', label: 'エー', icon: 'a' }], [{ id: 'a1', chapter: 'a' }]);

function make() {
  const m = new BookModel(book, { reduced: () => true });
  const settle = () => {
    let n = 0;
    while (m.anim !== 'none' && n++ < 2000) m.tick();
  };
  m.openFromButton();
  settle();
  return { m, settle };
}

describe('ずかんの データ', () => {
  const all = zukanEntries();

  it('登録表の 全アイテムが 1 回ずつ のる', () => {
    const ids = all.map((e) => e.id as string);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(ITEM_DEFS).sort());
  });

  it('影は レア度 7 以上の 物だけ', () => {
    for (const e of all) expect(e.shadow, e.id).toBe(rarityIndex(e.rarity) >= ZUKAN_SHADOW_INDEX);
    expect(all.some((e) => e.shadow)).toBe(true);
  });

  it('さがす: ひらがな・カタカナ・空白・漢字の よみ どれでも 見つかる', () => {
    expect(normalizeKana('カタナ')).toBe('かたな');
    const katana = all.find((e) => e.key === 'かたな')!;
    expect(filterZukan(all, 'かたな', null)).toContain(katana.id);
    expect(filterZukan(all, 'カタナ', null)).toContain(katana.id);
    // 漢字の 名前は よみで 見つかる（ルビ記法の よみ）
    const kanji = all.find((e) => e.name.includes('｜'))!;
    expect(filterZukan(all, kanji.key.slice(0, 2), null)).toContain(kanji.id);
    expect(filterZukan(all, 'ぜったい ない なまえ', null)).toEqual([]);
  });

  it('組で しぼる・字が 空なら ぜんぶ', () => {
    expect(filterZukan(all, '', null)).toHaveLength(all.length);
    const w = filterZukan(all, '', 'weapon');
    expect(w.length).toBeGreaterThan(0);
    expect(w.every((id) => all.find((e) => e.id === id)!.group === 'weapon')).toBe(true);
  });
});

describe('ずかんの 並び', () => {
  const all = zukanEntries();

  it('レア度の 低い 順 → 同じ レア度の 中は 組（ぶき・ぼうぐ・どうぐ・たべもの・しょくぶつ・ブロック・くらし・ざいりょう）の 順 → 同じ 組の 中は あいうえお 順', () => {
    const g = (id: string) => ZUKAN_GROUPS.findIndex((x) => x.id === all.find((e) => e.id === id)!.group);
    let sameGroupPairs = 0;
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1]!;
      const b = all[i]!;
      const [ra, rb] = [rarityIndex(a.rarity), rarityIndex(b.rarity)];
      expect(ra <= rb, `${a.id}（レア度 ${ra}）→ ${b.id}（${rb}）`).toBe(true);
      if (ra !== rb) continue;
      expect(g(a.id) <= g(b.id), `${a.id}（${a.group}）→ ${b.id}（${b.group}）`).toBe(true);
      if (g(a.id) !== g(b.id)) continue;
      sameGroupPairs++;
      expect(a.key.localeCompare(b.key, 'ja') <= 0, `${a.id}（${a.key}）→ ${b.id}（${b.key}）`).toBe(true);
    }
    expect(sameGroupPairs).toBeGreaterThan(20);
    // 影（レア度 7 以上）は いちばん うしろ
    const firstShadow = all.findIndex((e) => e.shadow);
    expect(all.slice(firstShadow).every((e) => e.shadow)).toBe(true);
  });

  it('組で しぼっても 同じ 並び（全体の 並びの 一部）', () => {
    for (const g of ['weapon', 'armor', 'tool', 'food', 'plant', 'block', 'home', 'material'] as const) {
      expect(filterZukan(all, '', g), g).toEqual(all.filter((e) => e.group === g).map((e) => e.id));
    }
  });
});

/**
 * 読み物の 文（登録表の `zukan`）。漢字は 小 1・小 2 の 漢字（学年別漢字配当表の 240 字）か、アイテムの 名前に ある 漢字だけ。
 * 240 字の 表は ここ 1 か所。
 */
const GRADE_1 = '一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六';
const GRADE_2 =
  '引羽雲園遠何科夏家歌画回会海絵外角楽活間丸岩顔汽記帰弓牛魚京強教近兄形計元言原戸古午後語工公広交光考行高黄合谷国黒今才細作算止市矢姉思紙寺自時室社弱首秋週春書少場色食心新親図数西声星晴切雪船線前組走多太体台地池知茶昼長鳥朝直通弟店点電刀冬当東答頭同道読内南肉馬売買麦半番父風分聞米歩母方北毎妹万明鳴毛門夜野友用曜来里理話';
const KANJI = /[一-鿿㐀-䶿]/;
const MARKED = /［([^｜］]+)｜([^］]+)］/g;

describe('ずかんの 読み物の 文', () => {
  const entries = zukanEntries();
  const nameKanji = new Set([...Object.values(ITEM_DEFS).map((d) => d.name).join('')].filter((c) => KANJI.test(c)));
  const allowed = new Set([...GRADE_1, ...GRADE_2, ...nameKanji]);

  it('学年別漢字配当表の 小 1（80 字）・小 2（160 字）の 表', () => {
    expect([...GRADE_1]).toHaveLength(80);
    expect([...GRADE_2]).toHaveLength(160);
    expect(new Set([...GRADE_1, ...GRADE_2]).size).toBe(240);
  });

  it('全アイテムに ある・空でない', () => {
    expect(entries).toHaveLength(Object.keys(ITEM_DEFS).length);
    for (const e of entries) expect(e.text.trim(), e.id).not.toBe('');
  });

  it('［｜］の 外に 漢字が ない・かっこが 閉じて いる・よみは かな だけ', () => {
    for (const e of entries) {
      const outside = e.text.replace(MARKED, '');
      expect(KANJI.test(outside), `${e.id}: ［｜］の 外に 漢字`).toBe(false);
      expect(/[［］｜]/.test(outside), `${e.id}: かっこが 閉じて いない`).toBe(false);
      for (const m of e.text.matchAll(MARKED)) expect(m[2], `${e.id}: ${m[0]} の よみ`).toMatch(/^[ぁ-ゖァ-ヺー]+$/);
    }
  });

  it('［｜］の 中の 漢字は 小 1・小 2 の 漢字か、アイテムの 名前に ある 漢字だけ', () => {
    expect(nameKanji.size).toBeGreaterThan(0);
    for (const e of entries) {
      for (const m of e.text.matchAll(MARKED)) {
        for (const c of m[1]!) if (KANJI.test(c)) expect(allowed.has(c), `${e.id}: 「${c}」（${m[0]}）`).toBe(true);
      }
    }
  });

  it('ずかんの ページの「どんな もの」に zukan の 文が ルビつきで 出る', () => {
    for (const e of entries) {
      const html = zukanBodyHtml(e, 'てに いれかた');
      expect(html, e.id).toContain(`data-zukan-use>${withRuby(ITEM_DEFS[e.id as keyof typeof ITEM_DEFS].zukan)}</p>`);
      expect(html, e.id).toContain(`data-item-id="${e.id}"`);
      expect(findUnrubiedKanji(html), e.id).toEqual([]);
    }
  });
});

describe('ずかんの 流れ', () => {
  it('もくじ → ずかん → アイテム → もどる → もどる で もくじ', () => {
    const { m, settle } = make();
    m.openZukan();
    settle();
    expect(m.view).toBe('zukan');
    expect(m.links()).toEqual(m.zukanIds().slice(0, ZUKAN_SPREAD));
    const id = m.links()[0];
    m.openZukanItem(id);
    settle();
    expect(m.view).toBe('zukanItem');
    expect(m.item).toBe(id);
    m.back();
    settle();
    expect(m.view).toBe('zukan');
    m.escape();
    settle();
    expect(m.view).toBe('toc');
  });

  it('さがすと 1 見開き目に もどり、▶ で となりの 見開き・アイテムの ◀▶ は しぼった 中で', () => {
    const { m, settle } = make();
    m.openZukan();
    settle();
    const total = zukanPages(m.zukanIds().length);
    expect(total).toBeGreaterThan(1);
    m.step(1);
    settle();
    expect(m.zukanPage).toBe(2);
    m.setZukanFilter('かたな', null);
    expect(m.zukanPage).toBe(1);
    const ids = m.zukanIds();
    expect(ids.length).toBeGreaterThan(1);
    m.openZukanItem(ids[0]);
    settle();
    m.step(1);
    settle();
    expect(m.item).toBe(ids[1]);
    m.step(-1);
    settle();
    m.step(-1);
    settle();
    expect(m.item).toBe(ids[0]);
    expect(m.bumps).toBe(1);
  });

  it('ずかんを ひらきなおすと さがす 字は 空', () => {
    const { m, settle } = make();
    m.openZukan();
    settle();
    m.setZukanFilter('かたな', 'weapon');
    m.toToc();
    settle();
    m.openZukan();
    settle();
    expect(m.zukanQuery).toBe('');
    expect(m.zukanGroup).toBeNull();
  });

  it('jump: zukan・zukan:<id>', () => {
    const { m } = make();
    const id = zukanEntries()[40].id;
    m.jump(`zukan:${id}`);
    expect(m.view).toBe('zukanItem');
    expect(m.zukanPage).toBe(Math.floor(40 / ZUKAN_SPREAD) + 1);
    m.jump('zukan');
    expect(m.view).toBe('zukan');
  });
});
