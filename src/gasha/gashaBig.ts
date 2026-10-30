/**
 * #293 試作（開発サーバーだけ）: 大きい がしゃどくろ（第一形態）の 見た目 と 登れる 当たり。
 * `?proto=gashaBig` のときだけ main.ts から 読まれる。見た目は design-v1 の C 案（黒の セーラー ＋ ピンクの スカーフ）を 箱で 作った もの。
 * ・上半身は 関節ごとの Group（Meshy の 人型の 骨の 名前と おなじ: Hips, Spine, Spine01, Spine02, neck, Head, Left/Right の Shoulder・Arm・ForeArm・Hand）。
 *   原点は 関節の 場所（回転の 中心）。休みの 姿勢では ぜんぶ 回転なし（向きは からだの 座標と おなじ）。`__gashaBig.joints()` で 名前 → Group。
 * ・描画回数を へらす ため、箱は 関節ごとに まとめて 1 つの メッシュに する。ゲームに 光源は ないので MeshBasicMaterial ＋ 頂点の 色で、面の 向きごとに 明るさを かえて 立体に 見せる。
 * ・当たりは 見えない 箱（OBB）で、関節の Group に ついて 動く。プレイヤーの 当たりは ブロック（isSolidForPlayer）でしか 当たらないので、箱を ブロックの マスに 直して
 *   「追加の 固いマス」として 足す（deps.addPlayerSolid）。うでを 動かしたら `refreshColliders()` で 作りなおす。
 * ・目は ふだん 白、`__gashaBig.angry(true)` で 赤。
 * 数は ぜんぶ gashaBigTuning.ts。
 */
import { Group, Mesh, MeshBasicMaterial, Plane, Quaternion, Vector3 } from 'three';
import { BodyPlaced } from './gashaBigPlaced';
import { TUNE as T, applyTune, applyTuneFromUrl } from './gashaBigTuning';
import { BigActor, type ActorClips } from './gashaBigActor';
import { sharedGashaBgm } from './gashaBgm';
import { CoreBarrier } from './gashaBigBarrier';
import { BigHit } from './gashaBigHit';
import { GashaGeyser } from './gashaGeyser';
import { BigShock } from './gashaBigShock';
import { ShockFx } from './gashaBigShockFx';
import { createBigSfx, createBigWebAudioPlayer } from './gashaBigSfx';
import { crushAt } from './gashaBigCrush';
import { BodyQuake } from './gashaBigQuake';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
import lookBackClip from './gashaBigClips/lookBack.json';
import { buildBig } from './gashaBigBuild';
import { JOINT_NAMES, type BigModel, type GlassMask, type JointName } from './gashaBigTypes';
import { hazePatch, updateHaze } from './gashaBigHaze';
import { UP } from './gashaBigBuilder';
import type { GashaBigDeps, GashaBigHandle } from './gashaBigDeps';
import { worldHits, type WorldHit } from './gashaBigWorld';
import { createGlassField } from './gashaBigGlassField';
import { CoreThrow } from './gashaBigCoreThrow';
import { createSweepStep } from './gashaBigSweepStep';
import { createBeamStep } from './gashaBigBeamStep';
import { createEruptionStep } from './gashaBigEruptStep';
import { createThunderStep } from './gashaBigThunderStep';
import { createFinishStep } from './gashaBigFinishStep';

export { JOINT_NAMES, buildBig, hazePatch };
export { cellKey, voxelize, worldHits } from './gashaBigWorld';
export type { BigModel, GlassMask, JointName, GashaBigDeps, GashaBigHandle, WorldHit };

