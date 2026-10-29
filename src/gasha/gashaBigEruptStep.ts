/**
 * #308 gashaBig.ts を 分けた もの: 攻撃 4「口から 火山噴火」の 世界との つなぎ。隕石（放射状・一部 ねらい）・予告の 赤い 輪・落下範囲ダメージ・
 * 飛び散る 炎・燃え残り・小さな 穴・植物が 燃える・体の ガラス/こけ/おいた ブロックが 焼ける・燃えかすを 殴ると 消える
 * （動きの 本体は gashaBigEruption.ts、見た目は gashaBigEruptFx.ts）。
 */
import { Vector3 } from 'three';
import { GHOST_EMBER_BASE, GHOST_ID_SPAN } from '../combat/ghostIds';
import type { BigActor } from './gashaBigActor';
import type { BigModel } from './gashaBigTypes';
import type { GashaBigDeps } from './gashaBigDeps';
import type { BodyPlaced, PlacedBlock } from './gashaBigPlaced';
import type { BigSfx } from './gashaBigSfx';
import { Embers, MeteorRain, burnPlants, craterCells, inBlast, type Ember, type LandInfo, type Meteor, type Spark } from './gashaBigEruption';
import { EruptFx } from './gashaBigEruptFx';
import { boxTouchesCapsule, boxTouchesFan, distToBox, rayBox, type BoxLike } from './gashaBigHit';
import { crushable } from './gashaBigCrush';
import { TUNE as T } from './gashaBigTuning';

export interface EruptionEnv {
  actor(): BigActor | null;
  model(): BigModel | null;
  placed: Pick<BodyPlaced, 'burn' | 'restore'>;
  sfx: Pick<BigSfx, 'meteor' | 'ash' | 'smoke' | 'embers' | 'erupt'>;
  /** ガラスの 雲を 割る（gashaBigGlassField.ts） */
  breakGlass(c: { x: number; y: number; z: number }, radius: number, max?: number): number;
  reduced(): boolean;
  deps: Pick<GashaBigDeps, 'scene' | 'camera' | 'groundY' | 'blockAt' | 'setBlockAir' | 'player' | 'hurt' | 'shake' | 'hit'>;
}

export interface EruptionStep {
  step(dt: number): void;
  /** 噴火の 火柱が 立った（隕石を ふらせはじめる） */
  begin(): void;
  /** 隕石の 着地点を 決める 地面の 見つけ方（落雷も 使う） */
  landAt(x: number, z: number): LandInfo;
  /** 隕石・待っている 地形の 仕事・炎を 止めて 消す。keepEmbers: 燃えかすは のこす。full: 体の 焼け あとの もどす 予定も 消す */
  clear(full: boolean, keepEmbers: boolean): void;
  /** 体の 焼け あとの もどす 予定を 消す */
  resetBurnt(): void;
  readonly rain: MeteorRain;
  readonly embers: Embers;
  readonly fx: EruptFx;
  readonly meteorHurts: number;
  readonly burntBlocks: number;
  readonly craterBlocks: number;
  readonly doused: number;
}

