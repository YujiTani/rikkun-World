import type { PlayerState, TargetInfo, Vec3, YokaiInfo } from '../contracts';
import { cropKindOfBlock } from '../contracts';
import type { ActionState } from '../input/actions';
import { boxOf, centerOfYokai, decideAttack, type AttackDecision, type AttackHold } from '../combat/attackFacing';
import { GHOST_ID_MIN } from '../combat/ghostIds';
import { isBladeItem } from '../tools/blade/BladeSystem';
import type { DigCore } from './digCore';
import type { AttackLast } from './digPorts';
import { lookDirection } from './raycast';

const TECH_OF_STANCE = { chudan: 'thrust', jodan: 'kesa', gedan: 'kiriage' } as const;

type OriginFn = (player: PlayerState, out: Vec3) => Vec3;

/** 攻撃の向きの係が DigSystemImpl から受け取る物（DigCore のほか） */
export interface DigAttackDeps extends DigCore {
  readonly actions: ActionState;
  /** 体の点 B（P の 真上・肩の高さ）の 出どころ。なければ 足もと + 1.40 */
  bodyOrigin(): OriginFn | undefined;
  /** 出どころ o から d の向きの線で ねらうブロック（reachOrigin があれば その点から reach 以内のものだけ） */
  aimBlock(p: PlayerState, o: Vec3, d: Vec3): TargetInfo | null;
  origin(p: PlayerState, out: Vec3): Vec3;
  /** ねらいの線の 向き（update で 決めた物） */
  readonly dir: Vec3;
}

/** WEAPON-3: 近接の 攻撃の 向き（§4.4）の係。妖怪の 一覧・向きの決まり・さいごに 始めた 攻撃を 持つ */
export class DigAttack {
  private listCache: YokaiInfo[] = [];
  private listCacheTick = -1;
  private inUpdate = false;
  private lastAttack: AttackLast | null = null;
  private prevPunchDir: number | null = null;
  private readonly bodyScratch = { x: 0, y: 0, z: 0 };
  private readonly targetScratch = { x: 0, y: 0, z: 0 };
  private readonly pvDir = { x: 0, y: 0, z: 0 };
  private readonly pvOrigin = { x: 0, y: 0, z: 0 };
  /** aimedYokaiId 用（毎フレーム呼ばれても new しない） */
  private readonly yokaiOriginScratch = { x: 0, y: 0, z: 0 };

  constructor(private readonly d: DigAttackDeps) {}

  /** update() の はじめ・おわり（妖怪の 一覧を この間だけ 1 ステップ 1 回に する） */
  begin(): void {
    this.listCacheTick = -1;
    this.inUpdate = true;
  }
  end(): void {
    this.inUpdate = false;
  }

  /** 妖怪の 一覧。1 ステップに 1 回だけ 作る（歩数が 変わったときだけ 取り直す） */
  yokaiList(): YokaiInfo[] {
    const m4 = this.d.m4;
    if (!m4.yokai) return [];
    // update() の中だけ キャッシュ(1 ステップ 1 回)。外から 呼ばれたときは 毎回 取り直す
    if (!this.inUpdate) return m4.yokai().list();
    if (this.listCacheTick !== this.d.tick()) {
      this.listCache = m4.yokai().list();
      this.listCacheTick = this.d.tick();
    }
    return this.listCache;
  }

  targetCenter(list: YokaiInfo[], id: number): Vec3 | null {
    for (const y of list) if (y.id === id) return { ...centerOfYokai(y, this.targetScratch) };
    return null;
  }

  /** 体の点 B: P の 真上（肩の高さ）。右へは ずらさない */
  bodyPoint(p: PlayerState, out: Vec3): Vec3 {
    const bodyOrigin = this.d.bodyOrigin();
    if (bodyOrigin) {
      bodyOrigin(p, out);
      out.x = p.position.x;
      out.z = p.position.z;
      return out;
    }
    out.x = p.position.x;
    out.y = p.position.y + 1.4;
    out.z = p.position.z;
    return out;
  }

  /** 体の点 B（このステップの 使い回しの 入れもの） */
  bodyNow(p: PlayerState): Vec3 {
    return this.bodyPoint(p, this.bodyScratch);
  }

  /** 今の 持ち物の 近接の なかま（弓は bow） */
  private holdKind(): AttackHold {
    if (this.d.m4.tools?.current().kind === 'bow') return 'bow';
    return isBladeItem(this.d.inventory.held()?.item) ? 'blade' : 'punch';
  }

