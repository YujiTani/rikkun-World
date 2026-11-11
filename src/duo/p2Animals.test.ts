import { describe, expect, it } from 'vitest';
import type { AnimalEvent, LockStatus, PlayerState } from '../contracts';
import { OFFSET, setupDuo, type DuoS } from '../animals/duoKit';
import { BUG_CATCH_UPDATES } from '../animals/animalConsts';
import { DigSystemImpl } from '../dig/DigSystem';
import { lookDirection } from '../dig/raycast';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createP2Animals } from './p2Animals';
import { createP2Dig } from './p2Dig';
import { P2State } from './p2State';

/**
 * COOP-1 5c（docs/design/COOP-1.md 1.15 §3.7 (d)・§8・§12.0、AC136・AC154・AC156・AC160）の 先行テスト（赤）。
 * 2P の ほる係の `m4.animals` に 渡す 包み。本物の `AnimalManager`（世界に 1 つ）・本物の `DigSystemImpl`（1P）と `createP2Dig`（2P）で 動かす。
 *
 * ---- 実装への 約束（仕様 §8「5c（1.15）」。新しい ファイル src/duo/p2Animals.ts）----
 *   createP2Animals(m: AnimalManager): AnimalApi
 *     `AnimalApi` と 同じ 形。呼び出しは ぜんぶ `who: 2` を つけて `m` に わたす。2P の ほる係の `m4.animals` に そのまま 入れる:
 *       carrying() = m.carrying(2)・carryHold(id, t) = m.carryHold(id, t, 2)・putDown(spot) = m.putDown(spot, 2)・putDownWhy() = m.putDownWhy(2)・
 *       throwSpot(aim) = m.throwSpot(aim, 2)・startThrow(aim) = m.startThrow(aim, 2)・swingNet(b) = m.swingNet(b, 2)・collectCoop(id) = m.collectCoop(id, 2)・
 *       emitHint(h) = m.emitHint(h, 2)・meat(id, id2) = m.meat(id, id2, 2)。
 *     出来事に `by: 2` が つく のは 2P の 口を 通した 物だけ。feed・pet・useKit・breakCoop が 起こす 出来事（feed・pet・full・hint・kitWait…・coopLocked）にも `by: 2`
 *     （つけ方は 開発に まかせる。口の 引数に who を 足しても、包みが 受け取って つけなおしても よい）。
 *     にわとりの 状態（なつき度・おなかいっぱい・まち中・ねている）は 世界に 1 つ なので、2P が あげた 子に すぐ 1P が あげると 1P は 'full'。
 *     rayHit・preview・isFriend・natsukiView・coopAt・coops・kits・kitAt・previewCoop・placeCoop・meatList・forEachVisible などは そのまま 通す。
 *   2P の ほる係（`createP2Dig`）の `m4.animals`・`m4.live` に これを 渡せば、DigAnimals の 右クリックの 係が そのまま 2P の パッドの ZL で 動く（押す 判定は 2P の 入力）。
 *     - 持ち物は 2P の 物が へる（むし・はらぱんみみず・たまご・toriya は `consumeHeld`）。
 *     - あみを ふって いる `netSwingTicks` の あいだ 2P の ZL は 何も しない（1P の ふりとは 別に 数える。`DigAnimals.netLock` が 人ごとに ある）。
 *     - 2P が なかまを 押しつづけて いる あいだ `dig.carryProgress()` が 0 から 1 へ（だっこ したら 0）。`dig.animalTarget()` が 2P の ねらい。
 */

const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
const EYE = 1.62;
const stateOf = (position: { x: number; y: number; z: number }): PlayerState => ({
  position,
  velocity: { x: 0, y: 0, z: 0 },
  yawDeg: 90, // 前が +x
  pitchDeg: 0,
  onGround: true,
  inWater: false,
  moving: false,
  facingDeg: 0,
  running: false,
});

