// main.ts の 流れ 9 の つづき: 2P の あそび（COOP-1 作業 3a。docs/design/COOP-1.md §2.5・§2.6・§9.5）。
// 2P の ほる・おく・こうげき・ハート・たおれて もどる・けいけんち。歩く・カメラ・えらびは wire/duo.ts。
// 2P が 参加する たびに 一式を 作り、やめる たびに 片づける（倒れたまま やめても 次は 元気）。
import type * as THREE from 'three';
import type { PlayerCombatImpl as PlayerCombatT } from '../../combat';
import { PlayerCombatImpl } from '../../combat';
import { createCombatConfig } from '../../combat/config';
import type { DigSystemImpl } from '../../dig/DigSystem';
import type { DigFx } from '../../fx/DigFx';
import type { ActionState } from '../../input/actions';
import type { PlayerController } from '../../player/PlayerController';
import { ToolSystemImpl } from '../../tools';
import { createBladeSystem } from '../../tools/blade/BladeSystem';
import { createWeaponDamage } from '../../tools/blade/weaponDamage';
import type { YokaiPartner } from '../../yokai/ai/target';
import { queueKodachiSlash } from '../../fx/kodachiSlash';
import { createRng } from '../../world/gen/random';
import type { DuoHud } from '../../ui/duoHud';
import type { LockStatus, Inventory, Vec3 } from '../../contracts';
import type { GetaPlayer } from '../../craft/geta';
import type { BladeSystem, CraftSystem } from '../../contracts';
import { bindWho } from '../../duo/credit';
import { createP2Dig } from '../../duo/p2Dig';
import { createP2DigFx } from '../../duo/p2DigFx';
import { createP2Kodachi, type P2Kodachi } from '../../duo/p2Kodachi';
import { createP2Partner } from '../../duo/p2Partner';
import { createP2Wear } from '../../duo/p2Wear';
import { createP2Sounds, type P2Sounds } from '../../duo/p2Sounds';
import { P2Life } from '../../duo/p2Life';
import { sampleStacks } from '../../duo/sample';
import { ALL_RECIPES } from '../../craft/recipes';
import { ITEM_TYPES, itemType } from '../../inventory/items';
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
  /** 2P の 向きを この 角度（度。+ が 右）だけ 回す（次の ステップの 2P の カメラへ。`duo.aimAt(2, …)` が 向きを 変える ため。毎ステップ 向きは カメラから もどされる） */
  lookBy: (deg: number) => void;
  /** 2P の カメラ（小太刀の 斬撃の 向きに 使う。1P の game.camera ではない） */
  camera2: () => { position: Vec3 };
  /** 2P が 出る 所（1P の 横） */
  joinSpot: () => DuoVec3;
  dev: boolean;
  /** COOP-1 4c: 2P が かまど（ZL）・たんす（Y か ZL）を ねらって 開いた。2P の 画面の ページを 開く */
  openFurnace: (x: number, y: number, z: number) => void;
  openTansu: (x: number, y: number, z: number) => void;
  /** COOP-1 4c: 2P の つくる（2P が かまどを こわした とき 中身は こわした 人 = 2P の もちものへ。参加している あいだだけ 呼ぶ） */
  craft2: () => Pick<CraftSystem, 'furnaceBroken'>;
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
  /** 2P の 道具・そうびの へった／こわれた の 音・お知らせ・かけら（COOP-1 4b） */
  wear: { step(): void };
  /** 忍びの 手甲の 小太刀の 追い打ち（2P の そうびを 見る。1P の 追い打ちとは 別） */
  kodachi: P2Kodachi;
}

/** 2P の 手もと（足もと + 1。毎回 同じ 入れものに 書く。1P の WeaponFx.handPos と 同じ 高さ） */
const handScratch: Vec3 = { x: 0, y: 0, z: 0 };
function handAt(p: Vec3): Vec3 {
  handScratch.x = p.x;
  handScratch.y = p.y + 1;
  handScratch.z = p.z;
  return handScratch;
}