/** `first`: 最初の 置き場所（なければ プレイヤーの 前 T.place.distance。ふだんの ゲームは release.ts が 場所を 渡す） */
export function startGashaBig(deps: GashaBigDeps, first?: { x: number; z: number; yawDeg?: number }): GashaBigHandle {
  applyTuneFromUrl(location.search);
  let model: BigModel | null = null;
  let actor: BigActor | null = null;
  /** 少女に かわる 間は true（hide）。体は のこして かくす */
  let hidden = false;
  /** 体力 0 の 通知を 出したか（place() で もどる） */
  let defeatedFired = false;
  /** 固まった ことを 知らせたか(place・despawn で もどる) */
  let heldFired = false;
  const CLIPS: ActorClips = { climbUp, climbDown, lookBack: lookBackClip };
  let isAngry = false;
  let pos = new Vector3(), yaw = 0;
  const reduced = (): boolean => deps.reducedMotion?.() ?? false;
  // コアを たたかれた ときの 予兆・ふり落とし（gashaBigCoreThrow.ts）
  const core = new CoreThrow({ actor: () => actor, model: () => model, yaw: () => yaw, reduced, deps });
  // ガラスの 雲: 割れた マスの 順番待ち（古い 順に 1 つずつ もどる。gashaBigGlassField.ts）
  const glass = createGlassField({ model: () => model, deps });
  // プレイヤーが 体の 上に 置く ブロック（gashaBigPlaced.ts）。がしゃどくろを 置きなおすと ぜんぶ 消える
  const placed = new BodyPlaced({ model: () => model, actor: () => (hidden ? null : actor), lighting: deps.lighting, patch: hazePatch, breakGlassAt: (c, r, max) => glass.breakGlass(c, r, max) });
  // 少女の 間(固まって いる 間)は 体も コアも ダメージ 0 + コアは 虹色の バリアで まもられて いる(とどめの あとは 別)
  const barrier = new CoreBarrier(deps.scene);
  const bodyGuardOn = (): boolean => !!actor && !hidden && actor.held && finish.phase() === 'off' && T.freeze.bodyInvincible && !!deps.onHeld;
  // プレイヤーの 攻撃を 受ける（体力・部位の 倍率・怒る・火花・体力ゲージ。gashaBigHit.ts）
  const bh = new BigHit({ scene: deps.scene, angry: () => { isAngry = true; actor?.hit(); }, onCore: core.throwOff, coreGuard: () => core.warnLeft > 0,
    bodyGuard: bodyGuardOn,
    onDeflect: (at) => { if (at) barrier.ripple(at.x, at.y, at.z); else { const p = deps.player(); barrier.ripple(p.x, p.y + 1, p.z); } }, onCloud: (at) => { glass.breakGlass(at, T.glass.swordRadius); }, onCoreHit: (at) => finish.coreStruck(at), onStrike: deps.onStrike, defIgnore: deps.defIgnore, sources: deps.hit });
  const { blockAt, setGeyserBlock, scanGeyserBlocks } = deps;
  const geysers = deps.onUpdate && deps.playerBody && deps.setPlayerVelocity && deps.nudgePlayer && deps.setNoFall && blockAt && setGeyserBlock && scanGeyserBlocks
    ? new GashaGeyser({
      scene: deps.scene, onUpdate: deps.onUpdate, groundY: deps.groundY, body: deps.playerBody, setVelocity: deps.setPlayerVelocity, nudge: deps.nudgePlayer, setNoFall: deps.setNoFall,
      blockAt, setBlock: (x, y, z) => setGeyserBlock(x, y, z), restoreBlock: deps.restoreGeyserBlock, scanBlocks: scanGeyserBlocks,
      bodySolid: (x, y, z) => (hidden ? false : actor?.solid(x, y, z) ?? false),
      centre: () => (actor && !hidden ? { x: pos.x, z: pos.z } : null),
    })
    : null;
  if (geysers) deps.onSaveOverrides?.(() => geysers.saveOverrides());
  // 手が 地面を たたいた ときの 打撃・衝撃波・小さい 衝撃・ひるみ（gashaBigShock.ts）と 見た目（gashaBigShockFx.ts）
  const shock = new BigShock({
    player: deps.player, groundY: deps.groundY, hurt: deps.hurt, setPlayerVelocity: deps.setPlayerVelocity, knockbackMul: deps.knockbackMul,
    onGround: deps.playerBody ? () => deps.playerBody!().onGround ?? true : undefined,
  });
  const shockFx = new ShockFx(deps.scene, deps.camera);
  // 攻撃 1 の アースクエイク: 体も ゆれて、のっている 人は 一定の 間かくで 横に ゆさぶられる（自動では ふり落とさない。歩いて 踏んばれば のこれる。ジャンプ中は 押されない）
  const riding = (): boolean => { if (!actor || !deps.carryPlayer) return false; const p = deps.player(); return actor.boxUnder(p.x, p.y, p.z) >= 0; };
  // 効果音（gashaBigSfx.ts。オーナー OK 済みの sfx-big-v1。数は 調整表の sfx）。ファイルは 最初に まとめて 読みこむ
  const sfxPlayer = deps.sfxEnv ? null : createBigWebAudioPlayer(deps.sfxOut);
  const sfx = createBigSfx(deps.sfxEnv ?? sfxPlayer!);
  sfxPlayer?.preload();
  const quake = new BodyQuake({
    isRider: riding, onGround: () => deps.playerBody?.().onGround ?? true,
    nudge: (dx, dz) => deps.nudgePlayer?.(dx, dz),
    onPush: () => { sfx.shake(); },
  });
  // 攻撃 2「両手で 払う」・3「目から 光線」・4「口から 火山噴火」・5「自分に 落雷」の 世界との つなぎ（gashaBig{Sweep,Beam,Eruption,Thunder}Step.ts）
  const stepSweep = createSweepStep({ actor: () => actor, shock, shockFx, deps });
  const beam = createBeamStep({ actor: () => actor, sfx, deps });
  const eruption = createEruptionStep({ actor: () => actor, model: () => model, placed, sfx, breakGlass: glass.breakGlass, reduced, deps });
  const thunder = createThunderStep({ actor: () => actor, reduced, sfx, landAt: eruption.landAt, deps });
  deps.blockPlayerInput?.(() => shock.inputBlocked() || core.blocked());
  deps.onBeforeRender?.(() => shockFx.applyShake(Math.max(reduced() ? 0 : shock.shakeNow, core.warnLeft > 0 ? T.core.throwOff.warnShakeDeg * (reduced() ? 0.25 : 1) : 0, quake.active && riding() ? T.slam2.quake.bodyShakeDeg * (reduced() ? 0.25 : 1) : 0), shock.time));
  const fwdOf = (p: { yawDeg: number }) => { const y = (p.yawDeg * Math.PI) / 180; return { fx: Math.sin(y), fz: -Math.cos(y) }; };

  const clear = () => {
    if (!model) return;
    deps.scene.remove(model.group);
    const mats = new Set<MeshBasicMaterial>();
    model.group.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.geometry.dispose(); mats.add(m.material as MeshBasicMaterial); } });
    mats.forEach((m) => { deps.lighting?.unregister?.(m); m.dispose(); });
    model = null;
    glass.clear();
    placed.reset();
  };

  /** 当たりの 箱の 場所を いまの 姿勢で 更新（マスの 集合は 作らない。判定は その 場で 箱に 聞く） */
  const refresh = (): void => {
    if (!model || !actor) return;
    model.group.updateMatrixWorld(true);
    actor.updateBoxes();
  };

  const place = (at?: { x: number; z: number; yawDeg?: number }): void => {
    clear();
    model = buildBig();
    hidden = false;
    defeatedFired = false;
    heldFired = false;
    finish.reset();
    deps.lighting?.registerTree(model.group, 'doll');
    const p = deps.player();
    const f = fwdOf(p);
    const mx = at ? at.x : p.x + f.fx * T.place.distance, mz = at ? at.z : p.z + f.fz * T.place.distance;
    yaw = at && at.yawDeg !== undefined ? (at.yawDeg * Math.PI) / 180 : Math.atan2(p.x - mx, p.z - mz) + (T.place.faceYawOffsetDeg * Math.PI) / 180;
    const s = model.scale;
    // 地面の 高さ: 手・からだの 下の 何点かで 決める
    const R = new Quaternion().setFromAxisAngle(UP, yaw);
    const hs = model.groundPts.map((q) => {
      const w = q.clone().multiplyScalar(s).applyQuaternion(R);
      return (deps.placeGroundY ?? deps.groundY)(Math.floor(mx + w.x), Math.floor(mz + w.z)) + 1;
    });
    const handHs = hs.slice(1);
    const base = T.place.groundPick === 'min' ? Math.min(...hs) : T.place.groundPick === 'center' ? hs[0]! : T.place.groundPick === 'hands' ? Math.round(handHs.reduce((a, b) => a + b, 0) / handHs.length) : Math.max(...hs);
    pos = new Vector3(mx, base, mz);
    model.group.position.copy(pos);
    model.group.rotation.y = yaw;
    model.group.scale.setScalar(s);
    deps.scene.add(model.group);
    // 間欠泉は ここで 場所を きめる（がしゃどくろが その後 動いても そのまま）
    geysers?.place({ x: pos.x, y: pos.y, z: pos.z, yaw, scale: s });
    actor = new BigActor(model, CLIPS, {
      groundY: deps.groundY, player: deps.player, carryPlayer: deps.carryPlayer,
      onSlam: (x, y, z) => { if (farNow) return;
        shockFx.spawn(shock.add('slam', x, y, z));
        sfx.step();
        if (blockAt && deps.setBlockAir) crushAt(x, y, z, { getBlock: blockAt, setAir: deps.setBlockAir, onBlocks: deps.onCrushBlocks });
      },
      onTap: (x, y, z) => { if (farNow) return; shockFx.spawn(shock.add('tap', x, y, z)); sfx.step(); },
      onAttackStart: (name) => { if (farNow) return; if (name === 'slam2') sfx.lift(); else if (name === 'sweep') sfx.windup(); else if (name === 'beam') sfx.omen(); else if (name === 'eruption') sfx.inhale(); else if (name === 'thunder') sfx.cloud(); },
      onEruptStart: () => { if (farNow) return; eruption.begin(); }, // 少女への 切りかえの 噴火（hold）は プレイヤーの まわりに 落とさない
      onThunderStrike: () => { if (farNow) return; thunder.onStrike(); },
      onThunderLand: () => { if (farNow) return; thunder.onLand(); },
      onSweepStroke: (i) => { if (farNow) return; sfx.sweep(i); },
      onSlam2: (x, y, z, fx, fz) => { if (farNow) return;
        sfx.slam();
        shockFx.spawn(shock.add('slam2', x, y, z, { fx, fz }));
        if (blockAt && deps.setBlockAir) crushAt(x, y, z, { getBlock: blockAt, setAir: deps.setBlockAir, onBlocks: deps.onCrushBlocks }, T.slam2);
        quake.start();
      },
    }, 293);
    actor.place(pos.x, pos.y, pos.z, yaw);
    actor.walk(T.wander.enabledAtStart);
    if (isAngry) actor.hit();
    bh.bind(actor.boxList, model);
  };

  // ---- とどめの あと(FIX-BRIEF-2 §5): 一撃 → 倒れる → 赤い コア → たたくと ばらまく → こわすと くずれて 消える（gashaBigFinishStep.ts）----
  const finish = createFinishStep({
    actor: () => actor, model: () => model, pos: () => pos, hit: bh, sfx, core,
    setAngry: (on) => { isAngry = on; }, clearFx: () => clearFx(false), stopBgm: () => bgm?.request('big', false), deps,
  });

  deps.addPlayerSolid((x, y, z) => actor !== null && !hidden && actor.solid(x, y, z));
  // BGM「神々の 戯れ」: 怒って いる（赤い 目の）間だけ。少女が 出た あとは 共通の 係が「災厄」を 優先する（gashaBgm.ts）
  const bgm = deps.bgmOut && deps.suppressBgm ? sharedGashaBgm({ bgmOut: deps.bgmOut, suppressBgm: deps.suppressBgm }) : null;
  bgm?.preload('kamigami', 'saiyaku'); // 怒った 瞬間・少女が 出る 瞬間に 曲が とぎれない ように 先に 読みこむ（FIX-BRIEF-2 §3-4）
  let bgmWant = false;
  let farNow = false;
  /** コアの バリア: 少女の 間だけ 張る(コアの 場所に ついて いく) */
  const stepBarrier = (dt: number): void => {
    const on = bodyGuardOn();
    barrier.setOn(on);
    if (!on) return;
    const c = finish.coreCenter();
    barrier.setCenter(c.x, c.y, c.z);
    barrier.update(dt);
  };
  deps.onUpdate?.((dt) => {
    // 片づけた あと・少女の 間は 何も 動かさない（BGM の 後始末だけ 毎コマ）
    if (!actor || hidden) { barrier.setOn(false); bgm?.step(); return; }
    stepBarrier(dt);
    updateHaze();
    // プレイヤーが 遠い(perf.farDist より 遠い)間は 攻撃の 当たり・見た目・音・ゆれを まいコマ 省く(体の 動きと 体力だけ)。遠く なった しゅんかんに 画面の 効果・音を 片づける
    const fp = deps.player();
    const far = Math.hypot(fp.x - actor.pos.x, fp.z - actor.pos.z) > T.perf.farDist;
    if (far && !farNow) clearFx(false, true); // 燃えかすは ワールドに のこる もの: 遠くへ いっても 消さず（約 5 分の 寿命どおり）
    farNow = far;
    const wasAttack = actor.mode === 'attack';
    actor.update(dt);
    if (wasAttack && !actor.isAngry()) clearFx(false, true); // 攻撃の 途中で 怒りが 自然に とけた（calmSec）: 効果・雷・灰・音を 片づける（燃えかすは のこす）
    if (actor.held && !heldFired && finish.phase() === 'off') { heldFired = true; bgm?.cut(); deps.onHeld?.(); } // 固まった しゅんかん: BGM を ぶつっと 切って 少女を 呼ぶ
    if (far) {
      eruption.embers.update(dt); // 遠い 間も 燃えかすの 年れいは 進める（寿命どおり）
      bh.step(dt);
      if (!defeatedFired && bh.hp <= 0) { defeatedFired = true; finish.start(); deps.onDefeated?.(); }
      finish.step(dt);
      if (actor) { pos = actor.pos; yaw = actor.yaw; }
      if (bgm && actor) { const w = actor.angryLeft > 0; if (w !== bgmWant) { bgmWant = w; bgm.request('big', w); } bgm.step(); }
      return;
    }
    model?.updateMoss();
    bh.step(dt);
    if (!defeatedFired && bh.hp <= 0) { defeatedFired = true; finish.start(); deps.onDefeated?.(); if (!actor) return; }
    finish.step(dt);
    if (!actor) return; // くずれて 消えた 合図で 呼んだ 側が despawn() した
    glass.step(dt);
    core.stepWarn(dt);
    quake.step(dt);
    stepSweep(dt);
    beam.step(dt);
    eruption.step(dt);
    thunder.step(dt);
    // アースクエイクの ゴゴゴ: ゆれの のこりが 少なく なったら 小さく して 切る
    if (quake.left > T.sfx.quakeFadeOutSec) sfx.quakeOn(); else sfx.quakeOff();
    sfx.update();
    shockFx.setWarn(actor.warn);
    core.stepPush(dt);
    shock.step(dt);
    shockFx.update(dt);
    pos = actor.pos; yaw = actor.yaw;
    if (bgm) {
      const w = actor.angryLeft > 0;
      if (w !== bgmWant) { bgmWant = w; bgm.request('big', w); }
      bgm.step();
    }
  });
  place(first);
  deps.onBodyBlocks?.(placed);

  /** 攻撃の エフェクト・音・燃えかす・雷・たたいた 輪・ひるみ・画面の ゆれを ぜんぶ 止めて 消す（体は そのまま）。full: 体の 焼け あとの もどす 予定も 消す。keepEmbers: 燃えかすは のこす（遠くへ いった とき） */
  const clearFx = (full: boolean, keepEmbers = false): void => {
    quake.stop(); beam.fx.clear(); eruption.clear(full, keepEmbers);
    thunder.clear(); sfx.stopAll();
    shock.clear(); shockFx.clear();
    core.clear();
  };
  const detachedGroup = new Group();

  /** 片づける（#293 まとめ）。体・当たり・間欠泉・体力ゲージ・射線の 割りこみ・エフェクト・燃えかす・音を 消す。あとは place(at) で また 出せる */
  const despawn = (): void => {
    clearFx(true);
    geysers?.dismiss();
    bh.dismiss();
    clear();
    actor = null;
    isAngry = false; hidden = false; defeatedFired = false; heldFired = false;
    finish.reset();
    barrier.setOn(false);
    if (bgm) { bgmWant = false; bgm.uncut(); bgm.request('big', false); bgm.step(); }
  };

  /** 少女に かわる 間だけ かくす / もどす */
  const hide = (on: boolean): void => {
    if (!model || !actor || on === hidden) return;
    hidden = on;
    model.group.visible = !on;
    if (on) {
      // 体の 上に のっている 人は 地面へ おろす（高い 所から 落とさない）
      const p = deps.player();
      if (deps.carryPlayer && actor.boxUnder(p.x, p.y, p.z) >= 0) deps.carryPlayer(0, deps.groundY(Math.floor(p.x), Math.floor(p.z)) + 1 - p.y, 0, 0);
      clearFx(false);
      actor.abortAttack(); // 攻撃の 途中の 状態(払い・雷・噴火・光線)を ぜんぶ 片づける。怒りは のこす
      bh.bind([], null);
      if (bgm && !bgmWant && actor.angryLeft > 0) { bgmWant = true; bgm.request('big', true); }
    } else {
      bh.bind(actor.boxList, model);
    }
  };

  const handle: GashaBigHandle = {
    tune: (o) => applyTune(o),
    place: (at) => { clearFx(true); eruption.resetBurnt(); place(at); bh.reset(); },
    despawn,
    hide,
    finale: () => { if (!actor) return; if (hidden) hide(false); isAngry = true; actor.finale(); },
    frozen: () => actor?.held ?? false,
    perchSpot: () => {
      if (!actor) return null;
      const b = actor.boxList.find((q) => q.name === T.freeze.perchBox);
      if (!b) return null;
      const top = b.c[1]! + Math.abs(b.ax[1]!) * b.half[0] + Math.abs(b.ax[4]!) * b.half[1] + Math.abs(b.ax[7]!) * b.half[2];
      return { x: b.c[0]!, y: top + T.freeze.perchUp, z: b.c[2]!, yawDeg: (yaw * 180) / Math.PI };
    },
    setGirlBox: (box) => { if (finish.phase() === 'off') bh.setExtra(box); },
    barrier: () => barrier.info(),
    finishInfo: () => finish.info(),
    maxHp: () => bh.maxHp,
    hp: () => bh.hp,
    damage: (part, amount, at, source) => bh.damage(part, amount, at ?? null, source),
    section: (on) => {
      if (!model || !actor) return;
      const i = actor.model.hits.findIndex((h) => h.name === 'core');
      const b = i >= 0 ? actor.boxList[i] : undefined;
      if (!b) return;
      const plane = new Plane().setFromNormalAndCoplanarPoint(new Vector3(-b.ax[0]!, -b.ax[1]!, -b.ax[2]!), new Vector3(b.c[0]!, b.c[1]!, b.c[2]!)); // 左（+x）がわが 消える
      model.group.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const mat = m.material as MeshBasicMaterial;
        mat.clippingPlanes = on ? [plane] : null;
        mat.needsUpdate = true;
        m.onBeforeRender = on ? (r) => { r.localClippingEnabled = true; } : () => undefined;
      });
    },
    angry: (on) => { isAngry = on; if (!on && actor?.mode === 'attack') clearFx(false, true); actor?.angry(on); }, // 攻撃の 途中で 怒りが とけたら tired と 同じく 効果を 片づける（燃えかすは のこす）
    hit: () => { isAngry = true; actor?.hit(); },
    walk: (on) => actor?.walk(on),
    goTo: (x, z) => actor?.goTo(x, z),
    lookBack: () => actor?.lookBack(),
    back: (on) => actor?.back(on),
    attack: (name) => actor?.attack(name),
    tired: (sec) => { if (actor?.mode === 'attack') clearFx(false, true); actor?.tired(sec); }, // 燃えかすは 休んでも 消さない（約 5 分・殴ると 消える）
    attackInfo: () => ({
      mode: actor?.mode ?? '', phase: actor?.cycle.phase ?? 'off', attack: actor?.attackName ?? null, done: actor?.cycle.done ?? 0, count: actor?.cycle.count ?? 0, left: actor?.cycle.left ?? 0,
      slam2Count: actor?.slam2Count ?? 0, sweepCount: actor?.sweepCount ?? 0, sweepActive: actor?.sweepNow?.side ?? null, quakeLeft: quake.left, warn: !!actor?.warn, fx: shockFx.bigCounts(),
      beamCount: actor?.beamCount ?? 0, beamPhase: actor?.beam.phase ?? 'idle', beamMode: actor && actor.attackName === 'beam' ? beam.aim.mode : null, beamAim: actor && actor.attackName === 'beam' && beam.prev() === 'fire' ? { ...beam.aim.a } : null, beamFx: beam.fx.counts(),
      thunder: { count: actor?.thunderCount ?? 0, phase: actor?.thunder.phase ?? 'idle', cloud: actor?.thunder.cloud ?? 0, elec: actor?.thunder.elec ?? 0, strikes: thunder.strikes.list.length, hits: thunder.strikes.hitCount, bodyHurts: thunder.bodyHurts(), strikeHurts: thunder.strikeHurts(), fx: thunder.fx.counts() },
      eruption: { count: actor?.eruptionCount ?? 0, phase: actor?.eruption.phase ?? 'idle', flying: eruption.rain.meteors.length, sparks: eruption.rain.sparks.length, landed: eruption.rain.landedCount, aimed: eruption.rain.aimedCount, meteorHurts: eruption.meteorHurts, embers: eruption.embers.list.length, onBody: eruption.embers.list.filter((e) => e.body).length, mossHidden: model?.mossHidden() ?? 0, glassBroken: glass.brokenCount(), burntBlocks: eruption.burntBlocks, craterBlocks: eruption.craterBlocks, doused: eruption.doused, fx: eruption.fx.counts() },
    }),
    rest: (sec) => actor?.rest(sec),
    thunderSpots: () => thunder.hitLog().map((q) => ({ ...q })),
    eruptionEmbers: () => eruption.embers.list.map((e) => ({ ...e })),
    eruptionImpacts: () => eruption.rain.impacts.map((q) => ({ ...q })),
    motion: () => (actor ? {
      mode: actor.mode, speedNow: actor.speedNow, crawlSpeed: actor.crawlSpeed, crawlRate: actor.crawlRate, strideScale: actor.strideScale, backOn: actor.backOn, target: actor.target, wander: actor.wanderOn,
      angryLeft: actor.angryLeft, eyeMix: actor.eyeMix, walkLeft: actor.walkLeft, restLeft: actor.restLeft, work: actor.work, plant: actor.plant,
    } : {}),
    breakGlass: glass.breakGlass,
    glassInfo: () => ({ total: model?.glass.length ?? 0, broken: glass.brokenCount() }),
    colliders: () => (model && !hidden ? worldHits(model) : []),
    refreshColliders: refresh,
    joints: () => (model ? { ...model.joints } : {}),
    solidAt: (x, y, z) => (hidden ? false : actor?.solid(x, y, z) ?? false),
    geysers: () => geysers?.geysers() ?? [],
    spawnGeyser: (x, z, sec) => geysers?.spawn(x, z, sec) ?? false,
    giveTabi: () => deps.giveNinjaTabi?.(),
    shock: () => ({
      staggerLeft: shock.staggerLeft, inputBlocked: shock.inputBlocked(), hits: shock.hits.slice(), impacts: shock.impacts.length, shake: shock.shakeNow, lastPush: shock.lastPush,
      slams: actor?.step.slams ?? 0, taps: actor?.step.taps ?? 0, phase: actor?.step.phase ?? '', fx: shockFx.counts(), lastSlam: actor?.lastSlam ?? null, lastTap: actor?.lastTap ?? null,
    }),
    info: () => ({
      scale: model?.scale, pos: [pos.x, pos.y, pos.z], yawDeg: (yaw * 180) / Math.PI, drawCalls: model?.meshes, hitBoxes: model?.hits.length, angry: (actor?.angryLeft ?? 0) > 0, hp: bh.hp, maxHp: bh.maxHp, lastHit: bh.last, deflects: bh.deflects,
      coreWarn: { warnLeft: core.warnLeft, throwLeft: core.left, spinLeft: core.spinLeft },
      head: model ? model.head.clone().multiplyScalar(model.scale).applyQuaternion(new Quaternion().setFromAxisAngle(UP, yaw)).add(pos).toArray() : null,
      rest: model ? Object.fromEntries(JOINT_NAMES.map((j) => [j, model!.rest[j].toArray()])) : null,
    }),
    bodyBlocks: placed,
    get group() { return model ? model.group : detachedGroup; },
  };
  (window as unknown as { __gashaBig: GashaBigHandle }).__gashaBig = handle;
  if (!deps.noTabi) deps.giveNinjaTabi?.(); // #293: 試作・テストでは はじめから 忍者の足袋を 着ている。ふだんの ゲーム（noTabi）では ごほうび
  return handle;
}


