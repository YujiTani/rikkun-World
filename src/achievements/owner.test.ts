import { describe, expect, it } from 'vitest';
import type { AchievementModalPort, AchievementShow } from '../contracts';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { COUNTRY_KINDS } from '../world/gen/biome';
import { halvesOfAll } from '../ui/duoHalves';
import { AchievementSystem } from './AchievementSystem';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 §3.7 (g) #18・「1.17 の きめ」、AC178 ③・AC146）のユニットテスト。実装の前に書いた赤のテスト。
 * 実績の 帯（おしらせ）・テロップは 今 1P の 半分に だけ 出る。「達成した 人の 半分（世界が 達成した 物は 両方）」に する ため、
 * 実績が「だれの 達成か」を もつ。数えかたは 2 人で 共有の まま（実績の 数・記録は かえない）。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   `contracts/achievements.ts`:  type AchievementOwner = 1 | 2 | 'world' | null   … 1.17: 持ち主 `1 | 2 | 'world' | null`。null = 持ち主 なし（セーブから 戻した 物）。`ui/duoHalves.ts` の `Owner | null` と 同じ 形
 *       AchievementShow に `owners: readonly AchievementOwner[]` を 足す（ids と 同じ 長さ・同じ 順番。ids[i] を 達成した 持ち主）
 *   AchievementSystem:
 *       withWho<T>(who: AchievementOwner, fn: () => T): T   … fn の あいだ「いま feed している 人」を who に する（入れ子は 元に もどす。例外でも もどす）。
 *           これの 外（今の 1P の 呼び出し）は 1P。`createP2Feed`（duo/p2Feed.ts）は 2P の feed を `withWho(2, …)` で 包む
 *       feedPhase（昼夜）・enterCountry（国に 入る）・update(ctx)（日数・場所）など 世界が 進めて 取れる 実績は 'world'（呼び出しの 中で 自分で 'world' に する）
 *       ownerOf(id: AchievementId): AchievementOwner | null   … 取った 実績の 持ち主。取って いない・読みこみで 戻した（持ち主を 覚えていない）物は null
 *   取った あとの 持ち主は セーブ しない（読みこみ後に 取った 物から 数える。戻した 物は null → 帯は 両方の 半分）
 *   帯の 出す 半分 = `halvesOfAll(show.owners, joined)`（ui/duoHalves.ts。owners に null が まざれば 両方）
 */

const mk = () => {
  const s = { ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 };
  return new AchievementSystem(() => s);
};

class FakeModal implements AchievementModalPort {
  shows: AchievementShow[] = [];
  private openNow = false;
  open(s: AchievementShow): boolean {
    if (this.openNow) return false;
    this.openNow = true;
    this.shows.push(s);
    return true;
  }
  isOpen(): boolean {
    return this.openNow;
  }
  onClosed(): void {}
}
const attach = (sys: AchievementSystem): FakeModal => {
  const m = new FakeModal();
  sys.attach(m, { bannerShowing: () => false, levelUpShowing: () => false });
  return m;
};

const b = { x: 0, y: 0, z: 0 };
const breakDirt = [{ type: 'break' as const, tick: 1, block: b, id: 'dirt' as const, gotItem: true, count: 1 }];
const placeLog = [{ type: 'place' as const, tick: 2, block: b, id: 'log' as const }];