  /** 向きの決まり（§4.4）。つなぎが そろっていなければ null（今までの 線で 決める） */
  buildDecision(p: PlayerState, d: Vec3, o: Vec3, tgt: TargetInfo | null, list: YokaiInfo[] | null): AttackDecision | null {
    const c = this.d;
    const w2 = c.m4.w2;
    if (!w2 || !c.m4.yokai || !c.gate || !list) return null;
    const hold = this.holdKind();
    if (hold === 'blade' && !c.m4.blade) return null;
    const a = c.actions;
    const aimYokai = c.gate.aimedYokai?.(o, d, tgt?.distance ?? null) ?? null;
    const block: 'block' | 'crop' | null = tgt ? (c.m4.farm && cropKindOfBlock(tgt.id) ? 'crop' : 'block') : null;
    const before = tgt ? c.m4.yokai().raycast(o, d, tgt.distance) : null;
    const yokaiBeforeBlock = before !== null && before.distance < tgt!.distance;
    // 仮の id（がしゃどくろの 体の 箱・燃えかす）は 一覧に 無いので、当たった 点に 立つ 仮の 妖怪を 足して 規則 2 に 入れる
    let yokaiList = list;
    if (aimYokai !== null && aimYokai >= GHOST_ID_MIN && !list.some((q) => q.id === aimYokai)) {
      const hit = c.m4.yokai().raycast(o, d, tgt?.distance ?? 12);
      if (hit && hit.id === aimYokai) {
        const ghost: YokaiInfo = {
          id: aimYokai, kind: hit.kind, position: { x: o.x + d.x * hit.distance, y: o.y + d.y * hit.distance, z: o.z + d.z * hit.distance },
          yawDeg: 0, hp: 1, maxHp: 1, state: 'idle', attackTick: 0, scale: 1, name: '', title: 'none', m: 1, attack: 0,
        };
        ghost.position.y -= boxOf(ghost).h / 2;
        yokaiList = [...list, ghost];
      }
    }
    // WEAPON-6: 次に 始まる わざ・何段目か（きらめく カタナだけ。ほかは かまえの わざ）
    const nextBlade = hold === 'blade' ? c.m4.blade!.nextStart?.() : undefined;
    return decideAttack({
      settings: w2,
      hold,
      item: c.inventory.held()?.item ?? null,
      tech: nextBlade?.tech ?? (hold === 'blade' ? TECH_OF_STANCE[c.m4.blade!.state().stance] : 'thrust'),
      step: nextBlade?.step,
      punchReach: c.m4.tools?.punchParams?.().reach ?? 3.5,
      yawDeg: p.yawDeg,
      facingDeg: p.facingDeg,
      keys: {
        forward: a.isHeld('moveForward'),
        back: a.isHeld('moveBack'),
        right: a.isHeld('moveRight'),
        left: a.isHeld('moveLeft'),
      },
      position: p.position,
      body: this.bodyPoint(p, this.bodyScratch),
      yokai: yokaiList,
      world: c.world,
      aim: { yokaiId: aimYokai, block, yokaiBeforeBlock },
    });
  }

  /** 今 決め直した 向きの決まり（遊べない間・弓・つなぎがない間は null） */
  freshDecision(): AttackDecision | null {
    const c = this.d;
    if (!c.lock.playInputEnabled() || c.gate?.blocksInput()) return null;
    if (!c.m4.w2 || !c.m4.yokai || c.m4.tools?.current().kind === 'bow') return null;
    const p = c.player();
    const d = lookDirection(p.yawDeg, p.pitchDeg, this.pvDir);
    const o = c.origin(p, this.pvOrigin);
    return this.buildDecision(p, d, o, c.aimBlock(p, o, d), this.yokaiList());
  }

  /** `attack.preview()`（§4.8）: 今 左クリックしたら どうなるか */
  attackPreview(): { use: 'attack' | 'dig' | 'harvest' | 'whiff' | 'none'; rule: 1 | 2 | 3 | 4 | null; dirDeg: number | null; targetId: number | null } {
    const dec = this.freshDecision();
    if (!dec) return { use: 'none', rule: null, dirDeg: null, targetId: null };
    return { use: dec.use, rule: dec.rule, dirDeg: dec.dirDeg, targetId: dec.targetId };
  }

  /** `attack.last()`（§4.8）: さいごに 始めた 攻撃。まだなければ null */
  attackLast(): AttackLast | null {
    return this.lastAttack ? { ...this.lastAttack } : null;
  }

  /** 刀の わざ・パンチの 間は 攻撃の向き u。そうでなければ null（キャラの向きを u に 固定する） */
  attackFaceDeg(): number | null {
    const mv = this.d.m4.blade?.state().move;
    if (mv) return mv.dirDeg;
    return this.d.gate?.punchDirDeg?.() ?? null;
  }

  /** 刀の わざの 1 コマ目に 「さいごに 始めた 攻撃」を 記録する */
  noteBlade(dec: AttackDecision, dirDeg: number, tiltDeg: number): void {
    this.lastAttack = {
      tick: this.d.tick(), kind: 'blade', rule: dec.rule ?? 4, baseDeg: dec.baseDeg, keyDeg: dec.keyDeg,
      dirDeg, targetId: dec.targetId, tiltDeg,
    };
  }

  /** パンチの 向きが 決まった 最初の ステップに 記録する（pd = 今のパンチの向き。なければ null） */
  notePunch(pd: number | null, dec: AttackDecision | null): void {
    if (pd !== null && this.prevPunchDir === null && dec) {
      this.lastAttack = {
        tick: this.d.tick(), kind: 'punch', rule: dec.rule ?? 4, baseDeg: dec.baseDeg, keyDeg: dec.keyDeg,
        dirDeg: pd, targetId: dec.targetId, tiltDeg: 0,
      };
    }
    this.prevPunchDir = pd;
  }

  /** ねらっている（手前の・とどく距離内の）妖怪の id。たたく ヒントとふちどりが同じ判定を使う。遊べない間は null */
  aimedYokaiId(): number | null {
    const c = this.d;
    if (!c.gate?.aimedYokai || !c.lock.playInputEnabled() || c.gate.blocksInput()) return null;
    // WEAPON-3: 刀・パンチの 持ち物では、毎ステップ「今 左クリックしたら 攻撃する 妖怪」（§4.4 の (1)・(2)）
    const dec = this.freshDecision();
    if (dec) return dec.use === 'attack' ? dec.targetId : null;
    const p = c.player();
    const eye = c.origin(p, this.yokaiOriginScratch);
    return c.gate.aimedYokai(eye, lookDirection(p.yawDeg, p.pitchDeg, c.dir), c.tgt()?.distance ?? null);
  }
}
