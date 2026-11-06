import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BladeEvent, BowEvent, CombatEvent, DigEvent, DigState, DigSystem, TargetInfo } from '../contracts';
import { COMBAT_SOUNDS, playCombat } from '../fx/combatSounds';
import { FX_SETTINGS } from '../fx/config';
import { createFootsteps, FOOTSTEP_TUNING } from '../fx/footsteps';
import { SoundFx, type Tone } from '../fx/sound';
import { playSwing } from '../ui/craftUi';
import { WEAPON_SOUNDS, playBladeSound, playBowSound } from '../fx/weaponSounds';
import { createP2DigFx } from './p2DigFx';
import { createP2Sounds } from './p2Sounds';

/**
 * COOP-1 作業 3c（#417）の 先行テスト（赤）。AC67（2P の 足音・ほる・ひび・こわす・おく・ひろう・こうげき の 音）。仕様 §3.4・§9.7。
 * 「つくる」は のぞく（AC67）。「1P から 60 マス（分割中）」でも 鳴る・段を かえない は、2P の 音が **距離を 受けとらない 作り**で 守る
 * （`createP2Sounds` に 位置の 引数は ない。液体の 音のような 距離の 段は かけない）。E2E は 書かない。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/fx/weaponSounds.ts（切り出し。WeaponFx の onBlade・onBow の 「音を 鳴らす 部分」を 純粋な 関数に する。WeaponFx も これを 呼ぶ。1P の 音は かわらない）
 *     playBladeSound(sound: Pick<SoundFx, 'playTones'>, e: BladeEvent): void
 *       techStart → playWeapon(tech)（step 2 は 続けて combo2・step 3 は combo3）／ techHit → kesa なら playWeapon('kesaHit')、それ以外は playCombat('hit')／
 *       stance → playWeapon('stance')／ ほかの 出来事（techMiss・cancel）は 何も 鳴らさない。
 *       （WeaponFx の replaceTechSound — 虹の 刀が 斬撃音を 入れかえる 枝 — は WeaponFx に のこす。2P は 虹の 刀を 持たない 段階）
 *     playBowSound(sound: Pick<SoundFx, 'play' | 'playTones'>, e: BowEvent): void
 *       stage → drawStage1〜3／ arrowShot → shoot1〜3（stage で）／ arrowHit → 'arrowHit' ＋ playCombat('hit')／ arrowStick → 'arrowStick'／ dryRelease → 'dry'／
 *       noArrow → sound.play('clink')／ pickup → sound.play('pickup')／ ほか（drawStart・arrowEnd）は 何も 鳴らさない。（今の WeaponFx.onBow の 音の 部分そのまま）
 *   src/duo/p2Sounds.ts   createP2Sounds(sound: Pick<SoundFx, 'play' | 'playTones'>): P2Sounds
 *     2P が 鳴らす 音（ほる・ひび・こわす・おく・ひろう は 今の 2P の DigFx = `createP2DigFx` が 出す ので、下の 見張りの とおり 今のまま）。
 *     まだ ない 3 つ（足音・こうげき・刀と 弓の わざ）を ここに 集める。1P と 同じ 音の 表・同じ 大きさ（距離で 小さく しない）。数の 上限は 渡された SoundFx の もの 1 つ（2 人で 1 つ）。
 *     P2Sounds = {
 *       // 毎ステップ。2P の 足音。作りは `createFootsteps(sound)` を 2P 用に もう 1 つ（1 歩の 数え方は 2P だけの 分）。鳴らした ときは 種類、鳴らさない ときは null
 *       step(body: GetaPlayer, groundId: () => string): FootKind | null;
 *       // 2P の combat.drainEvents()。punchStart → 'punch'・punchHit → 'hit'・punchMiss → 'miss'（`playCombat`。CombatFx と 同じ 名前）。ほかの 出来事は 何も 鳴らさない
 *       combat(events: readonly CombatEvent[]): void;
 *       // 2P の tools.drainSwings()。`playSwing(sound, anim, held)` と 同じ 音
 *       swings(swings: readonly { anim: SwingAnim }[], held: ItemId | null): void;
 *       // 2P の blade.drainEvents()。1 つずつ `playBladeSound(sound, e)`
 *       blade(events: readonly BladeEvent[]): void;
 *       // 2P の tools.drainArrowEvents()。1 つずつ「`playBowSound(sound, e)` ＋ arrowHit なら もう 1 つ `playCombat(sound, 'hit')`（1P の step.ts:270 と 同じ）」。
 *       // noArrow だけは 鳴らさない（1P も 画面の 合図だけ。2P は 合図の 画面が ない）
 *       arrows(events: readonly BowEvent[]): void;
 *     }
 *   配線（テストの 外）: wire/duoPlay.ts の
 *     - Live に 2P 用の blade（いま build() の 中の ローカル）を 持たせ、step() で `l.blade.drainEvents()` を 毎ステップ 取り出して blade() に わたす（取り出さないと たまり続ける）。
 *       combat.drainEvents()・tools.drainSwings()・tools.drainArrowEvents() も いま 捨てている 所を 上の 口へ。
 *     - 足音: 2P の 体（ctl.state）の 足もとの ブロックで step() を 呼ぶ。1P の step.ts:192 と 同じに、2P の 遊び画面が 開いて いない（panelOpen でない）・
 *       2P の combat.dead() でない・flinching() でない ときだけ 歩く。そうでない ときは running と onGround を false にして わたす（倒れている あいだも 含む）。
 *     - ?duo=dev で 起動した ときも duo.ts の dev join で duoSplit が 1 つ 鳴る（`createSplitSound.onJoined()` は join() の 中なので 同じ。E2E で `audio.sfx()` の duoSplit を 数える なら この 1 つを 考えに 入れる）。
 *   ※ 2P の「やられた／ダメージ」の 音（hurt・faint・respawn）は AC67 の 対象外。決めるのは 段階 2 以降（報告に 書いた）。
 */

