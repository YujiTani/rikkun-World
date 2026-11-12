// main.ts の 流れ 5: 妖怪・小太刀・にわとりの 見た目。
import { bladeMidInto } from '../../fx/parryFx';
import { playParry } from '../../fx/parrySounds';
import { SlashFx } from '../../fx/slashFx';
import { Kodachi } from '../../combat/Kodachi';
import { SEA_Y, type CombatEvent } from '../../contracts';
import { ringSeen } from '../../animals/models/throwRing';
import { type KitIconRow, kitIconsFor } from '../../animals/models/kitIcons';
import { AnimalFx } from '../../fx/animalFx';
import { AnimalRenderer, ViewBuffer } from '../../animals/models/AnimalRenderer';
import { countryAt } from '../../world/gen/biome';
import { groundHeightAt } from '../../world/gen/terrain';
import { YokaiManager } from '../../yokai';
import { creditDefeat, type CreditDeps } from '../../duo/credit';
import { createParryEventSink, createParryPort } from '../../duo/p2Parry';
import { MachoMarks } from '../../ui/machoMarks';
import { FX_SETTINGS } from '../../fx/config';
import { impactOf } from '../../fx/impact';
import { queueKodachiSlash } from '../../fx/kodachiSlash';
import { playKodachi } from '../../fx/weaponSounds';
import type { WiredFighters } from './combat';
import type { WiredHouse } from './house';
import { emptyKitSize } from './coopMenuView';

