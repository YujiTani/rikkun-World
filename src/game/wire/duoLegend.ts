// COOP-1 4d-2（docs/design/COOP-1.md 1.13 §3.6 (b)）: 2P の レジェンダリーの わざの つなぎ（2P が 参加している あいだ だけ。参加ごとに 1 つ作り、やめる ときに 片づける）。
// ゲームの しくみは src/duo/p2Legend.ts（1P と 同じ createLegendSystem・createWaveSystem の 2 つ目）。ここは 2P の 道具・カメラ・音・絵に つなぐ だけ。
// 絵は 1P と 同じ 部品を 2P の カメラで もう 1 つ ずつ 作る（板は 2P の カメラを 向く）。雷の 板は 区画に 重ねる（renderInPane）。
import type * as THREE from 'three';
import type { BladeEvent, BladeSystem, BladeTech, ItemId, VoxelWorld, W2Settings, YokaiInfo, YokaiWorld } from '../../contracts';
import { boxOf } from '../../combat/attackFacing';
import { WindWaveFx } from '../../fx/windWaveFx';
import { SpiralFx } from '../../fx/spiralFx';
import { NijiFx } from '../../fx/nijiFx';
import { ChargeLightFx } from '../../fx/chargeLightFx';
import { playLegend, startLegendLoop, startLegendOneShot } from '../../fx/legendSounds';
import type { ThunderHook } from '../../fx/thunderFx';
import type { ImpactLevel } from '../../fx/impact';
import type { SoundFx } from '../../fx/sound';
import { chargeOf, trailStyleOf } from '../../legend/defs';
import { createChargeLight } from '../../legend/chargeLight';
import { createDomeGrains } from '../../legend/domeGrains';
import { CHEST_UP, computeHand, newHandInfo } from '../../legend/handPos';
import { createSpiralDebris } from '../../legend/spiralDebris';
import { createWaveView3D } from '../../legend/waveView';
import type { LegendEvent } from '../../legend/LegendSystem';
import type { WaveView } from '../../legend/WaveSystem';
import type { FlashSrc } from '../../duo/flash';
import { createP2Legend, type P2Legend } from '../../duo/p2Legend';
import { DUO_TUNING } from '../../duo/tuning';
import type { P2State } from '../../duo/p2State';
import type { PlayerController } from '../../player/PlayerController';
import { createLegendFx, type LegendFx } from './legendFx';
import { IDLE_THUNDER_LOOK } from './shared';

/** 2P の わざが 読む もの（wireDuoPlay が 渡す） */
export interface DuoLegendCtx {
  world: VoxelWorld;
  /** 素の 妖怪の 世界（中で who=2 を つける） */
  yokai: () => YokaiWorld;
  w2: W2Settings;
  seed: number;
  tick: () => number;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  /** 2P の 区画の カメラ（板が 向く 先・真空波の 絵の 向き） */
  camera: THREE.PerspectiveCamera;
  p2: P2State;
  ctl: PlayerController;
  /** 2P の 刀（今の ようす） */
  blade: Pick<BladeSystem, 'state'>;
  sound: Pick<SoundFx, 'playTones'>;
  camFx: { setDistance(d: number | null): void };
  impact: { hit(level: ImpactLevel): void };
  reducedMotion: () => boolean;
  /** 妖怪の 一覧（虹の 斬撃が 当たった 妖怪の 胸の 高さ） */
  yokaiList: () => readonly YokaiInfo[];
}

export interface DuoLegend {
  /** 2P の わざの しくみ（P2Legend） */
  readonly p2: P2Legend;
  /** 毎ステップ 1 回（2P の dig.update の あと。パリィの よせの あと）: 波・出来事・手ごたえ・カメラの 口 */
  step(): void;
  /** 毎ステップ 1 回（2P の カメラを 決めた あと）: 雷・波・らせん・ドーム・ための 光・虹の 斬撃の 絵 */
  stepFx(): void;
  /** 2P の 刀の 出来事: 虹の 刀の ふつうの 斬撃を 2P 用の 絵へ（1P の 絵には 入れない） */
  slash(events: readonly BladeEvent[]): void;
  /** うすい 光の もと（その人の 雷・虹の 絵が 出ているか。毎回 同じ 入れもの） */
  flashSrc(): FlashSrc;
  /** 区画の 世界の 描画の すぐ あとに 雷の 板を 重ねる（2P の 分） */
  renderInPane(r: THREE.WebGLRenderer, cam: THREE.Camera): void;
  /** 試験の 口 `duo.thunder(2)` */
  thunderHook(): ThunderHook;
  dispose(): void;
}

