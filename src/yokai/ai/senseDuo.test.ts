import { describe, expect, it } from 'vitest';
import type { ArmorSlot, DamageKind, DayPhase, Inventory, ItemId, PlayerCombat, TimeOfDay, Vec3, YokaiKind } from '../../contracts';
import { NINJA_GEAR } from '../../craft/config';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { YokaiManager } from './YokaiManager';
import { createYokaiConfig, type YokaiConfig } from './config';
import { SENSE } from './senseTuning';
import type { YokaiPartner } from './target';

/**
 * COOP-1 作業 4b（docs/design/COOP-1.md 1.10 §3.5・AC90）の 先行テスト（赤）。2 人あそびの 妖怪まわり 2 つ。
 *  ① 忍び装束: 妖怪が 気づく 距離は **ねらう 人の そうび** で きまる。いまは `notices`（yokai/ai/chase.ts）が ねらう 相手に かかわらず 1P の そうび
 *     （`YokaiManagerOptions.armor`）を 見て いる（1P が 着ると 2P も 気づかれにくく、2P が 着ても 効かない）。
 *  ② 火の玉の 種類: 妖怪 → 2P の ダメージの 道（currentTarget → partner.hurt）が ダメージの 種類（DamageKind。'ball'）を 落としている。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/yokai/ai/target.ts   YokaiPartner に 足す:
 *     armor?: { equipped(slot: ArmorSlot): ItemId | null }   … ねらわれる 2P の そうび。**なければ はだか**（1P の そうびには 代えない）。
 *     hurt(amount: number, kind: YokaiKind, from: Vec3, damageKind?: DamageKind): boolean   … 4 つめを 足す（currentTarget の damage が 渡す。1P の combat.damage の 4 つめ `kind` と 同じ）。
 *   src/yokai/ai/chase.ts   notices(): 忍び装束の 判定は「いま ねらっている 人」（YokaiField.who）の そうびを 見る:
 *     who = 1 → `opts.armor`（いまの とおり）／ who = 2 → `opts.partner?.()?.armor`（なければ はだか）。
 *     呼ぶ たびに 防具の マスを 4 つ 見る のは 今までどおり（距離が 近い ときだけ・1 回。距離が `sight × shinobiSightMul` 以下 または `sight` より 遠い ときは 聞かない）。
 *     ChaseDeps.opts の 型は Pick<YokaiManagerOptions, 'armor' | 'partner'>。
 *   wire/duoPlay.ts: YokaiPartner は createP2Partner（src/duo/p2Partner.ts。src/duo/p2Guard.test.ts）で 作り、armor = p2.armor。
 *   1 人の ときは かわらない: partner が ない／ねらう 人が 1P の ときは 今までどおり `opts.armor`（src/yokai/ai/sense.test.ts が 見張る）。
 */

const SIZE = { x: 200, y: 40, z: 64 };
const Z = 32.5;
const X = 100.5;
const SIGHT = SENSE.kinds.karakasa.sight;
const HALF = SIGHT * SENSE.shinobiSightMul;
const SHOZOKU = NINJA_GEAR.body;

function makeTime(phase: DayPhase): TimeOfDay {
  return { dayTick: () => 0, day: () => 0, phase: () => phase, skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} };
}
const combat1: PlayerCombat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] };
const inv = { add: () => 0 } as unknown as Inventory;

type Wear = (slot: ArmorSlot) => ItemId | null;
/** 体 1 つぶんの そうび。body だけ 見る。呼ばれた 回数を 数える */
function gear(body: ItemId | null) {
  const o = { calls: 0, body };
  const armor = { equipped: ((slot: ArmorSlot) => (o.calls++, slot === 'body' ? o.body : null)) as Wear };
  return { o, armor };
}

interface Opts {
  p1: Vec3;
  p2: Vec3;
  body1?: ItemId | null;
  /** undefined = 2P に armor の 窓口が ない（古い つなぎ込み） */
  body2?: ItemId | null | undefined;
  config?: Partial<YokaiConfig>;
}

