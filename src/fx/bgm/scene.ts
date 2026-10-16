/**
 * 場面の判定（SOUND.md §2）と、画面ごとの BGM の倍率（§5）。DOM も WebAudio も使わない。固定ステップで決定的。
 */
import type { DayPhase, ScreenMode, Vec3, YokaiState } from '../../contracts';
import type { AudioSettings } from '../audioConfig';
import type { BgmSong } from './songs';

export interface BgmSceneInput {
  /** ゲームのステップ数（呼ぶ間隔が空いてもよい。差で数える） */
  tick: number;
  phase: DayPhase;
  player: Vec3;
  yokai: readonly { state: YokaiState; position: Vec3 }[];
  /** やられている（combat.dead()）あいだは判定しない */
  dead: boolean;
}

export class BgmSceneTracker {
  private current: BgmSong = 'day';
  private battle = false;
  /** 「近くに追いかけてくる妖怪がいる」が続いている最初の tick */
  private nearSince: number | null = null;
  /** 「いない」が続いている最初の tick（たたかいの中だけ） */
  private farSince: number | null = null;

  constructor(private readonly s: AudioSettings) {}

  scene(): BgmSong {
    return this.current;
  }

  update(i: BgmSceneInput): BgmSong {
    if (i.dead) {
      // 曲はそのまま。数えかけは捨てる（生き返ったら 数えなおし）
      this.nearSince = null;
      this.farSince = null;
      return this.current;
    }
    const r = this.s.battleRange;
    let near = false;
    for (const y of i.yokai) {
      if (y.state !== 'chase' && y.state !== 'attack') continue;
      const dx = y.position.x - i.player.x;
      const dy = y.position.y - i.player.y;
      const dz = y.position.z - i.player.z;
      if (dx * dx + dy * dy + dz * dz <= r * r) {
        near = true;
        break;
      }
    }
    if (!this.battle) {
      if (near) {
        this.nearSince ??= i.tick;
        if (i.tick - this.nearSince >= this.s.battleEnterTicks) {
          this.battle = true;
          this.nearSince = null;
          this.farSince = null;
        }
      } else {
        this.nearSince = null;
      }
    } else if (near) {
      this.farSince = null;
    } else {
      this.farSince ??= i.tick;
      if (i.tick - this.farSince >= this.s.battleExitTicks) {
        this.battle = false;
        this.farSince = null;
      }
    }
    this.current = this.battle ? 'battle' : i.phase === 'day' || i.phase === 'dawn' ? 'day' : 'night';
    return this.current;
  }
}

/** 画面ごとの BGM にかける倍率（SOUND.md §5）。celebrate は 1（下げるのは duck の役目）。やられた画面は 1 */
export function screenLevel(mode: ScreenMode, dead: boolean): number {
  if (dead) return 1;
  switch (mode) {
    case 'inventory':
      return 0.7;
    case 'guide':
      return 0.4;
    case 'play':
    case 'celebrate':
      return 1;
  }
}