type Played = readonly Tone[];

/** 鳴らす 部品の 並びを ためる だけの にせ の 音 */
function recorder() {
  const played: Played[] = [];
  const names: string[] = [];
  return { played, names, sound: { playTones: (t: Played) => void played.push(t), play: (n: string) => void names.push(n) } };
}

const walk = (o: Partial<{ running: boolean; onGround: boolean; inWater: boolean; v: number }> = {}) => ({
  running: o.running ?? false,
  onGround: o.onGround ?? true,
  inWater: o.inWater ?? false,
  velocity: { x: o.v ?? 4, z: 0 },
});

describe('AC67: 2P の 足音', () => {
  const GROUNDS = ['grass', 'dirt', 'stone', 'sand', 'log', 'snow'];

  it('1P の 同じ 足音と 同じ 部品・同じ 大きさ（距離の 段を かけない）', () => {
    for (const id of GROUNDS) {
      const one = recorder();
      const two = recorder();
      const f1 = createFootsteps(one.sound);
      const f2 = createP2Sounds(two.sound);
      for (let i = 0; i < FOOTSTEP_TUNING.walkTicks; i++) {
        f1.step(walk(), () => id);
        f2.step(walk(), () => id);
      }
      expect(one.played.length, id).toBe(1);
      expect(two.played, id).toEqual(one.played);
      // 部品の 配列そのもの（名前の 引き当てに 使う）を 作りなおさない
      expect(two.played[0], id).toBe(one.played[0]);
    }
  });

  it('歩く: walkTicks ごとに 1 歩、走る: runTicks ごと。空中・止まっている・水の 中 では 鳴らない', () => {
    const r = recorder();
    const p2 = createP2Sounds(r.sound);
    const n = (o: Parameters<typeof walk>[0], ticks: number) => {
      let k = 0;
      for (let i = 0; i < ticks; i++) if (p2.step(walk(o), () => 'grass')) k++;
      return k;
    };
    expect(n({}, FOOTSTEP_TUNING.walkTicks * 3)).toBe(3);
    expect(n({ running: true }, FOOTSTEP_TUNING.runTicks * 4)).toBe(4);
    for (const o of [{ onGround: false }, { v: 0 }, { inWater: true }]) expect(n(o, 100)).toBe(0);
  });

  it('2 人が 同時に 歩くと 足音は 2 人分（1 歩の 数え方は 1 人ずつ）', () => {
    const r = recorder();
    const f1 = createFootsteps(r.sound);
    const p2 = createP2Sounds(r.sound);
    const lag = 10; // 2P は 10 ステップ おくれて 歩き出す
    const total = FOOTSTEP_TUNING.walkTicks * 3 + lag;
    let k1 = 0;
    let k2 = 0;
    for (let i = 0; i < total; i++) {
      if (f1.step(walk(), () => 'grass')) k1++;
      if (i >= lag && p2.step(walk(), () => 'grass')) k2++;
    }
    expect(k1).toBe(3);
    expect(k2).toBe(3);
    expect(r.played.length).toBe(6);
  });

  it('2P が 止まっても 1P の 歩数は 進む（数えは 別々）', () => {
    const r = recorder();
    const f1 = createFootsteps(r.sound);
    const p2 = createP2Sounds(r.sound);
    let k1 = 0;
    for (let i = 0; i < FOOTSTEP_TUNING.walkTicks * 2; i++) {
      if (f1.step(walk(), () => 'grass')) k1++;
      p2.step(walk({ v: 0 }), () => 'grass');
    }
    expect(k1).toBe(2);
    expect(r.played.length).toBe(2);
  });
});