function rig(o: Opts) {
  const w = new ArrayVoxelWorld(SIZE);
  w.fill(0, 8, 0, SIZE.x - 1, 8, SIZE.z - 1, 'stone');
  const p1 = { position: { ...o.p1 } };
  const g1 = gear(o.body1 ?? null);
  const g2 = gear(o.body2 ?? null);
  const hurts: Array<{ amount: number; by: YokaiKind; kind: DamageKind | undefined }> = [];
  const partner: YokaiPartner = {
    position: { ...o.p2 },
    targetable: true,
    hurt: (amount, by, _from, kind) => (hurts.push({ amount, by, kind }), true),
    ...(o.body2 === undefined ? {} : { armor: g2.armor }),
  };
  const config = { ...createYokaiConfig(), yokaiAutoSpawn: false, yokaiWander: false, ...o.config } as YokaiConfig;
  const m = new YokaiManager({ world: w, time: makeTime('night'), getPlayer: () => p1, combat: combat1, inventory: inv, seed: 5, config, partner: () => partner, armor: g1.armor });
  const step = (n = 1) => void Array.from({ length: n }, () => m.update(1 / 60));
  return { m, step, g1, g2, hurts };
}

const FOUND: ReadonlySet<string> = new Set(['chase', 'attack', 'search', 'retreat']);
const stateOf = (m: YokaiManager): string => m.list()[0]!.state;

describe('AC90 忍び装束は ねらう 人の そうびで きまる', () => {
  const FAR = SIGHT * 2.5;
  /** 妖怪は X。2P は 妖怪から d2 の ところ（東）、1P は ずっと 遠く（西） */
  const near2 = (d2: number, o: Partial<Opts> = {}) => rig({ p1: { x: X - FAR, y: 9, z: Z }, p2: { x: X + d2, y: 9, z: Z }, ...o });

  it('表の 数: 気づく 距離 sight と 半分の 比（HALF < d < SIGHT の あいだで 見る）', () => {
    expect(SENSE.kinds.karakasa.shinobi).toBe(true);
    expect(HALF).toBeLessThan(SIGHT);
  });

  it('① 1P だけ 忍び装束・ねらうのは 2P（近い）: 2P は ふつうの 距離（sight）で 気づかれる', () => {
    const r = near2(SIGHT * 0.7, { body1: SHOZOKU });
    r.m.spawn('karakasa', X, 9, Z, { ai: true });
    r.step(30);
    expect(FOUND.has(stateOf(r.m)), '2P に 気づいた').toBe(true);
  });

  it('② 2P だけ 忍び装束: 2P は 半分の 距離まで 気づかれない（半分より 遠い 2P には 300 ステップ 待っても 気づかない）', () => {
    const r = near2(SIGHT * 0.7, { body2: SHOZOKU });
    r.m.spawn('karakasa', X, 9, Z, { ai: true });
    r.step(300);
    expect(stateOf(r.m)).toBe('idle');
  });

  it('③ 2P が 忍び装束でも 半分の 内側なら 気づく', () => {
    const r = near2(HALF * 0.8, { body2: SHOZOKU });
    r.m.spawn('karakasa', X, 9, Z, { ai: true });
    r.step(30);
    expect(FOUND.has(stateOf(r.m))).toBe(true);
  });

  it('④ 1 人の ときと 同じ: ねらうのが 1P で 1P が 忍び装束なら 半分。2P が はだかで 遠くても かわらない', () => {
    // 1P が 近い（妖怪の 東）・2P は 遠い（西）
    const r = rig({ p1: { x: X + SIGHT * 0.7, y: 9, z: Z }, p2: { x: X - FAR, y: 9, z: Z }, body1: SHOZOKU });
    r.m.spawn('karakasa', X, 9, Z, { ai: true });
    r.step(300);
    expect(stateOf(r.m)).toBe('idle');
    const r2 = rig({ p1: { x: X + SIGHT * 0.7, y: 9, z: Z }, p2: { x: X - FAR, y: 9, z: Z } });
    r2.m.spawn('karakasa', X, 9, Z, { ai: true });
    r2.step(30);
    expect(FOUND.has(stateOf(r2.m)), '1P が はだかなら 気づく').toBe(true);
  });

  it('⑤ 2P に armor の 窓口が ない つなぎ込みは はだか 扱い（1P の そうびを 代わりに 読まない）', () => {
    const r = near2(SIGHT * 0.7, { body1: SHOZOKU, body2: undefined });
    r.m.spawn('karakasa', X, 9, Z, { ai: true });
    r.step(30);
    expect(FOUND.has(stateOf(r.m))).toBe(true);
  });

  it('⑥ 防具の マスを 聞くのは ねらう 人の だけ・距離が 半分より 遠く sight より 近い ときだけ（1P の マスは 2P を ねらう とき 聞かない）', () => {
    const mid = near2(SIGHT * 0.7, { body2: SHOZOKU });
    mid.m.spawn('karakasa', X, 9, Z, { ai: true });
    mid.step(60);
    expect(mid.g2.o.calls, '半分と sight の あいだ: 2P の マスを 聞く').toBeGreaterThan(0);
    expect(mid.g1.o.calls, '2P を ねらう とき 1P の マスは 聞かない').toBe(0);

    const close = near2(HALF * 0.5, { body2: SHOZOKU });
    close.m.spawn('karakasa', X, 9, Z, { ai: true });
    close.step(5);
    expect(close.g2.o.calls, '半分の 内側は 聞かなくても 気づく').toBe(0);
    expect(close.g1.o.calls).toBe(0);

    const out = near2(SIGHT * 1.3, { body2: SHOZOKU });
    out.m.spawn('karakasa', X, 9, Z, { ai: true });
    out.step(60);
    expect(out.g2.o.calls, 'sight より 遠い').toBe(0);
    expect(out.g1.o.calls).toBe(0);
  });

  it('⑦ 近さが 同じなら 1P を ねらう（いまの きまり）ので、1P が 着て いれば 2P が はだかでも 半分', () => {
    const r = rig({ p1: { x: X + SIGHT * 0.7, y: 9, z: Z }, p2: { x: X - SIGHT * 0.7, y: 9, z: Z }, body1: SHOZOKU });
    r.m.spawn('karakasa', X, 9, Z, { ai: true });
    r.step(300);
    expect(stateOf(r.m)).toBe('idle');
  });
});

