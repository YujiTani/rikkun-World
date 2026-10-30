// main.ts の 流れ 5: 妖怪・小太刀・にわとりの 見た目。
import { bladeMidInto } from '../../fx/parryFx';
import { playParry } from '../../fx/parrySounds';
import { SlashFx } from '../../fx/slashFx';
import { NINJA_TUNING } from '../../craft/ninjaTuning';
import { Kodachi } from '../../combat/Kodachi';
import { SEA_Y, type CombatEvent } from '../../contracts';
import { ringSeen } from '../../animals/models/throwRing';
import { type KitIconRow, kitIconsFor } from '../../animals/models/kitIcons';
import { AnimalFx } from '../../fx/animalFx';
import { AnimalRenderer, ViewBuffer } from '../../animals/models/AnimalRenderer';
import { countryAt } from '../../world/gen/biome';
import { terrainFor } from '../../world/gen/terrain';
import { YokaiManager } from '../../yokai';
import { MachoMarks } from '../../ui/machoMarks';
import { FX_SETTINGS } from '../../fx/config';
import { playKodachi } from '../../fx/weaponSounds';
import type { WiredFighters } from './combat';
import type { WiredHouse } from './house';

export function wireYokai(deps: WiredFighters) {
  const {
    shared, world, time, controller, combat, inventory, drops, game, seed, harapanRoll, armor,
    strengthLevel, renderer, island, w2, legend, parry, parryFx, sparkAt, reducedMotionMq, fxSound, level,
  } = deps;
  shared.yokaiManager = new YokaiManager({
    world,
    time,
    getPlayer: () => controller.state,
    combat,
    inventory,
    drops,
    tick: () => game.tick + 1,
    seed,
    // COUNTRY-1 §3.3: 妖怪の 種類は その場所の 国の行で えらぶ
    countryOf: (x, z) => countryAt(seed, Math.floor(x), Math.floor(z)).kind,
    // MINE-1A §4.3: 地下に いる ＝ 足が 生成の 地形の 高さ（掘っても かわらない）より 6 マス 以上 下
    groundY: (x, z) => terrainFor(seed).height(Math.floor(x), Math.floor(z)),
    harapan: (y) => harapanRoll.yokai(y),
    armor, // NINJA-1: 忍び装束で 気づく 距離が 半分
    samurai: () => ({ book: shared.samuraiBook.got(), have: shared.samuraiHave() }), // SAMURAI-1 §4.2: ヌシの 表で 選べない 侍装備の 行を とばす
    strength: strengthLevel,
    light: renderer.light,
    // 出る場所は 描く輪の メッシュずみの列だけ（VOX-D）
    canSpawnAt: (x, z) => shared.streamHost?.stream.isDrawn(Math.floor(x) >> 4, Math.floor(z) >> 4) ?? true,
    // 場所の倍率 M の はじまりの場所・海面の高さは、世界の設定から読む（数を書きこまない）
    origin: () => island.spawn(),
    seaY: () => SEA_Y,
    settings: w2,
    // WEAPON-9: 弾は ドームの 球に ふれた ステップに 消える（音は 1 ステップに 1 つ）
    dome: () => legend.dome(),
    onDomeErase: (id) => {
      legend.emit({ type: 'domeErase', tick: game.tick, projectileId: id });
      shared.domeEraseThisStep = true;
    },
    // WEAPON-7: ヌシが レジェンダリーを おとした → 上の 帯の テロップ
    onLegendDrop: (info) => shared.celebrate.enqueueTelop(info.item),
    // WEAPON-5: 妖怪の 攻撃が 当たる所で パリィに 聞く
    parry: {
      hit: (h) => {
        const r = parry.hit({ dirDeg: h.dirDeg, yawDeg: controller.state.yawDeg, by: h.by, yokaiId: h.yokaiId, amount: h.amount });
        if (r.first) parryFx.spark(bladeMidInto(sparkAt, controller.state.position, controller.state.facingDeg), reducedMotionMq?.matches ?? false, controller.state.facingDeg);
        return { result: r.result, amount: r.amount };
      },
    },
    onParryEvent: (e) => {
      parry.note({ type: e.type, yokaiId: e.yokaiId, ...(e.by ? { by: e.by } : {}), ...(e.damage !== undefined ? { damage: e.damage } : {}) });
      if (e.type === 'staggerDouble') {
        shared.staggerIcons.burstAt(e.yokaiId);
        playParry(fxSound, 'staggerBreak');
      }
    },
    onDefeat: (kind, info) => {
      level.onDefeat(kind, info.xp);
      shared.onDefeatAch(kind);
    },
    // ぬりかべ: たおれこみでこわす・みず で石になる（くだけるつぶと音。fx はあとで作るので関数で包む）
    onBlocks: (cells, why) => {
      for (const c of cells) shared.fx.particles.burst({ x: c.x, y: c.y, z: c.z }, why === 'stone' ? c.to : c.from, FX_SETTINGS);
      fxSound.play('break');
    },
  });
  game.scene.add(shared.yokaiManager!.group);
  const yokaiM = shared.yokaiManager;
  shared.yokaiM = yokaiM;
  // NINJA-1 §4.3 忍びの手甲: 刀・素手の 当たりの あと、おくれて 小太刀の 追い打ち。絵は 今の 斬撃（slashFx）を 小さく 白く、音は 今の 切り上げの 音を 小さく 軽く
  // 追い打ちは くりかえす 行動なので 控えめ（画面は ゆらさない・止めない）。斬撃の 絵は 本人の 斬撃と ぶつからない よう もう 1 組 持つ
  const kodachiFx = new SlashFx(game.scene, game.camera);
  kodachiFx.warmUp(game.renderer, game.camera, game.scene);
  const kodachi = new Kodachi({
    armor,
    yokai: yokaiM,
    playerPos: () => ({ ...controller.state.position }),
    big: { damage: (part, amount, at, source) => shared.bigBossHandle?.damage?.(part, amount, at, source) ?? 0 },
    tick: () => game.tick,
    onFire: (info) => {
      playKodachi(fxSound);
      if (info.yokaiId === null) return;
      const y = yokaiM.list().find((q) => q.id === info.yokaiId);
      if (!y) return;
      const px = controller.state.position.x, pz = controller.state.position.z;
      const dx = y.position.x - px, dz = y.position.z - pz;
      const uDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
      // 追い打ちの 当たりと 同じ ステップに（delay 0）、妖怪の 中心の 高さで カメラ側の 手前に 小さく 白く（体に かくれない・遠ざけない）
      const T = NINJA_TUNING;
      kodachiFx.queueSlash({
        tech: 'kiriage',
        step: 1,
        uDeg,
        pos: () => y.position,
        reach: T.tekkoSlashReach,
        delay: 0,
        back: 0,
        center: () => {
          const c = game.camera.position;
          const vx = c.x - y.position.x, vz = c.z - y.position.z;
          const vl = Math.hypot(vx, vz) || 1;
          return { x: y.position.x + (vx / vl) * T.tekkoSlashFront, y: y.position.y + T.tekkoSlashHeight, z: y.position.z + (vz / vl) * T.tekkoSlashFront };
        },
      });
    },
  });
  let kodachiHookBuf: CombatEvent[] = [];
  return { yokaiM, kodachiFx, kodachi, kodachiHookBuf };
}

