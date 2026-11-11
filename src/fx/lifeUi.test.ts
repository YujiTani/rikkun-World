import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../contracts';
import { lifeUiOf, type LifeUiAction } from './combatFxModel';
import { halvesForKey } from '../ui/duoHalves';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.16 §3.7 (g) #14〜#16、AC178・AC146）のユニットテスト。実装の前に書いた赤のテスト。
 * ダメージの ふち（#15）・倒れた 画面（#16）・復活の お知らせ（#14）が 1P の ものだけ だった（`fx/combatFx.ts` の switch が 1P の d.edge・d.deathScreen・d.homeNotice を 直接 呼ぶ）。
 * 2P の 戦い（`PlayerCombatImpl` の 出来事）にも 同じ 部品の 同じ 答えを 使う。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   `src/fx/combatFxModel.ts` に 追加（純関数。DOM なし）:
 *     type LifeUiAction = 'edge' | 'down' | 'respawn'
 *     lifeUiOf(ev: CombatEvent): LifeUiAction | null
 *        playerHit・fallHurt → 'edge'（ふちが 1 回 ふわっと）／ death → 'down'（倒れた 画面）／ respawn → 'respawn'（「スタートに もどったよ」）／ ほかは null
 *   `fx/combatFx.ts`（1P）と `game/wire/duoPlay.ts`（2P）は この 関数の 答えで 動かす（出来事の 種類の 式を 2 か所に 書かない）。
 *   2 人の とき: 1P の ふち・倒れた 画面・もどったよは 1P の 半分の 中だけ（`duo-damage-edge-p1`・`duo-death-p1`・`duo-home-notice-p1`）、
 *   2P は 2P の 半分の 中（`duo-damage-edge-p2`・`duo-home-notice-p2`）。2P の 倒れた 表示は 今の `duo-p2-down`（2P の 半分）を そのまま 使う（全面の 白い 画面は 出さない）。
 *   1 人の ときは 今の 全面の まま（`#damage-edge`・`#death-screen`・`#home-notice` の 規則を かえない）。
 */

// 出来事の 種類を ぜんぶ 数える（足し忘れは 型で 落ちる）
const EXPECT = {
  punchStart: null,
  punchHit: null,
  punchMiss: null,
  kodachiHit: null,
  playerHit: 'edge',
  fallHurt: 'edge',
  regen: null,
  death: 'down',
  respawn: 'respawn',
  pickup: null,
} as const satisfies Record<CombatEvent['type'], LifeUiAction | null>;

const sample = (type: CombatEvent['type']): CombatEvent => {
  switch (type) {
    case 'punchStart':
      return { type, tick: 0 };
    case 'punchHit':
      return { type, tick: 0, yokaiId: 1 };
    case 'punchMiss':
      return { type, tick: 0 };
    case 'kodachiHit':
      return { type, tick: 0, yokaiId: 1, damage: 1 };
    case 'playerHit':
      return { type, tick: 0, by: 'karakasa', amount: 1 };
    case 'fallHurt':
      return { type, tick: 0, amount: 1 };
    case 'regen':
      return { type, tick: 0, hp: 5 };
    case 'death':
      return { type, tick: 0, dropped: [] };
    case 'respawn':
      return { type, tick: 0 };
    case 'pickup':
      return { type, tick: 0, bagId: 1 };
    default: {
      const never: never = type;
      return never;
    }
  }
};

describe('AC178: ふち・倒れた 画面・もどったよの 出来事（1P と 2P で 同じ 答え）', () => {
  for (const type of Object.keys(EXPECT) as CombatEvent['type'][]) {
    it(`${type} → ${EXPECT[type]}`, () => {
      expect(lifeUiOf(sample(type))).toBe(EXPECT[type]);
    });
  }
  it('防具で ふせいだ（blocked）当たりでも ふちは 出る（1P の 今の 動きと 同じ）', () => {
    expect(lifeUiOf({ type: 'playerHit', tick: 0, by: 'karakasa', amount: 0, blocked: true })).toBe('edge');
  });
});

describe('AC178: 出す 半分（2 人の とき）', () => {
  it('ふち・倒れた 画面・もどったよは 起こした 人の 半分だけ', () => {
    for (const who of [1, 2] as const) {
      expect(halvesForKey('damageEdge', true, who)).toEqual([who]);
      expect(halvesForKey('death', true, who)).toEqual([who]);
      expect(halvesForKey('homeNotice', true, who)).toEqual([who]);
    }
  });
  it('1 人の ときは いつも 全面（1P）', () => {
    for (const key of ['damageEdge', 'death', 'homeNotice'] as const) expect(halvesForKey(key, false, 1)).toEqual([1]);
  });
});

describe('同じ 部品（式の コピーなし）: 配線の 見はり', () => {
  const src = (p: string): string => readFileSync(p, 'utf8');
  it('1P の fx/combatFx.ts は lifeUiOf を 使い、playerHit／fallHurt の ふちを 直接 書かない', () => {
    const s = src('src/fx/combatFx.ts');
    expect(s).toMatch(/\blifeUiOf\(/);
    expect(s).not.toMatch(/case 'fallHurt':\s*\n\s*playCombat\(sound, 'hurt'\);\s*\n\s*d\.edge\.flash\(\)/);
  });
  it('2P の game/wire/duoPlay.ts も lifeUiOf で 2P の 半分の ふち・もどったよを 出す', () => {
    const s = src('src/game/wire/duoPlay.ts');
    expect(s).toMatch(/\blifeUiOf\(/);
    expect(s).toMatch(/combatEvents/);
  });
  it('2P の 倒れた 画面は 全面の DeathScreen を 使わない（今の duo-p2-down の まま）', () => {
    expect(src('src/game/wire/duoPlay.ts')).not.toMatch(/new DeathScreen|deathScreen\.start\(/);
  });
});