/** 本物の 1P の ほる係・2P の ほる係を 同じ 世界・同じ にわとりの しくみに つなぐ */
function rig(o: { held2?: [string, number]; held1?: [string, number] } = {}) {
  const s = setupDuo();
  // 2P は 1P の すぐ そば（ほんとうの 参加と 同じ。なかまは 1P に ついて くる ので 2P の 前に 立つ ように）
  s.pl2.cur!.position.x = s.p1.position.x;
  s.pl2.cur!.position.z = s.p1.position.z + 5;
  const ps1 = stateOf(s.p1.position);
  const ps2 = stateOf(s.pl2.cur!.position);
  const a1 = new ActionState();
  const a2 = new ActionState();
  const inv1 = new InventoryImpl();
  const p2 = new P2State();
  if (o.held1) inv1.setSlot(0, { item: o.held1[0] as never, count: o.held1[1] });
  if (o.held2) p2.inventory.setSlot(0, { item: o.held2[0] as never, count: o.held2[1] });
  inv1.select(0);
  p2.inventory.select(0);
  const live = () => s.settings;
  const dig1 = new DigSystemImpl(s.world, () => ps1, a1, lock, inv1, () => EYE, undefined, undefined, null, { animals: s.m, live, partner: () => ({ ...ps2.position }) });
  const wrapped = createP2Animals(s.m);
  const dig2 = createP2Dig({ world: s.world, p2, actions: a2, position: () => ps2, lock, eyeHeight: () => EYE, partner: () => ({ ...ps1.position }), m4: { animals: wrapped, live } });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      dig1.update();
      dig2.update();
      s.m.setTargeted(dig1.animalTarget(), 1);
      s.m.setTargeted(dig2.animalTarget(), 2);
      s.m.update();
      a1.endFrame();
      a2.endFrame();
    }
  };
  step(1);
  /** その人の 前（+x に 2 マス）に なかまを 置いて 落ち着くまで 待つ */
  const bird = (ps: PlayerState, o: Record<string, unknown> = {}) => {
    const id = s.m.spawn(ps.position.x + 2, 9, ps.position.z, { friend: true, follow: s.full, ...o })!;
    step(60);
    return id;
  };
  /** その人の 目から その羽が ねらえる 向きを さがして 向ける（羽が 少し 動いても 向きなおせる） */
  const look = (ps: PlayerState, id: number) => {
    const b = s.one(id);
    ps.yawDeg = (Math.atan2(b.x - ps.position.x, -(b.z - ps.position.z)) * 180) / Math.PI;
    for (let p = 40; p >= -80; p--) {
      const d = lookDirection(ps.yawDeg, p, { x: 0, y: 0, z: 0 });
      const hit = s.m.rayHit({ x: ps.position.x, y: ps.position.y + EYE, z: ps.position.z }, d, 5);
      if (hit?.id === id) {
        ps.pitchDeg = p;
        return;
      }
    }
    throw new Error(`ねらえない: ${id} (${b.x}, ${b.y}, ${b.z})`);
  };
  const tap = (a: ActionState, n = 1) => {
    a.press('secondary');
    step(n);
    a.release('secondary');
    step(1);
  };
  return { s, ps1, ps2, a1, a2, inv1, p2, dig1, dig2, wrapped, step, bird, look, tap };
}

const only = <T extends AnimalEvent['type']>(s: DuoS, type: T) => s.m.events().filter((e): e is Extract<AnimalEvent, { type: T }> => e.type === type);
const byOf = (e: AnimalEvent): unknown => ('by' in e ? (e as { by?: unknown }).by : undefined);