describe('AC83・AC90 妖怪 → 2P の ダメージは 種類（DamageKind）も わたす', () => {
  it('ちょうちんの 火の玉が 2P に 当たると partner.hurt の 4 つめが "ball"（いままで 落ちていた）', () => {
    const r = rig({ p1: { x: X - 60, y: 9, z: Z }, p2: { x: X + 7, y: 9, z: Z }, config: { yokaiMax: 1 } });
    r.m.spawn('chochin', X, 9, Z, { ai: true });
    for (let i = 0; i < 1800 && !r.hurts.some((h) => h.kind === 'ball'); i++) r.step(1);
    const ball = r.hurts.filter((h) => h.kind === 'ball');
    expect(ball.length, '火の玉が 2P に 当たった').toBeGreaterThan(0);
    expect(ball[0]!.by).toBe('chochin');
    expect(ball[0]!.amount).toBeGreaterThan(0);
  });

  it('からかさの 体当たりは ふつう（4 つめは なし か "normal"）', () => {
    const r = rig({ p1: { x: X - 60, y: 9, z: Z }, p2: { x: X + 1.2, y: 9, z: Z } });
    r.m.spawn('karakasa', X, 9, Z, { ai: true });
    for (let i = 0; i < 900 && r.hurts.length === 0; i++) r.step(1);
    expect(r.hurts.length).toBeGreaterThan(0);
    for (const h of r.hurts) expect([undefined, 'normal']).toContain(h.kind);
  });
});
