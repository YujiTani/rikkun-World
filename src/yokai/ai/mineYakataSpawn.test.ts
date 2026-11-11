import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, PlayerCombat, TimeOfDay, Vec3, YokaiKind } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { SEEDS_20 } from '../../world/gen/mineShaftKit';
import { hookF, needYakataHook } from '../../world/gen/mineYakataKit';
import { YokaiManager } from './YokaiManager';
import { createYokaiConfig, type YokaiConfig } from './config';
import type { HookYokaiEvent, YokaiManagerOptions } from './managerTypes';

/**
 * MINE-1F F5「あらわれて から 60 ステップは 攻撃しない・当たらない」・F6「ふつうの きまりの 外」（docs/design/MINE-1F.md §4.5・§6.2）。
 * 本物の YokaiManager〔地下の 大部屋の 合成の 世界。mineSpawn.test.ts と 同じ 型〕で 見る。数は 表〔`yakataTable()`〕・設定から 読む〔#311〕。
 * 【テスト側の 読み】窓口は 仕様に ない ので 次の 形で 約束する〔developer は ここに 合わせる。ちがう 名前に するなら テストを 直して 台帳に 書く〕:
 *   ・`YokaiManager.spawn(kind, x, y, z, { title, free: true, graceSteps })`: `free` ＝ 地下の 上限・間かくに 数えない・見つけられなくても 〔3,600 ステップ〕・遠くても〔横 64〕・夜明けでも 消えない。
 *     `graceSteps` ＝ あらわれてから その ステップ数は 攻撃しない・たたかれても ダメージを 受けない。
 *   ・`YokaiManager.leave(ids)`: そっと 去る〔おとし物 なし〕。
 *   ・`YokaiManagerOptions.noSpawnAt?(x, y, z): boolean`: true の マスには 自動で 出さない〔やかたの 大広間の 床。まだ・かった・挑戦の 間 ぜんぶ〕。
 *   F6 の「まだ・かった の 床で ためし 0」は つなぎ〔src/game/wire/creatures.ts の noSpawnAt に caveKindAt が yakata を ふくめる〕なので つなぎ込みで 見る〔形の 見張りは 実装の 書き方に しばるので 書かない。`caveAt` が yakata は mineYakataShape.test.ts〕。
 *   数えかた〔`list()`〕: 自動で 出た ふつうの 妖怪は 7 ひきに かぞえない。
 */

const GROUND = 150;
const SIZE = { x: 96, y: 200, z: 96 };
const CENTER = 47.5;

const makeTime = (phase: DayPhase, ref: { p: DayPhase } = { p: phase }): TimeOfDay =>
  ({ dayTick: () => 0, day: () => 0, phase: () => ref.p, skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} }) as unknown as TimeOfDay;

function room(): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld(SIZE);
  w.fill(0, 0, 0, SIZE.x - 1, GROUND, SIZE.z - 1, 'stone');
  w.fill(8, 60, 8, 87, 63, 87, 'air');
  return w;
}

function rig(config: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const hits: { amount: number; by: YokaiKind; from: Vec3 }[] = [];
  const combat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: (amount: number, by: YokaiKind, from: Vec3) => (hits.push({ amount, by, from }), true), heal: () => 0, drainEvents: () => [] } as unknown as PlayerCombat;
  const world = room();
  const phase = { p: 'night' as DayPhase };
  const player = { position: { x: CENTER, y: 60, z: CENTER } };
  const events: HookYokaiEvent[] = [];
  const m = new YokaiManager({
    world,
    time: makeTime('night', phase),
    getPlayer: () => player,
    combat,
    inventory: { add: () => 0 } as unknown as Inventory,
    seed: 1,
    config: { ...createYokaiConfig(), ...config } as YokaiConfig,
    groundY: () => GROUND,
    ...extra,
  } as YokaiManagerOptions);
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      m.update(1 / 60);
      events.push(...m.takeHookEvents());
    }
  };
  return { m, hits, player, events, step, phase, world };
}
type Free = { spawn(kind: YokaiKind, x: number, y: number, z: number, o: { title: 'oyabun' | 'taisho'; free: true; graceSteps: number }): number; leave(ids: readonly number[]): void };
const asFree = (m: YokaiManager): Free => m as unknown as Free;
const T = () => {
  const h = hookF(SEEDS_20[0]!);
  needYakataHook(h, ['yakataTable']);
  return h.yakataTable();
};

describe('F5: あらわれて から graceSteps は 攻撃しない・当たらない', () => {
  it('graceSteps の あいだ すぐ そばの 妖怪は 攻撃しない〔当たらない〕。そのあとは 攻撃する', () => {
    const grace = T().graceSteps;
    const r = rig();
    asFree(r.m).spawn('karakasa', CENTER + 1.5, 60, CENTER, { title: 'oyabun', free: true, graceSteps: grace });
    r.step(grace - 2);
    expect(r.hits, '攻撃しない').toHaveLength(0);
    r.step(grace + 240);
    expect(r.hits.length, 'そのあとは 攻撃する').toBeGreaterThan(0);
  });
});