describe('AC67: 2P の こうげき', () => {
  it('パンチ: 始まり → punch・当たり → hit・空ぶり → miss（1P の CombatFx と 同じ 音）', () => {
    const r = recorder();
    const p2 = createP2Sounds(r.sound);
    p2.combat([
      { type: 'punchStart', tick: 1 },
      { type: 'punchHit', tick: 2, yokaiId: 7 },
      { type: 'punchMiss', tick: 3 },
    ] satisfies CombatEvent[]);
    expect(r.played.length).toBe(3);
    expect(r.played[0]).toBe(COMBAT_SOUNDS.punch);
    expect(r.played[1]).toBe(COMBAT_SOUNDS.hit);
    expect(r.played[2]).toBe(COMBAT_SOUNDS.miss);
  });

  it('こうげきでは ない 出来事（regen など）は 何も 鳴らさない', () => {
    const r = recorder();
    createP2Sounds(r.sound).combat([{ type: 'regen', tick: 1, hp: 4 }]);
    expect(r.played.length).toBe(0);
  });

  it('刀・なぎなた・弓の ふり: playSwing と 同じ 音（持っている 物で 変わる）', () => {
    const cases = [
      { anim: 'slash', held: 'crystal_katana' },
      { anim: 'slash', held: null },
      { anim: 'thrust', held: null },
      { anim: 'draw', held: null },
      { anim: 'release', held: null },
    ] as const;
    for (const c of cases) {
      const ref = recorder();
      playSwing(ref.sound, c.anim, c.held);
      const r = recorder();
      createP2Sounds(r.sound).swings([{ anim: c.anim }], c.held);
      expect(r.played, `${c.anim}/${c.held}`).toEqual(ref.played);
      expect(r.played.length, `${c.anim}/${c.held}`).toBeGreaterThan(0);
    }
  });

  it('素手の ふり（punch）は swings では 鳴らさない（パンチの 音は combat 側）', () => {
    const r = recorder();
    createP2Sounds(r.sound).swings([{ anim: 'punch' }], null);
    expect(r.played.length).toBe(0);
  });

  const bladeEv = (e: Omit<Extract<BladeEvent, { type: 'techStart' }>, 'tick'>): BladeEvent => ({ tick: 1, ...e });
  const hitEv = (tech: 'thrust' | 'kesa' | 'kiriage', step?: 1 | 2 | 3): BladeEvent => ({ type: 'techHit', tick: 1, tech, yokaiId: 1, damage: 2, knock: 1, up: 0, position: { x: 0, y: 0, z: 0 }, ...(step ? { step } : {}) });

  it('刀の わざ: techStart は 1 段目 = わざの 音、2 段目 = わざ ＋ combo2、3 段目 = わざ ＋ combo3（playBladeSound と 同じ）', () => {
    for (const tech of ['thrust', 'kesa', 'kiriage'] as const) {
      const cases: Array<[1 | 2 | 3 | undefined, Played[]]> = [
        [undefined, [WEAPON_SOUNDS[tech]]],
        [1, [WEAPON_SOUNDS[tech]]],
        [2, [WEAPON_SOUNDS[tech], WEAPON_SOUNDS.combo2]],
        [3, [WEAPON_SOUNDS[tech], WEAPON_SOUNDS.combo3]],
      ];
      for (const [step, want] of cases) {
        const e = bladeEv({ type: 'techStart', tech, ...(step ? { step } : {}) });
        const ref = recorder();
        playBladeSound(ref.sound, e);
        const r = recorder();
        createP2Sounds(r.sound).blade([e]);
        expect(r.played, `${tech}/${step}`).toEqual(ref.played);
        expect(r.played.length, `${tech}/${step}`).toBe(want.length);
        want.forEach((w, i) => expect(r.played[i], `${tech}/${step}/${i}`).toBe(w));
      }
    }
  });

  it('刀の 当たり: 大げさ斬り（kesa）は kesaHit、それ以外は hit', () => {
    for (const tech of ['thrust', 'kesa', 'kiriage'] as const) {
      const e = hitEv(tech);
      const ref = recorder();
      playBladeSound(ref.sound, e);
      const r = recorder();
      createP2Sounds(r.sound).blade([e]);
      expect(r.played, tech).toEqual(ref.played);
      expect(r.played.length, tech).toBe(1);
      expect(r.played[0], tech).toBe(tech === 'kesa' ? WEAPON_SOUNDS.kesaHit : COMBAT_SOUNDS.hit);
    }
  });

  it('かまえ（stance）は stance の 音。techMiss・cancel は 鳴らさない', () => {
    const r = recorder();
    const p2 = createP2Sounds(r.sound);
    p2.blade([{ type: 'stance', tick: 1, from: 'chudan', to: 'jodan' }]);
    expect(r.played.length).toBe(1);
    expect(r.played[0]).toBe(WEAPON_SOUNDS.stance);
    p2.blade([{ type: 'techMiss', tick: 2, tech: 'thrust' }, { type: 'cancel', tick: 3 }]);
    expect(r.played.length).toBe(1);
  });

  it('弓: ArrowEvent の 全種類が 1P の 参照（playBowSound ＋ arrowHit の hit）と 同じ。noArrow だけは 鳴らさない', () => {
    const P0 = { x: 0, y: 0, z: 0 };
    const events: BowEvent[] = [
      { type: 'drawStart', tick: 1 },
      { type: 'stage', tick: 1, stage: 1 },
      { type: 'stage', tick: 2, stage: 2 },
      { type: 'stage', tick: 3, stage: 3 },
      { type: 'arrowShot', tick: 4, stage: 1, speed: 10, position: P0, velocity: P0 },
      { type: 'arrowShot', tick: 5, stage: 2, speed: 10, position: P0, velocity: P0 },
      { type: 'arrowShot', tick: 6, stage: 3, speed: 10, position: P0, velocity: P0 },
      { type: 'arrowHit', tick: 7, yokaiId: 3, damage: 2, position: P0 },
      { type: 'arrowStick', tick: 8, position: P0 },
      { type: 'arrowEnd', tick: 9, position: P0 },
      { type: 'dryRelease', tick: 10 },
      { type: 'noArrow', tick: 11 },
      { type: 'pickup', tick: 12 },
    ];
    for (const e of events) {
      const ref = recorder();
      if (e.type !== 'noArrow') {
        playBowSound(ref.sound, e);
        if (e.type === 'arrowHit') playCombat(ref.sound, 'hit'); // step.ts:270
      }
      const r = recorder();
      createP2Sounds(r.sound).arrows([e]);
      expect(r.played, e.type).toEqual(ref.played);
      expect(r.names, e.type).toEqual(ref.names);
    }
    // 目で 見て わかる 形: 当たりは コツ ＋ ポコーン ＋ ポコーン（1P と 同じ）、ひく・とばす・ささる・からうち は 1 つ、noArrow は 0
    const count = (e: BowEvent) => {
      const r = recorder();
      createP2Sounds(r.sound).arrows([e]);
      return r.played.length + r.names.length;
    };
    expect(count(events.find((e) => e.type === 'arrowHit')!)).toBe(3);
    expect(count(events.find((e) => e.type === 'stage')!)).toBe(1);
    expect(count(events.find((e) => e.type === 'arrowShot')!)).toBe(1);
    expect(count(events.find((e) => e.type === 'arrowStick')!)).toBe(1);
    expect(count(events.find((e) => e.type === 'dryRelease')!)).toBe(1);
    expect(count(events.find((e) => e.type === 'noArrow')!)).toBe(0);
    expect(count(events.find((e) => e.type === 'drawStart')!)).toBe(0);
  });
});