export function createDuoLegend(c: DuoLegendCtx): DuoLegend {
  const { w2, ctl, p2 } = c;
  const waveView = createWaveView3D(c.camera);
  const held = (): ItemId | null => p2.inventory.held()?.item ?? null;
  const bladeNow = { item: null as ItemId | null, tech: null as BladeTech | null, phase: 'idle', frame: 0, startup: 0, dirDeg: 0 };

  const p2legend = createP2Legend({
    world: c.world,
    yokai: c.yokai,
    settings: w2,
    tick: c.tick,
    armor: p2.armor,
    wear: (n) => {
      p2.inventory.wearHeld(n);
    },
    camFx: c.camFx,
    impact: c.impact,
    baseDistance: () => DUO_TUNING.cameraSplit,
    position: () => ctl.state.position,
    view: () => waveView.view(),
    sound: (n) => playLegend(c.sound, n),
    waveSound: (v) => playLegend(c.sound, 'windWave', v),
    // ため音は 続く 音。剣ごとの 味（風神 / 雷神）は ためわざの しゅるいで えらぶ（1P の combat.ts と 同じ 決め）
    loop: (name) => {
      if (name === 'domePull') return startLegendLoop(c.sound, name);
      const kind = chargeOf(w2, held())?.kind;
      return startLegendLoop(c.sound, name, kind === 'spiral' ? 'fujin' : kind === 'shining' ? undefined : 'raijin');
    },
    spiralSound: () => startLegendOneShot(c.sound, 'spiralWind'),
    reducedMotion: c.reducedMotion,
    seed: c.seed ^ 0x2b2b,
  });

  // ---- 絵（2P の カメラで 作る）。雷・虹の 斬撃は 1P と 同じ 作り方の 関数（createLegendFx）----
  const lfx: LegendFx = createLegendFx({ scene: c.scene, camera: c.camera, seed: c.seed ^ 0x2b2b, w2, paneOnly: true });
  const { thunderFx, rainbowFx } = lfx;
  thunderFx.warmUp(c.renderer, c.camera);
  const windWaveFx = new WindWaveFx({ scene: c.scene, camera: c.camera });
  const spiralFx = new SpiralFx({ scene: c.scene, camera: c.camera });
  const spiralDebris = createSpiralDebris({ world: c.world, seed: c.seed ^ 0x2b2b });
  const nijiFx = new NijiFx(c.scene, c.camera);
  const domeGrains = createDomeGrains();
  const chargeLight = createChargeLight();
  const chargeLightFx = new ChargeLightFx({ scene: c.scene, camera: c.camera });
  const handInfo = newHandInfo();
  const chest = { x: 0, y: 0, z: 0 };
  const center = { x: 0, y: 0, z: 0 };
  const look = { charging: false, ready: false, aimS: null as { x: number; y: number; z: number } | null };
  const debrisIn = { id: 0, age: 0, position: center, dir: center };
  const flashSrc: FlashSrc = { thunder: false, rainbow: false };
  let events: readonly LegendEvent[] = [];
  let hook: ThunderHook | null = null;

  return {
    p2: p2legend,
    step() {
      const bs = c.blade.state();
      bladeNow.item = bs.item;
      bladeNow.tech = bs.tech;
      bladeNow.phase = bs.phase;
      bladeNow.frame = bs.frame;
      bladeNow.startup = bs.lengths?.startup ?? 0;
      bladeNow.dirDeg = bs.move?.dirDeg ?? ctl.state.yawDeg;
      events = p2legend.step(bladeNow);
    },
    stepFx() {
      const reduced = c.reducedMotion();
      const lg = p2legend.legend;
      for (const e of events) {
        thunderFx.onEvent(e);
        windWaveFx.onEvent(e);
        spiralFx.onEvent(e);
      }
      events = [];
      const waves = p2legend.waves.list();
      windWaveFx.step(waves, reduced);
      let sp: WaveView | undefined;
      for (let i = 0; i < waves.length; i++) {
        if (waves[i]!.kind === 'spiral') {
          sp = waves[i];
          break;
        }
      }
      if (sp) {
        debrisIn.id = sp.id;
        debrisIn.age = sp.age;
        debrisIn.position = sp.position;
        debrisIn.dir = sp.dir;
      }
      spiralDebris.step(sp ? debrisIn : null, reduced);
      spiralFx.step(sp, spiralDebris);
      const lv = lg.chargeable(held()) ? lg.view() : null;
      const st = lv && lv.ready ? lg.state() : null;
      if (lv && lv.kind !== 'shining') {
        look.charging = lv.charging;
        look.ready = lv.ready;
        look.aimS = st && st.aim && st.aim.skyVisible ? st.aim.S : null;
        thunderFx.step(look, reduced);
      } else thunderFx.step(IDLE_THUNDER_LOOK, reduced);
      // ため中の 手もとの 光（2P の カメラで 見る 三人称）
      const cp = ctl.state.position;
      const cl = chargeLight.step({ ticks: lv ? lv.chargeTicks : null, kind: lv ? lv.kind : null, reduced, full: chargeOf(w2, held())?.chargeTicks, cut: lg.state().move === 'shining' });
      if (cl.phase !== 'off') {
        c.camera.updateMatrixWorld();
        computeHand({ first: false, pos: cp, yawDeg: ctl.state.yawDeg, camera: c.camera }, handInfo);
        chest.x = cp.x;
        chest.y = cp.y + CHEST_UP;
        chest.z = cp.z;
        chargeLightFx.step(cl, handInfo, chest);
      } else chargeLightFx.step(cl, handInfo, null);
      // 虹の ドーム
      const dv = lg.view();
      const mv = lg.state();
      center.x = cp.x;
      center.y = cp.y + 0.9;
      center.z = cp.z;
      domeGrains.step({ F: mv.move === 'shining' ? mv.moveF : 0, center, radius: dv.dome, pulled: lg.pullers(), reduced });
      nijiFx.step(dv.dome > 0 ? { radius: dv.dome, center, groundY: dv.groundY, F: mv.moveF } : null, domeGrains, reduced, false);
      rainbowFx.step(reduced);
      flashSrc.thunder = thunderFx.active();
      flashSrc.rainbow = rainbowFx.active();
    },
    slash(evs) {
      const item = held();
      if (trailStyleOf(w2, item) !== 'rainbow') return;
      for (const e of evs) {
        if (e.type === 'techStart') {
          const bs = c.blade.state();
          rainbowFx.queue({ tech: e.tech, step: e.step ?? 1, uDeg: bs.move?.dirDeg ?? ctl.state.yawDeg, pos: () => ctl.state.position });
        } else if (e.type === 'techHit') {
          const y = c.yokaiList().find((q) => q.id === e.yokaiId);
          const chestH = y ? boxOf(y).h * 0.6 : 0.8;
          rainbowFx.hit({ x: e.position.x, y: e.position.y + chestH, z: e.position.z });
        } else if (e.type === 'cancel') rainbowFx.cancel();
      }
    },
    flashSrc: () => flashSrc,
    renderInPane: (r, cam) => thunderFx.renderInPane(r, cam),
    thunderHook: () => (hook ??= thunderFx.hook({ renderer: c.renderer, camera: c.camera })),
    dispose() {
      p2legend.dispose();
      thunderFx.dispose();
      rainbowFx.dispose();
      windWaveFx.dispose();
      spiralFx.dispose();
      nijiFx.dispose();
      chargeLightFx.dispose();
    },
  };
}
