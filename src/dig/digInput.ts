import type { PlayerState, Vec3 } from '../contracts';
import type { Action, ActionState } from '../input/actions';
import { routeAttackInput } from '../combat/parry';
import { isBladeItem } from '../tools/blade/BladeSystem';
import type { DigAttack } from './digAttack';
import type { DigCore } from './digCore';

/** 左クリックの ふりわけの係が DigSystemImpl から受け取る物（DigCore のほか） */
export interface DigInputDeps extends DigCore {
  readonly actions: ActionState;
  /** だっこ中か（手がふさがる） */
  isCarrying(): boolean;
}

/**
 * 左クリック（ほる・たたく・わざ・パリィ・ため・弓）の ふりわけの係。毎ステップ `step` で
 * 今のステップの 結果（primary・secondary・punching・yokaiBlocks）を 決める。
 */
export class DigInput {
  /** ほる／たたく の 左クリック（わざ・弓のときは false） */
  primary = false;
  secondary = false;
  /** このステップはパンチ（ほらない） */
  punching = false;
  /** ＋マークの線で ブロックより手前に 妖怪が いて 空ぶりに なる（ほらない。#34） */
  yokaiBlocks = false;
  /** ふりわけ の 前の 生の 押し（刀の わざの 押した しゅんかん用） */
  private prevPrimaryRaw = false;
  /** WEAPON-5: パリィの 先行入力の 間に 押した ふつうの こうげき（パリィが おわった ステップに わざを 出す） */
  private pendingTech = false;

  constructor(
    private readonly d: DigInputDeps,
    private readonly attack: DigAttack,
  ) {}

