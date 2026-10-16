import { expect, test } from '@playwright/test';
import { openBal } from './helpers/bal';

/**
 * BAL-G（#115）の受け入れ基準（docs/tickets/BAL-G.md、BALANCE.md §5・§6、DESIGN 13 章）のうち ゲームを動かして確かめる物。
 * 数・ファイルは ユニット（titleSound*.test.ts・variants.test.ts・nickMarks.test.ts など）が見る。
 * 見た目の好み（AC21〜AC24）は オーナー確認。
 *
 * 窓口（tester が決めた名前。開発はこの形で作る）:
 *  - `combat.sounds()`: 鳴らす頼み・鳴らした音の名前の列（`src/fx/soundLog.ts` の drainSounds。呼ぶと空）。
 *      二つ名の出現音の「鳴らす頼み」は 出来事 1 回で `appear_oyabun` / `appear_taisho` / `appear_nushi` を 1 回
 *      （音ファイルを読めたかに 関係なく。実際に鳴ったかは ここでは見ない）。たおしたときは 今の `defeat`。
 *  - `yokai.palette(id)`: { stage: 1|2|3, brightness, colors: number[], textureColors: number[] }
 *      colors = 材料（テクスチャなし）の色の 16 進数、textureColors = ぬりかべの もよう（2 色のテクスチャ）の色
 *  - `yokai.marks(id)`: { mark: 'none'|'hachimaki'|'crown', markColors: number[], markOnHead: boolean,
 *                          glow: null | { color, opacity, additive: boolean, lift: number（地面から うかせた 高さ ÷ 体の高さ）} }
 */
test.describe.configure({ timeout: 180_000 });

const STEPS_PAST_NUSHI = 5.2 * 60 + 30;

test.describe('BAL-G 二つ名の出現音（AC20 (3)(4)）', () => {
  test('出来事 1 回で その二つ名の「鳴らす頼み」が 1 回', async ({ page }) => {
    await openBal(page);
    const r = await page.evaluate((past) => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      const out: any = {};
      for (const t of ['oyabun', 'taisho', 'nushi']) {
        h.yokai.clear();
        h.step(past);
        T.sounds();
        h.yokai.spawn('karakasa', 6.5, 9, 6.5, { ai: false, title: t, m: 1 });
        h.step(5);
        out[t] = T.sounds('appear_');
      }
      h.yokai.clear();
      h.step(past);
      T.sounds();
      h.yokai.spawn('karakasa', 6.5, 9, 6.5, { ai: false, title: 'none', m: 1 });
      h.step(5);
      out.none = T.sounds('appear_');
      return out;
    }, STEPS_PAST_NUSHI);
    expect(r.oyabun).toEqual(['appear_oyabun']);
    expect(r.taisho).toEqual(['appear_taisho']);
    expect(r.nushi).toEqual(['appear_nushi']);
    expect(r.none).toEqual([]);
  });

  test('鳴っている間の 2 体目は 頼まない。聞こえる長さ（ヌシ 5.2 秒）が すぎれば また頼む', async ({ page }) => {
    await openBal(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      h.yokai.spawn('karakasa', 6.5, 9, 3.5, { ai: false, title: 'nushi', m: 1 });
      h.step(30);
      h.yokai.spawn('karakasa', 6.5, 9, 9.5, { ai: false, title: 'oyabun', m: 1 });
      h.step(30);
      const during = T.sounds('appear_');
      const events = h.yokai.events().filter((e: any) => e.type === 'titleSound').map((e: any) => e.title);
      h.step(Math.ceil(5.2 * 60)); // 合わせて 5.2 秒をすぎる
      h.yokai.spawn('karakasa', 6.5, 9, 12 - 0.5, { ai: false, title: 'oyabun', m: 1 });
      h.step(5);
      return { during, events, after: T.sounds('appear_') };
    });
    expect(r.during).toEqual(['appear_nushi']);
    // 出来事は 2 体とも 出る（音だけ 重ねない）
    expect(r.events).toEqual(['nushi', 'oyabun']);
    expect(r.after).toEqual(['appear_oyabun']);
  });

  test('たおした音は 二つ名でも 今の「ポン」（defeat）のまま。出現音は 鳴らさない', async ({ page }) => {
    await openBal(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      const id = h.yokai.spawn('karakasa', 6.5, 9, 6.5, { ai: false, yawDeg: 270, title: 'taisho', m: 1 });
      h.step(5);
      T.sounds();
      h.yokai.setHp(id, 1);
      const faced = T.faceTo(id);
      T.punch();
      h.step(70);
      const names: string[] = T.sounds();
      return { faced, names, gone: !T.one(id) || T.one(id).hp <= 0 };
    });
    expect(r.faced).toBe(true);
    expect(r.gone).toBe(true);
    expect(r.names).toContain('defeat');
    expect(r.names.filter((n) => n.startsWith('appear_'))).toEqual([]);
  });
});