describe('createP2Animals 包み: 呼び出しは who: 2', () => {
  it('だっこ・おろす・着地点・合図・あみ は 2P の 物（carrying(2)）。出来事に by: 2', () => {
    const s = setupDuo();
    const api = createP2Animals(s.m);
    const id = s.friend(2);
    s.m.events();
    expect(api.carrying()).toBeNull();
    expect(api.carryHold?.(id, s.hold)).toBe('lifted');
    expect(api.carrying()).toBe(id);
    expect(s.m.carrying(2)).toBe(id);
    expect(s.m.carrying(1)).toBeNull();
    expect(s.m.carrying()).toBeNull();
    const px = Math.floor(s.pl2.cur!.position.x);
    const sp = api.throwSpot?.({ ...s.aimEast(2, { x: px + 2, y: 9, z: 20 }) });
    expect(sp).toMatchObject({ x: px + 2.5, ok: true });
    expect(api.putDown({ x: s.pl2.cur!.position.x + 1.5, y: 9, z: s.pl2.cur!.position.z })).toBe(true);
    api.emitHint?.('carryWild');
    const ev = s.m.events();
    expect(ev.filter((e) => e.type === 'carry').map(byOf)).toEqual([2]);
    expect(ev.filter((e) => e.type === 'putDown').map(byOf)).toEqual([2]);
    expect(ev.filter((e) => e.type === 'hint')).toEqual([{ type: 'hint', hint: 'carryWild', by: 2 }]);
    expect(s.m.lastHint(), '1P の 合図は 書かない').toBeNull();
  });

  it('あみ: swingNet は 2P の ふり（swing・bugCatch が by: 2・むしは 2P の もちもの）', () => {
    const s = setupDuo();
    s.settings.bugChance = 1;
    const api = createP2Animals(s.m);
    api.swingNet({ x: 10, y: 12, z: 10 });
    s.step(BUG_CATCH_UPDATES);
    const ev = s.m.events();
    expect(ev.filter((e) => e.type === 'swing').map(byOf)).toEqual([2]);
    expect(ev.filter((e) => e.type === 'bugCatch').map(byOf)).toEqual([2]);
    expect(s.added).toEqual([{ item: 'mushi', who: 2 }]);
  });

  it('えさ・なでる・小屋: 出来事 feed・pet・coopLocked と 合図に by: 2。1P の 出来事には by が ない', () => {
    const s = setupDuo();
    const api = createP2Animals(s.m);
    const a = s.friend(2, -1, 0, { stage: 'chick' });
    const b = s.friend(1, -1, 0, { stage: 'chick' });
    s.m.events();
    expect(api.feed(a, 'mushi')).toBe('ate');
    expect(api.pet(a)).toBeNull(); // 食べた あとの 動きの 最中
    s.step(s.settings.animalReactTicks + 1);
    expect(api.pet(a)).toBe('friend');
    expect(s.m.feed(b, 'mushi')).toBe('ate');
    const ev = s.m.events();
    expect(ev.filter((e) => e.type === 'feed' && e.id === a).map(byOf)).toEqual([2]);
    expect(ev.filter((e) => e.type === 'pet' && e.id === a).map(byOf)).toEqual([2]);
    const mine = ev.filter((e) => e.type === 'feed' && e.id === b);
    expect(mine).toHaveLength(1);
    expect('by' in mine[0]!).toBe(false);

    const c = s.coop(50 + OFFSET, 50);
    s.kid(c);
    s.m.events();
    expect(api.breakCoop(c.id, true)).toBe('locked');
    const ev2 = s.m.events();
    expect(ev2.filter((e) => e.type === 'coopLocked').map(byOf)).toEqual([2]);
    expect(ev2.filter((e) => e.type === 'hint')).toEqual([{ type: 'hint', hint: 'coopNotEmpty', by: 2 }]);
    expect(s.m.lastHint()).toBeNull();
  });

  it('こたつ: 2P の 合図（kitNeedEgg）は by: 2。たまごを 入れるのは 世界の こたつ（1P からも 見える）', () => {
    const s = setupDuo();
    const api = createP2Animals(s.m);
    const x = 20 + OFFSET + 3;
    s.world.setBlock(x, 9, 20, 'nukunuku');
    s.m.events();
    expect(api.useKit(x, 9, 20, null)).toBe('needEgg');
    expect(s.m.events().filter((e) => e.type === 'hint')).toEqual([{ type: 'hint', hint: 'kitNeedEgg', by: 2 }]);
    expect(api.useKit(x, 9, 20, 'egg')).toBe('put');
    expect(s.m.kitAt(x, 9, 20)).not.toBeNull();
    expect(s.m.useKit(x, 9, 20, null)).toBe('wait'); // 2P が 入れた こたつは 世界の 物（1P の 口からも 同じ こたつに 見える）
    expect(s.m.useKit(x, 9, 20, 'egg')).toBe('put'); // たまごは 3 こまで 入る ので 1P も 足せる
  });

  it('なつき度・おなかいっぱいは にわとりの 物: 2P が あげた 子に すぐ 1P が あげると 1P は full（まってね）', () => {
    const s = setupDuo();
    const api = createP2Animals(s.m);
    const a = s.friend(2, -1, 0, { stage: 'chick' });
    expect(api.feed(a, 'mushi')).toBe('ate');
    s.step(s.settings.animalReactTicks + 1);
    expect(api.preview(a, { item: 'mushi', count: 1 })).toBe('animalFull'); // 見るだけ。feed の 'full' の ロックの 前に 聞く
    expect(s.m.feed(a, 'mushi')).toBe('full');
  });

  it('見るだけの 口は そのまま 通る（rayHit・preview・isFriend・coops）', () => {
    const s = setupDuo();
    const api = createP2Animals(s.m);
    const id = s.friend(2, -1, 0);
    const p = s.one(id);
    const ray = [{ x: p.x - 3, y: p.y + 0.4, z: p.z }, { x: 1, y: 0, z: 0 }] as const;
    expect(api.rayHit(ray[0], ray[1], 6)).toEqual(s.m.rayHit(ray[0], ray[1], 6));
    expect(api.rayHit(ray[0], ray[1], 6)?.id).toBe(id);
    expect(api.isFriend?.(id)).toBe(true);
    expect(api.coops()).toEqual(s.m.coops());
  });
});