  step(p: PlayerState, o: Vec3, d: Vec3, enabled: boolean): void {
    const c = this.d;
    const actions = c.actions;
    // LIVE-1 版 3.2 §2.8: だっこ 中 は 手が ふさがる。左クリック（ほる・こうげき・弓）は 何も しない
    const carrying = enabled && c.isCarrying();
    // 同じステップのうちに押してはなす短いタップも拾う（wasPressed）
    const primaryAny = enabled && !carrying && (actions.isHeld('primary') || actions.wasPressed('primary'));
    // HURT-1: 怯み中でも レジェンダリーの ためだけは 消さない（やられたときは 今まで どおり 消える）
    const legendOn = c.lock.playInputEnabled() && (!c.gate?.blocksInput() || !!c.gate?.flinching?.());
    const primaryLegend = legendOn && !carrying && (actions.isHeld('primary') || actions.wasPressed('primary'));
    // WEAPON-5: 刀＋Shift は パリィ（押した）か 何も出さない（押しつづけ）。ほる・わざは しない
    const parryM = c.m4.parry;
    const route = c.m4.blade && parryM ? routeAttackInput({ item: c.inventory.held()?.item, run: actions.isHeld('run'), pressed: actions.wasPressed('primary'), held: primaryAny }) : 'normal';
    const pstate = parryM ? parryM.state() : null;
    const parryBusy = pstate !== null && pstate.phase !== 'idle';
    let primaryRaw = primaryAny && route === 'normal';
    if (parryBusy && primaryRaw) {
      // パリィの 間の ふつうの こうげき: 先行入力の 区間なら あとに 押した 方が 勝つ（パリィが おわった ステップに わざ）
      if (actions.wasPressed('primary') && parryM!.inWindow()) {
        parryM!.dropBuffer();
        this.pendingTech = true;
      }
      primaryRaw = false;
    }
    if (route === 'parry' && this.pendingTech) this.pendingTech = false;
    const pendingNow = this.pendingTech && !parryBusy;
    if (pendingNow) this.pendingTech = false;
    const secondary = enabled && (actions.isHeld('secondary') || actions.wasPressed('secondary'));
    const tools = c.m4.tools;
    const eye = { x: o.x, y: o.y, z: o.z };
    const bow = tools?.current().kind === 'bow';
    // ゆみ を持っているあいだは ほる・たたく をしない（や は tools が飛ばす）
    let primary = primaryRaw && !bow;
    // 刀（WEAPON-2 §2.1-6・WEAPON-3 §4.4）: 向いている方の 妖怪（1）・＋マークで ねらった 妖怪（2）・何もない（4）→ わざ。作物・ブロック → しゅうかく・ほる
    const blade = c.m4.blade;
    const list = enabled && !bow ? this.attack.yokaiList() : null;
    const tgt = c.tgt();
    const dec = enabled && !bow ? this.attack.buildDecision(p, d, o, tgt, list) : null;
    if (blade) {
      const held = c.inventory.held()?.item ?? null;
      const bladeItem = isBladeItem(held) ? held : null;
      let tech = false;
      /** ふりわけが わざ（ほるでは ない）か */
      let furiTech = false;
      if (bladeItem && enabled) {
        if (parryBusy) tech = false;
        else if (pendingNow) tech = true;
        else if (blade.state().phase !== 'idle') tech = true;
        else if (primaryRaw) {
          if (dec) tech = dec.use === 'attack' || dec.use === 'whiff';
          else {
            const y = c.gate?.aimedYokai?.(eye, d, tgt?.distance ?? null) ?? null;
            tech = y !== null || !tgt;
          }
        }
        if (primaryRaw) furiTech = pendingNow || tech;
      }
      // WEAPON-7: ためわざの ある 武器は ため・はなすを この 係に まかせる（刀の 先行入力・くり返しは 使わない）
      const lg = c.m4.legend;
      let legendOwns = false;
      let legendFire = false;
      let legendBusy = false;
      if (lg) {
        const bs0 = blade.state();
        const bladeBusy = bs0.phase !== 'idle';
        const res = lg.step({
          item: bladeItem,
          active: legendOn && bladeItem !== null && !parryBusy,
          pressed: (primaryRaw && actions.wasPressed('primary')) || pendingNow,
          // Shift を 押しても ためは 続く（生の 押している）
          held: primaryLegend && !parryBusy,
          startOk: furiTech || pendingNow,
          bladeBusy,
          bladeAccepts: bladeBusy ? (blade.busyNext?.().accepts ?? false) : false,
          bladeChainOpen: bs0.combo?.open ?? false,
          eye,
          dir: d,
          position: p.position,
          yawDeg: p.yawDeg,
          inWater: p.inWater,
          power: c.inventory.held()?.power ?? null,
          onGround: p.onGround,
        });
        legendOwns = lg.chargeable(bladeItem);
        legendFire = res.fireTech;
        legendBusy = res.busy;
        if (res.busy) tech = true;
        else if (legendFire) tech = true;
      }
      if (parryM && tech && primaryRaw && actions.wasPressed('primary') && blade.state().phase !== 'idle' && pstate?.buffered) parryM.dropBuffer();
      // WEAPON-6: パリィが 始まったら つなぎの窓の わざは やめる
      if (parryBusy && blade.state().combo) blade.yieldToParry?.();
      const body = this.attack.bodyNow(p);
      blade.update({
        item: bladeItem,
        techPressed: legendOwns ? legendFire : tech && ((primaryRaw && (!this.prevPrimaryRaw || actions.wasPressed('primary'))) || pendingNow),
        techHeld: legendOwns ? false : tech && primaryRaw,
        stancePressed: enabled && !parryBusy && !legendBusy && actions.wasPressed('stanceNext' as Action),
        eye,
        dir: d,
        position: p.position,
        yawDeg: p.yawDeg,
        active: enabled,
        body,
        attackDirDeg: dec?.dirDeg ?? p.yawDeg,
        attackTarget: dec && dec.targetId !== null && list ? this.attack.targetCenter(list, dec.targetId) : null,
      });
      if (parryBusy) blade.dropBuffer?.();
      if (tech) primary = false;
      if (dec && bladeItem) {
        const bs = blade.state();
        if (bs.tech !== null && bs.frame === 1 && bs.move) this.attack.noteBlade(dec, bs.move.dirDeg, bs.move.tiltDeg);
      }
    }
    this.prevPrimaryRaw = primaryRaw;
    tools?.step(primaryRaw, eye, d, !c.gate?.blocksInput());
    this.punching = c.gate ? c.gate.primaryStep(primary, eye, d, tgt?.distance ?? null, dec ?? undefined) : false;
    this.attack.notePunch(c.gate?.punchDirDeg?.() ?? null, dec);
    // ＋マークの線で ブロックより手前に 妖怪 → ほらずに 空ぶり（M3 AC18・#34。刀は 上で わざに なる）
    this.yokaiBlocks = dec !== null && dec.use === 'whiff' && c.tgt() !== null;
    this.primary = primary;
    this.secondary = secondary;
  }
}
