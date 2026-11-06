// main.ts の 流れ 9 の つづき: 2P の あそび（COOP-1 作業 3a。docs/design/COOP-1.md §2.5・§2.6・§9.5）。
// 2P の ほる・おく・こうげき・ハート・たおれて もどる・けいけんち。歩く・カメラ・えらびは wire/duo.ts。
// 2P が 参加する たびに 一式を 作り、やめる たびに 片づける（倒れたまま やめても 次は 元気）。
import type * as THREE from 'three';
import type { PlayerCombatImpl as PlayerCombatT } from '../../combat';
import { PlayerCombatImpl } from '../../combat';
import { createCombatConfig } from '../../combat/config';
import type { DigSystemImpl } from '../../dig/DigSystem';
import type { DigFx } from '../../fx/DigFx';
import { legendPowerOf } from '../../legend/defs';
import type { ActionState } from '../../input/actions';
import type { PlayerController } from '../../player/PlayerController';
import { ToolSystemImpl } from '../../tools';
import { createBladeSystem } from '../../tools/blade/BladeSystem';
import type { YokaiPartner } from '../../yokai/ai/target';
import { createRng } from '../../world/gen/random';
import type { DuoHud } from '../../ui/duoHud';
import type { LockStatus, Inventory, Vec3 } from '../../contracts';
import type { GetaPlayer } from '../../craft/geta';
import type { BladeSystem } from '../../contracts';
import { bindWho } from '../../duo/credit';
import { createP2Dig } from '../../duo/p2Dig';
import { createP2DigFx } from '../../duo/p2DigFx';
import { createP2Sounds, type P2Sounds } from '../../duo/p2Sounds';
import { P2Life } from '../../duo/p2Life';
import { pickableMate } from '../../duo/rules';
import { DUO_TUNING } from '../../duo/tuning';
import type { DuoPlayHook, DuoVec3 } from '../../duo/types';
import type { WiredLoop } from './save';

const DEG = Math.PI / 180;

export interface DuoPlayCtx {
  deps: WiredLoop;
  ui: DuoHud;
  /** 2P の 入力 */
  actions: ActionState;
  /** 2P の 入力が 通る か（もちもの画面が 開いていない・倒れていない） */
  lock: LockStatus;
  /** 参加している あいだの 2P の 体（参加前は 呼ばない） */
  ctl2: () => PlayerController;
  joined: () => boolean;
  /** 2P の パッドが ささっているか */
  padPresent: () => boolean;
  /** 2P が 出る 所（1P の 横） */
  joinSpot: () => DuoVec3;
  dev: boolean;
}

/** 参加の あいだ だけ ある 一式 */
interface Live {
  combat: PlayerCombatT;
  life: P2Life;
  dig: DigSystemImpl;
  fx: DigFx;
  tools: ToolSystemImpl;
  blade: Pick<BladeSystem, 'drainEvents'>;
  /** 2P の 音（足音・こうげき・刀と 弓。COOP-1 3c） */
  sounds: P2Sounds;
  /** 足音に わたす 体の ようす（使いまわす。毎ステップ new しない） */
  walkBody: GetaPlayer;
  /** 2P の 足もとの ブロック id */
  ground: () => string;
  mate: { readonly position: Vec3; readonly inventory: Inventory };
  yokai: YokaiPartner;
}

