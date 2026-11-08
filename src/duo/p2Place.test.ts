import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { AchievementSystem } from '../achievements/AchievementSystem';
import { CountryWatch, COUNTRY_ENTER_STEPS } from '../achievements/countryWatch';
import type { MineAchEvent } from '../achievements/feedStats';
import { createPlaceWatch } from './p2Place';

/**
 * COOP-1 5b（docs/design/COOP-1.md 1.14 §3.7 (c) ⑤・AC151）の 先行テスト（赤）。場所の 実績（ダンジョンの いちばん 下・ほらあな・かくしべや など）と
 * 国の 見はり（countryWatch）を 2 人分。いま `game/wire/save.ts` の `updateAchievements` は 1P の 場所だけ 見る。
 * どちらかが 入ったら 実績・出来事が 出る。種類ごとに 1 回は 今の まま（実績の 側が 1 回に する。AchievementSystem の 決まり）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/p2Place.ts（新しく。`game/wire/save.ts` は 1P 用と 2P 用に 1 つずつ 作って 毎ステップ step を 呼ぶ。1P の wasInBottom・wasCave・wasArea は ここに うつす）
 *     createPlaceWatch(d: {
 *       country: Pick<CountryWatch, 'step' | 'reset'>               … その 人の 国の 見はり（CountryWatch を 人ごとに 1 つ。onEnter は どちらも achievements.enterCountry）
 *       bottom(x: number, y: number, z: number): boolean             … 足が いちばん 下の へやに いるか。**高さの ふるい込み(SHAFT_CONFIG.room)は ここで、今の save.ts と 同じに 足の y（pos.y）で 見る**。step は y に + 0.1 を 渡す ので、この 関数の 中で `y - 0.1 < SHAFT_CONFIG.room.maxY + SHAFT_CONFIG.room.height` と 引きもどす（今の `st.position.y < …`〔+ 0.1 なし〕と 同じ）。そのあとの inBottom の 呼び出しは 今の まま（floor(y + 0.1) 相当）
 *       cave(x: number, y: number, z: number): CaveKind | null      … ほらあなの 部屋の 種類（いなければ null）
 *       area(x: number, y: number, z: number): MineAreaKind | null  … かくしべや・むかしの えだ道・迷路の おく・キャンプあと（いなければ null）
 *       feedMine(events: MineAchEvent[]): void                        … achievements.feedMine
 *       tick(): number
 *     }): PlaceWatch
 *     PlaceWatch = {
 *       step(pos: Vec3, down: boolean, screenSteps: number): void   … 毎ステップ。pos は 足もと。bottom・cave・area には (pos.x, pos.y + 0.1, pos.z) を そのまま わたす（床の 切り上げは 呼ぶ 側の 関数）。
 *                                                                      country.step(pos, down ? 0 : screenSteps)。down の ときは bottom・cave・area を 「いない」と 見る。
 *                                                                      へやに **入った ステップだけ** feedMine（下 = { type: 'bottom' }・ほらあな = { type: 'cave', kind }（種類が かわった ステップ）・場所 = { type: 'area', kind }）。
 *       reset(): void                                               … セーブを 読んだ とき: 「入っている」記憶と country.reset() を 消す
 *     }
 *   1 人の ときは かわらない（AC146）: 2P が いない あいだは 2P 用の PlaceWatch を 作らない／step を 呼ばない。1P の 判定は 今の save.ts と 同じ（入った コマだけ 送る）。
 */

const P = { x: 4, y: 10, z: 4 };
const ach = (): AchievementSystem => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));

/** 位置の x で 場所を 決める かんたんな 世界: x<0 は どこでもない・0〜9 は いちばん 下・10〜19 は ほらあな hiroi・20〜29 は ほらあな suisho・30〜 は かくしべや */
function hook() {
  const events: MineAchEvent[] = [];
  const w = {
    country: { stepped: [] as Array<{ x: number; steps: number }>, resets: 0, step(p: { x: number }, steps: number) { this.stepped.push({ x: p.x, steps }); }, reset() { this.resets++; } },
    bottom: (x: number) => x >= 0 && x < 10,
    cave: (x: number) => (x >= 10 && x < 20 ? ('hiroi' as const) : x >= 20 && x < 30 ? ('suisho' as const) : null),
    area: (x: number) => (x >= 30 ? ('kakushi' as const) : null),
  };
  const watch = createPlaceWatch({ country: w.country as never, bottom: w.bottom, cave: w.cave, area: w.area, feedMine: (e) => void events.push(...e), tick: () => 7 });
  const at = (x: number, down = false, steps = 1): void => watch.step({ ...P, x }, down, steps);
  return { watch, events, w, at };
}