// ---- 本物の SoundFx で 記録（audio.sfx() が 読む 物）を 見る ----
function fakeOutput() {
  const clock = { t: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, gain: param(), frequency: param(), Q: param(), start() {}, stop() {}, type: '', buffer: null, loop: false });
  const ctx = {
    get currentTime() {
      return clock.t;
    },
    sampleRate: 44100,
    destination: {},
    createGain: node,
    createOscillator: node,
    createBufferSource: node,
    createBiquadFilter: node,
    createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
  };
  return { clock, output: () => ({ ctx: ctx as never, destination: ctx.destination }) };
}

describe('AC67: 記録（audio.sfx()）に 入り、dropped で なく、1P と 同じ', () => {
  it('2P の 足音・パンチ・ふり・矢（当たり は コツ ＋ ポコーン ＋ ポコーン）が 全部 記録に 入り、dropped は 1 つも ない（1 秒ずつ あけて 鳴らす）', () => {
    const f = fakeOutput();
    const fx = new SoundFx({ output: f.output, seed: 5 });
    const p2 = createP2Sounds(fx);
    const at = () => void (f.clock.t += 1);
    for (let i = 0; i < FOOTSTEP_TUNING.walkTicks; i++) p2.step(walk(), () => 'stone');
    at();
    p2.combat([{ type: 'punchStart', tick: 1 }]);
    at();
    p2.combat([{ type: 'punchHit', tick: 2, yokaiId: 1 }]);
    at();
    p2.swings([{ anim: 'slash' }], null);
    at();
    p2.arrows([{ type: 'arrowHit', tick: 1, yokaiId: 1, damage: 1, position: { x: 0, y: 0, z: 0 } }]);
    const rec = fx.drainRecords();
    expect(rec.length).toBe(7);
    expect(rec.filter((x) => x.dropped)).toEqual([]);
    expect(rec.map((x) => x.name)).toEqual(['', 'punch', 'hit', 'slash', 'arrowHit', 'hit', 'hit']);
  });

  it('1P の 同じ 音と 記録が 同じ（同じ たね の SoundFx で くらべる = 大きさ・ゆらぎの 段を かえない）', () => {
    const run = (who: 1 | 2) => {
      const f = fakeOutput();
      const fx = new SoundFx({ output: f.output, seed: 11 });
      const f1 = createFootsteps(fx);
      const p2 = createP2Sounds(fx);
      for (let i = 0; i < FOOTSTEP_TUNING.walkTicks; i++) (who === 1 ? f1 : p2).step(walk(), () => 'dirt');
      f.clock.t += 1;
      if (who === 1) playCombat(fx, 'punch');
      else p2.combat([{ type: 'punchStart', tick: 1 }]);
      return fx.drainRecords();
    };
    expect(run(2)).toEqual(run(1));
  });

  it('数の 上限は 2 人で 1 つ（同じ 名前が 3 つ 鳴っている ときは 2P の 4 つ目が dropped）', () => {
    const f = fakeOutput(); // 時計は 止めたまま = 鳴りっぱなし
    const fx = new SoundFx({ output: f.output, seed: 3 });
    const p2 = createP2Sounds(fx);
    for (let i = 0; i < 3; i++) playCombat(fx, 'punch'); // 1P
    fx.drainRecords();
    p2.combat([{ type: 'punchStart', tick: 1 }]); // 2P
    const r = fx.drainRecords();
    expect(r.map((x) => [x.name, x.dropped])).toEqual([['punch', true]]);
  });
});