export function wireYokai(deps: WiredFighters) {
  const {
    shared, world, time, controller, combat, inventory, drops, game, seed, harapanRoll, armor,
    strengthLevel, renderer, island, w2, legend, parry, parryFx, sparkAt, reducedMotionMq, fxSound, level,
  } = deps;
  const credit: CreditDeps = { level1: level, level2: shared.p2.levels, feedDefeat: (who, kind) => shared.onDefeatAch(kind, who) };
  // COOP-1 4d-1: 妖怪の 攻撃は ねらっている 人の パリィに 聞く。1P の 側は 今の 中身（1P の parry・向き・火花）を そのまま 包む。2P の 側は 参加している あいだ だけ（いなければ 受けない）
  const side1 = {
    hit: (h: { by: 'attack' | 'fireball'; yokaiId: number | null; dirDeg: number | null; amount: number }) => {
      const r = parry.hit({ dirDeg: h.dirDeg, yawDeg: controller.state.yawDeg, by: h.by, yokaiId: h.yokaiId, amount: h.amount });
      if (r.first) parryFx.spark(bladeMidInto(sparkAt, controller.state.position, controller.state.facingDeg), reducedMotionMq?.matches ?? false, controller.state.facingDeg);
      return { result: r.result, amount: r.amount };
    },
  };
  const parrySide = (who: 1 | 2) => (who === 1 ? side1 : shared.p2Parry());
  const parryNote = createParryEventSink((who) => (who === 1 ? parry : shared.p2Parry()));
  const domeList: ({ x: number; y: number; z: number; r: number } | null)[] = [null, null];
  shared.yokaiManager = new YokaiManager({
    world,
    time,
    getPlayer: () => controller.state,
    partner: () => shared.duoYokai(),
    combat,
    inventory,
    drops,
    tick: () => game.tick + 1,
    seed,
    // COUNTRY-1 §3.3: 妖怪の 種類は その場所の 国の行で えらぶ
    countryOf: (x, z) => countryAt(seed, Math.floor(x), Math.floor(z)).kind,
    // MINE-1A §4.3: 地下に いる ＝ 足が 生成の 地形の 高さ（掘っても かわらない）より 6 マス 以上 下
    groundY: (x, z) => groundHeightAt(seed, x, z),
    harapan: (y) => harapanRoll.yokai(y),
    armor, // NINJA-1: 忍び装束で 気づく 距離が 半分
    samurai: () => ({ book: shared.samuraiBook.got(), have: shared.samuraiHave() }), // SAMURAI-1 §4.2: ヌシの 表で 選べない 侍装備の 行を とばす
    strength: strengthLevel,
    // MINE-1D §4.3: ほたるの ほらあなの 床には 出ない
    // MINE-1F: やかたの 中〔挑戦の 間の ほか も〕にも 出ない
    noSpawnAt: (x, y, z) => deps.shafts.caveKindAt(x, y, z) === 'hotaru' || deps.shafts.yakataAt(x, y, z),
    quietFor: (who) => shared.yakataQuiet(who), // MINE-1F §4.5: 挑戦の 間は その 人の まわりに 自動で 出ない
    protectAt: (x, y, z) => shared.yakataLocked(x, y, z), // MINE-1F §4.3: ぬりかべの たおれこみで やかたの ブロックを こわさない
    light: renderer.light,
    // 出る場所は 描く輪の メッシュずみの列だけ（VOX-D）
    // HOUSE-1C §4.6: 建築中の 家の まわり 16 マスには 湧かない（建築中の 家だけを 見る。世界は 読まない）
    canSpawnAt: (x, z) => (shared.streamHost?.stream.isDrawn(Math.floor(x) >> 4, Math.floor(z) >> 4) ?? true) && !(shared.house?.build.builder.noSpawn(x, z) ?? false),
    // 場所の倍率 M の はじまりの場所・海面の高さは、世界の設定から読む（数を書きこまない）
    origin: () => island.spawn(),
    seaY: () => SEA_Y,
    settings: w2,
    // WEAPON-9: 弾は ドームの 球に ふれた ステップに 消える（音は 1 ステップに 1 つ）
    // COOP-1 4d-2: 2P の ドームも 弾を 消す（0 番目 = 1P、1 番目 = 2P。2P が いなければ null）。音は 1 ステップに 1 つ（旗は 1P と 共通）
    dome: () => legend.dome(),
    domes: () => {
      domeList[0] = shared.legendFor(1)?.dome() ?? null;
      domeList[1] = shared.legendFor(2)?.dome() ?? null;
      return domeList;
    },
    onDomeErase: (id, who) => {
      (shared.legendFor(who) ?? legend).emit({ type: 'domeErase', tick: game.tick, projectileId: id });
      shared.domeEraseThisStep = true;
    },
    // WEAPON-7: ヌシが レジェンダリーを おとした → 上の 帯の テロップ
    onLegendDrop: (info) => shared.celebrate.enqueueTelop(info.item),
    // WEAPON-5: 妖怪の 攻撃が 当たる所で パリィに 聞く
    parry: createParryPort(parrySide),
    onParryEvent: (e, who) => {
      parryNote(e, who); // ねらわれた 人の パリィの 出来事の 列に だけ（1P の 列に 2P の ひるみを まぜない）
      if (e.type === 'staggerDouble') {
        shared.staggerIcons.burstAt(e.yokaiId);
        playParry(fxSound, 'staggerBreak');
      }
    },
    // COOP-1 3a: さいごの 1 発を 当てた 人の けいけんちに だけ 入る。実績は 2 人で 1 つ
    onDefeat: (kind, info) => {
      creditDefeat(credit, info.who, kind, info.xp);
      // COOP-1 4d-0: 2 人の ときの たおした 手ごたえ（止め・ゆれ）は たおした 人の 半分だけ。1 人の ときは combatFx の onDefeat（今の まま）
      if (shared.duoJoined()) shared.impactFor(info.who).hit(impactOf({ kind: 'defeat' }));
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
      queueKodachiSlash(kodachiFx, game.camera, yokaiM, controller.state.position, info.yokaiId);
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
    shared.p2Animals()?.feed(ev); // COOP-1 5c: 2P の 合図・パネルの 動き（by: 2 の 物だけ。出来事は 1 回だけ 取り出して 配る）
    shared.achievements.feedAnimals(ev);
    // LIVE-3: 持ち物 に 入った なま もも にく を 拾った ログ に（足もと に おちた 分 は おとしもの として 拾った とき に）。2P の 分は 2P の 知らせへ
    for (const e of ev) {
      if (e.type !== 'meat' || e.count - e.dropped <= 0) continue;
      if (e.by === 2) shared.p2DropPicked('momo_nama', e.count - e.dropped, false);
      else shared.onDropPicked('momo_nama', e.count - e.dropped, false);
    }
    for (const e of ev) animalEvents.push(e);
    if (animalEvents.length > 512) animalEvents.splice(0, animalEvents.length - 512);
  }
  /** こたつ の 天板 の 3 わく（描く のも 窓口 fx().kitIcons も 同じ 物） */
  function currentKitRows(): KitIconRow[] {
    const aim = dig.aimedKit();
    const rows = animals.kits() as unknown as Array<{ x: number; y: number; z: number; size?: 1 | 2; eggs: Array<{ egg: 'egg' | 'gold'; left: number }> }>;
    const emptySize = aim.kit && aim.holdingEgg && !rows.some((k) => k.x === aim.kit!.x && k.y === aim.kit!.y && k.z === aim.kit!.z) ? emptyKitSize(world, aim.kit) : null;
    if (aim.kit && emptySize !== null) rows.push({ x: aim.kit.x, y: aim.kit.y, z: aim.kit.z, size: emptySize, eggs: [] });
    const p = controller.state.position;
    const k2 = shared.p2Animals()?.kitAim(); // COOP-1 5c: 2P の 目と ねらい（2P が いなければ 1 人の ときと 同じ）
    return kitIconsFor(rows, { eye: { x: p.x, z: p.z }, total: live.kitHatchTicks, aim: aim.kit ? { x: aim.kit.x, z: aim.kit.z, holdingEgg: aim.holdingEgg } : null, eye2: k2?.eye ?? null, aim2: k2?.aim ?? null });
  }
  const throwSpots: (ReturnType<typeof animals.throwSpot>)[] = [null, null];
  game.onBeforeRender(() => {
    animalRenderer.setKitIcons(currentKitRows());
    const throwAim = dig.throwAim();
    const throwSpot = animals.throwSpot(throwAim);
    // 丸 は さく・もん の 板 ごし でも 見せる（目 から 丸 への 線 が 地形 に ふさがれて いない とき だけ）
    const clear = (x: number, y: number, z: number): boolean => {
      const id = String(world.getBlock(x, y, z));
      return world.isSolid(x, y, z) && id !== 'toriya_fence' && id !== 'toriya_gate';
    };
    const aim2 = shared.p2Animals()?.throwAim();
    const spot2 = aim2 ? animals.throwSpot(aim2, 2) : null;
    throwSpots[0] = throwSpot;
    throwSpots[1] = spot2;
    animalRenderer.setThrowSpots(throwSpots, (throwSpot !== null && ringSeen(clear, throwAim.eye, throwSpot)) || (spot2 !== null && aim2 !== undefined && ringSeen(clear, aim2.eye, spot2)));
    animalRenderer.setCoopGhost(dig.coopGhost());
    animalRenderer.setKitGhost(dig.kotatsuGhost());
    animalRenderer.update(animalViews.fill(animals), game.camera);
  });
  rig.setHeldProvider(() => inventory.held()?.item ?? null);
  rig.setWeaponSource({ blade: () => blade.state(), bowPose: () => tools.bow().pose() });
  return {
    animalRenderer, animalFx, animalViews, machoMarks, machoMarkIn, animalEvents, deliverAnimalEvents, currentKitRows,
  };
}

export type WiredAnimalView = WiredHouse & ReturnType<typeof wireAnimalView>;
