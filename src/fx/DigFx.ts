import * as THREE from 'three';
import type { DigEvent, DigSystem, ItemId, Vec3 } from '../contracts';
import { ComboTracker } from './combo';
import { FX_SETTINGS, type FxSettings } from './config';
import { BlockPuffs, BreakParticles, CrackOverlay, TargetOutline } from './objects3d';
import { WHIFF_TONES } from './sfxVoices';
import type { SoundFx, Tone } from './sound';

export interface DigFxDeps {
  scene: THREE.Scene;
  dig: DigSystem;
  /** true のあいだ ブロックの枠を出さない（妖怪をねらっているとき） */
  hideBlockFocus?: () => boolean;
  sound: SoundFx;
  /** 人形（右うでを振る） */
  doll: { swing(): void; setDigging(on: boolean): void };
  /** カメラのごく弱いゆれ（ラジアン） */
  view: { setShake(yaw: number, pitch: number): void };
  /** 合図のアイコン */
  notice: { showSignal(kind: 'needTool' | 'full'): void };
  /** アイテムが入った（ホットバーの「ぽよん」や飛ぶ絵） */
  onPickup?: (item: ItemId, count: number) => void;
  settings?: FxSettings;
  /** 出来事を main が 1 回だけ drain して配るとき、その列を渡す（なければ dig.drainEvents()） */
  events?: () => DigEvent[];
}

/** 空振りの小さな「ひゅっ」（控えめ） */
const WHIFF_SOUND: readonly Tone[] = WHIFF_TONES;

const same = (a: Vec3 | null, b: Vec3 | null) => !!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z;

/**
 * ほる・置くときの演出（枠・ひび・はじける四角・ぷくっ・ゆれ・音）をまとめて動かす。
 * 毎ステップ、プレイヤーとカメラの更新のあとに update(dt) を呼ぶ。
 * 出来事は dig.drainEvents() で読む（テスト用の peek の列とは別）。
 */
export class DigFx {
  readonly outline = new TargetOutline();
  readonly crack = new CrackOverlay();
  readonly particles = new BreakParticles();
  readonly puffs = new BlockPuffs();
  readonly combo: ComboTracker;
  private readonly cfg: FxSettings;
  private enabled = true;
  private redLeft = 0;
  private prevStage = 0;
  private prevBlock: Vec3 | null = null;
  private digTimer = 0;
  private shakeLeft = 0;
  private wobbleLeft = 0;
  private rng = 777;
  private lastDigging = false;
  private lastWhiffs = 0;
  private readyT = 0;
  private wasReady = false;

  constructor(private readonly d: DigFxDeps) {
    this.cfg = d.settings ?? FX_SETTINGS;
    const c = this.cfg;
    this.combo = new ComboTracker(
      () => c.comboSemitones,
      () => c.comboMax,
      () => c.comboResetSeconds,
    );
    d.scene.add(this.outline.mesh, this.crack.mesh, this.particles.mesh, this.puffs.group);
  }