describe('#18: 実績の 持ち主（だれが 達成したか）', () => {
  it('1P の 呼び出し（今まで どおり）で 取った 実績の 持ち主は 1', () => {
    const s = mk();
    s.feedDig(breakDirt);
    expect(s.ownerOf('break.dirt.1')).toBe(1);
  });
  it('withWho(2, …) の 中で 取った 実績の 持ち主は 2（数えかたは 共有 → 1P が あとで 同じ 種類を こわしても 2 のまま）', () => {
    const s = mk();
    s.withWho(2, () => s.feedDig(breakDirt));
    expect(s.ownerOf('break.dirt.1')).toBe(2);
    s.feedDig(breakDirt);
    expect(s.ownerOf('break.dirt.1')).toBe(2);
    expect(s.stat('break:dirt')).toBe(2); // 記録は 2 人で 共有（かわらない）
  });
  it('withWho は 値を かえし、入れ子・例外の あとで 元に もどる', () => {
    const s = mk();
    expect(s.withWho(2, () => s.withWho('world', () => 7))).toBe(7);
    expect(() =>
      s.withWho(2, () => {
        throw new Error('x');
      }),
    ).toThrow('x');
    s.feedDig(breakDirt); // もどって 1P
    expect(s.ownerOf('break.dirt.1')).toBe(1);
  });
  it('世界が 進めて 取れる 実績（昼夜）は world', () => {
    const s = mk();
    s.feedPhase('night');
    expect(s.ownerOf('night.first.1')).toBe('world');
  });
  it('場所（国に 入る）も 世界の 物 → world（withWho の 外から 呼んでも 1P には ならない）', () => {
    const s = mk();
    const kind = COUNTRY_KINDS[0]!;
    s.enterCountry(kind, false);
    expect(s.ownerOf(`visit.country.${kind}.1`)).toBe('world');
  });
  it('セーブから 戻した 物は 持ち主 なし（null）。戻した あとに 取った 物は 持ち主が つく', () => {
    const a = mk();
    a.withWho(2, () => a.feedDig(breakDirt));
    expect(a.ownerOf('break.dirt.1')).toBe(2);
    const b = mk();
    b.deserialize(JSON.parse(JSON.stringify(a.serialize())));
    expect(b.isUnlocked('break.dirt.1')).toBe(true);
    expect(b.ownerOf('break.dirt.1')).toBeNull();
    b.withWho(2, () => b.feedDig(placeLog));
    expect(b.ownerOf('place.log.1')).toBe(2);
  });
  it('まだ 取って いない・ない id は null', () => {
    const s = mk();
    expect(s.ownerOf('break.dirt.1')).toBeNull();
    expect(s.ownerOf('ない.id' as never)).toBeNull();
  });
});

describe('#18: おしらせ（AchievementShow）に 持ち主の 列', () => {
  it('owners は ids と 同じ 長さ・同じ 順番（2P だけ → すべて 2）', () => {
    const s = mk();
    const m = attach(s);
    s.withWho(2, () => s.feedDig(breakDirt));
    const show = s.flush()!;
    expect(show).not.toBeNull();
    expect(show.owners).toHaveLength(show.ids.length);
    expect(show.owners.every((o) => o === 2)).toBe(true);
    expect(m.shows[0]!.owners).toEqual(show.owners);
    expect(halvesOfAll(show.owners, true)).toEqual([2]);
  });
  it('1P だけ → その 半分は 1P のみ', () => {
    const s = mk();
    attach(s);
    s.feedDig(breakDirt);
    const show = s.flush()!;
    expect(show.owners.every((o) => o === 1)).toBe(true);
    expect(halvesOfAll(show.owners, true)).toEqual([1]);
  });
  it('1P と 2P が 同じ 列に まざる → 両方の 半分（ids の 順に owners が ならぶ）', () => {
    const s = mk();
    attach(s);
    s.feedDig(breakDirt);
    s.withWho(2, () => s.feedDig(placeLog));
    const show = s.flush()!;
    expect(show.owners).toHaveLength(show.ids.length);
    const i1 = show.ids.indexOf('break.dirt.1');
    const i2 = show.ids.indexOf('place.log.1');
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThanOrEqual(0);
    expect(show.owners[i1]).toBe(1);
    expect(show.owners[i2]).toBe(2);
    expect(halvesOfAll(show.owners, true)).toEqual([1, 2]);
  });
  it('世界が 取った 実績が まざれば 両方', () => {
    const s = mk();
    attach(s);
    s.feedPhase('night');
    const show = s.flush()!;
    expect(show.owners).toContain('world');
    expect(halvesOfAll(show.owners, true)).toEqual([1, 2]);
  });
  it('セーブから 戻した まま おしらせ待ちの 物（持ち主 null）は 両方の 半分', () => {
    const a = mk();
    a.feedDig(breakDirt); // おしらせ待ち（pending）が のこる
    const b = mk();
    attach(b);
    b.deserialize(JSON.parse(JSON.stringify(a.serialize())));
    const show = b.flush()!;
    expect(show).not.toBeNull();
    expect(show.owners).toHaveLength(show.ids.length);
    expect(show.owners.every((o) => o === null)).toBe(true);
    expect(halvesOfAll(show.owners, true)).toEqual([1, 2]);
  });
  it('1 人の とき（joined=false）は どの 持ち主でも 1P の 全面', () => {
    expect(halvesOfAll([2], false)).toEqual([1]);
    expect(halvesOfAll([null], false)).toEqual([1]);
  });
});
