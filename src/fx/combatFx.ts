import type * as THREE from 'three';
import type { DayPhase, ItemId, PlayerCombat, TimeOfDay, YokaiWorld } from '../contracts';
import { BagVisuals, type BagLike } from './bagVisuals';
import { COMBAT_FX, invincibleAlpha } from './combatFxModel';
import { playCombat } from './combatSounds';
import { FX_SETTINGS, type FxSettings } from './config';
import type { SoundFx } from './sound';
import { logSound } from './soundLog';
import { TITLE_RULES } from '../yokai/title';

export interface CombatFxDeps {
  scene: THREE.Scene;
  sound: Pick<SoundFx, 'play' | 'playTones'>;
  combat: Pick<PlayerCombat, 'hp' | 'maxHp' | 'dead' | 'invincibleTicks' | 'drainEvents'>;
  yokai: Pick<YokaiWorld, 'drainEvents'>;
  time: Pick<TimeOfDay, 'phase' | 'onPhaseChange'>;
  /** いまあるおとしもの ぶくろ（`combat.bags()` のうち id・場所・のこりだけ使う） */
  bags: () => readonly BagLike[];
  /** 人形（パンチのうで・むてきの点滅・たおれる） */
  doll: { punch(): void; setAlpha(a: number): void; setFallen(k: number): void };
  /** カメラのごく弱いゆれ（ラジアン）。DigFx のあとに update を呼ぶこと */
  view: { setShake(yaw: number, pitch: number): void };
  hearts: { update(dt: number, hp: number, invincible: boolean): void };
  deathScreen: { start(): void; end(): void; update(dt: number): void };
  homeNotice: { show(): void; update(dt: number): void };
  edge: { flash(): void; update(dt: number): void };
  clock?: { set(phase: DayPhase): void };
  /** 二つ名の出現音（音ファイル）。無ければ 鳴らさない（頼みの記録は する） */
  titleSound?: { play(title: 'oyabun' | 'taisho' | 'nushi'): unknown };
  /** アイテムが入った（ホットバーの飛ぶ絵）。ようかいだまが入ったとき */
  onPickup?: (item: ItemId, count: number) => void;
  settings?: FxSettings;
}

/**
 * 戦いの見た目と音をまとめて動かす（M3 §3.3〜§3.7）。画面全体の点滅はしない。
 * 毎ステップ、DigFx.update のあと・CameraRig.update のまえに update(dt) を呼ぶ。
 * 出来事は combat.drainEvents()・yokai.drainEvents() で読む（テストの窓口用の列とは別）。
 */
export class CombatFx {
  readonly bags: BagVisuals;
  private readonly cfg: FxSettings;
  private fallT = 0;
  private shakeLeft = 0;
  private rng = 4242;
  private readonly offPhase: () => void;
  private lastAlpha = 1;
  /** 二つ名の音が鳴り終わるまで（秒） */
  private titleSoundLeft = 0;

  constructor(private readonly d: CombatFxDeps) {
    this.cfg = d.settings ?? FX_SETTINGS;
    this.bags = new BagVisuals(d.scene, (r) =>
      playCombat(d.sound, r === 'superRare' ? 'dropSuperRare' : r === 'rare' ? 'dropRare' : r === 'uncommon' ? 'dropUncommon' : 'dropCommon'),
    );
    d.clock?.set(d.time.phase());
    this.offPhase = d.time.onPhaseChange((p) => {
      d.clock?.set(p);
      if (p === 'dusk') playCombat(d.sound, 'bell');
      else if (p === 'dawn') playCombat(d.sound, 'birds');
    });
  }

  /**
   * 二つ名が出た音（版 B の音ファイル）。出来事 1 回で「鳴らす頼み」を 1 回記録する（読めたかに関係なく）。
   * 鳴っている間（聞こえる長さ）の 2 体目は 頼まない。
   */
  private playTitleSound(title: 'oyabun' | 'taisho' | 'nushi'): void {
    if (this.titleSoundLeft > 0) return;
    this.titleSoundLeft = TITLE_RULES[title].soundSeconds;
    logSound(`appear_${title}`);
    this.d.titleSound?.play(title);
  }

  private rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 4294967296 - 0.5;
  }

  update(dt: number): void {
    const d = this.d;
    const sound = d.sound;
    if (this.titleSoundLeft > 0) this.titleSoundLeft -= dt;

    for (const ev of d.combat.drainEvents()) {
      switch (ev.type) {
        case 'punchStart':
          d.doll.punch();
          playCombat(sound, 'punch');
          break;
        case 'punchHit':
          playCombat(sound, 'hit');
          break;
        case 'punchMiss':
          playCombat(sound, 'miss');
          break;
        case 'playerHit':
          playCombat(sound, 'hurt');
          d.edge.flash();
          this.shakeLeft = this.cfg.fxShake ? COMBAT_FX.hurtShakeSeconds : 0;
          break;
        case 'fallHurt':
          playCombat(sound, 'hurt');
          d.edge.flash();
          break;
        case 'death':
          d.deathScreen.start();
          playCombat(sound, 'faint');
          break;
        case 'respawn':
          d.deathScreen.end();
          d.homeNotice.show();
          playCombat(sound, 'respawn');
          break;
        case 'pickup':
          sound.play('pickup');
          break;
        case 'regen':
          break; // 回復の音は無し（うるさくしない）
      }
    }

    for (const ev of d.yokai.drainEvents()) {
      if (ev.type === 'spawn') {
        playCombat(sound, 'spawn');
      } else if (ev.type === 'defeat') {
        playCombat(sound, 'defeat');
      } else if (ev.type === 'titleSound') {
        this.playTitleSound(ev.title);
      }
    }

    // 人形: やられたら横にたおれる、むてき中はうすい⇔ふつう
    const dead = d.combat.dead();
    this.fallT = Math.max(0, Math.min(COMBAT_FX.fallSeconds, this.fallT + (dead ? dt : -dt * 4)));
    d.doll.setFallen(this.fallT / COMBAT_FX.fallSeconds);
    const alpha = dead ? 1 : invincibleAlpha(d.combat.invincibleTicks());
    if (alpha !== this.lastAlpha) {
      this.lastAlpha = alpha;
      d.doll.setAlpha(alpha);
    }

    d.hearts.update(dt, d.combat.hp(), !dead && d.combat.invincibleTicks() > 0);
    d.edge.update(dt);
    d.deathScreen.update(dt);
    d.homeNotice.update(dt);
    this.bags.update(dt, d.bags());

    // ごく弱いゆれ（DigFx が先に 0 にしているので、ゆれているあいだだけ上書きする）
    if (this.shakeLeft > 0) {
      this.shakeLeft -= dt;
      const k = Math.max(0, this.shakeLeft / COMBAT_FX.hurtShakeSeconds);
      const a = this.cfg.fxShake ? this.cfg.shakeStrength * 0.5 * k : 0;
      d.view.setShake(this.rand() * 2 * a, this.rand() * 2 * a);
    }
  }

  dispose(): void {
    this.offPhase();
    this.bags.dispose();
    this.d.doll.setFallen(0);
    this.d.doll.setAlpha(1);
  }
}