  /** もちもの画面などで枠を隠したいとき */
  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  private rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 4294967296 - 0.5;
  }

  update(dt: number): void {
    const { dig, sound, doll, notice } = this.d;
    const c = this.cfg;
    this.combo.update(dt);

    const whiffs = dig.whiffCount?.() ?? this.lastWhiffs;
    if (whiffs !== this.lastWhiffs) {
      this.lastWhiffs = whiffs;
      doll.swing();
      sound.playTones(WHIFF_SOUND);
    }

    const target = dig.target();
    const st = dig.state();

    // ねらいの枠
    this.outline.show(this.enabled && target && !this.d.hideBlockFocus?.() ? target.block : null);
    if (this.redLeft > 0) {
      this.redLeft -= dt;
      if (this.redLeft <= 0) this.outline.setRed(false);
    }

    // 出来事
    let stageSoundPlayed = false;
    for (const ev of this.d.events ? this.d.events() : dig.drainEvents()) {
      if (ev.type === 'break') {
        const hadItem = ev.gotItem;
        this.puffs.start(ev.block, ev.id, 1, c.puffScale, c.puffSeconds, () =>
          this.particles.burst(ev.block, ev.id, c),
        );
        sound.play('break');
        if (hadItem) {
          // 続けて取ると、和音の音を 1 つずつ上がる（comboStep。1 オクターブで止まる）。数が多いほど少し高く（0.5 半音ずつ）
          this.combo.hit(ev.id);
          sound.play('pickup', (ev.count - 1) * 0.5, { comboStep: this.combo.chain });
          this.d.onPickup?.(ev.id, ev.count);
        } else {
          notice.showSignal('full');
          this.flashRed();
        }
        this.startShake();
        this.prevStage = 0;
        this.prevBlock = null;
        this.digTimer = 0;
      } else if (ev.type === 'ready') {
        sound.play('ready');
      } else if (ev.type === 'place') {
        this.puffs.start(ev.block, ev.id, 1.002 + (c.placeScale - 1), 1.002, c.placeSeconds, null);
        sound.play('place');
        doll.swing();
      } else {
        sound.play('clink');
        this.flashRed();
        if (ev.reason === 'needTool') notice.showSignal('needTool');
      }
    }

    // ひび。段階が上がったときだけ「カッ」とブロックが小さくゆれる（下がるときは鳴らさない）
    this.crack.show(st.block, st.crackStage);
    const block = st.block;
    if (st.crackStage > 0 && block) {
      const sameBlock = same(block, this.prevBlock);
      const before = sameBlock ? this.prevStage : 0;
      if (st.crackStage > before && st.active) {
        sound.play(st.crackStage >= 3 ? 'crackFinal' : 'crack');
        stageSoundPlayed = true;
        this.wobbleLeft = c.crackWobbleSeconds;
      }
      this.prevBlock = block;
      this.prevStage = st.crackStage;
    } else if (!block || st.crackStage === 0) {
      this.prevStage = 0;
      this.prevBlock = block;
    }

    // ほっているあいだのコツ
    const digging = st.active && st.blockedReason === null;
    if (digging) {
      if (!this.lastDigging) this.digTimer = c.digSoundInterval;
      this.digTimer += dt;
      if (this.digTimer >= c.digSoundInterval - 1e-9) {
        this.digTimer -= c.digSoundInterval;
        if (!stageSoundPlayed) sound.play('dig');
      }
    }
    this.lastDigging = digging;
    doll.setDigging(digging);

    // 「いま押して！」: ふちがゆっくり光り、ブロックがぷるぷる震え続ける
    if (st.ready && st.block) {
      this.readyT += dt;
      const level = 0.5 + 0.5 * Math.sin((2 * Math.PI * this.readyT) / c.readyPulseSeconds);
      this.outline.setGlow(level);
      const a = c.fxShake ? c.readyTremble : 0;
      this.crack.wobble(this.rand() * a, this.rand() * a, this.rand() * a);
      this.wasReady = true;
    } else if (this.wasReady) {
      this.wasReady = false;
      this.readyT = 0;
      this.outline.setGlow(null);
      this.crack.wobble(0, 0, 0);
    }

    // ブロックの小さなゆれ（ひびの段階が上がったとき）
    if (st.ready) {
      // ふるえは上で処理した
    } else if (this.wobbleLeft > 0) {
      this.wobbleLeft -= dt;
      const k = Math.max(0, this.wobbleLeft / c.crackWobbleSeconds);
      const a = c.crackWobble * k * (c.fxShake ? 1 : 0);
      this.crack.wobble(this.rand() * a, this.rand() * a, this.rand() * a);
    } else if (this.crack.mesh.visible) {
      this.crack.wobble(0, 0, 0);
    }

    // 画面のごく弱いゆれ
    if (this.shakeLeft > 0) {
      this.shakeLeft -= dt;
      const k = Math.max(0, this.shakeLeft / c.shakeSeconds);
      const a = c.fxShake ? c.shakeStrength * k : 0;
      this.d.view.setShake(this.rand() * 2 * a, this.rand() * 2 * a);
    } else {
      this.d.view.setShake(0, 0);
    }

    this.puffs.update(dt);
    this.particles.update(dt);
  }

  private flashRed(): void {
    this.redLeft = this.cfg.redSeconds;
    this.outline.setRed(true);
  }

  private startShake(): void {
    this.shakeLeft = this.cfg.fxShake ? this.cfg.shakeSeconds : 0;
  }

  dispose(): void {
    this.d.scene.remove(this.outline.mesh, this.crack.mesh, this.particles.mesh, this.puffs.group);
    this.outline.dispose();
    this.crack.dispose();
    this.particles.dispose();
    this.puffs.dispose();
    this.d.view.setShake(0, 0);
  }
}