export type WiredYokai = WiredFighters & ReturnType<typeof wireYokai>;

export function wireAnimalView(deps: WiredHouse) {
  const {
    shared, fxSound, live, seed, controller, animals, hud, game, lighting, dig, world, rig, inventory,
    blade, tools,
  } = deps;
  // LIVE-1: にわとり の 見た目・音（動きの強さの 設定は まだ ない。できたら ここで つなぐ）
  const animalMotion = (): number => 1;
  const animalFx = new AnimalFx({ sound: fxSound, motion: animalMotion, lookDist: () => live.animalLookDist, fullTicks: () => live.animalFullTicks, seed });
  const animalRenderer = new AnimalRenderer({ fx: animalFx, motion: animalMotion, player: () => controller.state.position, source: animals });
  const animalViews = new ViewBuffer();
  // LIVE-4: マッチョ の「！」と、ねらって いる 妖怪 の 上 の 顔（HTML）
  const machoMarks = new MachoMarks(hud);
  const machoMarkIn: import('../../ui/machoMarks').MachoMarkInput = { bang: null, face: null };
  const animalEvents: import('../../contracts').AnimalEvent[] = [];
  game.scene.add(animalRenderer.group);
  lighting.register(animalRenderer.bodyMaterial, 'doll');
  /** A の出来事を 1 回だけ 取り出して、B（音・つぶ）と C（実績・合図）に 同じ物を流す。窓口 events() 用にも ためる */
  function deliverAnimalEvents(): void {
    const ev = animals.events();
    if (ev.length === 0) return;
    // はじめての お祝いの あと: A の carryHint 出来事を、ほかの 合図と 同じ hint 出来事に する
    for (let i = 0; i < ev.length; i++) {
      if (ev[i].type === 'carryHint') ev[i] = { type: 'hint', hint: 'carryHint' };
    }
    animalFx.onEvents(ev);
    shared.animalHint.feed(ev);
    shared.natsukiPanel.onEvents(ev, dig.animalTarget());
    shared.achievements.feedAnimals(ev);
    // LIVE-3: 持ち物 に 入った なま もも にく を 拾った ログ に（足もと に おちた 分 は おとしもの として 拾った とき に）
    for (const e of ev) if (e.type === 'meat' && e.count - e.dropped > 0) shared.onDropPicked('momo_nama', e.count - e.dropped, false);
    for (const e of ev) animalEvents.push(e);
    if (animalEvents.length > 512) animalEvents.splice(0, animalEvents.length - 512);
  }
  /** こたつ の 天板 の 3 わく（描く のも 窓口 fx().kitIcons も 同じ 物） */
  function currentKitRows(): KitIconRow[] {
    const aim = dig.aimedKit();
    const rows = animals.kits() as unknown as Array<{ x: number; y: number; z: number; size?: 1 | 2; eggs: Array<{ egg: 'egg' | 'gold'; left: number }> }>;
    if (aim.kit && aim.holdingEgg && !rows.some((k) => k.x === aim.kit!.x && k.y === aim.kit!.y && k.z === aim.kit!.z) && String(world.getBlock(aim.kit.x, aim.kit.y, aim.kit.z)) === 'nukunuku') {
      rows.push({ x: aim.kit.x, y: aim.kit.y, z: aim.kit.z, size: world.getBlock(aim.kit.x + 1, aim.kit.y, aim.kit.z) === 'nukunuku_e' ? 2 : 1, eggs: [] });
    }
    const p = controller.state.position;
    return kitIconsFor(rows, { eye: { x: p.x, z: p.z }, total: live.kitHatchTicks, aim: aim.kit ? { x: aim.kit.x, z: aim.kit.z, holdingEgg: aim.holdingEgg } : null });
  }
  game.onBeforeRender(() => {
    animalRenderer.setKitIcons(currentKitRows());
    const throwAim = dig.throwAim();
    const throwSpot = animals.throwSpot(throwAim);
    // 丸 は さく・もん の 板 ごし でも 見せる（目 から 丸 への 線 が 地形 に ふさがれて いない とき だけ）
    animalRenderer.setThrowSpot(
      throwSpot,
      throwSpot !== null &&
        ringSeen((x, y, z) => {
          const id = String(world.getBlock(x, y, z));
          return world.isSolid(x, y, z) && id !== 'toriya_fence' && id !== 'toriya_gate';
        }, throwAim.eye, throwSpot),
    );
    animalRenderer.setCoopGhost(dig.coopGhost());
    animalRenderer.setKitGhost(dig.kotatsuGhost());
    animalRenderer.update(animalViews.fill(animals), game.camera);
  });
  rig.setHeldProvider(() => inventory.held()?.item ?? null);
  rig.setWeaponSource({ blade: () => blade.state(), bowPose: () => tools.bow().pose() });
  return {
    animalFx, animalViews, machoMarks, machoMarkIn, animalEvents, deliverAnimalEvents, currentKitRows,
  };
}

export type WiredAnimalView = WiredHouse & ReturnType<typeof wireAnimalView>;
