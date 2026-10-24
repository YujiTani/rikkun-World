import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { buildBig, worldHits } from './gashaBig';
import {
  BIG_ID_BASE, BigHit, boxTouchesCapsule, boxTouchesFan, boxTouchesSphere, closestOnBox, damageOf, defOf, distToBox, mulOf, partOf, rayBox,
  type BoxLike, type HitSources, type YokaiWorldLike,
} from './gashaBigHit';
import { TUNE as T } from './gashaBigTuning';
import type { BladeShapeInfo, Vec3, YokaiRayHit } from '../contracts';

const box = (c: [number, number, number], half: [number, number, number]): BoxLike => ({ name: 'handL', c, ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], half });

/** 休みの 姿勢の からだ（原点・向き 0）の 当たりの 箱。うごき（BigActor）には よらない */
function bodyBoxes(): { boxes: BoxLike[]; model: ReturnType<typeof buildBig> } {
  const model = buildBig();
  model.group.position.set(0, 0, 0);
  model.group.scale.setScalar(model.scale);
  const boxes = worldHits(model).map((h) => ({ name: h.name, c: h.center, ax: [...h.axes[0], ...h.axes[1], ...h.axes[2]], half: h.half }));
  return { boxes, model };
}

/** 準備（からだ 1 つ）。怒る 口は 数えるだけ */
function rig(sources: HitSources = {}) {
  const { boxes, model } = bodyBoxes();
  let angryCalls = 0;
  const bh = new BigHit({ scene: new Scene(), angry: () => { angryCalls++; }, sources });
  bh.bind(boxes, model);
  const find = (n: string) => boxes.find((b) => b.name === n)!;
  return { bh, find, calls: () => angryCalls };
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

describe('コアの 予兆（無敵）', () => {
  it('coreGuard が true の 間は コアに 当てても ダメージ 0・怒らない・ふり落とし（onCore）も 起きない。はじいた 数だけ 数える。false に もどれば ふつうに 当たる', () => {
    const { boxes, model } = bodyBoxes();
    let guard = true, angry = 0, cores = 0;
    const bh = new BigHit({ scene: new Scene(), angry: () => { angry++; }, onCore: () => { cores++; }, coreGuard: () => guard });
    bh.bind(boxes, model);
    expect(bh.damage('core', 10)).toBe(0);
    expect(bh.hp).toBe(bh.maxHp);
    expect(bh.deflects).toBe(1);
    expect(angry + cores).toBe(0);
    guard = false;
    expect(bh.damage('core', 10)).toBeGreaterThan(0);
    expect(cores).toBe(1);
    expect(bh.deflects).toBe(1);
  });
});
/** 体力の 初期値は 調整表から（数を かえても テストは 追従する） */
const HP = T.hit.hp;
const hpIs = (r: { bh: { hp: number } }, lost: number): void => { expect(r.bh.hp).toBeCloseTo(HP - lost, 5); };

describe('gashaBigHit（#293 プレイヤーの 攻撃を 受ける）', () => {
  // しくみの テストは 防御力を 0 にして 数を 見やすく する（防御力は 下の 専用の テスト）
  const defSaved = { ...T.hit.partDef };
  beforeEach(() => { for (const k of Object.keys(T.hit.partDef)) T.hit.partDef[k] = 0; });
  afterEach(() => { Object.assign(T.hit.partDef, defSaved); });

  it('部位の 倍率は 調整表どおり（手 1.0・腕 0.6・頭 0.5・コア 9.0・雲 0）', () => {
    expect(partOf('handL')).toBe('hand');
    expect(partOf('foreArmR')).toBe('foreArm');
    expect(partOf('upperArmL')).toBe('upperArm');
    expect(partOf('skull')).toBe('head');
    expect(partOf('ribbonKnot')).toBe('ribbon');
    expect(partOf('rampL3')).toBe('cloud');
    expect(partOf('bank7')).toBe('cloud');
    for (const n of ['handThumbL', 'handFingersR']) expect(partOf(n)).toBe('hand');
    for (const n of ['skull', 'skullTop0', 'skullJaw', 'skullTempleL']) expect(partOf(n)).toBe('head');
    for (const n of ['torsoWaist', 'chestTop', 'neck', 'spineMid', 'collarbone', 'shoulderClothL', 'hairTailL0']) expect(partOf(n)).toBe('body');
    expect(partOf('shoulderL3')).toBe('cloud');
    expect(partOf('tailL4')).toBe('cloud');
    expect(mulOf('body')).toBe(0.5); // 胴体・胸・首・髪も たたける
    expect(mulOf('hand')).toBe(1.0);
    expect(mulOf('foreArm')).toBe(0.6);
    expect(mulOf('upperArm')).toBe(0.6);
    expect(mulOf('head')).toBe(0.5);
    expect(mulOf('core')).toBe(9.0);
    expect(mulOf('cloud')).toBe(0);
    expect(mulOf('なにか')).toBe(0);
    expect(T.hit.hp).toBeGreaterThan(0);
  });

  it('形の 計算: 線・カプセル・扇・球', () => {
    const b = box([0, 0, 0], [2, 1, 3]);
    expect(rayBox(b, 0, 0, -10, 0, 0, 1, 20)).toBeCloseTo(7, 5); // 手前の 面
    expect(rayBox(b, 0, 0, -10, 0, 0, 1, 5)).toBeNull(); // とどかない
    expect(rayBox(b, 5, 0, -10, 0, 0, 1, 20)).toBeNull(); // よこに ずれる
    expect(rayBox(b, 0, 0, 0, 0, 0, 1, 5)).toBe(0); // 中から
    expect(distToBox(b, 0, 0, -5)).toBeCloseTo(2, 5);
    expect(closestOnBox(b, 9, 0, 0, v(0, 0, 0)).x).toBeCloseTo(2, 5);
    expect(boxTouchesCapsule(b, v(0, 0, -6), v(0, 0, -3.8), 0.5)).toBe(false);
    expect(boxTouchesCapsule(b, v(0, 0, -6), v(0, 0, -2.5), 0.6)).toBe(true);
    expect(boxTouchesSphere(b, v(0, 0, -5), 1.9)).toBe(false);
    expect(boxTouchesSphere(b, v(0, 0, -5), 2.1)).toBe(true);
    const fan = { kind: 'fan' as const, center: v(0, 0, -6), forward: v(0, 0, 1), halfAngleDeg: 60, rMin: 0, rMax: 4, yMin: -1, yMax: 3 };
    expect(boxTouchesFan(b, fan)).toBe(true);
    expect(boxTouchesFan(b, { ...fan, forward: v(0, 0, -1) })).toBe(false); // うしろむき
    expect(boxTouchesFan(b, { ...fan, rMax: 2 })).toBe(false); // とどかない
    expect(boxTouchesFan(b, { ...fan, yMin: 5, yMax: 8 })).toBe(false); // 高さが ちがう
  });

  it('damage: ダメージ = 武器の 強さ × 部位の 倍率。体力は 0 で 止まる。倍率 0 は 当たらない', () => {
    const r = rig();
    hpIs(r, 0);
    expect(r.bh.damage('hand', 10)).toBe(10);
    hpIs(r, 10);
    expect(r.bh.damage('foreArm', 10)).toBe(6);
    expect(r.bh.damage('upperArm', 10)).toBe(6);
    expect(r.bh.damage('head', 10)).toBe(5);
    expect(r.bh.damage('core', 10)).toBe(90);
    hpIs(r, 10 + 6 + 6 + 5 + 90);
    const before = r.bh.hp;
    expect(r.bh.damage('cloud', 10)).toBe(0);
    expect(r.bh.damage('hand', 0)).toBe(0);
    expect(r.bh.hp).toBe(before);
    r.bh.damage('core', 1000);
    expect(r.bh.hp).toBe(0);
    r.bh.reset();
    hpIs(r, 0);
  });

  it('調整表の 数を かえると 倍率も 体力も かわる', () => {
    const r = rig();
    const old = { ...T.hit.partMul }, hp0 = T.hit.hp;
    try {
      T.hit.partMul.hand = 2;
      T.hit.hp = 100;
      r.bh.reset();
      expect(r.bh.damage('hand', 5)).toBe(10);
      expect(r.bh.hp).toBe(90);
    } finally {
      Object.assign(T.hit.partMul, old);
      T.hit.hp = hp0;
      r.bh.reset();
    }
  });

  it('怒る 口は 当たるたびに 呼ばれる（白目 → 赤い 目に なる。倍率 0 では 呼ばれない）', () => {
    const r = rig();
    r.bh.damage('cloud', 5);
    expect(r.calls()).toBe(0);
    r.bh.damage('hand', 5);
    r.bh.damage('head', 5);
    expect(r.calls()).toBe(2);
  });

  it('刀（つき・カプセル）: 手の 箱に 当たると 減る。1 振りに 1 回、つぎの 振りで また 当たる', () => {
    let shape: BladeShapeInfo | null = null;
    let swing = 'thrust:0';
    let frame = 1;
    const r = rig({ blade: () => (shape ? { shape, damage: 2, swing, frame } : null) });
    const h = r.find('handL');
    const c = v(h.c[0]!, h.c[1]!, h.c[2]!);
    shape = { kind: 'capsule', from: v(c.x, c.y + 0.2, c.z - 6), to: v(c.x, c.y + 0.2, c.z + 6), radius: 0.6 };
    r.bh.step(1 / 60);
    hpIs(r, 2);
    expect(r.bh.last?.part).toBe('hand');
    expect(r.bh.last?.source).toBe('blade');
    frame = 2; r.bh.step(1 / 60); r.bh.step(1 / 60);
    hpIs(r, 2); // おなじ 振りでは 増えない
    shape = null; r.bh.step(1 / 60); // 当たりが おわる
    shape = { kind: 'capsule', from: v(c.x, c.y + 0.2, c.z - 6), to: v(c.x, c.y + 0.2, c.z + 6), radius: 0.6 };
    frame = 1; r.bh.step(1 / 60);
    hpIs(r, 4);
    expect(r.calls()).toBe(2);
  });

  it('刀が ガラスの 雲に だけ 当たると onCloud（割る 口）が 1 振りに 1 回 呼ばれる。ダメージは なし', () => {
    const { boxes, model } = bodyBoxes();
    const cloud = boxes.find((b) => b.name === 'bank12')!;
    const seen: Vec3[] = [];
    let swing = 'a';
    let on = true;
    const bh = new BigHit({ scene: new Scene(), angry: () => {}, onCloud: (at) => { seen.push(at); }, sources: { blade: () => (on ? { shape: { kind: 'capsule', from: v(cloud.c[0]!, cloud.c[1]!, cloud.c[2]!), to: v(cloud.c[0]!, cloud.c[1]! + 0.1, cloud.c[2]!), radius: 0.3 }, damage: 3, swing, frame: 1 } : null) } });
    bh.bind(boxes, model);
    bh.step(1 / 60); bh.step(1 / 60);
    expect(seen).toHaveLength(1);
    expect(bh.hp).toBe(bh.maxHp);
    on = false; bh.step(1 / 60); on = true; swing = 'b'; bh.step(1 / 60);
    expect(seen).toHaveLength(2);
  });

  it('刀（けさ・扇）: 手の 前に 立って ふると 当たる。うしろむき・遠いと 当たらない', () => {
    let shape: BladeShapeInfo | null = null;
    let swing = 'kesa:1';
    const r = rig({ blade: () => (shape ? { shape, damage: 5, swing, frame: 1 } : null) });
    const h = r.find('handL');
    const tip = h.c[2]! + h.half[2]!; // 手の 先（プレイヤー がわ = +z）
    const fanAt = (dz: number, fz: number): BladeShapeInfo => ({ kind: 'fan', center: v(h.c[0]!, h.c[1]!, tip + dz), forward: v(0, 0, fz), halfAngleDeg: 70, rMin: 0, rMax: 3, yMin: h.c[1]! - 1.5, yMax: h.c[1]! + 2 });
    shape = fanAt(60, -1); swing = 'kesa:a'; r.bh.step(1 / 60);
    hpIs(r, 0); // 遠い
    shape = null; r.bh.step(1 / 60);
    shape = fanAt(1.2, 1); swing = 'kesa:b'; r.bh.step(1 / 60);
    hpIs(r, 0); // 手と 反対むき
    shape = null; r.bh.step(1 / 60);
    shape = fanAt(1.2, -1); swing = 'kesa:c'; r.bh.step(1 / 60);
    hpIs(r, 5);
    expect(r.bh.last?.part).toBe('hand');
  });

  it('刀: 手と 腕と 頭と コアに ぜんぶ 当たる 振りは いちばん 倍率の 高い 所（コア 9 倍）に 1 回だけ', () => {
    const r = rig({ blade: () => ({ shape: { kind: 'capsule', from: v(-80, 20, -80), to: v(80, 20, 80), radius: 80 }, damage: 10, swing: 'x', frame: 1 }) });
    r.bh.step(1 / 60);
    expect(r.bh.last?.part).toBe('core');
    hpIs(r, 90);
  });

  it('矢・パンチ: YokaiManager の 線の 当たりと ダメージに 割りこむ。本物の 妖怪は そのまま', () => {
    const dmg: [number, number][] = [];
    const real: YokaiWorldLike = {
      raycast: (_o, _d, _m): YokaiRayHit | null => (_o.x === 123 ? { id: 7, kind: 'karakasa', distance: 3 } : null),
      damage: (id, amount) => { dmg.push([id, amount]); return amount; },
    };
    const r = rig({ yokai: () => real });
    const h = r.find('handL');
    const tip = h.c[2]! + h.half[2]!;
    const origin = v(h.c[0]!, h.c[1]!, tip + 30);
    const hit = real.raycast(origin, v(0, 0, -1), 60)!;
    expect(hit.id).toBeGreaterThanOrEqual(BIG_ID_BASE);
    expect(hit.distance).toBeCloseTo(30, 3); // 手の 先の 面
    expect(real.raycast(origin, v(0, 0, -1), 20)).toBeNull(); // とどかない
    expect(real.raycast(v(123, 0, 0), v(0, 0, -1), 60)!.id).toBe(7); // 本物の 妖怪が 近ければ そちら
    expect(real.damage(hit.id, 4, origin)).toBe(4);
    hpIs(r, 4);
    expect(r.bh.last?.source).toBe('ray');
    expect(r.bh.last?.part).toBe('hand');
    expect(r.bh.last?.at).not.toBeNull();
    expect(dmg).toEqual([]);
    real.damage(7, 3, origin);
    expect(dmg).toEqual([[7, 3]]);
    hpIs(r, 4);
  });

  it('真空波・らせん: 飛んで きて 箱を つらぬく 間に 1 回。雷・ドームも', () => {
    let waves: { id: number; position: Vec3; radius: number; damage: number }[] = [];
    let strikes: { center: Vec3; radius: number; damage: number }[] = [];
    let dome: { center: Vec3; radius: number; damage: number; everySteps: number } | null = null;
    const r = rig({ waves: () => waves, strikes: () => strikes, dome: () => dome });
    const h = r.find('handL');
    const z0 = h.c[2]! + h.half[2]! + 3; // 手の 先の 3 ブロック 前から 手前へ とんで くる
    waves = [{ id: 1, position: v(h.c[0]!, h.c[1]!, z0), radius: 0.5, damage: 1.8 }];
    r.bh.step(1 / 60);
    hpIs(r, 0);
    for (let i = 1; i <= 12; i++) { waves = [{ id: 1, position: v(h.c[0]!, h.c[1]!, z0 - i * 0.5), radius: 0.5, damage: 1.8 }]; r.bh.step(1 / 60); }
    hpIs(r, 1.8); // つらぬいても 1 回
    waves = [];
    r.bh.step(1 / 60);
    strikes = [{ center: v(h.c[0]! + 2, h.c[1]!, h.c[2]!), radius: 5, damage: 16 }];
    r.bh.step(1 / 60);
    strikes = [];
    hpIs(r, 17.8);
    expect(r.bh.last?.source).toBe('strike');
    dome = { center: v(h.c[0]!, h.c[1]!, h.c[2]!), radius: 7, damage: 10, everySteps: 60 };
    r.bh.step(1 / 60);
    hpIs(r, 27.8);
    for (let i = 0; i < 30; i++) r.bh.step(1 / 60);
    hpIs(r, 27.8); // 間かくの 間は 当たらない
    for (let i = 0; i < 40; i++) r.bh.step(1 / 60);
    hpIs(r, 37.8);
  });

  it('防御力（はじめて）: 手・腕・頭・胴体は 30 ひかれる（オーナー 2026-10-24: 腕にも）。最低 1。コアは 防御力 0', () => {
    Object.assign(T.hit.partDef, defSaved); // 調整表の 本物の 数
    expect(defSaved.hand).toBe(30);
    expect(defSaved.head).toBe(30);
    expect(defSaved.body).toBe(30);
    expect(defSaved.foreArm).toBe(30);
    expect(defSaved.upperArm).toBe(30);
    for (const k of ['core', 'ribbon', 'cloud']) expect(defOf(k), k).toBe(0);
    expect(defOf('なにか')).toBe(0);
    // 手: 武器の 強さ × 1.0 − 30、ただし 最低 1
    expect(damageOf('hand', 10)).toBe(1);
    expect(damageOf('hand', 30)).toBe(1);
    expect(damageOf('hand', 31)).toBe(1);
    expect(damageOf('hand', 32)).toBe(2);
    expect(damageOf('hand', 100)).toBe(70); // レジェンダリー 級
    expect(damageOf('hand', 0.5)).toBe(1);
    expect(damageOf('hand', 0)).toBe(0); // 強さ 0 いかは 当たらない
    // 頭・顔・胴体・胸: 強さ × 0.5 − 30（最低 1）
    for (const k of ['head', 'body']) {
      expect(damageOf(k, 10), k).toBe(1);
      expect(damageOf(k, 60), k).toBe(1); // 30 − 30 = 0 → 最低 1
      expect(damageOf(k, 62), k).toBe(1);
      expect(damageOf(k, 100), k).toBe(20); // 50 − 30
      expect(damageOf(k, 0), k).toBe(0);
    }
    // 腕: 強さ × 0.6 − 30（最低 1）。コアは 防御力 0（強さ × 9.0）= ねらい目
    for (const k of ['foreArm', 'upperArm']) {
      expect(damageOf(k, 10), k).toBe(1);
      expect(damageOf(k, 50), k).toBe(1); // 30 − 30 = 0 → 最低 1
      expect(damageOf(k, 100), k).toBe(30); // 60 − 30
    }
    expect(damageOf('core', 10)).toBe(90);
    expect(damageOf('cloud', 10)).toBe(0);
    // 防御力が あっても 倍率 0 の 部位は 当たらない（最低 1 は 当たる 部位だけ）
    T.hit.partDef.cloud = 50;
    expect(damageOf('cloud', 10)).toBe(0);
    // 最低 1 は 倍率が かかった あとで 引く（倍率 2 の 手に 20 → 40 − 30 = 10）
    const mul = T.hit.partMul.hand;
    try { T.hit.partMul.hand = 2; expect(damageOf('hand', 20)).toBe(10); } finally { T.hit.partMul.hand = mul; }
  });

  it('防御力は 体力にも 反映: 手・体・頭だけ 殴り続けても 体力は 0 に ならない（1 ずつ へる）、コアは 防御力なし', () => {
    Object.assign(T.hit.partDef, defSaved);
    const r = rig();
    for (let i = 0; i < 100; i++) expect(r.bh.damage('hand', 20)).toBe(1); // 弱い 武器でも 1
    hpIs(r, 100);
    for (let i = 0; i < 100; i++) r.bh.damage('body', 50); // 防御力 いかでも 最低 1
    hpIs(r, 200);
    for (let i = 0; i < 100; i++) r.bh.damage('head', 50);
    hpIs(r, 300);
    expect(r.bh.last?.dealt).toBe(1);
    expect(r.bh.damage('hand', 80)).toBe(50);
    expect(r.bh.damage('core', 10)).toBe(90);
    expect(r.calls()).toBeGreaterThan(0);
  });

  it('胴体・胸・顔の 箱に 当たると 防御力で ひかれて 最低 1（刀・矢）', () => {
    Object.assign(T.hit.partDef, defSaved);
    let shape: BladeShapeInfo | null = null;
    const r = rig({ blade: () => (shape ? { shape, damage: 5, swing: 'x', frame: 1 } : null) });
    const c = r.find('chestMid2');
    shape = { kind: 'capsule', from: v(c.c[0]!, c.c[1]!, c.c[2]! - 40), to: v(c.c[0]!, c.c[1]!, c.c[2]! + 40), radius: 0.6 };
    r.bh.step(1 / 60);
    expect(r.bh.last?.part).toBe('body');
    expect(r.bh.last?.dealt).toBe(1);
    hpIs(r, 1);
  });
});