export function wireDuoPlay(c: DuoPlayCtx) {
  const { deps, ui } = c;
  const { shared, game, world, controller, w2, seed, toolConfig, digCfg, drops, fxSound, craft, storage, dig: dig1, combat: combat1, weaponFx, kodachiFx } = deps;
  const p2 = shared.p2;
  // 2P の そうびの たいきゅうの 設定と 時計を 本物に（1P の armor と 同じ。COOP-1 4b）
  shared.p2Wear.settings = () => w2;
  shared.p2Wear.tick = () => game.tick;
  const dev = c.dev;
  let live: Live | null = null;

  shared.duoMate = () => live?.mate ?? null;
  shared.duoDropMate = () => pickableMate(live?.mate ?? null, live?.life.down ?? false);
  shared.duoYokai = () => live?.yokai ?? null;
  shared.p2LoadReset = () => live?.kodachi.clear(); // セーブを 読んだ とき 前の 世界の 妖怪 id に 追い打ちが 当たらない ように
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
      // 刀の 強さは 1P と 同じ 部品（侍の 手甲は 2P の そうび）
      weaponDamage: createWeaponDamage({ settings: w2, base: toolConfig.weaponDamage, held: () => p2.inventory.held(), armor: p2.armor }),
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
      armor: p2.armor, // 2P の そうび（ふせぐ・こわれる・羽織・袋。1P と 同じ 部品）
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
      onOpenFurnace: c.openFurnace,
      onOpenTansu: c.openTansu,
      gate: combat,
      config: digCfg,
      rng: createRng(20240602),
      m4: {
        tools,
        blade,
        w2,
        yokai: yokai2,
        // かまどを こわした 中身は こわした 人（2P）の もちものへ（4c）。開く 口は onOpenFurnace に つなぐので ここは 空
        craft: { isFurnace: (x, y, z) => craft.isFurnace(x, y, z), openFurnace: () => {}, furnaceBroken: (x, y, z) => c.craft2().furnaceBroken(x, y, z), fixedDrop: (id) => craft.fixedDrop(id) },
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
    // 妖怪から 見た 2P（ダメージの 種類〔火の玉 'ball'〕と 2P の そうびも 伝える）
    const yokai: YokaiPartner = createP2Partner({
      position: () => ctl.state.position,
      targetable: () => c.joined() && !life.down && c.padPresent(),
      life,
      armor: p2.armor,
    });
    const wear = createP2Wear({
      inventory: p2.inventory,
      armor: p2.armor,
      sound: fxSound,
      notice: ui.wearNotice,
      nameOf: (item) => itemType(item)?.name ?? item,
      handPos: () => handAt(ctl.state.position),
      burst: (at, item) => weaponFx.breakShards(at, item),
    });
    const kodachi = createP2Kodachi({
      armor: p2.armor,
      yokai: shared.yokaiManager!,
      playerPos: () => ctl.state.position,
      sound: fxSound,
      tick: () => game.tick,
      onFire: (info) => {
        if (info.yokaiId !== null) queueKodachiSlash(kodachiFx, c.camera2(), shared.yokaiManager!, ctl.state.position, info.yokaiId);
      },
    });
    const walkBody: GetaPlayer = { running: false, onGround: false, inWater: false, velocity: ctl.state.velocity };
    const ground = () => world.getBlock(Math.floor(ctl.state.position.x), Math.floor(ctl.state.position.y - 0.05), Math.floor(ctl.state.position.z));
    return { combat, life, dig, fx, tools, blade, sounds: createP2Sounds(fxSound, p2.armor), walkBody, ground, mate, yokai, wear, kodachi };
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
    // 小太刀の 追い打ちは 先に 1 ステップ すすめ、このステップの 当たりは あとで 入れる（当てた ステップを 0 に する ため。1P と 同じ 順）
    l.kodachi.step();
    l.dig.update();
    l.life.step();
    // 2P の 音（1P と 同じ 音・同じ 大きさ。距離で 小さく しない。COOP-1 3c）。出来事は 毎ステップ 取り出す（たまり続けない ように）
    const combatEvents = l.combat.drainEvents();
    l.sounds.combat(combatEvents);
    l.kodachi.combat(combatEvents);
    l.combat.takeHookEvents();
    l.sounds.swings(l.tools.drainSwings(), p2.inventory.held()?.item ?? null);
    l.sounds.arrows(l.tools.drainArrowEvents());
    const bladeEvents = l.blade.drainEvents();
    l.sounds.blade(bladeEvents);
    l.kodachi.blade(bladeEvents);
    l.kodachi.drainEvents(); // 追い打ちの 出来事は たまり続けない ように 毎ステップ 取り出す（2P の 分は テストの 窓口に 出さない）
    l.wear.step(); // 2P の 道具・そうびの へった／こわれた（音・お知らせ・かけら）。出来事は 毎ステップ 空に する
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
    ui.updateArmor(p2.armor.snapshot().hudIcons); // ハートの 右の 防具の 絵（1P の step.ts と 同じ）
    ui.stepWear();
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
      const yaw = Math.atan2(dx, -dz) / DEG;
      // 2P の 向き（yaw）は 毎ステップ 2P の カメラから もどされる ので、カメラも 同じ だけ 回す（ctl.set だけだと 次の ステップで 消える）
      if (who === 2) c.lookBy((((yaw - ctl.state.yawDeg + 180) % 360) + 360) % 360 - 180);
      ctl.set({ yawDeg: yaw, pitchDeg: Math.asin(dy / len) / DEG });
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
    sample(who) {
      const inv = invOf(who);
      if (!dev || !inv) return;
      inv.clear();
      sampleStacks(ITEM_TYPES, ALL_RECIPES, inv.size).forEach((s, i) => inv.setSlot(i, s));
      inv.select(0);
    },
    count: (who, item) => invOf(who)?.count(item) ?? 0,
    armor: (who) => (who === 1 ? deps.armor.snapshot() : live ? p2.armor.snapshot() : null),
    equip(who, head, body, arms = null, legs = null) {
      if (!dev) return;
      if (who === 1) deps.armor.set(head, body, arms, legs);
      else if (live) p2.armor.set(head, body, arms, legs);
    },
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
    /** 2P が たんすを ねらって Y（1P の E と 同じ）。開いたら true（かまどを ねらった Y は false＝「もちもの」の ページ） */
    tryOpenTansu: (): boolean => live?.dig.tryOpenAimedStorage() ?? false,
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
