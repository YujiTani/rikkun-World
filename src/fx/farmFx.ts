import type { CropKind, FarmEvent, FarmHintKind, PetResult, Vec3 } from '../contracts';
import { FX_SETTINGS, type FxSettings } from './config';
import { playFarm, type FarmSoundName } from './farmSounds';
import type { SoundFx } from './sound';

/** やさいの つぶの色 */
export const VEG_COLOR: Readonly<Record<CropKind, number>> = {
  onion: 0xf5f0dc,
  tomato: 0xe53935,
  pumpkin: 0xf57c00,
  eggplant: 0x6a1b9a,
};
/** たがやす つちの つぶ */
export const SOIL_COLOR = 0x6e4520;

export interface FarmFxDeps {
  sound: Pick<SoundFx, 'playTones'>;
  /** はじける つぶ（`BreakParticles.burstHex` が合う）。なければ つぶなし */
  particles?: { burstHex(block: Vec3, hex: number, cfg: FxSettings, count: number): void };
  /** 合図のチップ（`FarmHint.show` が合う） */
  hint?: { show(kind: FarmHintKind): void };
  /** 実績（`AchievementSystem.feedFarm` が合う） */
  achievements?: { feedFarm(events: readonly FarmEvent[]): void };
  /** M7-2: なでた ハート・ゆれ（`FarmSparkle.onPet` が合う） */
  sparkle?: { onPet(x: number, y: number, z: number, result: PetResult): void };
  settings?: FxSettings;
}

/**
 * 農業の出来事（`farm.drainEvents()`）から 音・つぶ・合図・実績を 起こす（M7 §3.3・§3.6・§4.7）。
 * つなぎ込みは 毎ステップ `farmFx.feed(farm.drainEvents())` を呼ぶ。段階が変わった `stage` は 音なし。
 */
export class FarmFx {
  /** 鳴らした音の名前（テスト用。長くなりすぎない） */
  readonly played: FarmSoundName[] = [];
  private readonly cfg: FxSettings;

  constructor(private readonly d: FarmFxDeps) {
    this.cfg = d.settings ?? FX_SETTINGS;
  }

  feed(events: readonly FarmEvent[]): void {
    if (events.length === 0) return;
    for (const e of events) this.one(e);
    this.d.achievements?.feedFarm(events);
  }

  private snd(name: FarmSoundName): void {
    playFarm(this.d.sound, name);
    this.played.push(name);
    if (this.played.length > 64) this.played.shift();
  }

  private burst(e: { x: number; y: number; z: number }, hex: number, n: number): void {
    this.d.particles?.burstHex({ x: e.x, y: e.y, z: e.z }, hex, this.cfg, n);
  }

  private one(e: FarmEvent): void {
    switch (e.type) {
      case 'till':
        this.snd('till');
        this.burst(e, SOIL_COLOR, 8);
        break;
      case 'tillPress':
        this.snd('tillPress');
        // 1・2 回目も 小さな つちの つぶ（3 回押す ことに 気づけるように）
        this.burst(e, SOIL_COLOR, 3);
        break;
      case 'plant':
        this.snd('plant');
        break;
      case 'harvest':
        this.snd('harvest');
        this.burst(e, VEG_COLOR[e.kind], 10);
        break;
      case 'wild':
        this.snd('wild');
        this.burst(e, VEG_COLOR[e.kind], 14);
        break;
      case 'notRipe':
        this.snd('notRipe');
        break;
      case 'eat':
        this.snd('eat');
        break;
      case 'seedFound':
        this.snd('seedFound');
        break;
      case 'hint':
        this.d.hint?.show(e.hint);
        if (e.hint === 'fill') this.snd('empty'); // からっぽ の じょうろ（4c）軽い「コン」
        break;
      // ---- M7-2（しずく・しぶき の つぶ は A・B の 担当。音 は ここ から）
      case 'fill':
        // まんたん で くむと 「ちゃぷん」（A が `wasFull` を 入れる）。入れない 間 は ゴボゴボ
        this.snd((e as { wasFull?: boolean }).wasFull ? 'fullCan' : 'fill');
        break;
      case 'pour':
        this.snd('pour');
        break;
      case 'pet':
        this.snd(e.result === 'happy' ? 'pet' : 'petAgain');
        this.d.sparkle?.onPet(e.x, e.y, e.z, e.result);
        break;
      case 'sprinklerPlaced':
        this.snd('sprinklerPlace');
        break;
      default:
        // stage・wet・visitOldFarm・sprinklerBroken は 音なし
        break;
    }
  }
}
