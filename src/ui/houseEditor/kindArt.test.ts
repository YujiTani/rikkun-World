import { describe, expect, it } from 'vitest';
import { ALL_KINDS, LIGHT_KINDS, PARTS, PART_FORMS, STYLES, kindsOfForm } from '../../house/recipes/kinds';
import { kindArt, lightArt, placeArt } from './kindArt';

/** clipPath の 通し番号は 1 回ごとに かわる ので 比べる ときは ぬく */
const flat = (s: string): string => s.replace(/ka\d+/g, 'ka');

describe('しゅるいの ボタンの 絵（HOUSE-2B。アートの 32×32 の ドット絵）', () => {
  it('知って いる しゅるいは ぜんぶ 絵が ある（足し忘れが ない）', () => {
    for (const part of PARTS) {
      for (const kind of ALL_KINDS[part]) expect(kindArt(part, kind), `${part}-${kind}`).toMatch(/^<svg /);
    }
  });

  it('同じ ばしょの しゅるいは ぜんぶ ちがう 絵（小さな 絵でも 見分けられる）', () => {
    for (const part of PARTS) {
      const arts = ALL_KINDS[part].map((k) => flat(kindArt(part, k)));
      expect(new Set(arts).size, `${part} の 絵が かぶる`).toBe(arts.length);
    }
  });

  it('同じ 形の 3 つ（むら・おしろ・こうざん）は 絵が ちがう', () => {
    for (const part of PARTS) {
      for (const form of PART_FORMS[part]) {
        const arts = kindsOfForm(form).map((k) => flat(kindArt(part, k)));
        expect(new Set(arts).size, `${part} ${form}`).toBe(kindsOfForm(form).length);
        if (arts.length > 1) expect(arts.length).toBe(STYLES.length);
      }
    }
  });

  it('「なし」は 点線の わく（ドット絵。色は #E6DEC8 の 1 色・✕・赤い 線は 使わない）', () => {
    for (const part of ['roof', 'wall', 'window'] as const) {
      const a = kindArt(part, 'none');
      expect([...a.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1]!.toUpperCase()), part).toEqual(['#E6DEC8']);
      expect(a, part).toContain('crispEdges');
    }
  });

  it('ばしょの ボタンの 絵・あかりの 絵が ある', () => {
    for (const part of PARTS) expect(placeArt(part)).toMatch(/^<svg /);
    for (const kind of LIGHT_KINDS) expect(lightArt(kind), kind).toMatch(/^<svg /);
  });

  it('絵に 漢字・字は 入れない（絵だけ。字は ボタンの 外に 出す）', () => {
    for (const part of PARTS) for (const kind of ALL_KINDS[part]) expect(kindArt(part, kind)).not.toContain('<text');
  });
});
