import { describe, expect, it } from 'vitest';
import { halvesOfAll } from '../duoHalves';
import { TopBandModel } from './bandModel';
import { defaultCelebrateSettings } from './config';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 §3.7 (g) #18・#19、AC178 ③⑤・AC146）のユニットテスト。実装の前に書いた赤のテスト。
 * 上の 帯（実績の おしらせ・テロップ・家の 名前・完成の 帯）は 1 つずつ 順番に 出る（今の きまりの まま）。出ている 帯が「どの 半分に 出るか」を 持ち主で 決める。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   ui/celebrate/bandModel.ts
 *     enqueueTelop(item, source = 'nushi', owner: Owner = 'world')   … テロップ。ヌシ・がしゃどくろの おとしものは だれの 物でも ない → 世界（両方の 半分）。宝箱は あけた 人（呼び出し側が 渡す）
 *     enqueueHouseName(text, owner: Owner = 'world')・enqueueHouseDone(text, owner = 'world')   … 家の 帯。建築士さんと 話した 人が わかれば その 人（5d の who）
 *     TopBandInfo に `owners: readonly Owner[]`   … いま 出ている 帯の 持ち主（実績の おしらせは show.owners・テロップ／家は [owner]・あらわれた〔appear〕は ['world']・なにも 出て いなければ []）
 *   `Owner`（1 | 2 | 'world'）は ui/duoHalves.ts の 型。出す 半分 = `halvesOfAll(info.owners, joined)`。
 *   ui/celebrate/index.ts の BandView は 2 人の とき 2 つ（各半分の 帯。`duo-cel-band-p1`／`-p2`）。同じ 帯を 両方に 出す ときは 同じ 中身・同じ 時間（1 つの モデルを 2 つの 絵が 見る）。
 *   1.17: 持ち主は `1 | 2 | 'world' | null`（null = 持ち主 なし。セーブから 戻した 物）。`TopBandInfo.owners` の 型も `readonly (Owner | null)[]`。null は 両方の 半分。
 *   横断幕（`.cel-banner-wrap`。はじめて つくった とき。#19）は 1P の craft だけ 出る（2P の つくるは 今 横断幕に つながって いない。2P の 横断幕は 別 issue・§13）→ 2 人の とき 1P の 半分（`duo-cel-banner-p1`・はば = 半分の 90% まで）。
 *   紙ふぶきも 1P の 半分だけ。css の 層では 切れない（fixed の 紙を JS が 動かす）ので 位置を 矩形から 決める（confettiAt。confetti.test.ts）。
 *   1 人の ときの 帯・横断幕の 位置・時間は 今の まま。
 */

const cfg = () => defaultCelebrateSettings();
const show = (owners: (1 | 2 | 'world' | null)[]) => ({ ids: owners.map((_, i) => `a${i}`), mainId: 'a0', more: 0, owners });

describe('#18: 出ている 帯の 持ち主', () => {
  it('何も 出ていなければ []', () => {
    expect(new TopBandModel(cfg).info(null).owners).toEqual([]);
  });

  it('テロップ: 持ち主を 渡さなければ world（両方の 半分）。渡せば その 人の 半分', () => {
    const a = new TopBandModel(cfg);
    a.enqueueTelop('raijin_ken');
    a.step(1, false);
    expect(a.info(null).owners).toEqual(['world']);
    expect(halvesOfAll(a.info(null).owners, true)).toEqual([1, 2]);

    const b = new TopBandModel(cfg);
    b.enqueueTelop('raijin_ken', 'chest', 2);
    b.step(1, false);
    expect(b.info(null)).toMatchObject({ kind: 'telop', source: 'chest', owners: [2] });
    expect(halvesOfAll(b.info(null).owners, true)).toEqual([2]);
  });

  it('実績の おしらせ: show.owners が そのまま 持ち主の 列', () => {
    const b = new TopBandModel(cfg);
    b.toast.open(show([2, 2]));
    expect(b.info(null)).toMatchObject({ kind: 'achieve', owners: [2, 2] });
    expect(halvesOfAll(b.info(null).owners, true)).toEqual([2]);
    const c = new TopBandModel(cfg);
    c.toast.open(show([1, 2]));
    expect(halvesOfAll(c.info(null).owners, true)).toEqual([1, 2]);
  });

  it('家の 名前・完成の 帯: 持ち主を 渡せば その 人の 半分（省くと world）', () => {
    const a = new TopBandModel(cfg);
    a.enqueueHouseName('さくらの いえ', 1);
    a.step(1, false);
    expect(a.info(null)).toMatchObject({ kind: 'house', owners: [1] });

    const b = new TopBandModel(cfg);
    b.enqueueHouseDone('さくらの いえ');
    b.step(1, false);
    expect(b.info(null)).toMatchObject({ kind: 'house', owners: ['world'] });
  });

  it('持ち主 なし（null。セーブから 戻した 物）の おしらせは 両方の 半分', () => {
    const b = new TopBandModel(cfg);
    b.toast.open(show([null]));
    expect(b.info(null)).toMatchObject({ kind: 'achieve', owners: [null] });
    expect(halvesOfAll(b.info(null).owners, true)).toEqual([1, 2]);
  });

  it('あらわれた（appear）は 世界の 物 → 両方', () => {
    const b = new TopBandModel(cfg);
    expect(b.info({ ticksLeft: 100 }).owners).toEqual(['world']);
  });

  it('1 つずつ 順番に 出る きまりは かわらない（2P の テロップが 出ている あいだ 1P の 実績は 待つ。持ち主は 出ている 帯の 物）', () => {
    const b = new TopBandModel(cfg);
    b.enqueueTelop('raijin_ken', 'chest', 2);
    b.step(1, false);
    expect(b.canOpenToast(false)).toBe(false);
    expect(b.info(null).owners).toEqual([2]);
    for (let i = 0; i < 299; i++) b.step(1, false);
    expect(b.canOpenToast(false)).toBe(true);
    b.toast.open(show([1]));
    expect(b.info(null).owners).toEqual([1]);
  });
});

describe('AC146: 1 人の とき', () => {
  it('どの 持ち主でも 1P の 全面だけ', () => {
    for (const owners of [[2], ['world'], [1, 2]] as const) expect(halvesOfAll(owners, false)).toEqual([1]);
  });
});
