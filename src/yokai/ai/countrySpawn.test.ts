import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, PlayerCombat, TimeOfDay } from '../../contracts';
import { COUNTRY_KINDS, countryAt } from '../../world/gen/biome';
import { COUNTRY_TABLE } from '../../world/gen/countryTable';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { YokaiManager } from './YokaiManager';

/** #291 COUNTRY-1 AC4・AC6・AC8（docs/design/COUNTRY-1.md §3.3・§9） */
const time = (phase: DayPhase): TimeOfDay =>
  ({ dayTick: () => 0, day: () => 0, phase: () => phase, skyColor: () => '#000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} }) as unknown as TimeOfDay;
const combat = {
  hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [],
} as unknown as PlayerCombat;
const inv = { add: () => 0 } as unknown as Inventory;

function make(extra: Record<string, unknown> = {}, seed = 1) {
  const world = new ArrayVoxelWorld({ x: 128, y: 32, z: 64 });
  for (let x = 0; x < 128; x++) for (let z = 0; z < 64; z++) world.setBlock(x, 8, z, 'stone');
  const player = { position: { x: 64, y: 9, z: 32 } };
  const m = new YokaiManager({ world, time: time('night'), getPlayer: () => player, combat, inventory: inv, seed, ...extra } as never);
  m.config.yokaiWander = false;
  return { m, player };
}

describe('妖怪の えらび方（場所 → 国 → 種類）', () => {
  it('AC6: 国 A（x<64）は ちょうちん だけ・B は からかさ だけ。どちらも 出る', () => {
    const table = [
      { kind: 'harappa', yokai: { chochin: 10 } },
      { kind: 'mori', yokai: { karakasa: 10 } },
    ];
    const { m } = make({ countryOf: (x: number) => (x < 64 ? 'harappa' : 'mori'), countryTable: table });
    m.config.yokaiMax = 100000;
    m.config.yokaiSpawnInterval = 1;
    m.config.yokaiAutoSpawn = true;
    let a = 0;
    let b = 0;
    let seen = 0;
    for (let i = 0; i < 20000 && seen < 200; i++) {
      m.update(1 / 60);
      for (const e of m.takeHookEvents()) {
        if (e.type !== 'spawn') continue;
        seen++;
        if (e.position.x < 64) {
          expect(e.kind).toBe('chochin');
          a++;
        } else {
          expect(e.kind).toBe('karakasa');
          b++;
        }
      }
      m.clear();
    }
    expect(seen).toBeGreaterThanOrEqual(200);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
  });
  it('AC8: 同じ シード・同じ うごきなら 種類・場所・順が 同じ', () => {
    const run = () => {
      const { m } = make({ countryOf: () => 'harappa' });
      m.config.yokaiAutoSpawn = true;
      for (let i = 0; i < 1500; i++) m.update(1 / 60);
      return m.takeHookEvents().filter((e) => e.type === 'spawn');
    };
    const r = run();
    expect(r.length).toBeGreaterThan(0);
    expect(run()).toEqual(r);
  });
  it('AC4: spawnWeights(x, z) は countryAt の行 × 倍率。倍率 0 の種類は 12 国とも 0', () => {
    const seed = 20261012;
    const { m } = make({ seed, countryOf: (x: number, z: number) => countryAt(seed, x, z).kind }, seed);
    const pts = [{ x: 0, z: 0 }, { x: 500, z: 300 }, { x: -700, z: 900 }, { x: 2000, z: -1500 }, { x: -3000, z: -2500 }];
    for (const p of pts) {
      const w = m.spawnWeights(p.x, p.z);
      const kind = countryAt(seed, p.x, p.z).kind;
      expect(w.country).toBe(kind);
      const row = COUNTRY_TABLE.find((r) => r.kind === kind)!;
      expect(w.weights).toEqual(expect.objectContaining(row.yokai));
    }
    m.config.yokaiWeights.nurikabe = 0;
    m.config.yokaiWeights.karakasa = 2;
    for (const k of COUNTRY_KINDS) {
      const row = COUNTRY_TABLE.find((r) => r.kind === k)!;
      const mk = make({ countryOf: () => k }, 1).m;
      mk.config.yokaiWeights.nurikabe = 0;
      mk.config.yokaiWeights.karakasa = 2;
      const w = mk.spawnWeights(0, 0).weights;
      expect(w.nurikabe).toBe(0);
      expect(w.karakasa).toBe((row.yokai.karakasa ?? 0) * 2);
    }
  });
});