export function wireDuoPlay(c: DuoPlayCtx) {
  const { deps, ui } = c;
  const { shared, game, world, controller, w2, seed, toolConfig, digCfg, drops, fxSound, craft, storage, dig: dig1, combat: combat1 } = deps;
  const p2 = shared.p2;
  const dev = c.dev;
  let live: Live | null = null;

  shared.duoMate = () => live?.mate ?? null;
  shared.duoDropMate = () => pickableMate(live?.mate ?? null, live?.life.down ?? false);
  shared.duoYokai = () => live?.yokai ?? null;
  shared.p2LevelUp = () => live?.life.fill();
  shared.p2Hp = () => live?.life.hp ?? 0;

  function build(): Live {
    const ctl = c.ctl2();
    let y2: ReturnType<typeof bindWho> | null = null;
    const yokai2 = () => (y2 ??= bindWho(shared.yokaiManager!, 2));
    const tools = new ToolSystemImpl({ inventory: p2.inventory, world, player: () => ctl.state, yokai: yokai2, base: { dig: digCfg, combat: createCombatConfig() }, config: toolConfig, settings: w2 });
    const blade = createBladeSystem({
      world,
      yokai: yokai2,
      settings: w2,
      weaponDamage: (item) => legendPowerOf(w2, item, p2.inventory.held()?.power ?? null) ?? toolConfig.weaponDamage[item] ?? 1,
      onHit: () => {
        p2.inventory.wearHeld(w2.toolWear.blade.hit);
      },
      lunge: (dx, dz) => ctl.lunge(dx, dz),
      tick: () => game.tick,
    });
    // 2P の 体力の 持ち主（1P と 同じ 道。やられた 画面・音は 1P に つながない）
    const combat = new PlayerCombatImpl({
      config: { ...createCombatConfig(), respawnDelayTicks: DUO_TUNING.p2ReturnSteps },
      tool: tools,
      world,
      player: { get: () => ctl.state, set: (v) => ctl.set(v) },
      inventory: p2.inventory,
      yokai: yokai2,
      spawn: () => ({ ...c.joinSpot(), yawDeg: controller.state.yawDeg, pitchDeg: 0 }),
      drops,
      tickDrops: false,
      settings: w2,
      rng: createRng(seed ^ 0x2b2b),
      requestSave: () => shared.requestSave(),
    });
    // 倒れた 場所(AC44 の 待ちで ずれないように とめる)
    let downPos: Vec3 | null = null;
    const life = new P2Life({
      combat,
      p1Down: () => combat1.dead(),
      onDown: () => {
        downPos = { ...ctl.state.position };
      },
      onWait: () => {
        if (downPos) ctl.set({ position: { ...downPos }, velocity: { x: 0, y: 0, z: 0 } });
      },
    });
    const dig = createP2Dig({
      world,
      p2,
      actions: c.actions,
      position: () => ctl.state,
      lock: c.lock,
      eyeHeight: () => ctl.settings.eyeHeight,
      partner: () => controller.state.position,
      gate: combat,
      config: digCfg,
      rng: createRng(20240602),
      m4: {
        tools,
        blade,
        w2,
        yokai: yokai2,
        craft: { isFurnace: (x, y, z) => craft.isFurnace(x, y, z), openFurnace: () => {}, furnaceBroken: (x, y, z) => craft.furnaceBroken(x, y, z), fixedDrop: (id) => craft.fixedDrop(id) },
        storage,
        scatterItem: (pos, item, count) => {
          drops.scatter(pos, [{ item, count }]);
        },
        nowTick: () => game.tick,
      },
    });
    const fx = createP2DigFx({ scene: game.scene as THREE.Scene, dig, sound: fxSound, hideBlockFocus: () => dig.aimedYokaiId() !== null });
    const mate = {
      get position() {
        return ctl.state.position;
      },
      inventory: p2.inventory,
    };
    const yokai: YokaiPartner = {
      get position() {
        return ctl.state.position;
      },
      get targetable() {
        return c.joined() && !life.down && c.padPresent();
      },
      // 火の玉などの ダメージの 種類(kind)は 妖怪の 種類として わたす
      // TODO(COOP-1 段階 2・2P の そうび): DamageKind の ball が ここに 伝わらない。そうびを 持たせる ときに 直す
      hurt: (amount, kind, from) => life.damage(amount, { type: 'yokai', kind, from }).applied > 0,
    };
    const walkBody: GetaPlayer = { running: false, onGround: false, inWater: false, velocity: ctl.state.velocity };
    const ground = () => world.getBlock(Math.floor(ctl.state.position.x), Math.floor(ctl.state.position.y - 0.05), Math.floor(ctl.state.position.z));
    return { combat, life, dig, fx, tools, blade, sounds: createP2Sounds(fxSound), walkBody, ground, mate, yokai };
  }

  /** 2P の 足音。1P の step.ts と 同じ 決まり: 遊び画面が 開いて いない・やられて いない・ひるんで いない ときだけ 歩く */
  function stepFoot(l: Live): void {
    const s = c.ctl2().state;
    const walking = c.lock.playInputEnabled() && !l.combat.dead() && !l.combat.flinching();
    const b = l.walkBody;
    b.running = walking && s.running;
    b.onGround = walking && s.onGround;
    b.inWater = s.inWater;
    b.velocity = s.velocity;
    l.sounds.step(b, l.ground);
  }

  /** 毎ステップ（2P の 体を 動かした あと） */
  function step(dt: number): void {
    const l = live;
    if (!l) return;
    l.dig.update();
    l.life.step();
    // 2P の 音（1P と 同じ 音・同じ 大きさ。距離で 小さく しない。COOP-1 3c）。出来事は 毎ステップ 取り出す（たまり続けない ように）
    l.sounds.combat(l.combat.drainEvents());
    l.combat.takeHookEvents();
    l.sounds.swings(l.tools.drainSwings(), p2.inventory.held()?.item ?? null);
    l.sounds.arrows(l.tools.drainArrowEvents());
    l.sounds.blade(l.blade.drainEvents());
    stepFoot(l);
    l.tools.takeHookEvents();
    // 2P の レベルアップは 2P の 半分にだけ 出す（1P の 演出・ログ・実績は 1P の level が 受け持つ。実績は creatures の feedDefeat で 共有）
    let up = false;
    for (const e of p2.levels.drainEvents()) {
      if (e.type === 'levelUp') up = true;
    }
    if (up) fxSound.play('levelUp');
    p2.levels.takeHookEvents();
    l.fx.update(dt);
    ui.updateLife(dt, l.combat.hp(), l.combat.invincibleTicks() > 0, l.life.down);
    ui.updateLevel(dt, p2.levels.get(), up);
  }

  const invOf = (who: 1 | 2): Inventory | null => (who === 1 ? deps.inventory : live ? p2.inventory : null);
  const ctlOf = (who: 1 | 2): PlayerController | null => (who === 1 ? controller : live ? c.ctl2() : null);

  const hook: DuoPlayHook = {
    aimAt(who, cell) {
      const ctl = ctlOf(who);
      if (!dev || !ctl) return;
      const p = ctl.state.position;
      const dx = cell.x + 0.5 - p.x;
      const dy = cell.y + 0.5 - (p.y + ctl.settings.eyeHeight);
      const dz = cell.z + 0.5 - p.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      ctl.set({ yawDeg: Math.atan2(dx, -dz) / DEG, pitchDeg: Math.asin(dy / len) / DEG });
    },
    target(who) {
      const t = who === 1 ? dig1.target() : (live?.dig.target() ?? null);
      return t ? { block: { ...t.block }, place: { ...t.place }, id: t.id } : null;
    },
    frame(who) {
      const fx = who === 1 ? shared.fx : live?.fx;
      if (!fx) return { visible: false, color: '' };
      const mat = fx.outline.mesh.material as THREE.MeshBasicMaterial;
      return { visible: fx.outline.mesh.visible, color: `#${mat.color.getHexString()}` };
    },
    give(who, item, count) {
      const inv = invOf(who);
      if (!dev || !inv) return;
      inv.setSlot(0, { item, count });
      inv.select(0);
    },
    count: (who, item) => invOf(who)?.count(item) ?? 0,
    hearts(who) {
      if (who === 1) return { hp: combat1.hp(), maxHp: combat1.maxHp(), down: combat1.dead() };
      return live ? { hp: live.life.hp, maxHp: live.life.maxHp, down: live.life.down } : { hp: 0, maxHp: 0, down: false };
    },
    level: (who) => (who === 1 ? deps.level.get() : live ? p2.levels.get() : null),
    setLevel(who, level, xp = 0) {
      if (!dev) return;
      (who === 1 ? deps.level : p2.levels).set(level, xp);
    },
    addXp(who, amount) {
      if (!dev) return;
      (who === 1 ? deps.level : p2.levels).addXp(amount);
    },
    hurt(who, amount) {
      if (!dev) return;
      if (who === 1) combat1.debugDamage(amount);
      else live?.life.damage(amount, { type: 'yokai' });
    },
  };

  return {
    hook,
    step,
    /** 倒れている あいだ true（2P の 入力を ぜんぶ はなす） */
    down: (): boolean => live?.life.down ?? false,
    onJoin(): void {
      live?.fx.dispose();
      live = build();
    },
    onLeave(): void {
      live?.fx.dispose();
      live = null;
    },
  };
}
