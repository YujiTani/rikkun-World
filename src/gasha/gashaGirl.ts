/**
 * #293 がしゃどくろ 第二形態（少女）の「ワープ → 詠唱 → 魔法 4 種」。
 * 試作ページ（`?proto=gashaGirl`、開発サーバーだけ）は すぐ はじまる。ふだんの ゲームでは `{ dormant: true }` で 読みこんで ねかせて おき（見えない・動かない・描かない）、
 * 大きな 姿の 体力が 1/2 に なって 固まったら release.ts が summon() で はじめる（笑い声 → ワープで 飛びまわる → 決めポーズ → 5 回の 魔法 → 大きな 姿の かたに 座って 休む（perchSpot・setHitBox）→ また 魔法）。dismiss() で 止める。GLB は public/models/gasha/girl-cast.glb（相対パス。公開版でも 読める。頂点の 使わない 属性を 減らし、テクスチャは JPEG の 圧縮を 強めて 約 4 MB）。
 * 少女は 歩かない・走らない（移動は ワープだけ）。ふだんは ゾンビの ように 右うでを 前に 出して 立つ。
 * すべて Game.onUpdate の 固定ステップで 進める。乱数は シード付き。ダメージは なし（見た目だけ）。
 * 魔法 1: 背面か 左横へ ワープ → プレイヤーの 足もとに 噴き出す / 2: 真後ろ → 周囲攻撃（渦）/
 * 3: 距離を とって → 火の玉 10 連射（ホーミング）/ 4: 距離を とって → 青い 弾の 扇（へびのように ゆれる・追尾なし）
 */
import {
  Box3, Group, LoopOnce, AnimationClip, AnimationMixer, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Quaternion,
  Vector3, type MeshStandardMaterial, type SkinnedMesh, type Bone,
} from 'three';
import { ruby } from '../ui/text';
import { bearingOf } from '../combat/parry';
import { TUNE as T, applyTune, applyTuneFromUrl } from './gashaGirlTuning';
import { sharedGashaBgm } from './gashaBgm';
import { createGirlSfx, createWebAudioPlayer } from './gashaGirlSfx';
import { IntroSeq, introAngleDeg, introPoseSec, introSpot, type IntroEvent } from './gashaGirlIntro';
import { blendBetween, buildFloatPose, floatEntry } from './gashaGirlFloat';
import { applyDelta, blendPose, SIT_DELTA, type BaseBone } from './gashaGirlPose';
import { POSES } from './gashaGirlPoseData';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GashaGirlDeps, GashaGirlOpts, GirlController, GashaGirlHandle } from './gashaGirlTypes';
import { D2R, clamp01, fwdOf, mulberry } from './gashaGirlMath';
import { rotateWorld, poseZombie } from './gashaGirlRig';
import { ParticlePool } from './gashaGirlParticles';
import { createGirlGfx } from './gashaGirlGfx';
import { createEruptions } from './gashaGirlEruption';
import { createVortices } from './gashaGirlVortex';
import { createProjs, chestOf, type GirlStats } from './gashaGirlProjs';
import { createShy } from './gashaGirlShy';

export type { GashaGirlDeps } from './gashaGirlTypes';

/** りっくんは 1.8 ブロック */
export const GIRL_HEIGHTS = [3.0]; // yuzu 2026-10-23: 3.0 ブロックに 決定
const GAP = 2.6;

const tmpV = new Vector3();

const SPELLS = 4;

export function startGashaGirl(deps: GashaGirlDeps, opts: GashaGirlOpts = {}): Promise<GirlController> {
  applyTuneFromUrl(location.search);
  return new Promise<GirlController>((resolve, reject) => {
    new GLTFLoader().load(
      './models/gasha/girl-cast.glb',
      (gltf) => {
        void import('three/examples/jsm/utils/SkeletonUtils.js').then(({ clone }) => {
          try { resolve(build(deps, gltf.scene, gltf.animations[0]!, clone, opts)); } catch (e) { console.warn('[gashaGirl] 作れません', e); reject(e instanceof Error ? e : new Error('girl build')); } // build() の 途中で 失敗しても 待たされ続けない
        }, reject);
      },
      undefined,
      (e) => { console.warn('[gashaGirl] 読めません', e); reject(e instanceof Error ? e : new Error('girl glb')); },
    );
  });
}

