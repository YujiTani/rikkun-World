import { describe, expect, it } from 'vitest';
import { ALL_KINDS, LIGHT_KINDS, PARTS, PART_FORMS, STYLES, kindsOfForm } from '../../house/recipes/kinds';
import { kindArt, lightArt, placeArt } from './kindArt';

/** clipPath の 通し番号は 1 回ごとに かわる ので 比べる ときは ぬく */
const flat = (s: string): string => s.replace(/ka\d+/g, 'ka');

describe('しゅるいの ボタンの 絵（仮。HOUSE-2B で かえる）', () => {
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

  it('「なし」は 点線の わく（✕・赤い 斜線は 使わない）', () => {
    for (const part of ['roof', 'wall', 'window'] as const) {
      const a = kindArt(part, 'none');
      expect(a, part).toContain('stroke-dasharray');
      expect(a, part).not.toContain('M5 5l14 14'); // ✕ の 線
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