describe('F6: ふつうの きまりの 外', () => {
  it('7 ひき いても 地下の 上限は ふつうの 妖怪だけで 数える〔ふつう 8 ＋ 7 ひき ＝ 15 体〕', () => {
    const cfg = { yokaiSpawnInterval: 1, yokaiSpawnIntervalUnder: 1, yokaiMaxUnder: 8, yokaiForgetSteps: 1e9 };
    const r = rig(cfg);
    const ids = new Set<number>();
    for (let i = 0; i < 7; i++) ids.add(asFree(r.m).spawn('karakasa', 20 + i * 3, 60, 20, { title: 'oyabun', free: true, graceSteps: T().graceSteps }));
    r.step(900);
    const ordinary = r.m.list().filter((q) => !ids.has(q.id));
    expect(ordinary.length, '地下の 上限 ちょうど').toBe(8);
    expect(r.m.list().length).toBe(15);
  });

  it('3,600 ステップ 見つけられなくても・横 64 より 遠くても・夜明けでも 消えない', () => {
    const forget = createYokaiConfig().yokaiForgetSteps as number;
    const r = rig({ yokaiSpawnInterval: 1e9, yokaiSpawnIntervalUnder: 1e9 });
    r.player.position.x = 80;
    const ids = [0, 1, 2].map((i) => asFree(r.m).spawn('karakasa', 10, 60, 10 + i * 3, { title: 'oyabun', free: true, graceSteps: T().graceSteps }));
    expect(Math.abs(r.player.position.x - 10), '横 64 より 遠い').toBeGreaterThan(64);
    r.step(forget + 600);
    for (const id of ids) expect(r.m.list().some((q) => q.id === id && q.state !== 'leaving'), `id ${id} が のこって いる`).toBe(true);
  });

  it('夜明け〔night → day の かわりめ〕でも 消えない', () => {
    const r = rig({ yokaiSpawnInterval: 1e9, yokaiSpawnIntervalUnder: 1e9 });
    const ids = [0, 1].map((i) => asFree(r.m).spawn('karakasa', 40 + i * 2, 60, 40, { title: 'oyabun', free: true, graceSteps: T().graceSteps }));
    r.step(60);
    r.phase.p = 'day';
    r.step(1200);
    for (const id of ids) expect(r.m.list().some((q) => q.id === id && q.state !== 'leaving'), `id ${id}`).toBe(true);
  });

  it('leave〔ids〕: そっと 去る〔おとし物 なし〕', () => {
    const r = rig({ yokaiSpawnInterval: 1e9, yokaiSpawnIntervalUnder: 1e9 });
    const id = asFree(r.m).spawn('karakasa', 30, 60, 30, { title: 'oyabun', free: true, graceSteps: T().graceSteps });
    asFree(r.m).leave([id]);
    r.step(600);
    expect(r.m.list().some((q) => q.id === id)).toBe(false);
    expect(r.events.filter((e) => e.type === 'drop' || e.type === 'defeat')).toHaveLength(0);
  });

  it('quietFor: 挑戦して いる 人の まわりでは ふつうの 妖怪の ためしが 0 回〔1,000 ステップ・間かく 1〕。false なら 出る〔このテストが 見て いる しるし〕', () => {
    const cfg = { yokaiSpawnInterval: 1, yokaiSpawnIntervalUnder: 1, yokaiMaxUnder: 100_000, yokaiForgetSteps: 1e9 };
    const open = rig(cfg, { quietFor: () => false });
    open.step(1000);
    expect(open.m.list().length, 'しるし').toBeGreaterThan(0);
    const closed = rig(cfg, { quietFor: () => true });
    closed.step(1000);
    expect(closed.m.list(), '出ない').toHaveLength(0);
  }, 300_000);

  it('見張り〔いまも 緑。ちょうちんを ならべる〕: ちょうちんの まわりでも 3,600 ステップ ほか 7 ひきは 消えない', () => {
    const forget = createYokaiConfig().yokaiForgetSteps as number;
    const r = rig({ yokaiSpawnInterval: 1e9, yokaiSpawnIntervalUnder: 1e9 });
    for (let x = 36; x <= 48; x += 2) r.world.setBlock(x, 60, 42, 'lantern' as never); // ちょうちんを ならべる
    const ids = [0, 1, 2].map((i) => asFree(r.m).spawn('karakasa', 40 + i * 2, 60, 40, { title: 'oyabun', free: true, graceSteps: T().graceSteps }));
    r.step(forget + 600);
    for (const id of ids) expect(r.m.list().some((q) => q.id === id && q.state !== 'leaving'), `id ${id}`).toBe(true);
  }, 300_000);
});
