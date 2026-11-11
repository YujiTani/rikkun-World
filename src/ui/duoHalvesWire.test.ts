import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DUO_HALF_ID, type HalfKey } from './duoHalves';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 §3.7 (g)・§8 5f-2・§12.0 の 目印、AC177・AC178・AC146）: 配線の 約束の 見はり（ソース見張り）。実装の前に書いた赤のテスト。
 * 純関数（duoHalves.test.ts・lifeUi.test.ts・halves.test.ts・owner.test.ts・bandOwner.test.ts・viewRender.panes.test.ts）で 決められない
 * 「どの 部品を どこで 2 つに するか・同じ 部品を 使っているか」を 見る。DOM は 作らない（UI 検査の 画面 duo-half-all／duo-half-down が 見た目を 見る）。
 *
 * ---- 開発への つなぎ目の 約束（部品ごと。置き場は 仕様 §8 5f-2 の とおり。1P の 要素は 今の 要素を 使い回し、2 人の あいだ だけ data-testid を 足す）----
 *   #13 titleAnnounce  `TitleAnnounce`（ui/titleAnnounce.ts）を 2 人の とき もう 1 つ（2P の 半分）。同じ `sync(announce)` の 答えを 両方に 渡す。音は fx/combatFx.ts の playTitleSound の 1 回だけ（DOM の 部品は 音を 鳴らさない）
 *   #14 homeNotice     `HomeNotice` を 2P の 半分にも（2P が 復活した ステップに show）。1.17: 文面は `homeTextOf(who)`（ui/deathScreenModel.ts。1P = HOME_TEXT、2P = HOME_TEXT_P2。homeText.test.ts）
 *   #15 damageEdge     `DamageEdge` を 半分ごとに（1P の 要素に 半分の 矩形を あてる／2P の 分を もう 1 つ）
 *   #16 death          `DeathScreen`（1P）を 1P の 半分の 矩形に。2P は 作らない（今の duo-p2-down）
 *   #17 clock          `Clock` を 2 つ（duo-clock-p1・duo-clock-p2）。時刻は 同じ `setTime(dayTick, settings, day)` を 2 つに 渡す。1.17: 置き場所は 各半分の 外がわの 上すみ（1P = 左上の `#clock`・2P = 右上の `duo-clock-p2`。css は duoHalvesCss.test.ts）。矢印は 時計の 箱を よける（arrowClock.test.ts）
 *   #18 band           `BandView`（ui/celebrate/views.ts）を 2 つ。出す 半分は halvesOfAll(info.owners, joined)
 *   #19 banner         `.cel-banner-wrap`（横断幕）と 紙ふぶきを 1P の 半分に（duo-cel-banner-p1。2P の 分は 作らない。2P の つくる 横断幕は 別 issue）
 *   #20 hudNotice      2P の つくれる マーク（`CraftHint`。`anyCraftNow(2P の craft, 2P の もちもの)`）を 2P の ホットバーの 右上に（duo-hud-notice-p2）。1.17: メダルの 印は 1P の 半分だけ（`hudNoticeShow`。2P の かたまりには 入れない）
 *   #21 nameplate      `YokaiNameplates`・`MachoMarks`・`StaggerIcons` の update に 半分の 矩形（Rect）を 渡し、投影は duoHalves.ts の ndcToHalf・clampToHalf。半分ごとに 1 つずつ 作る
 *   #22 buffPlate      `BuffIcons` を 2P の かたまり（#hud-self-p2）にも。`buffsOfHeld(2P の 手の 物, legendMoveMulOf)` の 答え
 *   #22a noticeName    `Notice`（who 2）が #notice-name-p2 も 作る。2P の ホットバーの `showName` は 2P の Notice に つなぐ（今は () => undefined）
 *   #22b inkDim        `InkDim` を 半分ごとに（その人の `yokaiM.inkDim(who)`）
 *   1.17 開いた とき: もちもの画面・家の 画面・にわとりの メニューを 開いた 人の 半分の 分だけ 時計・おしらせの 印・つくれる マークを 消す（`halvesCoveredBy(who, joined)`。duoHalves.test.ts）
 *   口（足りない 物）: `duo.select(who, slot)`（DuoPlayHook。`?duo=dev` の ときだけ。その人の ホットバーの 選びを かえる。2P の 名前の 表示を UI 検査で 出す ため）
 */

