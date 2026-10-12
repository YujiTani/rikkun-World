import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ItemId, PlayerState } from '../contracts';
import { ActionState } from '../input/actions';
import { ArrowVisuals } from '../fx/arrowVisuals';
import { CameraRig } from './CameraRig';
import { DollAnimator, armPoseAt, newArmPose } from './dollAnim';
import { createCameraHook } from './hook';

const DT = 1 / 60;
const world = {
  size: { x: 64, y: 32, z: 64 },
  getBlock: () => 'air' as const,
  setBlock: () => false,
  isSolid: () => false,
};

function setup() {
  const state: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 0,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false,
  };
  const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 500);
  const rig = new CameraRig(cam, new THREE.Scene(), world, () => state, new ActionState());
  let held: ItemId | null = 'katana';
  rig.setHeldProvider(() => held);
  rig.toggleView();
  rig.update(DT);
  const hook = createCameraHook(rig);
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) rig.update(DT);
  };
  return { rig, state, hook, step, setHeld: (h: ItemId | null) => (held = h) };
}

describe('人形のうでの動き（§2.9 / AC20）', () => {
  it('かたな: 合図の次のステップから 1〜30 が slash、31 で none', () => {
    const t = setup();
    let pending = [{ anim: 'slash' as const, tick: 0 }];
    t.rig.setSwingSource(() => {
      const p = pending;
      pending = [];
      return p;
    });
    t.step();
    expect(t.hook.doll().armAnim).toBe('slash');
    expect(t.hook.doll().animTick).toBe(1);
    t.step(29);
    expect(t.hook.doll().armAnim).toBe('slash');
    expect(t.hook.doll().animTick).toBe(30);
    t.step();
    expect(t.hook.doll().armAnim).toBe('none');
  });
  it('なぎなた: つく・はらう・つく が交互に出て 40 ステップずつ', () => {
    const t = setup();
    const seq = ['thrust', 'sweep', 'thrust'] as const;
    let i = 0;
    let fire = true;
    t.rig.setSwingSource(() => (fire ? [{ anim: seq[i], tick: 0 }] : []));
    for (let n = 0; n < 3; n++) {
      fire = true;
      t.step();
      fire = false;
      expect(t.hook.doll().armAnim).toBe(seq[n]);
      t.step(39);
      expect(t.hook.doll().animTick).toBe(40);
      t.step();
      expect(t.hook.doll().armAnim).toBe('none');
      i++;
    }
  });
  it('ゆみ: draw 1〜10 のあと release 11〜20', () => {
    const t = setup();
    const q: ('draw' | 'release')[] = ['draw'];
    t.rig.setSwingSource(() => (q.length ? [{ anim: q.shift()!, tick: 0 }] : []));
    t.step();
    expect(t.hook.doll().armAnim).toBe('draw');
    t.step(9);
    expect(t.hook.doll().armAnim).toBe('draw');
    expect(t.hook.doll().animTick).toBe(10);
    q.push('release');
    t.step();
    expect(t.hook.doll().armAnim).toBe('release');
    t.step(9);
    expect(t.hook.doll().armAnim).toBe('release');
    t.step();
    expect(t.hook.doll().armAnim).toBe('none');
  });
  it('つくれた → banzai 40、banzai 中にかたなをふると slash に替わる', () => {
    const t = setup();
    t.rig.onCraftEvent({ type: 'craft', tick: 0, recipe: 'x', item: 'dirt', count: 1 });
    t.step();
    expect(t.hook.doll().armAnim).toBe('banzai');
    t.step(39);
    expect(t.hook.doll().armAnim).toBe('banzai');
    t.step();
    expect(t.hook.doll().armAnim).toBe('none');
    t.rig.onCraftEvent({ type: 'craft', tick: 0, recipe: 'x', item: 'dirt', count: 1 });
    t.step(5);
    t.rig.doll.play('slash');
    t.step();
    expect(t.hook.doll().armAnim).toBe('slash');
  });
  it('優先が低いものは高いものの最中には始まらない', () => {
    const a = new DollAnimator();
    expect(a.startArm('slash')).toBe(true);
    expect(a.startArm('banzai')).toBe(false);
    expect(a.startArm('cheer')).toBe(false);
    expect(a.armAnim).toBe('slash');
    const b = new DollAnimator();
    b.startArm('slash');
    expect(b.startArm('punch')).toBe(false); // 同じ瞬間の パンチ の合図は武器の動きに負ける
  });
  it('焼けた → cheer 20、ぶくろを拾った → pickup 20、防具を着た → equip 15', () => {
    const t = setup();
    t.rig.onCraftEvent({ type: 'bakeDone', tick: 0, recipe: 'x', item: 'dirt', count: 1, position: { x: 0, y: 0, z: 0 } });
    t.step(20);
    expect(t.hook.doll().armAnim).toBe('cheer');
    t.step();
    expect(t.hook.doll().armAnim).toBe('none');
    t.rig.onCombatEvent({ type: 'pickup', tick: 0, bagId: 1 });
    t.step(20);
    expect(t.hook.doll().armAnim).toBe('pickup');
    t.step();
    expect(t.hook.doll().armAnim).toBe('none');
    let worn: ItemId | null = null;
    t.rig.setArmorProvider((slot) => (slot === 'head' ? worn : null));
    worn = 'kabuto';
    t.step(15);
    expect(t.hook.doll().armAnim).toBe('equip');
    expect(t.hook.doll().armor.head).toBe('kabuto');
    t.step();
    expect(t.hook.doll().armAnim).toBe('none');
  });
  it('白い弧は切ってから 0.15 秒（9 ステップ）で消える', () => {
    const t = setup();
    t.rig.doll.play('slash');
    t.step(20);
    expect(t.hook.doll().arc).toBe('none');
    t.step();
    expect(t.hook.doll().arc).toBe('slash');
    t.step(9);
    expect(t.hook.doll().arc).toBe('none');
  });
  it('すべての動きの 1〜最後のステップで数がこわれない', () => {
    const out = newArmPose();
    for (const name of ['punch', 'dig', 'place', 'slash', 'thrust', 'sweep', 'draw', 'release', 'banzai', 'cheer', 'pickup', 'equip'] as const) {
      for (let k = 1; k <= 40; k++) {
        armPoseAt(name, k, out);
        for (const v of Object.values(out)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('人形のからだの動き', () => {
  it('ジャンプ中は jump、着地から 8 ステップ land、そのあと idle', () => {
    const t = setup();
    expect(t.hook.doll().bodyAnim).toBe('idle');
    t.state.onGround = false;
    t.step(5);
    expect(t.hook.doll().bodyAnim).toBe('jump');
    t.state.onGround = true;
    t.step();
    expect(t.hook.doll().bodyAnim).toBe('land');
    t.step(7);
    expect(t.hook.doll().bodyAnim).toBe('land');
    t.step();
    expect(t.hook.doll().bodyAnim).toBe('idle');
  });
  it('歩くと walk、止まると idle', () => {
    const t = setup();
    t.state.moving = true;
    t.step();
    expect(t.hook.doll().bodyAnim).toBe('walk');
    t.state.moving = false;
    t.step();
    expect(t.hook.doll().bodyAnim).toBe('idle');
  });
  it('ダメージ（ふせがない）で hurt 12 ステップ。ふせいだ回は hurt にならない', () => {
    const t = setup();
    t.rig.onCombatEvent({ type: 'playerHit', tick: 0, by: 'karakasa', amount: 1, blocked: true } as never);
    t.step();
    expect(t.hook.doll().bodyAnim).toBe('idle');
    t.rig.onCombatEvent({ type: 'playerHit', tick: 0, by: 'karakasa', amount: 1 } as never);
    t.step(12);
    expect(t.hook.doll().bodyAnim).toBe('hurt');
    t.step();
    expect(t.hook.doll().bodyAnim).toBe('idle');
  });
  it('やられると down（星が出る）、もどると idle', () => {
    const t = setup();
    t.rig.doll.setFallen(1);
    t.step();
    expect(t.hook.doll().bodyAnim).toBe('down');
    expect((t.rig.doll as unknown as { stars: THREE.Group }).stars.visible).toBe(true);
    t.rig.doll.setFallen(0);
    t.step();
    expect(t.hook.doll().bodyAnim).toBe('idle');
  });
});

describe('持つ道具・防具の見た目', () => {
  it('M4 のアイテムを持つとようかいだま（玉）にならず、模型が出る', () => {
    const t = setup();
    const orb = (t.rig.doll as unknown as { orbMesh: THREE.Mesh }).orbMesh;
    for (const item of ['wood_pickaxe', 'katana', 'naginata', 'yumi', 'ya', 'iron_ingot', 'torch', 'haniwa', 'kabuto'] as ItemId[]) {
      t.setHeld(item);
      t.step();
      expect(orb.visible).toBe(false);
      expect(t.hook.doll().heldScreen).not.toBeNull();
    }
  });
  it('かぶと・よろいを着る・脱ぐ。一人称では見えない', () => {
    const t = setup();
    t.rig.doll.setArmor('kabuto', 'yoroi');
    expect(t.rig.doll.armorWorn('head')).toBe('kabuto');
    expect(t.rig.doll.armorWorn('body')).toBe('yoroi');
    t.rig.doll.setArmor(null, null);
    expect(t.rig.doll.armorWorn('body')).toBeNull();
  });
  it('こて（うで）・すねあて（あし）も着られる', () => {
    const t = setup();
    t.rig.doll.setArmor('kabuto', 'yoroi', 'kote', 'suneate');
    expect(t.rig.doll.armorWorn('arms')).toBe('kote');
    expect(t.rig.doll.armorWorn('legs')).toBe('suneate');
    expect(t.hook.doll().armor).toEqual({ head: 'kabuto', body: 'yoroi', arms: 'kote', legs: 'suneate' });
    t.rig.doll.setArmor('kabuto', 'yoroi', null, null);
    expect(t.rig.doll.armorWorn('arms')).toBeNull();
  });
});

describe('飛ぶ や の見た目', () => {
  it('一覧の本数だけ出し、からなら隠す', () => {
    const v = new ArrowVisuals();
    v.sync([
      { id: 1, position: { x: 1, y: 2, z: 3 }, dir: { x: 0, y: 0, z: -1 } },
      { id: 2, position: { x: 4, y: 2, z: 3 }, dir: { x: 1, y: 0, z: 0 } },
    ]);
    expect(v.visibleCount).toBe(2);
    v.sync([]);
    expect(v.visibleCount).toBe(0);
    v.dispose();
  });
});