test.describe('BAL-G 色ちがい 3 段階（DESIGN 13.1）', () => {
  // M → 段階: 1・1.49 → 1、1.5・2.24 → 2、2.25・3 → 3
  const STAGE_COLOR: Record<string, Record<number, number>> = {
    karakasa: { 1: 0xe0503a, 2: 0x9aaaff, 3: 0xffc83d },
    chochin: { 1: 0xffb347, 2: 0xbcd2ff, 3: 0xfff05a },
    rokurokubi: { 1: 0x6f84e8, 2: 0xc29cf2, 3: 0xffc83d },
  };
  test('昼: M に合わせて 段階 1・2・3 の 色（表の色）になる。上乗せではない', async ({ page }) => {
    await openBal(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      const out: any[] = [];
      for (const kind of ['karakasa', 'chochin', 'rokurokubi', 'nurikabe']) {
        for (const m of [1, 1.5, 2.25]) {
          h.yokai.clear();
          const id = h.yokai.spawn(kind, 6.5, 9, 6.5, { ai: false, title: 'none', m });
          h.step(3);
          out.push({ kind, m, p: h.yokai.palette(id) });
        }
      }
      return out;
    });
    for (const row of r) {
      const stage = row.m < 1.5 ? 1 : row.m < 2.25 ? 2 : 3;
      expect(row.p.stage, `${row.kind} M=${row.m}`).toBe(stage);
      expect(row.p.brightness, '昼は 明るさ 1').toBe(1);
      if (row.kind === 'nurikabe') {
        const want = { 1: [0xa39b8b, 0x8a8273], 2: [0xb2bce6, 0x8e99cc], 3: [0xf2cc6a, 0xd9a940] }[stage as 1 | 2 | 3]!;
        expect([...row.p.textureColors].sort()).toEqual([...want].sort());
      } else {
        expect(row.p.colors, `${row.kind} 段階${stage}`).toContain(STAGE_COLOR[row.kind]![stage]);
      }
    }
  });

  test('夜: 暗くなっても 3 段階の 色は ちがう。ちょうちんの どうは 暗くしない', async ({ page }) => {
    await openBal(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      h.time.set(70000);
      h.step(5);
      const out: any = { karakasa: [], chochin: [] };
      for (const m of [1, 1.5, 2.25]) {
        h.yokai.clear();
        const a = h.yokai.spawn('karakasa', 6.5, 9, 6.5, { ai: false, title: 'none', m });
        h.step(3);
        out.karakasa.push(h.yokai.palette(a));
        h.yokai.clear();
        const c = h.yokai.spawn('chochin', 6.5, 9, 6.5, { ai: false, title: 'none', m });
        h.step(3);
        out.chochin.push(h.yokai.palette(c));
      }
      return out;
    });
    for (const p of r.karakasa) expect(p.brightness).toBeLessThan(1);
    const key = (p: any) => [...p.colors].sort().join(',');
    expect(new Set(r.karakasa.map(key)).size).toBe(3);
    // どうは もとの（表の）色のまま
    [0xffb347, 0xbcd2ff, 0xfff05a].forEach((c, i) => expect(r.chochin[i].colors, `ちょうちん 段階${i + 1}`).toContain(c));
  });
});

