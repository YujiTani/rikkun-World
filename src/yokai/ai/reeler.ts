import type { StaggerBook, StaggerBy } from '../stagger';
import { YOKAI_STATS } from '../stats';
import type { YokaiKind } from '../../contracts';
import type { Ent, YokaiField } from './entity';
import type { YokaiManagerOptions } from './managerTypes';

interface ReelerDeps {
  f: YokaiField;
  stag: Pick<StaggerBook, 'stagger'>;
  /** onParryEvent を 呼ぶときに 読む */
  opts: Pick<YokaiManagerOptions, 'onParryEvent'>;
}

/**
 * よろける係（WEAPON-5）: 攻撃を取り消して よろける、よろけている間の ふらふらした すがた。
 */
export class YokaiReeler {
  constructor(private readonly d: ReelerDeps) {}

  /** そのステップの 次の攻撃までの ステップ数 */
  private coolTicks(kind: YokaiKind): number {
    return Math.round(YOKAI_STATS[kind].cooldownSeconds * 60);
  }

  /** 攻撃を 取り消して よろける（パリィの 成功・はね返しが 当たった）。できたら true */
  applyStagger(id: number, by: StaggerBy): boolean {
    const { f } = this.d;
    const e = f.ents.find((q) => q.id === id);
    if (!e || e.state === 'dying' || e.state === 'leaving' || e.remove) return false;
    if (e.state === 'attack') {
      // 攻撃は 取り消し（このあと 当たらない）。つぎの 攻撃までを はかり直す
      e.model.setMotion('wait');
      e.motion = 'wait';
      e.state = 'chase';
      e.attackSteps = 0;
      e.bestDist = Infinity;
      e.lastProgress = f.steps;
    } else if (e.motion === 'move') {
      e.model.setMotion('wait');
      e.motion = 'wait';
    }
    e.cool = this.coolTicks(e.kind);
    this.d.stag.stagger(id, by);
    e.stag = true;
    e.stagPhase = 0;
    this.d.opts.onParryEvent?.({ type: 'stagger', yokaiId: id, by });
    return true;
  }

  /** よろけている 間の すがた（ふらふら）。歩かない・向きを かえない・攻撃しない。次の攻撃までを 数えはじめない */
  pose(e: Ent): void {
    e.cool = this.coolTicks(e.kind);
    e.stagPhase++;
    const t = e.stagPhase;
    e.model.staggerTilt = Math.sin(t * 0.32) * 0.2;
    e.model.staggerTwist = Math.sin(t * 0.21 + 1) * 0.3;
  }

  clear(e: Ent): void {
    if (e.model.staggerTilt !== 0 || e.model.staggerTwist !== 0) {
      e.model.staggerTilt = 0;
      e.model.staggerTwist = 0;
    }
  }
}