describe('AC151: 場所の 実績(いちばん 下・ほらあな・かくしべや)は 入った ステップだけ 1 回', () => {
  it('いちばん 下に 入る → bottom が 1 回。いる あいだは 出ない。出て もう 1 回 入ると また 1 回(実績の 側が 1 回に する)', () => {
    const { events, at } = hook();
    at(-5);
    at(1);
    at(2);
    at(3);
    expect(events).toEqual([{ type: 'bottom', tick: 7 }]);
    at(-5);
    at(1);
    expect(events).toHaveLength(2);
  });

  it('ほらあな: 種類が かわった ステップだけ cave（hiroi → suisho で 2 回)', () => {
    const { events, at } = hook();
    at(12);
    at(13);
    at(25);
    at(26);
    expect(events).toEqual([
      { type: 'cave', tick: 7, kind: 'hiroi' },
      { type: 'cave', tick: 7, kind: 'suisho' },
    ]);
  });

  it('かくしべや など 坑道の 場所: area が 入った ステップだけ', () => {
    const { events, at } = hook();
    at(35);
    at(36);
    expect(events).toEqual([{ type: 'area', tick: 7, kind: 'kakushi' }]);
  });

  it('倒れて いる(down)あいだは 入って いても 出さない', () => {
    const { events, at } = hook();
    at(2, true);
    at(12, true);
    at(35, true);
    expect(events).toEqual([]);
  });

  it('(pos.x, pos.y + 0.1, pos.z) を そのまま 3 つの 判定へ わたす', () => {
    const seen: number[][] = [];
    const watch = createPlaceWatch({
      country: { step() {}, reset() {} },
      bottom: (x, y, z) => (seen.push([x, y, z]), false),
      cave: () => null,
      area: () => null,
      feedMine: () => {},
      tick: () => 0,
    });
    watch.step({ x: 1.5, y: 9, z: 2.5 }, false, 1);
    expect(seen).toEqual([[1.5, 9.1, 2.5]]);
  });

  it('reset: 「入っている」記憶を 消す → 読みこんだ あと 同じ へやに いても もう 1 回 出る。国の 見はりも reset', () => {
    const { watch, events, w, at } = hook();
    at(2);
    expect(events).toHaveLength(1);
    watch.reset();
    expect(w.country.resets).toBe(1);
    at(2);
    expect(events).toHaveLength(2);
  });
});

describe('AC151: 国の 見はり(countryWatch)を 2 人分', () => {
  it('step には その 人の 足もとと、倒れて いる あいだは 0 が わたる', () => {
    const { w, at } = hook();
    at(1, false, 1);
    at(2, true, 1);
    at(3, false, 0.25);
    expect(w.country.stepped).toEqual([
      { x: 1, steps: 1 },
      { x: 2, steps: 0 },
      { x: 3, steps: 0.25 },
    ]);
  });

  it('2P だけが 国の まん中に 180 コマ いても 国に 入った 実績が 出る。1P が あとで 同じ 国に 入っても 2 回目は 数えない(共有)', () => {
    const a = ach();
    const entered: boolean[] = [];
    const mkWatch = () =>
      new CountryWatch({ at: () => ({ kind: 'mori', e: 1 }), heightAt: () => 5, blend: 0.1, onEnter: (kind) => void entered.push(a.enterCountry(kind, false)) });
    const p1 = createPlaceWatch({ country: mkWatch(), bottom: () => false, cave: () => null, area: () => null, feedMine: (e) => a.feedMine(e), tick: () => 0 });
    const p2 = createPlaceWatch({ country: mkWatch(), bottom: () => false, cave: () => null, area: () => null, feedMine: (e) => a.feedMine(e), tick: () => 0 });
    const pos = { x: 100, y: 10, z: 100 };
    for (let i = 0; i < COUNTRY_ENTER_STEPS - 1; i++) p2.step(pos, false, 1);
    expect(entered).toEqual([]);
    p2.step(pos, false, 1); // 180 コマ目
    expect(entered).toEqual([true]);
    expect(a.found()).toContain('mori');
    for (let i = 0; i < COUNTRY_ENTER_STEPS; i++) p1.step(pos, false, 1);
    expect(entered).toEqual([true, false]);
    expect(a.found().filter((k) => k === 'mori')).toHaveLength(1);
  });

  it('倒れた 2P は 数えない(down の あいだは steps 0 なので 180 コマに ならない)', () => {
    const entered: string[] = [];
    const w = new CountryWatch({ at: () => ({ kind: 'mori', e: 1 }), heightAt: () => 5, blend: 0.1, onEnter: (k) => void entered.push(k) });
    const p2 = createPlaceWatch({ country: w, bottom: () => false, cave: () => null, area: () => null, feedMine: () => {}, tick: () => 0 });
    for (let i = 0; i < COUNTRY_ENTER_STEPS * 2; i++) p2.step({ x: 100, y: 10, z: 100 }, true, 1);
    expect(entered).toEqual([]);
  });
});