function build(deps: GashaGirlDeps, src: Object3D, clip: AnimationClip, clone: (o: Object3D) => Object3D, opts: GashaGirlOpts): GirlController {
  const dormant = opts.dormant === true;
  const scene = deps.scene;
  const front = new Vector3(0, 0, 1);
  const H = GIRL_HEIGHTS[0]!;

  // ---- 少女 ----
  const model = clone(src);
  const bareRest = new Map<string, Quaternion>(); // 少女の 骨の もとの 休みの 回転(座りポーズの もと)
  model.traverse((o) => { if ((o as Bone).isBone) bareRest.set(o.name, o.quaternion.clone()); });
  const floatPose = buildFloatPose(model); // 決めポーズ「空中で 足を 組んで 座る」(休みの 姿勢から 1 回だけ 組む)
  poseZombie(model, front);
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model, true);
  model.scale.multiplyScalar(H / (box.max.y - box.min.y));
  model.updateMatrixWorld(true);
  model.position.y -= new Box3().setFromObject(model, true).min.y;
  const mats: MeshBasicMaterial[] = [];
  model.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      const old = mesh.material as MeshStandardMaterial;
      const m = new MeshBasicMaterial({ map: old.map, color: 0xffffff, transparent: true, opacity: 1, alphaTest: old.alphaTest });
      mesh.material = m; mats.push(m);
    }
  });
  const pivot = new Group();
  pivot.add(model);
  scene.add(pivot);
  // 立ち姿の ポーズを 保存（詠唱のあと もどす）
  const standPose: { bone: Object3D; q: Quaternion; p: Vector3 }[] = [];
  model.traverse((o) => { if ((o as Bone).isBone) standPose.push({ bone: o, q: o.quaternion.clone(), p: o.position.clone() }); });
  const bareBase: BaseBone[] = standPose.map((s) => ({ bone: s.bone, q: bareRest.get(s.bone.name) ?? s.q })); // 座りポーズの もと
  const standBase: BaseBone[] = standPose.map((s) => ({ bone: s.bone, q: s.q })); // 決めポーズの もと(ゾンビの 立ち姿)
  const restorePose = () => standPose.forEach((s) => { s.bone.quaternion.copy(s.q); s.bone.position.copy(s.p); });
  const mixer = new AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1); action.clampWhenFinished = true;
  const clipDur = () => clip.duration / T.cast.speed; // 詠唱の 長さ（秒）
  const hand = model.getObjectByName('RightHand')!;
  const y0 = model.position.y;

  // ---- 粒・絵 ----
  const add = new ParticlePool(3000, true);
  const smoke = new ParticlePool(400, false);
  scene.add(add.points, smoke.points);
  const gfx = createGirlGfx();

  // ---- 乱数 ----
  let rs = 1, vs = 99;
  const rng = () => { const [s, v] = mulberry(rs); rs = s; return v; };
  const vrng = () => { const [s, v] = mulberry(vs); vs = s; return v; };
  const vr = (a: number, b: number) => a + (b - a) * vrng();

  const stats: GirlStats = { fbHit: 0, fbMiss: 0, waveHit: 0, waveMiss: 0, fired: 0, hits: 0, ringHits: 0, vortexHits: 0, swHits: 0, parried: 0, parryEarly: 0, reflected: 0, reflectHits: 0 };
  const st2 = stats;
  /** パリィに 聞く（当たる 瞬間）。success: 防ぐ／はね返す、early: ダメージが へる */
  let parryForce: 'success' | 'early' | null = null;
  const askParry = (by: 'attack' | 'fireball', at: { x: number; y: number; z: number }) => {
    const p = deps.player();
    if (parryForce) return { result: parryForce, amount: parryForce === 'early' ? T.damage.heart / 2 : T.damage.heart }; // テスト用
    return deps.parry({ dirDeg: bearingOf({ x: p.x, y: p.y, z: p.z }, at), by, amount: T.damage.heart });
  };
  /** 設置系（輪・渦）の 当たり: パリィは 防ぐだけ。'hit' = ダメージが 入った、'blocked' = 防いだ、'retry' = むてき時間 など */
  const setHit = (from: { x: number; y: number; z: number }): 'hit' | 'blocked' | 'retry' => {
    const r = askParry('attack', from);
    if (r.result === 'success') { st2.parried++; return 'blocked'; }
    if (r.result === 'early') st2.parryEarly++;
    const ok = deps.hurt(r.result === 'early' ? r.amount : T.damage.heart, from);
    if (ok) { stats.hits++; sfx.playerHit(); }
    return ok ? 'hit' : 'retry';
  };
  let nextSetHit = 0; // 設置系の 次の 判定（むてき時間と おなじ ぐらい あける）
  let flinchT = 0, flinchTotal = 1, reflectWait = 0;
  const hurtPlayer = (from: { x: number; y: number; z: number }, amount = T.damage.heart): boolean => { const ok = deps.hurt(amount, from); if (ok) { stats.hits++; sfx.playerHit(); } return ok; };

  // ---- 魔法 1（噴き出す）・魔法 2（渦）・弾（魔法 3・4）。効果音は あとで 作る ので 使う ときに 取りだす ----
  const groundY: GashaGirlDeps['groundY'] = (x, z) => deps.groundY(x, z);
  const player: GashaGirlDeps['player'] = () => deps.player();
  const eruptions = createEruptions({ scene, gfx, add, smoke, vr, vrng, rng, groundY, player, sfx: () => sfx });
  const erups = eruptions.list, fireEruptions = eruptions.fire;
  const vortexes = createVortices({ scene, gfx, add, vr, groundY, pivot, sfx: () => sfx });
  const vortices = vortexes.list, warnMat = vortexes.warnMat, fireVortices = vortexes.fire, showVortexWarn = vortexes.showWarn;
  const shots = createProjs({
    scene, gfx, add, smoke, vr, vrng, groundY, solid: (x, y, z) => deps.solid(x, y, z), player, pivot, H, stats, askParry, hurtPlayer,
    onGirlHit: () => { flinchT = flinchTotal = T.parry.flinchSec; }, sfx: () => sfx,
  });
  const chest = new Vector3();
  const projs = shots.list, bursts = shots.bursts, updateProjs = shots.update, spawnProj = shots.spawn;
  /** 魔法・弾・輪を ぜんぶ 消す（座る・とどめ・ねかせる とき） */
  const clearMagic = () => {
    for (const e of erups) { e.e.t = -1; e.e.root.visible = false; }
    for (const v of vortices) { v.v.t = -1; v.v.root.visible = false; v.showWarn(false); }
    for (const q of projs) q.on = false;
    for (const b of bursts) { b.on = false; b.mesh.visible = false; }
  };

  // ---- 目が合った ときの 演出（赤面・！・ピピン） ----
  const headBone = model.getObjectByName('Head')!;
  const headTop = model.getObjectByName('head_end') ?? headBone;
  const headC = new Vector3(), headT = new Vector3();
  const headCenter = (out: Vector3) => { headBone.getWorldPosition(out); headTop.getWorldPosition(headT); return out.lerp(headT, 0.5); };
  const shy = createShy({ scene, pivot, headCenter, sfx: () => sfx });
  const setShy = shy.set, updateShy = shy.update;
  // 効果音（13 音。数は 調整表 sfx）。ファイルは 最初に まとめて 読みこむ
  const sfxPlayer = createWebAudioPlayer(deps.sfxOut);
  const sfx = createGirlSfx(sfxPlayer);
  sfxPlayer.preload();
  const beep = () => { // 目が 合った「ピピン！」(音は gashaGirlSfx.ts の eye_pipin)
    soundCount++; lastSoundT = t;
    sfx.eyePipin();
  };
  const viewPos = new Vector3(), viewDir = new Vector3();
  const checkEye = (): boolean => { // 少女の 頭が カメラの 向きの 約 12° 以内 かつ 間に ブロックが ない
    if (camMode === 'overview' || !pivot.visible) return false;
    const lookLike = camMode === 'look' || camMode === 'close';
    headCenter(headC);
    const p = deps.player();
    if (lookLike) viewPos.set(p.x, p.y + 1.6, p.z);
    else deps.camera.getWorldPosition(viewPos);
    const to = tmpV.copy(headC).sub(viewPos); const d = to.length(); to.divideScalar(d || 1);
    if (lookLike) viewDir.copy(to); else deps.camera.getWorldDirection(viewDir);
    if (Math.acos(Math.min(1, viewDir.dot(to))) > T.eye.angleDeg * D2R) return false;
    for (let s = 0.5; s < d - 0.5; s += 0.25) if (deps.solid(Math.floor(viewPos.x + to.x * s), Math.floor(viewPos.y + to.y * s), Math.floor(viewPos.z + to.z * s))) return false;
    return true;
  };
  let bigEl: HTMLDivElement | null = null;
  const showBig = (on: boolean) => {
    if (!bigEl) {
      bigEl = document.createElement('div');
      bigEl.style.cssText = 'position:fixed;left:0;right:0;top:40%;text-align:center;z-index:50;pointer-events:none;font:bold 56px/1.4 IPAGothic,sans-serif;color:#fff;text-shadow:0 0 10px #a040ff,0 0 4px #000,2px 2px 0 #000';
      bigEl.innerHTML = `${ruby('大', 'おお')}きな${ruby('姿', 'すがた')}にもどる`;
      document.body.appendChild(bigEl);
    }
    bigEl.style.display = on ? 'block' : 'none';
  };
  const nextWarp = () => { chooseWarp(); phase = 'vanish'; pt = 0; purpleBurst(10); lineBurst(); sfx.warpOut(); };
  /** 1 回の 出番が おわった とき。5 回分 おわったら 大きな 姿に もどる（試作） */
  const turnDone = (viaCancel: boolean) => {
    setShy(false);
    if (turn >= T.eye.turnsPerShow) { phase = dormant ? 'perchgo' : 'bigvanish'; pt = 0; purpleBurst(10); lineBurst(); sfx.warpOut(); return; }
    if (viaCancel) nextWarp(); else { phase = 'stand'; pt = 0; }
  };

  // ---- 少女の 流れ ----
  type Phase = 'dormant' | 'stand' | 'vanish' | 'gone' | 'appear' | 'cast' | 'shy' | 'bigvanish' | 'bigtext' | 'bigwait' | 'laugh' | 'orbit' | 'pose' | 'perchgo' | 'perch' | 'perchleave' | 'down' | 'crumble';
  let phase: Phase = dormant ? 'dormant' : 'stand', pt = 0, spell = 0;
  let side: 'left' | 'back' = 'back', dist = 4.5, ang = 0;
  let turn = 0, cancels = 0, eyeNow = false, soundCount = 0, lastSoundT = -1, bigCount = 0;
  let wave2Done = false;
  let orbSounds = 0, fbShots = 0, fired = false, mixerLeft = 0, castLen = clipDur(), forced = -1;
  let t = 0;
  const tele = new Vector3();
  const faceTo = (p: { x: number; z: number }) => { pivot.rotation.y = Math.atan2(p.x - pivot.position.x, p.z - pivot.position.z); };
  const fade = (k: number) => { // k: 0 = 見える、1 = 消えた（さいごは 細い 光の 線に なって きえる）
    mats.forEach((m) => (m.opacity = 1 - k * k));
    const w = Math.max(0.03, 1 - 0.97 * k);
    pivot.scale.set(w, 1 + 0.15 * k, w);
  };
  const purpleBurst = (n: number) => {
    const c = pivot.position;
    for (let i = 0; i < n; i++) add.emit(c.x + vr(-0.5, 0.5), c.y + vr(0, H), c.z + vr(-0.5, 0.5), vr(-2, 2), vr(-1, 3), vr(-2, 2), vr(0.4, 0.9), 0.2, 0.05, 0xf0d8ff, 0x6020c0, -1.5, 0.5);
  };
  const lineBurst = () => { const c = pivot.position; for (let i = 0; i < 12; i++) add.emit(c.x, c.y + (i / 11) * H, c.z, 0, vr(-0.5, 0.5), 0, 0.2, 0.35, 0.05, 0xffffff, 0xa060ff); };
  const chooseWarp = () => {
    spell = forced >= 0 ? forced : Math.floor(rng() * SPELLS); forced = -1;
    if (spell === 0) { side = rng() < T.warp.s1.leftChance ? 'left' : 'back'; dist = T.warp.s1.distMin + (T.warp.s1.distMax - T.warp.s1.distMin) * rng(); }
    else if (spell === 1) { side = 'back'; dist = T.warp.s2.distMin + (T.warp.s2.distMax - T.warp.s2.distMin) * rng(); } // すぐ うしろ（急いで 前へ はしらないと 当たる）
    else { ang = (rng() * 2 - 1) * T.warp.far.fanDeg * D2R; dist = T.warp.far.distMin + (T.warp.far.distMax - T.warp.far.distMin) * rng(); }
  };
  const teleport = () => {
    const p = deps.player(); const f = fwdOf(p);
    let dx: number, dz: number;
    if (spell >= 2) { dx = f.fx * Math.cos(ang) + f.rx * Math.sin(ang); dz = f.fz * Math.cos(ang) + f.rz * Math.sin(ang); }
    else if (side === 'left') { dx = -f.rx; dz = -f.rz; } else { dx = -f.fx; dz = -f.fz; }
    const x = p.x + dx * dist, z = p.z + dz * dist;
    tele.set(x, deps.groundY(Math.floor(x), Math.floor(z)) + 1, z);
    pivot.position.copy(tele); model.rotation.y = 0; // 決めポーズの ななめ向きを もどす
    faceTo(p);
  };
  const startCast = () => {
    phase = 'cast'; pt = 0; fired = false; wave2Done = false; fbShots = 0; orbSounds = 0; castLen = clipDur(); sfx.cast();
    action.reset(); action.timeScale = T.cast.speed; action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.fadeIn(0.15).play();
    mixerLeft = 1e9;
  };
  const endCast = () => {
    action.fadeOut(0.15);
    mixerLeft = 0.2;
    turnDone(false);
  };
  const handPos = (out: Vector3) => hand.getWorldPosition(out);
  const hp = new Vector3(), dirV = new Vector3();
  const fireWave = (shift: number) => { // 前方 180° の 扇に 16 発（2 波目は 少し ずらした 角度）
    const p = deps.player();
    handPos(hp); chestOf(p, chest);
    const base = Math.atan2(chest.x - hp.x, chest.z - hp.z); // +Z 基準の 向き
    const pit = Math.atan2(chest.y - hp.y, Math.hypot(chest.x - hp.x, chest.z - hp.z));
    for (let i = 0; i < T.s4.count; i++) {
      const a = base + ((i + shift) / (T.s4.count - 1) - 0.5) * (T.s4.fanDeg * D2R);
      dirV.set(Math.sin(a) * Math.cos(pit), Math.sin(pit), Math.cos(a) * Math.cos(pit));
      spawnProj(1, hp, dirV, T.s4.ampl, i * 1.3 + shift * 2);
    }
    sfx.s4Wave(T.s4.count); // 16 発でも 1 波で 4〜6 回に 間引く
    purpleBurstAt(hp, 0x80c0ff);
  };
  const fire = () => {
    const p = deps.player();
    if (spell === 0) fireEruptions();
    else if (spell === 1) fireVortices();
    else if (spell === 3) fireWave(0);
    void p;
  };
  const purpleBurstAt = (c: Vector3, col: number) => { for (let i = 0; i < 10; i++) add.emit(c.x, c.y, c.z, vr(-1.5, 1.5), vr(-1, 1.5), vr(-1.5, 1.5), 0.5, 0.18, 0.04, 0xffffff, col); };
  const orbPos = (i: number, out: Vector3) => { // 少女の まわりに うかぶ 火の玉（前がわの 半円を 2 だんに ならべる）
    const tier = i % 2, k = Math.floor(i / 2);
    const a = ((k + tier * 0.5) / (T.s3.count / 2 - 1) - 0.5) * 2 * 120 * D2R + pivot.rotation.y;
    const r = 1.5 + 0.3 * tier + 0.1 * Math.sin(t * 2 + i);
    return out.set(pivot.position.x + Math.sin(a) * r, pivot.position.y + H * (0.58 + 0.24 * tier) + 0.15 * Math.sin(t * 3 + i * 1.7), pivot.position.z + Math.cos(a) * r);
  };
  const shootFireball = (i: number) => {
    const p = deps.player(); orbPos(i, hp); chestOf(p, chest);
    const h = Math.atan2(chest.x - hp.x, chest.z - hp.z) + (i % 2 ? 1 : -1) * vr(0.1, 0.4);
    const pit = T.s3.pitchRad;
    dirV.set(Math.sin(h) * Math.cos(pit), Math.sin(pit), Math.cos(h) * Math.cos(pit));
    spawnProj(0, hp, dirV); sfx.s3Fire();
    add.emit(hp.x, hp.y, hp.z, 0, 0, 0, 0.2, 1.6, 0.3, 0xfff0c0, 0xff7010);
  };

  // ---- 立ち姿の ゆらゆら（ゾンビらしく 傾いて ふらつく。骨で つける。詠唱・赤面の 間は 使わない） ----
  const axF = new Vector3(), axR = new Vector3();
  const wob = (a: number, f1: number, f2: number, ph: number) => a * D2R * (0.6 * Math.sin(Math.PI * 2 * f1 * t + ph) + 0.4 * Math.sin(Math.PI * 2 * f2 * t + ph * 1.7 + 1));
  const bn = (n: string) => model.getObjectByName(n) as Bone | undefined;
  const idleNames = ['Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
  const idleBones = new Map<string, Bone>();
  idleNames.forEach((n) => { const b = bn(n); if (b) idleBones.set(n, b); });
  const feet = ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'].map((n) => bn(n)).filter((b): b is Bone => !!b);
  const feetLow = () => { let m = 1e9; for (const f of feet) m = Math.min(m, f.getWorldPosition(tmpV).y); return m - pivot.position.y; };
  let footBase = NaN;
  const axUp = new Vector3(0, 1, 0), axX = new Vector3(1, 0, 0);
  const idleSway = () => {
    restorePose(); model.position.y = y0; model.position.x = 0;
    pivot.updateMatrixWorld(true);
    if (Number.isNaN(footBase)) footBase = feetLow();
    const yaw = pivot.rotation.y;
    axF.set(Math.sin(yaw), 0, Math.cos(yaw)); axR.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const rot = (n: string, axis: Vector3, rad: number) => { const b = idleBones.get(n); if (b) rotateWorld(b, axis, rad); };
    const d = D2R;
    // かまえ（ねこ背・頭を 前へ・片足に 体重・ひざを まげて 内また・左右 ひだりみぎ ちがう うで）
    rot('Hips', axF, -5 * d + wob(3, 0.31, 0.47, 0.5)); // 腰が 片側へ 出る ＋ 重心が ふらっと
    rot('Spine', axR, 5 * d + wob(3, 0.37, 0.43, 2)); rot('Spine', axF, wob(7, 0.33, 0.49, 1));
    rot('Spine01', axR, 6 * d + wob(3, 0.35, 0.47, 4)); rot('Spine01', axF, wob(7, 0.41, 0.31, 3));
    rot('Spine02', axR, 6 * d + wob(3, 0.4, 0.33, 6)); rot('Spine02', axF, wob(6, 0.3, 0.45, 5));
    rot('neck', axR, 8 * d); rot('neck', axF, 15 * d + wob(2, 0.3, 0.5, 7)); // 首を かしげたまま、前へ
    rot('Head', axR, 10 * d + wob(3, 0.37, 0.5, 9)); rot('Head', axF, wob(6, 0.31, 0.43, 8));
    rot('RightArm', axR, wob(5, 0.4, 0.3, 10)); rot('RightForeArm', axUp, 14 * d); rot('RightForeArm', axR, wob(4, 0.45, 0.35, 11));
    rot('RightHand', axR, 35 * d + wob(14, 0.5, 0.37, 12)); // 手首を 下へ おって ぶらっと
    rot('LeftArm', axR, wob(9, 0.35, 0.48, 13)); rot('LeftForeArm', axR, 25 * d + wob(6, 0.42, 0.3, 14)); rot('LeftHand', axR, 15 * d);
    // 足: ひざを かるく まげて 内また、右足に 体重
    rot('LeftUpLeg', axR, -16 * d); rot('LeftLeg', axR, 30 * d); rot('LeftFoot', axR, -14 * d); rot('LeftUpLeg', axF, 7 * d);
    rot('RightUpLeg', axR, -10 * d); rot('RightLeg', axR, 18 * d); rot('RightFoot', axR, -8 * d); rot('RightUpLeg', axF, -7 * d);
    pivot.updateMatrixWorld(true);
    // 足の うらを 地面から うかせない（腰を さげる）
    model.position.y = y0 + (footBase - feetLow()) + 0.03 * (0.6 * Math.sin(t * 1.9) + 0.4 * Math.sin(t * 2.9 + 1));
  };

  // ---- 登場(笑い声 → ワープで 飛びまわる → 決めポーズ)と、かたに 座って 休む ----
  let intro: IntroSeq | null = null;
  let poseT = 0, perchT = 0, perchOn = false;
  const gw = new Vector3();
  const hipsBone = bn('Hips');
  const ensureFootBase = () => { if (Number.isNaN(footBase)) { restorePose(); model.position.y = y0; pivot.updateMatrixWorld(true); footBase = feetLow(); } };
  /** 足の うらを 地面に つける(ポーズを つけた あと) */
  const groundFeet = () => { model.position.y = y0; pivot.updateMatrixWorld(true); model.position.y = y0 + (footBase - feetLow()); pivot.updateMatrixWorld(true); };
  const groundAt = (x: number, z: number) => deps.groundY(Math.floor(x), Math.floor(z)) + 1;
  const poseBones = () => (POSES[T.intro.poseName] ?? POSES.c!).bones;
  const isFloat = () => T.intro.poseName === 'float' && Object.keys(floatPose).length > 0;
  /** float の 座りポーズで いちばん 下の つま先を 地面に つける 高さ(model.position.y)。はじめて 使う とき 1 回 はかる */
  let floatGroundY = NaN, floatLifted = false;
  const floatBob = new Quaternion();
  /** 決めポーズ float: 立ち姿 → しずむ → くるっと 上がって 座る → 座った まま ゆれる(T.intro.float) */
  const updateFloat = () => {
    const F = T.intro.float, inS = Math.max(0.01, F.inSec);
    if (Number.isNaN(floatGroundY)) { blendBetween(standBase, null, floatPose, 1); groundFeet(); floatGroundY = model.position.y; }
    const e = floatEntry(poseT / inS, F.dipSec / inS);
    blendBetween(standBase, null, floatPose, e.pose);
    const tuck = Math.sin(Math.PI * e.pose) * (poseT < inS ? 1 : 0); // 上がる とちゅうで 足を ちぢめる
    const bend = (n: string, deg: number) => { const b = idleBones.get(n); if (b && deg) b.quaternion.multiply(floatBob.setFromAxisAngle(axX, deg * D2R)); };
    const dk = F.dipDeg * e.dip; // しずむ(ひざを まげる。足の うらは 地面の まま)
    bend('LeftUpLeg', 0.55 * dk + 30 * tuck); bend('RightUpLeg', 0.55 * dk + 20 * tuck);
    bend('LeftLeg', -dk - 45 * tuck); bend('RightLeg', -dk - 25 * tuck);
    bend('Spine02', 0.3 * dk); // ためで 少し 前かがみ
    const loopT = Math.max(0, poseT - inS), w = (Math.PI * 2 * loopT) / Math.max(0.1, F.bobSec);
    const calm = poseT < inS ? 0 : Math.min(1, loopT / 0.6); // 座って から ゆれを 入れる
    bend('Spine01', -F.breathDeg * calm * Math.sin(w)); // 息(上がる とき 胸が ひらく)
    bend('Head', 0.6 * F.breathDeg * calm * Math.sin(w - 0.6));
    bend('LeftLeg', -F.swingDeg * calm * Math.sin(w + 0.9)); // のばした 足が ゆれる
    bend('LeftUpLeg', 0.4 * F.swingDeg * calm * Math.sin(w + 0.5));
    model.rotation.y = (F.spinDeg + F.yawDeg) * D2R * e.pose;
    pivot.updateMatrixWorld(true);
    const look = -F.headTurnDeg * D2R * Math.max(0, e.pose * 2 - 1); // 顔を プレイヤーの 方へ(座る まぎわから)
    const nk = idleBones.get('neck'), hd = idleBones.get('Head');
    if (nk && look) rotateWorld(nk, axUp, 0.4 * look);
    if (hd && look) rotateWorld(hd, axUp, 0.6 * look);
    if (!floatLifted && e.lift > 0) { floatLifted = true; purpleBurst(10); } // 浮き上がる 瞬間
    if (poseT < inS) {
      groundFeet();
      const ground = model.position.y;
      const sitY = floatGroundY + F.hoverGap;
      model.position.y = ground + (sitY - ground) * e.lift;
    } else model.position.y = floatGroundY + F.hoverGap + F.bobUp * Math.sin(w);
    pivot.updateMatrixWorld(true);
  };
  const warpTo = (x: number, z: number) => {
    if (pivot.visible) { purpleBurst(8); lineBurst(); }
    pivot.position.set(x, groundAt(x, z), z);
    pivot.visible = true; fade(0);
    faceTo(deps.player());
    purpleBurst(14); sfx.warpIn();
  };
  const onIntro = (e: IntroEvent) => {
    const p = deps.player(), I = T.intro;
    if (e.kind === 'laugh') { phase = 'laugh'; pt = 0; pivot.visible = false; sfx.laugh(); }
    else if (e.kind === 'warp') {
      phase = 'orbit'; pt = 0; ensureFootBase(); restorePose(); model.position.y = y0; model.rotation.y = 0;
      if (pivot.visible) sfx.warpOut();
      const s = introSpot(p, introAngleDeg(e.index, I.warps), I.radius);
      warpTo(s.x, s.z);
      groundFeet();
    } else if (e.kind === 'pose') {
      phase = 'pose'; pt = 0; poseT = 0; floatLifted = false; ensureFootBase();
      if (pivot.visible) sfx.warpOut();
      const s = introSpot(p, 0, I.poseDist);
      warpTo(s.x, s.z);
    } else { // done: 戦いへ(BGM「災厄」が 流れる)
      intro = null;
      bgm.uncut(); bgm.request('girl', true);
      chooseWarp(); phase = 'vanish'; pt = 0; purpleBurst(10); lineBurst(); sfx.warpOut();
    }
  };
  const perchBox: { name: string; c: number[]; ax: number[]; half: number[] } = { name: 'girl', c: [0, 0, 0], ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [1, 1, 1] };
  const sitNow: Record<string, [number, number, number]> = {};
  /** とどめの あと: 大きな 姿の かたに 座って いたか(かたの 動きに ついて いく) */
  let downPerched = false;
  const updatePerch = (dt: number) => {
    perchT += dt;
    const P = T.perch;
    const isDown = phase === 'down' || phase === 'crumble';
    if (isDown && downPerched) { const sp = opts.perchSpot?.() ?? null; if (sp) pivot.position.set(sp.x, sp.y, sp.z); }
    faceTo(deps.player());
    for (const k of Object.keys(SIT_DELTA)) { const v = SIT_DELTA[k]!; const q = sitNow[k] ?? (sitNow[k] = [0, 0, 0]); q[0] = v[0]; q[1] = v[1]; q[2] = v[2]; }
    const sw = isDown ? 0 : P.swayDeg * Math.sin((perchT / Math.max(0.1, P.swaySec)) * Math.PI * 2); // とどめの あとは 足も 動かさない
    sitNow.LeftLeg![0] = SIT_DELTA.LeftLeg![0] + sw; sitNow.RightLeg![0] = SIT_DELTA.RightLeg![0] - sw;
    applyDelta(bareBase, sitNow, clamp01(perchT / Math.max(0.01, isDown ? T.finish.sitBlendSec : P.blendSec)));
    pivot.updateMatrixWorld(true);
    // お尻を かたの 上に(足は ぶらさげる)
    if (hipsBone) { hipsBone.getWorldPosition(gw); model.position.y += (pivot.position.y + T.perch.hipUp - gw.y); pivot.updateMatrixWorld(true); }
    if (perchOn) {
      perchBox.c[0] = pivot.position.x; perchBox.c[1] = pivot.position.y + P.hitUp; perchBox.c[2] = pivot.position.z;
      perchBox.half[0] = P.hitHalf[0]; perchBox.half[1] = P.hitHalf[1]; perchBox.half[2] = P.hitHalf[2];
    }
  };
  const perchBegin = () => {
    const sp = opts.perchSpot?.() ?? null;
    if (sp) pivot.position.set(sp.x, sp.y, sp.z); else pivot.position.y = pivot.position.y; // 場所が なければ その 場に 座る
    pivot.visible = true; perchT = 0; perchOn = true; pt = 0;
    // 座った 直後に 飛んで いた 弾・噴火・うずが 当たらない ように、downBegin と 同じく 消す(休んで いる 少女は 傷つけない)
    clearMagic();
    reflectWait = 0;
    restorePose(); model.position.y = y0; model.position.x = 0;
    purpleBurst(24); lineBurst(); sfx.warpIn(); fade(1);
    // 休んでいる 間も「災厄」は 流したまま(ふだんの 曲に もどさない。オーナー 2026-10-24 20:17)。とどめ・片づけで 止まる
    bgm.request('girl', true);
    phase = 'perch';
    updatePerch(0);
    opts.setHitBox?.(perchBox);
  };
  const perchEnd = () => {
    perchOn = false; opts.setHitBox?.(null);
    restorePose(); model.position.y = y0; model.position.x = 0;
    turn = 0; cancels = 0; chooseWarp(); phase = 'perchleave'; pt = 0; purpleBurst(10); lineBurst(); sfx.warpOut();
  };

  /** とどめ: 魔法・弾・輪・赤面・文字を ぜんぶ 消して、その場に 座りこむ(無敵。当たりの 箱も はずす) */
  const downBegin = () => {
    if (phase === 'dormant' || phase === 'down' || phase === 'crumble') return;
    const wasPerch = phase === 'perch' || phase === 'perchgo' || phase === 'perchleave';
    action.stop(); mixer.stopAllAction(); mixerLeft = 0; model.rotation.x = 0; model.rotation.y = 0; flinchT = 0;
    setShy(false); showBig(false);
    intro = null; perchOn = false; opts.setHitBox?.(null);
    clearMagic();
    forced = -1; reflectWait = 0; holdStand = false;
    bgm.uncut(); bgm.request('girl', false);
    sfxPlayer.stopAll?.();
    restorePose(); model.position.y = y0; model.position.x = 0;
    const p = deps.player();
    const sp = wasPerch ? opts.perchSpot?.() ?? null : null;
    downPerched = !!sp;
    if (sp) pivot.position.set(sp.x, sp.y, sp.z);
    else if (!pivot.visible) { const s = introSpot(p, 0, T.intro.poseDist); pivot.position.set(s.x, groundAt(s.x, s.z), s.z); } // まだ 姿を 見せて いなければ プレイヤーの 前に 座る
    else pivot.position.y = groundAt(pivot.position.x, pivot.position.z);
    pivot.visible = true; fade(0);
    purpleBurst(12);
    phase = 'down'; pt = 0; perchT = 0;
    updatePerch(0);
  };
  /** コアが こわれた: 座った まま 透けて、粉に なって 消えて いく */
  const crumbleBegin = () => {
    if (phase !== 'down') return;
    phase = 'crumble'; pt = 0;
  };
  let crumbleAcc = 0;
  const updateCrumble = (dt: number) => {
    const F = T.finish, k = clamp01(pt / Math.max(0.01, F.fadeSec));
    mats.forEach((m) => (m.opacity = 1 - k * k));
    crumbleAcc += F.crumbleSparksPerSec * dt;
    const c = pivot.position;
    while (crumbleAcc >= 1 && k < 1) {
      crumbleAcc -= 1;
      add.emit(c.x + vr(-0.5, 0.5), c.y + vr(0, H * 0.7), c.z + vr(-0.5, 0.5), vr(-0.6, 0.6), -F.crumbleFall * vr(0.5, 1), vr(-0.6, 0.6), vr(0.6, 1.2), 0.16, 0.04, F.crumbleColors[0], F.crumbleColors[1]);
    }
    if (k >= 1) pivot.visible = false;
  };

  // ---- 毎ステップ ----
  let camMode: 'overview' | 'default' | 'look' | 'close' | 'idle' | 'idleSide' | 'pose' | 'poseSide' = 'default';
  let holdStand = false;
  const camTarget = { pos: new Vector3(), look: new Vector3(), init: false };
  
  deps.onUpdate((dt) => {
    bgmStep();
    if (phase === 'dormant') return; // ねかせて いる 間は 何も しない
    t += dt; pt += dt;
    const frozen = flinchT > 0;
    if (frozen) { flinchT -= dt; pt -= dt; const u = 1 - Math.max(0, flinchT) / flinchTotal; model.rotation.x = -T.parry.flinchTiltRad * Math.sin(Math.PI * u); if (flinchT <= 0) model.rotation.x = 0; } // 短く 止まって 小さく のけぞる
    const p = deps.player();
    if (phase === 'stand') {
      faceTo(p); idleSway();
      if (holdStand) pt = 0;
      // はね返した 弾が 飛んでいる 間は 次の ワープに 入らず 待つ（上限 parry.reflectWaitMaxSec）
      if (pt >= T.timing.standSec && projs.some((q) => q.on && q.reflected) && reflectWait < T.parry.reflectWaitMaxSec) { reflectWait += dt; pt = T.timing.standSec - dt; }
      if (pt >= T.timing.standSec) { reflectWait = 0; nextWarp(); }
    } else if (phase === 'vanish') {
      fade(clamp01(pt / T.timing.vanishSec));
      if (pt >= T.timing.vanishSec) { phase = 'gone'; pt = 0; fade(1); pivot.visible = false; }
    } else if (phase === 'gone') { // 何も いない 時間（「どこいった？」）
      if (pt >= T.timing.goneSec) { teleport(); pivot.visible = true; bgm.request('girl', true); phase = 'appear'; pt = 0; turn++; fade(1); purpleBurst(24); sfx.warpIn(); }
    } else if (phase === 'appear') {
      faceTo(p); idleSway(); fade(1 - clamp01(pt / T.timing.appearSec));
      if (pt >= T.timing.appearSec) { fade(0); startCast(); }
    } else if (phase === 'shy') {
      faceTo(p);
      if (pt >= T.eye.holdSec) turnDone(true); // はずかしくて その場で とまる
    } else if (phase === 'bigvanish') {
      fade(clamp01(pt / T.timing.vanishSec));
      if (pt >= T.timing.vanishSec) { pivot.visible = false; phase = 'bigtext'; pt = 0; showBig(true); }
    } else if (phase === 'bigtext') {
      if (pt >= T.eye.bigTextSec) { showBig(false); phase = 'bigwait'; pt = 0; }
    } else if (phase === 'bigwait') {
      if (pt >= T.eye.bigWaitSec) { turn = 0; cancels = 0; bigCount++; chooseWarp(); phase = 'gone'; pt = T.timing.goneSec; }
    } else if (phase === 'laugh' || phase === 'orbit' || phase === 'pose') {
      if (intro) for (const e of intro.update(dt)) onIntro(e);
      if (phase === 'orbit' || phase === 'pose') faceTo(p);
      if (phase === 'pose') {
        poseT += dt;
        if (isFloat()) updateFloat();
        else {
          blendPose(standBase, poseBones(), clamp01(poseT / Math.max(0.01, T.intro.poseBlendSec)));
          groundFeet();
        }
      }
    } else if (phase === 'perchgo') {
      fade(clamp01(pt / T.timing.vanishSec));
      if (pt >= T.timing.vanishSec) { pivot.visible = false; perchBegin(); }
    } else if (phase === 'perch') {
      updatePerch(dt);
      fade(1 - clamp01(pt / T.timing.appearSec));
      if (pt >= T.eye.bigWaitSec) perchEnd();
    } else if (phase === 'down') {
      updatePerch(dt);
    } else if (phase === 'crumble') {
      updatePerch(dt); updateCrumble(dt);
    } else if (phase === 'perchleave') {
      fade(clamp01(pt / T.timing.vanishSec));
      if (pt >= T.timing.vanishSec) { phase = 'gone'; pt = T.timing.goneSec; fade(1); pivot.visible = false; }
    } else {
      faceTo(p);
      if (spell === 2) castLen = Math.max(clipDur(), T.cast.fireAt * clipDur() + T.s3.count * T.s3.shotGap + 0.4);
      if (spell === 3) castLen = Math.max(clipDur(), T.cast.fireAt * clipDur() + T.s4.secondWaveSec + 0.4);
      if (!fired && pt >= T.cast.fireAt * clipDur()) { fired = true; fire(); }
      if (spell === 3 && fired && !wave2Done && pt >= T.cast.fireAt * clipDur() + T.s4.secondWaveSec) { wave2Done = true; fireWave(T.s4.secondShift); }
      if (spell === 2 && fired) {
        const due = Math.floor((pt - T.cast.fireAt * clipDur()) / T.s3.shotGap + 1e-6) + 1;
        while (fbShots < Math.min(T.s3.count, due)) shootFireball(fbShots++);
      }
      if (spell === 2) { // 火の玉が 0.1 秒おきに ぽっと 出て ふわふわ うかぶ
        const shown = Math.min(T.s3.count, Math.floor((pt - T.s3.orbStartSec) / T.s3.orbGap) + 1);
        while (orbSounds < shown) { orbSounds++; sfx.s3Spawn(); } // 火の玉が 1 つ 出るたびに「ぽっ」
        for (let i = fbShots; i < shown; i++) {
          orbPos(i, hp);
          if (pt - T.s3.orbStartSec - i * T.s3.orbGap < dt * 1.5) add.emit(hp.x, hp.y, hp.z, 0, 0, 0, 0.2, 1.6, 0.3, 0xfff0c0, 0xff7010);
          add.emit(hp.x, hp.y, hp.z, 0, 0, 0, dt * 2, 0.55, 0.55, 0xfff6c8, 0xffe080);
          add.emit(hp.x, hp.y, hp.z, 0, 0, 0, dt * 2, 1.2, 1.2, 0xff8a20, 0xff6010);
        }
      }
      handPos(hp);
      for (let k = 0; k < 2; k++) add.emit(hp.x + vr(-0.2, 0.2), hp.y + vr(-0.2, 0.2), hp.z + vr(-0.2, 0.2), vr(-0.3, 0.3), vr(0.2, 0.9), vr(-0.3, 0.3), 0.5, 0.14, 0.03, 0xf0d8ff, 0x7030d0);
      if (pt >= castLen) endCast();
    }
    if (mixerLeft > 0 && !frozen) {
      mixer.update(dt); pivot.updateMatrixWorld(true);
      mixerLeft -= dt;
      if (mixerLeft <= 0) { action.stop(); mixer.stopAllAction(); restorePose(); }
    }
    pivot.updateMatrixWorld(true);
    // 目が 合った？（出てから 0.5 秒いない。止められるのは 2 回まで）
    eyeNow = checkEye();
    if (eyeNow && cancels < T.eye.maxCancels && ((phase === 'appear' && pt < T.eye.windowSec) || (phase === 'cast' && pt < T.eye.windowSec - T.timing.appearSec))) {
      cancels++;
      if (phase === 'cast') { action.fadeOut(0.1); mixerLeft = 0.2; }
      phase = 'shy'; pt = 0; fade(0); if (mixerLeft <= 0) { restorePose(); model.position.set(model.position.x, y0, model.position.z); } shy.begin(); beep();
    }
    updateShy(dt);
    // 詠唱が はじまったら 足もとに うすい 予告の 輪（どこまで にげれば いいか）
    const warn = phase === 'cast' && spell === 1 && !fired;
    showVortexWarn(warn); warnMat.opacity = 0.3 + 0.1 * Math.sin(t * 8);
    erups.forEach((e) => e.update(dt)); vortices.forEach((v) => v.update(dt)); updateProjs(dt);
    // 魔法 1: 輪の 中に いる あいだ ずっと（むてき時間ごと）
    if (t >= nextSetHit) {
      let src: { x: number; y: number; z: number } | null = null, isRing = false;
      for (const e of erups) if (e.hitActive() && Math.hypot(p.x - e.e.x, p.z - e.e.z) < e.e.rad && Math.abs(p.y - e.e.y) < 3) { src = { x: e.e.x, y: p.y, z: e.e.z }; isRing = true; break; }
      if (!src) for (const v of vortices) if (v.hits(p.x, p.z)) { src = { x: v.v.x, y: p.y, z: v.v.z }; break; }
      if (src) {
        const r = setHit(src);
        if (r === 'hit') { if (isRing) stats.ringHits++; else stats.vortexHits++; }
        if (r !== 'retry') nextSetHit = t + T.parry.setCooldownSec;
      }
    }
    // 魔法 2: 渦の 中に いる あいだ ずっと（むてき時間ごと）。渦と 渦の すき間は 安全
    add.update(dt); smoke.update(dt);
    // 俯瞰カメラの 目標（ふたりの まんなかを 見る）
    const gp = pivot.position, f = fwdOf(p);
    const wMid = Math.hypot(p.x - gp.x, p.z - gp.z) > 8 ? 0.46 : 0.5; // 遠い ときは プレイヤー寄り（扇が ひろがって くるのが 見える）
    let mx = p.x + (gp.x - p.x) * wMid, mz = p.z + (gp.z - p.z) * wMid;
    const my = p.y + 1;
    if (spell === 0) { const f0 = fwdOf(p); mx = p.x + f0.fx * 2.5; mz = p.z + f0.fz * 2.5; } // 魔法 1: 輪が 出る 足もと〜前を まんなかに
    const sep = Math.hypot(p.x - gp.x, p.z - gp.z), ex = spell === 1 ? 12 : spell === 0 ? 7 : Math.max(0, sep - 5) * (spell === 3 ? 1.7 : 1); // 180° の 扇は ひろいので 引く
    const tp = new Vector3(mx + f.rx * (3.6 + 0.3 * ex) + f.fx * (2 + 0.2 * ex), my + 4.5 + 0.4 * ex, mz + f.rz * (3.6 + 0.3 * ex) + f.fz * (2 + 0.2 * ex));
    const tl = new Vector3(mx, my, mz);
    if (!camTarget.init) { camTarget.pos.copy(tp); camTarget.look.copy(tl); camTarget.init = true; }
    else { camTarget.pos.lerp(tp, 0.15); camTarget.look.lerp(tl, 0.15); }
  });
  const upOff = new Vector3();
  const baseFov = (deps.camera as PerspectiveCamera).fov ?? 70;
  deps.onBeforeRender(() => {
    if (phase === 'dormant') return;
    const cam = deps.camera as PerspectiveCamera;
    const px = (window.innerHeight * Math.min(window.devicePixelRatio, 2)) / (2 * Math.tan((cam.fov * D2R) / 2));
    add.mat.uniforms.uPx!.value = px; smoke.mat.uniforms.uPx!.value = px;
    const wantFov = baseFov;
    if (camMode === 'idleSide') { const q = pivot.rotation.y; cam.position.set(pivot.position.x + Math.cos(q) * 4.6, pivot.position.y + 1.7, pivot.position.z - Math.sin(q) * 4.6); cam.lookAt(pivot.position.x, pivot.position.y + 1.5, pivot.position.z); cam.updateMatrixWorld(true); }
    if (camMode === 'idle') { const q = pivot.rotation.y; cam.position.set(pivot.position.x + Math.sin(q) * 3.8 + Math.cos(q) * 1.0, pivot.position.y + 1.9, pivot.position.z + Math.cos(q) * 3.8 - Math.sin(q) * 1.0); cam.lookAt(pivot.position.x, pivot.position.y + 1.5, pivot.position.z); cam.updateMatrixWorld(true); }
    // 決めポーズを 撮る(GIF 用): pose = プレイヤーの 目の 高さから、poseSide = 少女の 右の 真横から 腰の 高さで(見本と おなじ 向き)
    if (camMode === 'pose') { const p = deps.player(); cam.position.set(p.x, p.y + 1.6, p.z); cam.lookAt(pivot.position.x, pivot.position.y + 2.1, pivot.position.z); cam.updateMatrixWorld(true); }
    if (camMode === 'poseSide') { const q = pivot.rotation.y + model.rotation.y; const hy = hipsBone ? hipsBone.getWorldPosition(gw).y + 0.3 : pivot.position.y + 2; cam.position.set(pivot.position.x - Math.cos(q) * 4.6, hy, pivot.position.z + Math.sin(q) * 4.6); cam.lookAt(pivot.position.x, hy, pivot.position.z); cam.updateMatrixWorld(true); }
    if (camMode !== 'default' && cam.fov !== wantFov) { cam.fov = wantFov; cam.updateProjectionMatrix(); } // ふだんの 画角は ゲームに まかせる
    if ((camMode === 'look' || camMode === 'close') && pivot.visible) { const p = deps.player(); headCenter(headC);
      cam.position.set(p.x, p.y + 1.6, p.z);
      if (camMode === 'close') { upOff.copy(cam.position).sub(headC); upOff.y = 0; cam.position.copy(headC).addScaledVector(upOff.normalize(), 1.7); cam.position.y = headC.y + 0.1; } // 顔の すぐ 前まで 近づく
      cam.lookAt(headC.x, headC.y + (camMode === 'close' ? 0.15 : 0), headC.z); cam.updateMatrixWorld(true); }
    if (camMode === 'overview') { cam.position.copy(camTarget.pos); cam.lookAt(camTarget.look); cam.updateMatrixWorld(true); }
  });

  // ---- BGM「災厄」（少女が 出ている 間 ループ。大きな 姿の「神々の 戯れ」と 共通の 係 gashaBgm.ts が 流す。ファイルが なければ 音なし） ----
  const bgm = sharedGashaBgm({ bgmOut: deps.bgmOut, suppressBgm: deps.suppressBgm });
  bgm.preload('saiyaku'); // 少女が 出る 瞬間に 曲が とぎれない ように 先に 読みこむ（FIX-BRIEF-2 §3-4）
  const bgmStep = () => bgm.step();

  // ---- 外から 使う（テスト・スクショ） ----
  const place = (opts?: { groundY?: number; shift?: number; side?: boolean }) => {
    const p = deps.player(); const f = fwdOf(p);
    const sd = opts?.shift ?? 0;
    const x = p.x + f.fx * 5 + f.rx * sd, z = p.z + f.fz * 5 + f.rz * sd;
    pivot.position.set(x, (opts?.groundY ?? deps.groundY(Math.floor(x), Math.floor(z))) + 1, z);
    pivot.rotation.y = opts?.side ? Math.atan2(f.rx, f.rz) : Math.atan2(p.x - x, p.z - z);
  };
  void GAP;
  place();
  /** ねかせる とき・止める とき: 少女・魔法・弾・文字・BGM の 頼みを ぜんぶ 消す */
  const sleep = (): void => {
    action.stop(); mixer.stopAllAction(); mixerLeft = 0; restorePose(); model.rotation.x = 0; model.rotation.y = 0; flinchT = 0;
    fade(0);
    pivot.visible = false;
    setShy(false); showBig(false);
    intro = null; perchOn = false; opts.setHitBox?.(null); bgm.uncut();
    clearMagic();
    add.clear(); smoke.clear();
    add.points.visible = smoke.points.visible = false;
    forced = -1; reflectWait = 0; holdStand = false; downPerched = false; crumbleAcc = 0;
    bgm.request('girl', false);
    sfxPlayer.stopAll?.(); // 遅れて 鳴らす 予約の 効果音(間欠泉の 噴出など)も 止める
  };
  if (dormant) sleep();
  const warn0 = () => phase === 'cast' && spell === 1 && !fired;
  const handle: GashaGirlHandle = {
    tune: (o) => applyTune(o),
    forceParry: (r) => { parryForce = r; },
    place, figures: [pivot],
    labels: (riky, w, h) => {
      const pts = [new Vector3(pivot.position.x, pivot.position.y + H + 0.3, pivot.position.z), new Vector3(riky.x, riky.y + 2.1, riky.z)];
      return pts.map((v) => { v.project(deps.camera); return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h }; });
    },
    phase: () => phase,
    setSeed: (n) => { rs = n >>> 0; vs = (Math.imul(n, 7919) + 13) >>> 0; },
    warpNow: (s) => { if (s !== undefined) forced = (s - 1 + SPELLS) % SPELLS; if (phase === 'stand') pt = 2.0; },
    camera: (m) => { camMode = m; camTarget.init = false; },
    resetTurns: () => { turn = 0; cancels = 0; bigCount = 0; setShy(false); showBig(false); },
    holdStand: (on) => { holdStand = on; },
    standNow: () => { if (phase === 'stand') pt = 0; },
    nextSpell: (n) => { forced = (n - 1 + SPELLS) % SPELLS; },
    predictSide: () => (mulberry(rs)[1] < 0.5 ? 'left' : 'back'),
    info: () => ({
      bgmFile: bgm.info('saiyaku').file, bgmStarted: bgm.info('saiyaku').started, bgmDur: bgm.info('saiyaku').duration, bgmLoop: bgm.info('saiyaku').loop,
      bgmLoops: bgm.info('saiyaku').loops, bgmFade: bgm.info('saiyaku').fade, bgmCtx: bgm.info('saiyaku').ctx, bgmPlaying: bgm.status().playing ?? 'none', bgmGirlLock: bgm.status().girlLock,
      turn, cancels, eyeContact: eyeNow, soundCount, lastSoundT, bigCount, shy: shy.active(), warnRing: warn0(), camMode, camFov: (deps.camera as PerspectiveCamera).fov, parried: st2.parried, parryEarly: st2.parryEarly, reflected: st2.reflected, reflectHits: st2.reflectHits, flinch: flinchT > 0, hitActive: erups.some((e) => e.hitActive()), eruptionR: Math.max(...erups.map((e) => (e.e.t >= 0 ? e.e.rad : 0))), eruptionMaxR: T.s1.radius, playerHp: deps.hp(), playerMaxHp: deps.maxHp(), phase, spell: spell + 1, forced, castT: pt, side, dist, eruptionT: Math.max(...erups.map((e) => e.e.t)), vortexT: Math.max(...vortices.map((v) => v.v.t)), vortexCount: vortices.filter((v) => v.v.t >= 0).length,
      fireballs: projs.filter((q) => q.on && q.kind === 0).length, waves: projs.filter((q) => q.on && q.kind === 1).length,
      ...(stats as unknown as Record<string, number>), girlX: pivot.position.x, girlZ: pivot.position.z, footGap: pivot.visible ? feetLow() : 0, poseName: T.intro.poseName,
    }),
  };
  (window as unknown as { __gashaGirl: GashaGirlHandle }).__gashaGirl = handle;
  const controller: GirlController = {
    summon: () => {
      if (!dormant || phase !== 'dormant') return;
      add.points.visible = smoke.points.visible = true;
      turn = 0; cancels = 0; reflectWait = 0;
      chooseWarp();
      intro = new IntroSeq({ ...T.intro, poseSec: introPoseSec(T.intro) });
      phase = 'laugh'; pt = 0; pivot.visible = false;
      for (const e of intro.start()) onIntro(e); // 笑い声(少女は まだ 見えない)→ ワープで 飛びまわる → 決めポーズ → 戦い
    },
    dismiss: () => {
      if (!dormant || phase === 'dormant') return;
      phase = 'dormant';
      sleep();
    },
    finish: () => { if (dormant) downBegin(); },
    crumble: () => { if (dormant) crumbleBegin(); },
    active: () => phase !== 'dormant',
    stage: () => (phase === 'dormant' ? 'off' : phase === 'down' || phase === 'crumble' ? phase : phase === 'laugh' || phase === 'orbit' || phase === 'pose' ? phase : phase === 'perchgo' || phase === 'perch' || phase === 'perchleave' ? 'perch' : 'girl'),
    handle,
  };
  return controller;
}