test.describe('BAL-G 頭の印・ヌシの光（DESIGN 13.2）', () => {
  test('おやぶん・なしは 印なし、たいしょう = はちまき、ヌシ = かんむり＋光。ぬりかべは 印なし', async ({ page }) => {
    await openBal(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      const get = (kind: string, title: string) => {
        h.yokai.clear();
        const id = h.yokai.spawn(kind, 6.5, 9, 6.5, { ai: false, title, m: 1 });
        h.step(3);
        return h.yokai.marks(id);
      };
      const out: any = {};
      for (const k of ['karakasa', 'chochin', 'rokurokubi']) for (const t of ['none', 'oyabun', 'taisho', 'nushi']) out[`${k}_${t}`] = get(k, t);
      out.nurikabe_nushi = get('nurikabe', 'nushi');
      out.nurikabe_taisho = get('nurikabe', 'taisho');
      return out;
    });
    for (const k of ['karakasa', 'chochin', 'rokurokubi']) {
      for (const t of ['none', 'oyabun']) {
        expect(r[`${k}_${t}`].mark, `${k} ${t}`).toBe('none');
        expect(r[`${k}_${t}`].glow).toBeNull();
      }
      const ta = r[`${k}_taisho`];
      expect(ta.mark).toBe('hachimaki');
      expect(ta.markOnHead).toBe(true);
      expect(new Set(ta.markColors)).toEqual(new Set([0xfff6e0, 0x3d5a9e]));
      expect(ta.glow).toBeNull();
      const nu = r[`${k}_nushi`];
      expect(nu.mark).toBe('crown');
      expect(nu.markOnHead).toBe(true);
      expect(new Set(nu.markColors)).toEqual(new Set([0xffd23f, 0xd9a520, 0x5fd3ff]));
      expect(nu.glow).not.toBeNull();
      expect(nu.glow.color).toBe(0xfff0b0);
      expect(nu.glow.additive).toBe(true);
      expect(nu.glow.opacity).toBeGreaterThanOrEqual(0.06 - 1e-9);
      expect(nu.glow.opacity).toBeLessThanOrEqual(0.12 + 1e-9);
      expect(nu.glow.lift).toBeCloseTo(0.1, 2);
    }
    expect(r.nurikabe_nushi.mark).toBe('none');
    expect(r.nurikabe_nushi.glow).toBeNull();
    expect(r.nurikabe_taisho.mark).toBe('none');
  });

  test('ヌシの光: 2.5 秒で ゆっくり変わる（点滅しない）。夜も 暗くしない。印は 夜に 暗くなる', async ({ page }) => {
    await openBal(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      const id = h.yokai.spawn('karakasa', 6.5, 9, 6.5, { ai: false, title: 'nushi', m: 1 });
      h.step(3);
      const series: number[] = [];
      for (let i = 0; i < 300; i++) {
        h.step(1);
        series.push(h.yokai.marks(id).glow.opacity);
      }
      const day = h.yokai.marks(id);
      h.time.set(70000);
      h.step(5);
      const night = h.yokai.marks(id);
      return { series, day, night };
    });
    const s = r.series as number[];
    expect(Math.max(...s)).toBeLessThanOrEqual(0.12 + 1e-9);
    expect(Math.min(...s)).toBeGreaterThanOrEqual(0.06 - 1e-9);
    expect(Math.max(...s) - Math.min(...s)).toBeGreaterThan(0.03); // 動いている
    // なめらか: 1 ステップの変わりは 小さい。明暗が 反対に 変わる 回数は 5 秒（300 ステップ）で 4 回以下（周期 2.5 秒）
    for (let i = 1; i < s.length; i++) expect(Math.abs(s[i]! - s[i - 1]!)).toBeLessThan(0.01);
    let turns = 0;
    let dir = 0;
    for (let i = 1; i < s.length; i++) {
      const d = Math.sign(s[i]! - s[i - 1]!);
      if (d !== 0 && dir !== 0 && d !== dir) turns++;
      if (d !== 0) dir = d;
    }
    expect(turns).toBeLessThanOrEqual(5);
    // 夜: 光の色は そのまま、印の色は 暗い
    expect(r.night.glow.color).toBe(0xfff0b0);
    expect(r.night.glow.opacity).toBeGreaterThanOrEqual(0.06 - 1e-9);
    expect(r.night.markColors.join()).not.toBe(r.day.markColors.join());
  });
});

test.describe('BAL-G 登場のおしらせの アイコン（AC19・AC23）', () => {
  test('★ の文字ではなく、48px の ドット絵（ぼかさない）', async ({ page }) => {
    await openBal(page);
    for (const title of ['taisho', 'nushi']) {
      const r = await page.evaluate((t) => {
        const T = (window as any).T;
        const h = (window as any).__rikkun;
        T.base();
        h.yokai.clear();
        h.step(400);
        h.yokai.spawn('karakasa', 6.5, 9, 6.5, { ai: false, title: t, m: 1 });
        h.step(3);
        const el = document.querySelector('#title-announce .title-announce-icon') as HTMLElement | null;
        if (!el) return null;
        const visual = el.matches('canvas,img') ? el : (el.querySelector('canvas,img') as HTMLElement | null);
        const box = (visual ?? el).getBoundingClientRect();
        return {
          text: el.textContent ?? '',
          hasVisual: !!visual,
          w: Math.round(box.width),
          h: Math.round(box.height),
          rendering: getComputedStyle(visual ?? el).imageRendering,
          announceIcon: h.hud.announce()?.icon,
        };
      }, title);
      expect(r, 'おしらせの アイコンの 要素が 無い').not.toBeNull();
      expect(r!.announceIcon).toBe(title);
      expect(r!.text).not.toContain('★');
      expect(r!.hasVisual).toBe(true);
      expect(r!.w).toBe(48);
      expect(r!.h).toBe(48);
      expect(['pixelated', 'crisp-edges']).toContain(r!.rendering);
    }
  });
});