describe('2P の ほる係（createP2Dig）に つなぐ: 右クリックの 係が 2P の ZL で 動く', () => {
  it('むしを あげる: 2P の むしが 1 へる・1P の もちものは かわらない・出来事 feed は by: 2', () => {
    const r = rig({ held2: ['mushi', 3], held1: ['mushi', 3] });
    const id = r.bird(r.ps2, { stage: 'chick' });
    r.look(r.ps2, id);
    r.step(1);
    r.s.m.events();
    r.tap(r.a2);
    expect(r.p2.inventory.held()?.count).toBe(2);
    expect(r.inv1.held()?.count).toBe(3);
    const feed = only(r.s, 'feed');
    expect(feed).toHaveLength(1);
    expect(byOf(feed[0]!)).toBe(2);
  });

  it('1P が ねらうと 1P の 物が へる（今までどおり。出来事に by は ない）', () => {
    const r = rig({ held2: ['mushi', 3], held1: ['mushi', 3] });
    const id = r.bird(r.ps1, { stage: 'chick' });
    r.look(r.ps1, id);
    r.step(1);
    r.s.m.events();
    r.tap(r.a1);
    expect(r.inv1.held()?.count).toBe(2);
    expect(r.p2.inventory.held()?.count).toBe(3);
    const feed = only(r.s, 'feed');
    expect(feed).toHaveLength(1);
    expect('by' in feed[0]!).toBe(false);
  });

  it('だっこ: 2P が ZL を carryHoldTicks 押しつづけると carrying(2)。わ（carryProgress）は 0 から 1 へ、だっこ したら 0。1P の わは 動かない', () => {
    const r = rig();
    const id = r.bird(r.ps2);
    r.look(r.ps2, id);
    r.step(1);
    const hold = r.s.settings.carryHoldTicks;
    expect(r.dig2.carryProgress()).toBe(0);
    r.a2.press('secondary');
    r.step(Math.floor(hold / 2));
    const half = r.dig2.carryProgress();
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.8);
    expect(r.dig1.carryProgress()).toBe(0);
    expect(r.dig2.animalTarget()).toBe(id);
    r.step(hold);
    expect(r.s.m.carrying(2)).toBe(id);
    expect(r.s.m.carrying(1)).toBeNull();
    expect(r.dig2.carryProgress()).toBe(0);
    expect(only(r.s, 'carry').map(byOf)).toEqual([2]);
    r.a2.release('secondary');
    r.step(1);
  });

  it('だっこ中に ZL: 2P の ねらいから なげる（toss か putDown が by: 2）。羽は 2P の 近くへ', () => {
    const r = rig();
    const id = r.bird(r.ps2);
    r.look(r.ps2, id);
    r.step(1);
    r.a2.press('secondary');
    r.step(r.s.settings.carryHoldTicks + 2);
    r.a2.release('secondary');
    r.step(2);
    expect(r.s.m.carrying(2)).toBe(id);
    r.ps2.pitchDeg = 40; // 空を 見る → 何も ねらわない: 前 3 マス
    r.step(1);
    r.s.m.events();
    r.tap(r.a2);
    r.step(150);
    const ev = r.s.m.events();
    expect(ev.filter((e) => e.type === 'toss').map(byOf)).toEqual([2]);
    expect(ev.filter((e) => e.type === 'putDown').map(byOf)).toEqual([2]);
    expect(r.s.m.carrying(2)).toBeNull();
    const b = r.s.one(id);
    const range = r.s.settings.throwRange;
    expect(Math.hypot(b.x - r.ps2.position.x, b.z - r.ps2.position.z)).toBeLessThanOrEqual(range + 1);
    expect(b.x).toBeGreaterThan(r.ps2.position.x);
  });

  it('あみ: 2P が ふって いる netSwingTicks の あいだ 2P の ZL は 何も しない。そのあいだも 1P は ふれる', () => {
    const r = rig({ held2: ['mushi_ami', 1], held1: ['mushi_ami', 1] });
    r.s.settings.bugChance = 1;
    for (const ps of [r.ps1, r.ps2]) r.s.world.setBlock(Math.floor(ps.position.x) + 2, 10, Math.floor(ps.position.z), 'leaves');
    r.step(2);
    r.s.m.events();
    r.tap(r.a2);
    expect(only(r.s, 'swing').filter((e) => byOf(e) === 2)).toHaveLength(1);
    r.tap(r.a2); // ふっている あいだ
    expect(only(r.s, 'swing')).toHaveLength(0);
    r.tap(r.a1); // 1P は ふれる（1P の ふりとは 別に 数える）
    const swings = only(r.s, 'swing');
    expect(swings).toHaveLength(1);
    expect('by' in swings[0]!).toBe(false);
    r.step(r.s.settings.netSwingTicks);
    r.tap(r.a2);
    expect(only(r.s, 'swing').filter((e) => byOf(e) === 2)).toHaveLength(1);
  });

  it('あみで とれた むしは 2P の もちもの（addItem の who が 2）。1P の ふりは 1P', () => {
    const r = rig({ held2: ['mushi_ami', 1], held1: ['mushi_ami', 1] });
    r.s.settings.bugChance = 1;
    for (const ps of [r.ps1, r.ps2]) r.s.world.setBlock(Math.floor(ps.position.x) + 2, 10, Math.floor(ps.position.z), 'leaves');
    r.step(2);
    r.tap(r.a2);
    r.tap(r.a1);
    r.step(BUG_CATCH_UPDATES + 2);
    expect(r.s.added.map((x) => x.who).sort()).toEqual([1, 2]);
  });
});