export function createEruptionStep(env: EruptionEnv): EruptionStep {
  const { deps, sfx, placed } = env;
  const { blockAt } = deps;
  const rain = new MeteorRain(), embers = new Embers(), eruptFx = new EruptFx(deps.scene, deps.camera);
  const mouthV = new Vector3();
  let eruptClock = 0, burntBlocks = 0, craterBlocks = 0, meteorHurts = 0;
  /** 地形の 仕事（穴・植物が 燃える）の 待ち。terrain.everySec ごとに まとめて する（チャンクの 作り直しを へらす） */
  const terrainJobs: { x: number; y: number; z: number; crater: boolean; ember: Ember }[] = [];
  let terrainAcc = 0;
  const bodyBurnt: { t: number; moss: number[]; placed: PlacedBlock[] }[] = [];
  const landAt = (x: number, z: number): LandInfo => {
    const actor = env.actor();
    const ix = Math.floor(x), iz = Math.floor(z);
    const gy = deps.groundY(ix, iz) + 1;
    let top = gy;
    if (blockAt) for (let y = gy + 30; y >= gy; y--) { const b = blockAt(ix, y, iz); if (b !== 'air' && b !== 'outside') { top = y + 1; break; } }
    if (actor) for (let y = Math.floor(mouthV.y); y >= top; y--) if (actor.solid(ix, y, iz)) return { y: y + 1, body: true };
    return { y: top, body: false };
  };
  const placedBurnable = new Set(T.eruption.body.placedBurnable);
  /** 隕石・火の 粉が 落ちた 点の 体への 焼け（ガラスの 雲が 割れる のは 隕石だけ） */
  const burnBody = (x: number, y: number, z: number, glass: boolean): void => {
    const model = env.model();
    if (!model) return;
    const K = T.eruption, c = { x, y, z };
    if (glass) env.breakGlass(c, K.body.glassRadius, K.body.glassMax);
    const moss = model.burnMoss(c, K.body.mossRadius);
    const pl = placed.burn(c, K.body.placedRadius, placedBurnable, K.body.placedMax);
    if (moss.length || pl.length) bodyBurnt.push({ t: eruptClock, moss, placed: pl });
  };
  /** 地形の 仕事を まとめて する: 隕石の 小さな 穴（燃えかすを 穴の 底へ）・植物が 燃える */
  const runTerrain = (flush: boolean): void => {
    if (!blockAt || !deps.setBlockAir) { terrainJobs.length = 0; return; }
    const n = Math.min(terrainJobs.length, T.eruption.terrain.maxJobs); // flush（片づけ）でも 1 コマの 上限は まもる
    const jobs = terrainJobs.splice(0, n);
    if (flush) terrainJobs.length = 0; // 片づけでは 穴あけの 仕事を 捨てる（植物を 燃やす 仕事だけ 上限まで すませる）
    for (const j of jobs) {
      if (j.crater && !flush) {
        const cells = craterCells(j.x, j.y, j.z, blockAt, crushable, deps.setBlockAir); // 名簿（crater.blocks）の 自然の 地面だけ
        craterBlocks += cells.length;
        // 燃えかすの 真下が 穴に なったら 底へ おろす
        const ix = Math.floor(j.ember.x), iz = Math.floor(j.ember.z), iy = Math.floor(j.ember.y + 1e-6) - 1;
        if (cells.some((c) => c.x === ix && c.z === iz && c.y === iy)) { j.ember.y = iy; embers.moved(); }
      }
      // 燃えかすの 場所（穴の 底へ おりた あと）を 中心に 燃やす
      for (const c of burnPlants(j.x, j.ember.y, j.z, blockAt, deps.setBlockAir)) { eruptFx.burnFlame(c.x + 0.5, c.y, c.z + 0.5); burntBlocks++; }
    }
  };
  /** 隕石の 着地: 落下範囲ダメージ（＋ふつうの はじき）・燃えかす・重い ドン・輪と 光と かけら・小さな 穴・植物が 燃える / 体が 焼ける */
  const onMeteorLand = (m: Meteor): void => {
    const K = T.eruption;
    const ember = embers.add(m.lx, m.ly, m.lz, m.body, m.id);
    const p = deps.player();
    const dist = Math.hypot(p.x - m.lx, p.z - m.lz);
    sfx.meteor(dist);
    eruptFx.impact(m.lx, m.ly, m.lz);
    if (!rain.finale && inBlast(m.lx, m.ly, m.lz, { x: p.x, y: p.y, z: p.z }) && deps.hurt?.(K.meteor.damage, { x: m.lx, y: m.ly, z: m.lz })) meteorHurts++;
    if (dist < K.impact.shakeNear && !env.reduced()) deps.shake?.(K.impact.shake * (1 - dist / K.impact.shakeNear));
    if (!m.body) terrainJobs.push({ x: m.lx, y: m.ly, z: m.lz, crater: !rain.finale, ember }); // 切りかえの 噴火は 演出: 穴は あけない（植物が 燃えるのは そのまま）
    else burnBody(m.lx, m.ly, m.lz, true);
  };
  /** 飛び散った 火の 粉が 落ちた: 燃えかす・小さな ぱちっ・植物が 燃える / 体が 焼ける */
  const onSparkLand = (s: Spark): void => {
    const ember = embers.add(s.lx, s.ly, s.lz, s.body, s.from);
    sfx.ash();
    eruptFx.sparkPop(s.lx, s.ly, s.lz);
    if (!s.body) terrainJobs.push({ x: s.lx, y: s.ly, z: s.lz, crater: false, ember });
    else burnBody(s.lx, s.ly, s.lz, false);
  };
  // 燃えかすは 殴ると 消える（刀・真空波・らせん・ドーム・パンチ・矢）。小さな 煙と「じゅっ」
  const EMBER_ID_BASE = GHOST_EMBER_BASE;
  let doused = 0, lastDouse = -1e9, douseYm: object | null = null;
  const emberBox = { name: 'ember', c: [0, 0, 0], ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [0, 0, 0] } as { name: string; c: number[]; ax: number[]; half: number[] } satisfies BoxLike;
  const fillBox = (e: Ember): BoxLike => {
    const K = T.eruption.ember;
    emberBox.c[0] = e.x; emberBox.c[1] = e.y + K.douseHalfY; emberBox.c[2] = e.z;
    emberBox.half[0] = K.douseHalf; emberBox.half[1] = K.douseHalfY; emberBox.half[2] = K.douseHalf;
    return emberBox;
  };
  const douseWhere = (touch: (b: BoxLike, e: Ember) => boolean): void => {
    const gone = embers.douse((e) => touch(fillBox(e), e));
    if (!gone.length) return;
    const K = T.eruption.ember;
    doused += gone.length;
    for (const e of gone) eruptFx.puff(e.x, e.y + 0.3, e.z, K.douseSmoke, K.douseSmokeSize, 1.2, 0.5);
    if (eruptClock - lastDouse >= K.douseSoundEverySec) { lastDouse = eruptClock; sfx.smoke(); }
  };
  const stepDouse = (): void => {
    const s = deps.hit;
    if (!s) return;
    // 線の 当たり（パンチ・矢）: 燃えかすを 小さな 箱として 妖怪の 線の 当たりに 重ねる
    const ym = s.yokai?.() ?? null;
    if (ym && douseYm !== ym) {
      douseYm = ym;
      const rayPrev = ym.raycast.bind(ym), dmgPrev = ym.damage.bind(ym);
      ym.raycast = (origin, dir, max) => {
        const real = rayPrev(origin, dir, max);
        if (!embers.list.length) return real;
        const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
        let best: Ember | null = null, bt = real ? real.distance : max;
        const reach = bt + 2; // 線の とどく 長さより 遠い 燃えかすは 箱を 作らずに とばす（燃えかすは 数百 ある）
        for (const e of embers.list) {
          if (Math.abs(e.x - origin.x) > reach || Math.abs(e.z - origin.z) > reach || Math.abs(e.y - origin.y) > reach) continue;
          const t = rayBox(fillBox(e), origin.x, origin.y, origin.z, dir.x / len, dir.y / len, dir.z / len, bt);
          if (t !== null && (best === null ? t <= bt : t < bt)) { best = e; bt = t; }
        }
        return best ? { id: EMBER_ID_BASE + best.id, kind: 'nurikabe', distance: bt } : real;
      };
      ym.damage = (id, amount, from, knock, by) => {
        if (id >= EMBER_ID_BASE && id < EMBER_ID_BASE + GHOST_ID_SPAN) { const want = id - EMBER_ID_BASE; douseWhere((_b, e) => e.id === want); return 0; }
        return dmgPrev(id, amount, from, knock, by);
      };
    }
    if (!embers.list.length) return;
    const M = T.hit;
    const b = s.blade?.() ?? null;
    if (b) {
      if (b.shape.kind === 'capsule') { const sh = b.shape; douseWhere((bx) => boxTouchesCapsule(bx, sh.from, sh.to, sh.radius + M.swordMargin)); }
      else { const sh = b.shape; douseWhere((bx) => boxTouchesFan(bx, sh, M.swordMargin)); }
    }
    for (const w of s.waves?.() ?? []) douseWhere((bx) => distToBox(bx, w.position.x, w.position.y, w.position.z) <= w.radius + M.waveMargin);
    const d = s.dome?.() ?? null;
    if (d) douseWhere((bx) => distToBox(bx, d.center.x, d.center.y, d.center.z) <= d.radius);
  };
  const step = (dt: number): void => {
    const actor = env.actor();
    if (!actor) return;
    eruptClock += dt;
    const E = actor.eruption, ph = actor.attackName === 'eruption' && actor.mode === 'attack' ? E.phase : 'idle';
    actor.mouthPosition(mouthV);
    const mouth = { x: mouthV.x, y: mouthV.y, z: mouthV.z };
    eruptFx.setWind(mouth, ph === 'inhale' ? E.wind : 0);
    eruptFx.setColumn(mouth, ph === 'erupt' ? E.column : 0);
    eruptFx.setMouthGlow(mouth, ph === 'inhale' ? E.wind * 0.7 : ph === 'erupt' ? 0.5 + 0.5 * E.column : 0);
    if (rain.active) {
      const pl = deps.player();
      const o = rain.update(dt, mouth, landAt, { x: pl.x, y: pl.y, z: pl.z });
      for (const m of o.landed) onMeteorLand(m);
      for (const s of o.sparkLanded) onSparkLand(s);
      eruptFx.setRain(rain);
    } else eruptFx.setRain(null);
    terrainAcc += dt;
    if (terrainJobs.length && terrainAcc >= T.eruption.terrain.everySec) { terrainAcc = 0; runTerrain(false); }
    embers.update(dt);
    stepDouse();
    eruptFx.setEmbers(embers.list, embers.version);
    const p = deps.player();
    const d = embers.step(dt, { x: p.x, y: p.y, z: p.z });
    if (d > 0) deps.hurt?.(d, { x: p.x, y: p.y, z: p.z - 1 });
    // 焼けた 体は 時間で もどる（ガラスは glass の 再生）
    while (bodyBurnt.length && eruptClock - bodyBurnt[0]!.t >= T.eruption.body.restoreSec) {
      const b = bodyBurnt.shift()!;
      env.model()?.restoreMoss(b.moss);
      for (const pb of b.placed) placed.restore(pb);
    }
    sfx.embers(embers.list.length);
    eruptFx.update(dt);
  };
  return {
    step,
    begin: () => { const a = env.actor(); rain.begin(a?.eruptionCount ?? 0, !!a?.eruption.hold); sfx.erupt(); }, // 少女への 切りかえの 噴火（hold）は プレイヤーの まわりに 落とさない
    landAt,
    clear: (full, keepEmbers) => {
      rain.stop(); runTerrain(true); eruptFx.clear(); if (!keepEmbers) embers.clear(); // 地形の 待ちを すませて から 見た目を 消す（燃える 植物の 炎を のこさない）
      if (full) bodyBurnt.length = 0;
    },
    resetBurnt: () => { bodyBurnt.length = 0; },
    rain, embers, fx: eruptFx,
    get meteorHurts() { return meteorHurts; },
    get burntBlocks() { return burntBlocks; },
    get craterBlocks() { return craterBlocks; },
    get doused() { return doused; },
  };
}