// ---- 2P の ほる・ひび・こわす・おく・ひろう は 2P の DigFx が 鳴らす（今の 実装で 緑 = 距離を かけない 作りを 守る 見張り）----
class FakeDig implements DigSystem {
  tgt: TargetInfo | null = null;
  st: DigState = { active: false, block: null, progress: 0, crackStage: 0, ready: false, blockedReason: null };
  events: DigEvent[] = [];
  target() {
    return this.tgt;
  }
  state() {
    return this.st;
  }
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
  peekEvents() {
    return this.events;
  }
}

describe('AC67: 2P の DigFx（見張り。今の 実装で 緑）', () => {
  const B = { x: 4, y: 10, z: 6 };
  function setup() {
    const dig = new FakeDig();
    const sound = new SoundFx(() => null, { ...FX_SETTINGS });
    const calls: Array<[string, number | undefined]> = [];
    sound.play = (n, semis) => void calls.push([n, semis]);
    const fx = createP2DigFx({ scene: new THREE.Scene(), dig, sound, events: () => dig.drainEvents() });
    return { dig, fx, names: () => calls.map((c) => c[0]) };
  }

  it('こわす → break と pickup、おく → place、ほる → crack・dig が 鳴る（SoundFx.play を 直接 呼ぶ = 距離の 段なし）', () => {
    const t = setup();
    t.dig.events.push({ type: 'break', tick: 1, block: B, id: 'dirt', gotItem: true, count: 1 });
    t.fx.update(1 / 60);
    expect(t.names()).toContain('break');
    expect(t.names()).toContain('pickup');
    t.dig.events.push({ type: 'place', tick: 2, block: B, id: 'dirt' });
    t.fx.update(1 / 60);
    expect(t.names()).toContain('place');
    t.dig.st = { active: true, block: B, progress: 0.4, crackStage: 1, ready: false, blockedReason: null };
    t.dig.tgt = { block: B, id: 'dirt', face: { x: 0, y: 1, z: 0 }, place: { x: 4, y: 11, z: 6 }, distance: 1.5 };
    t.fx.update(1 / 60);
    expect(t.names()).toContain('crack');
    for (let i = 0; i < 60; i++) t.fx.update(1 / 60);
    expect(t.names()).toContain('dig');
  });
});