describe('AC154・AC136 2P の ほる係で 小屋・こたつ・みみず・あみ（持ち物は 2P の 物が へる・1P は かわらない）', () => {
  /** 足もとの 地面を ねらう（まっすぐ 下に 近い）。向きは yaw で きめる */
  const lookDown = (ps: PlayerState, yawDeg: number) => {
    ps.yawDeg = yawDeg;
    ps.pitchDeg = -45;
  };

  it('toriya を 置く: 2P の toriya が へる（手が 空に）・1P は かわらない。もんの むきは 置いた 2P の 方（1P の 方ではない）', () => {
    const r = rig({ held2: ['toriya', 1], held1: ['toriya', 1] });
    // 2P は 1P から 遠い 所で、南（+z）を 向いて 置く → もんは 北（0）= 置いた 人の 側。1P の 方（西）ではない
    r.ps2.position.x = 60.5;
    r.ps2.position.z = 50.5;
    lookDown(r.ps2, 180);
    r.step(2);
    r.s.m.events();
    r.tap(r.a2);
    expect(r.p2.inventory.held()).toBeNull(); // toriya は 1 つずつ（つみかさね なし）。置いたら 2P の 手が 空に
    expect(r.inv1.held()).toEqual({ item: 'toriya', count: 1 });
    const coops = r.s.m.coops();
    expect(coops).toHaveLength(1);
    expect(coops[0]!.dir).toBe(0);
    expect(coops[0]!.z).toBeGreaterThan(r.ps2.position.z);
  });

  it('toriya を 置く（1P）: 1P の toriya が へる・2P は かわらない（今までどおり）', () => {
    const r = rig({ held2: ['toriya', 1], held1: ['toriya', 1] });
    lookDown(r.ps1, 90); // 東を 向く → もんは 西（3）
    r.step(2);
    r.tap(r.a1);
    expect(r.inv1.held()).toBeNull();
    expect(r.p2.inventory.held()).toEqual({ item: 'toriya', count: 1 });
    expect(r.s.m.coops().map((c) => c.dir)).toEqual([3]);
  });

  it('こたつに たまごを 入れる: 2P の たまごが 1 へる・1P は かわらない。入れた こたつは 世界の 物', () => {
    const r = rig({ held2: ['egg', 3], held1: ['egg', 3] });
    const kx = Math.floor(r.ps2.position.x) + 3;
    const kz = Math.floor(r.ps2.position.z);
    r.s.world.setBlock(kx, 10, kz, 'nukunuku');
    r.ps2.pitchDeg = 0;
    r.step(2);
    r.s.m.events();
    r.tap(r.a2);
    expect(r.p2.inventory.held()?.count).toBe(2);
    expect(r.inv1.held()?.count).toBe(3);
    expect(r.s.m.kitAt(kx, 10, kz)).not.toBeNull();
  });

  it('はらぱんみみずを あげる: 2P の みみずが 1 へる・1P は かわらない・出来事 harapanFeed は by: 2', () => {
    const r = rig({ held2: ['harapan_mimizu', 2], held1: ['harapan_mimizu', 2] });
    const id = r.bird(r.ps2);
    r.look(r.ps2, id);
    r.step(1);
    r.s.m.events();
    r.tap(r.a2);
    expect(r.p2.inventory.held()?.count).toBe(1);
    expect(r.inv1.held()?.count).toBe(2);
    const fed = only(r.s, 'harapanFeed');
    expect(fed).toHaveLength(1);
    expect(byOf(fed[0]!)).toBe(2);
  });

  it('AC136 netHint: あみを もって 木でない 所を ねらって ZL → 合図 netHint が by: 2（1P の lastHint は 書かない）', () => {
    const r = rig({ held2: ['mushi_ami', 1], held1: ['mushi_ami', 1] });
    lookDown(r.ps2, 90);
    r.step(2);
    r.s.m.events();
    const before = r.s.m.lastHint();
    r.tap(r.a2);
    const hints = only(r.s, 'hint').filter((e) => e.hint === 'netHint');
    expect(hints).toHaveLength(1);
    expect(byOf(hints[0]!)).toBe(2);
    expect(r.s.m.lastHint()).toEqual(before);
  });

  it('AC136 treeEmpty: 1P が とった 木は 世界で 休む → 2P が 同じ 木を ふると treeEmpty が by: 2（空ぶりは 2P の 物）', () => {
    const r = rig({ held2: ['mushi_ami', 1], held1: ['mushi_ami', 1] });
    r.s.settings.bugChance = 1;
    // 2 人とも 同じ 場所に 立って 同じ 木（葉）を ねらう
    r.ps2.position.x = r.ps1.position.x;
    r.ps2.position.z = r.ps1.position.z;
    r.s.world.setBlock(Math.floor(r.ps1.position.x) + 2, 10, Math.floor(r.ps1.position.z), 'leaves');
    r.step(2);
    r.tap(r.a1);
    expect(only(r.s, 'swing').map((e) => e.caught)).toEqual([true]);
    r.step(r.s.settings.netSwingTicks + 1);
    r.s.m.events();
    r.tap(r.a2);
    const ev = r.s.m.events();
    expect(ev.filter((e) => e.type === 'swing').map((e) => [(e as { caught: boolean }).caught, byOf(e)])).toEqual([[false, 2]]);
    expect(ev.filter((e) => e.type === 'hint' && e.hint === 'treeEmpty').map(byOf)).toEqual([2]);
  });
});