const read = (p: string): string => readFileSync(p, 'utf8');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(p) && !/\.(test|spec)\.ts$/.test(p) ? [p] : [];
  });
const ALL = files('src').map((f) => ({ f: f.replaceAll('\\', '/'), s: read(f) }));
const KEYS = Object.keys(DUO_HALF_ID) as HalfKey[];

describe('目印: 12 の 部品が すべて 半分ごとの data-testid（halfId）を 持つ', () => {
  for (const key of KEYS) {
    it(`${key}: halfId('${key}', …) を 使う 本番の ソースが ある`, () => {
      const users = ALL.filter(({ f, s }) => f !== 'src/ui/duoHalves.ts' && new RegExp(`halfId\\(\\s*'${key}'`).test(s)).map((x) => x.f);
      expect(users.length, `${key} を 使う ソース`).toBeGreaterThan(0);
    });
  }
});

describe('#17: 時計は 2 つ・時刻は 同じ', () => {
  it('Clock を 2 つ 作り、同じ setTime の 引数を 両方に 渡す（時刻の 式を コピーしない）', () => {
    const s = ALL.find((x) => x.f === 'src/ui/duoHalves.ts')?.s ?? '';
    expect(s).toMatch(/new Clock\(/);
    expect((s.match(/\.setTime\(/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(s).not.toMatch(/clockScene\(|clockShouldFade\(/); // 場面の きめかたは Clock の 中の 1 か所
  });
});

describe('1.17: 横断幕・紙ふぶきは 1P の 半分だけ・メダルの 印は 1P だけ・開いた 人の 半分の 分だけ 消す', () => {
  const prod = ALL;
  it('横断幕の 目印は 1P の 分だけ（halfId(\'banner\', 1)。2P の 分は 作らない）', () => {
    expect(prod.some(({ s }) => /halfId\(\s*'banner'\s*,\s*1\b/.test(s))).toBe(true);
    expect(prod.some(({ s }) => /halfId\(\s*'banner'\s*,\s*2\b/.test(s))).toBe(false);
  });
  it('メダルの 印は 2P の かたまりに 入れない（hudNoticeShow の 答えで 出し分ける）', () => {
    const users = ALL.filter(({ f, s }) => f !== 'src/ui/duoHalves.ts' && /\bhudNoticeShow\(/.test(s)).map((x) => x.f);
    expect(users.length).toBeGreaterThan(0);
  });
  it('開いた 人の 半分の 分だけ 消す（halvesCoveredBy を 使う 本番の ソースが ある）', () => {
    const users = ALL.filter(({ f, s }) => f !== 'src/ui/duoHalves.ts' && /\bhalvesCoveredBy\(/.test(s)).map((x) => x.f);
    expect(users.length).toBeGreaterThan(0);
  });
  it('2P の 復活の おしらせは 文面を homeTextOf で 決める（文面を 2 か所に 書かない）', () => {
    expect(read('src/ui/homeNotice.ts')).toMatch(/\bhomeTextOf\(/);
    expect(read('src/ui/homeNotice.ts')).not.toMatch(/おともだち/);
  });
});

describe('1.17: 矢印は 時計の 箱を よける（配線）', () => {
  it('duoView.ts が 矢印の step の 入力に avoid（clockBoxAt の 答え）を 入れる', () => {
    const s = read('src/game/wire/duoView.ts');
    expect(s).toMatch(/\bclockBoxAt\(/);
    expect(s).toMatch(/\.avoid\b/);
  });
});

describe('#13: 世界の おしらせは 両方に・音は 1 回', () => {
  it('2 つ目の TitleAnnounce を 作り、音は 部品の 中で 鳴らさない', () => {
    expect(ALL.find((x) => x.f === 'src/ui/duoHalves.ts')?.s ?? '').toMatch(/new TitleAnnounce\(/);
    expect(read('src/ui/titleAnnounce.ts')).not.toMatch(/sound|logSound|playTitleSound/i);
    const fx = read('src/fx/combatFx.ts');
    expect((fx.match(/logSound\(/g) ?? []).length).toBe(1);
  });
});

describe('#21: 投影は 半分ごと（画面ぜんたいの はばに 写さない）', () => {
  for (const f of ['src/ui/yokaiNameplates.ts', 'src/ui/machoMarks.ts', 'src/fx/parryFx.ts']) {
    it(`${f}: duoHalves の ndcToHalf で 半分の 矩形に 写し、window.innerWidth で (ndc × 0.5 + 0.5) × w を 書かない`, () => {
      const s = read(f);
      expect(s).toMatch(/\bndcToHalf\(/);
      expect(s).not.toMatch(/\*\s*0\.5\s*\+\s*0\.5\)\s*\*\s*w\b/);
    });
  }
  it('妖怪の 名札と マッチョの 印は clampToHalf で 半分の 中に おさめる', () => {
    expect(read('src/ui/yokaiNameplates.ts')).toMatch(/\bclampToHalf\(/);
    expect(read('src/ui/machoMarks.ts')).toMatch(/\bclampToHalf\(/);
  });
});

describe('#22・#22a・#22b・#20: 2P の 分も 同じ 部品の 同じ 答え', () => {
  it('#22a: 2P の ホットバーの showName は 捨てない（Notice who 2 の nameEl に つなぐ）', () => {
    expect(read('src/ui/duoHud.ts')).not.toMatch(/showName:\s*\(\)\s*=>\s*undefined/);
    const n = read('src/ui/notice.ts');
    expect(n).not.toMatch(/if \(who === 1\) parent\.append\(this\.nameEl\)/);
    expect(n).toMatch(/notice-name/);
  });
  it('#22: 2P の バフの 札は buffsOf（1P と 同じ 関数。LEGEND-4 で buffsOfHeld から ふえた）で 決める', () => {
    const users = ALL.filter(({ f, s }) => /\bbuffsOf\(/.test(s) && f !== 'src/ui/buffIconsModel.ts').map((x) => x.f);
    expect(users.length).toBeGreaterThanOrEqual(2); // 1P の step.ts と 2P
  });
  it('#20: 2P の つくれるは anyCraftNow（1P と 同じ 関数）で 決める', () => {
    const users = ALL.filter(({ f, s }) => /\banyCraftNow\(/.test(s) && !/craftModel\.ts$/.test(f)).map((x) => x.f);
    expect(users.length).toBeGreaterThanOrEqual(2); // 1P の craftUi.ts と 2P
  });
  it('#22b: 2P の すみの 暗さは yokaiM.inkDim(2)', () => {
    expect(ALL.some(({ s }) => /\.inkDim\(2\)/.test(s))).toBe(true);
  });
});

describe('AC146: 1 人の ときは かわらない（見はり）', () => {
  it('今の 1P の 呼び出しは のこる（step.ts の combatUi.inkDim.set(yokaiM.inkDim())・titleAnnounce.sync・clock.setTime）', () => {
    const s = read('src/game/step.ts');
    expect(s).toMatch(/inkDim\.set\(yokaiM\.inkDim\(\)\)/);
    expect(s).toMatch(/titleAnnounce\.sync\(/);
    expect(s).toMatch(/combatUi\.clock\.setTime\(/);
  });
  it('2 人用の 部品は 参加して はじめて 作る（import しただけで document を さわらない）', () => {
    const s = ALL.find((x) => x.f === 'src/ui/duoHalves.ts')?.s ?? '';
    expect(s.split('\n').filter((l) => /^(const|let|var)\b.*\bdocument\./.test(l))).toEqual([]);
  });
});
