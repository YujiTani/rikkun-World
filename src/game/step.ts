// 毎ステップの 本体（main.ts から 移した）。順番は そのまま。まとまりは 最初に 1 回だけ 作る。
import { isBladeItem } from '../tools/blade/BladeSystem';
import { STEPS_PER_SECOND } from '../tools/config';
import { parryGlowLevel } from '../combat/parry';
import { isParrySound, playParry } from '../fx/parrySounds';
import { parryCellOf } from '../char/parryCells';
import { bladeColorsOf } from '../fx/bladeTrailModel';
import { playCombat } from '../fx/combatSounds';
import { playLegend } from '../fx/legendSounds';
import { buffsOfHeld } from '../ui/buffIconsModel';
import { SAMURAI_GEAR } from '../craft/config';
import { legendMoveMulOf, chargeOf } from '../legend/defs';
import { shiningBodyPose, lightningPoseFrame } from '../legend/pose';
import { handleCraftEvents, playSwing, handleGuardEvents } from '../ui/craftUi';
import { applyUiAlpha } from '../ui/theme';
import { isBowItem } from '../content/items/ids';
import { type ItemId, cropKindOfBlock, VEG_ITEM } from '../contracts';
import { FARM_HINT_VIEW } from '../ui/farmHintModel';
import { actionHintLines } from '../ui/actionHintModel';
import { impactOf } from '../fx/impact';
import { cooldownCells } from '../ui/hotbarModel';
import { skyDarkness, darkenFromBrightness } from '../world/light';
import { waterSettings, waterWaveUniforms } from '../world/render/waterWave';
import { NO_DIG, NO_SWINGS, IDLE_THUNDER_LOOK, NO_PLATES } from './wire/shared';
import type { WiredFrame } from './wire/save';

export function createStep(deps: WiredFrame): (dt: number) => void {
  const {
    shared, game, water, streamFrame, audioStep, craft2Settings, time, dig, sprite, armor, parry, blade, tools,
    legend, controller, w2, inventory, rig, combat, timeSettings, worldReady, yokaiM, animals, waveSys,
    coopMenu, itadakimasu, deliverAnimalEvents, animalFx, animalViews, pendingDust, animalHint, arrowRelay,
    screen, kodachi, geta, craft, storage, dropController, farm, renderer, m7, trackOldFarmSeeds,
    madeTracker, fxSound, pickupLog, log, celebrate, achievements, waterFx, farmFx, eyePos, sparkle,
    sparkleView, sprayFx, sprinklers, dropper, notice, impactBus, titleOfYokai, kodachiHookBuf,
    arrowVisuals, stuckVisuals, wearNotice, weaponFx, thunderFx, windWaveFx, reducedMotionMq, spiralFx,
    spiralDebris, chargeLight, handNow, chargeLightFx, handInfo, chargeChest, domeGrains, nijiCenter,
    nijiFx, slashFx, kodachiFx, fujinFx, raijinFx, rainbowFx, buffIcons, buffModel, parryFx, combatUi,
    craftHud, fx, combatFx, level, levelHud, updateFurnaceFx, blockDollOnly, aimMarks, sky, crosshair,
    yokaiFocus, hintVisible, titleAnnounce, machoMarkIn, machoMarks, yokaiNameplates, plateBuf,
    staggerIcons, stagIconBuf, natsukiPanel, actionHint, farmHint, plainReading, farmAimHud, nameOf,
    hotbar, shiningCooldownOf, inventoryScreen, storageScreen, achievementsPage, logPage, inventoryTabs,
    updateAchievements, save, gadgets, seat,
  } = deps;
  /** シャイニングの ドーム: 始めてから まだ 当たって いない（最初の 当たりだけ 大） */
  let domeFirstHit = true;
  let nijiLockSel = -1;
  return (dt: number): void => {
    streamFrame();
    audioStep();
    applyUiAlpha(craft2Settings);
    time.update();
    gadgets.step(dt); // ITEM-FX-1: ふとん（ねる）・たこ・わらじ（ジャンプの高さ）
    // WEAPON-5: パリィの 入力は 妖怪の 更新の 前（このステップの 当たりが F1 になる）
    const parryIn = dig.parryInput(game.tick + 1);
    // Shift を 押した 時点で パリィの 絵を 先読みする（刀を 持っただけでは 読まない。初回から 受けの 絵が 出るように）
    if (parryIn.run && parryIn.active && isBladeItem(parryIn.item)) sprite?.preloadParry();
    parryIn.jingasa = armor.equipped('head') === SAMURAI_GEAR.head; // SAMURAI-1: 始めた ステップの 値が そのパリィの 間 つかわれる
    parry.update(parryIn);
    // WEAPON-2: 刀・弓の 動きの 制限（歩く倍率・ジャンプ止め）を プレイヤーへ
    {
      const bm = blade.motion();
      const wm = tools.bow().motion();
      const pm = parry.motion();
      // 始めた ステップは まだ 走れる（刀のわざと 同じ）。そのあと 速さを 0 に して すべらせない
      const pmOn = !parry.startedNow();
      const lm = legend.motion();
      controller.motion.speedMul = bm.speedMul * wm.speedMul * (pmOn ? pm.speedMul : 1) * lm.speedMul * legendMoveMulOf(w2, inventory.held()?.item ?? null);
      controller.motion.jumpLocked = bm.jumpLocked || wm.jumpLocked || pm.jumpLocked || lm.jumpLocked;
      controller.motion.noRun = lm.noRun;
      // WEAPON-9: シャイニングの うかぶ（重力を 使わず 目標の 高さへ）と カメラを 引く
      controller.motion.hoverY = lm.hoverY ?? null;
      rig.distanceOverride = legend.camDistance();
      // CHAR-2: わざのあいだは 向きを わざの向きに 固定（わざを始めたステップは あとで その場で）
      // WEAPON-3: 刀の わざ・パンチの あいだは 攻撃の向き u。攻撃・空ぶりは ＋マークへ 回らない（leftAims）
      // WEAPON-5: パリィの あいだは 今 向いている 方（カメラの 向き）を向く。始めた ステップは すべらず 止まる
      controller.motion.faceDeg = pm.jumpLocked ? controller.state.yawDeg : (lm.faceDeg ?? dig.attackFaceDeg());
      controller.motion.leftAims = !['attack', 'whiff'].includes(dig.attackPreview().use);
      controller.motion.stopNow = false;
      // HURT-1: 怯み中は 歩く・走る・ジャンプが きかない
      controller.motion.noMoveInput = combat.flinchTicks() > 0;
      // HOUSE-1D: 座って いる 間は 位置・向きを 固定（motion を 書くので 上の 行より あと、controller.update より 前）
      seat.update();
    }
    // 空の光の弱まりを先に今の時刻にそろえる（妖怪の出現の「暗い所」がこれを読む。Sky は あとで画面ぶんを更新）
    skyDarkness.value = darkenFromBrightness(time.brightness(), timeSettings.nightBrightness);
    if (worldReady()) controller.update(dt); // 読みこみを まつ間は 動かない・落ちない（VOX-D）
    seat.afterUpdate(); // HOUSE-1D: 座って いる 間は「地面に 立って いる」ことに する（人形が とびあがる 形に ならない）
    // カメラ（肩の点 S）を先に決める。ねらい（dig.update）は S を使う（CHAR-1 第 5.2 版）
    rig.update(dt);
    if (worldReady()) yokaiM.update();
    if (worldReady()) animals.update();
    // WEAPON-9: シャイニング F1〜240 は 持ちかえ・もちもの画面を 出せない
    if (legend.locked()) {
      if (nijiLockSel < 0) nijiLockSel = inventory.selected();
      else if (inventory.selected() !== nijiLockSel) inventory.select(nijiLockSel);
    } else nijiLockSel = -1;
    dig.update();
    // WEAPON-7 PR2: 真空波（刀が きまった あと。体は ふみこんだ あとの 位置）
    {
      const bs = blade.state();
      const cp0 = controller.state.position;
      waveSys.step({
        item: bs.item,
        tech: bs.tech,
        phase: bs.phase,
        frame: bs.frame,
        startup: bs.lengths?.startup ?? 0,
        dirDeg: bs.move?.dirDeg ?? controller.state.yawDeg,
        body: { x: cp0.x, y: cp0.y + 1.4, z: cp0.z },
      });
    }
    // LIVE-1: ねらっている にわとり（しるし）。出来事は ここで 1 回だけ 取り出して 音・つぶ・実績・合図に 同じ物を流す
    animals.setTargeted(dig.animalTarget());
    {
      // LIVE-3: メニュー（はなれたら とじる）と 一言（ふわっと）
      coopMenu.update();
      itadakimasu.update(animals.meatSay());
      { const cues = yokaiM.takeCues(); if (cues) animals.fightCue(cues); }
      deliverAnimalEvents();
      const kitRows = animals.kits();
      const coopRows = animals.coops();
      animalFx.step(animalViews.fill(animals), controller.state.position, kitRows, coopRows);
      // 置いて たいら に した 足もと の 土けむり（とりごや は placeCoopBlocks、こたつ は DigSystem が ためる）
      const dust = dig.takeFlattenDust();
      if (pendingDust.length > 0) {
        dust.push(...pendingDust);
        pendingDust.length = 0;
      }
      if (dust.length > 0) animalFx.flattenDust(dust);
      // こたつ に たまご を 入れた・小屋 を 置いた 音（数 が ふえた とき）
      const nKit = kitRows.length;
      const nCoop = coopRows.length;
      if (nKit > shared.prevKits && shared.prevKits >= 0) animalFx.play('kitPut');
      if (nCoop > shared.prevCoops && shared.prevCoops >= 0) animalFx.play('coopPlace');
      shared.prevKits = nKit;
      shared.prevCoops = nCoop;
      animalHint.step();
    }
    // CHAR-2 §4.6: 刀・弓が 決まったあとで 板のコマを決める。矢の出来事は ここで 取り出して 配る
    const arrowEvents = tools.drainArrowEvents();
    arrowRelay.give(arrowEvents);
    if (screen.mode() === 'play') {
      const st = controller.state;
      const bs = blade.state();
      // わざを始めた ステップ: その場で わざの向きを向き、水平の速さを 0 に
      const lstrike = legend.strike();
      const shiningNow = legend.state().move === 'shining';
      const shiningBody = shiningNow && shiningBodyPose(legend.state().moveF) === 'charge';
      const faceU = legend.faceDeg() ?? dig.attackFaceDeg();
      if (faceU !== null) st.facingDeg = ((faceU % 360) + 360) % 360;
      rig.doll.setArcDir(st.facingDeg);
      // WEAPON-5: パリィの 絵と 青白い 光（からだの 色）
      const ps = parry.state();
      sprite?.setParry(parryCellOf(ps.phase, ps.frame, ps.jingasa));
      sprite?.setGlow(parryGlowLevel(ps.glowLeft, w2));
      if ((bs.move !== null && bs.frame === 1) || parry.startedNow() || lstrike?.F === 1) st.velocity.x = st.velocity.z = 0;
      const bowPose = tools.bow().state();
      const held = inventory.held()?.item ?? null;
      const weapon = bs.item !== null ? 'katana' : isBowItem(held) ? 'bow' : 'none';
      sprite?.step({
        position: st.position,
        velocity: st.velocity,
        onGround: st.onGround,
        inWater: st.inWater,
        running: st.running,
        facingDeg: st.facingDeg,
        weapon,
        // CHAR-4: 持っている 刀の 色（20・21 番を この 色に）。表に ない 刀は かたなの 行
        bladeColors: weapon === 'katana' ? bladeColorsOf(w2, bs.item) : null,
        // WEAPON-9: 手に 持つ 絵は 虹・雷神剣・風神剣が 専用（女の子）。シャイニング F1〜240 は ため の 形（おおげさぎり コマ 5）を 止める
        weaponSkin: held === 'niji' ? 'niji' : held === 'raijin_ken' ? 'raijin' : held === 'fujin_ken' ? 'fujin' : null,
        legendCharge: weapon === 'katana' && (legend.view().charging || shiningBody),
        blade:
          weapon === 'katana'
            ? lstrike && !shiningNow
              ? { stance: bs.stance, tech: 'kesa' as const, ...lightningPoseFrame(lstrike.F, lstrike.total), lengths: null }
              : { stance: bs.stance, tech: bs.tech, phase: bs.phase, frame: bs.frame, lengths: bs.tech ? (bs.lengths ?? w2.bladeTech[bs.tech]) : null }
            : null,
        bow:
          weapon === 'bow'
            ? { drawing: bowPose.drawing, drawTicks: bowPose.drawTicks, shot: arrowEvents.some((e) => e.type === 'arrowShot') }
            : null,
      });
    }
    // NINJA-1: 小太刀の 追い打ちは 先に 1 ステップ すすめ、このステップの 当たりは あとで 入れる（当てた ステップを 0 に する ため）
    kodachi.step();
    // SAMURAI-1 §4.6 明珍下駄: 走って いる 時間 30 ステップごとに 1 歩（遊び中・やられて いない・ひるんで いない とき だけ 数える）
    {
      const s = controller.state;
      const walking = screen.mode() === 'play' && !combat.dead() && !combat.flinching();
      geta.step({ running: walking && s.running, onGround: s.onGround, inWater: s.inWater, velocity: s.velocity });
    }
    combat.update();
    craft.update();
    storage.update();
    dropController.update();
    // 農業: あそんでいるあいだは 毎ステップ、もちもの画面は 4 ステップに 1 回、止まっているあいだは進めない
    {
      const m = screen.mode();
      if (m === 'play' || (m === 'inventory' && screen.timeScale() > 0 && game.tick % 4 === 0)) farm.update({ playerPos: controller.state.position });
      if (m === 'play' || (m === 'inventory' && screen.timeScale() > 0)) water.update(); // WATER-1: 水の 流れ(15 ステップごとに 1 パス)
      renderer.setRipeMinBrightness(m7.farmRipeMinBrightness);
      trackOldFarmSeeds();
    }
    // 出来事を 1 回だけ取り出して配る（実績へは、記録する前に「はじめて」を決めてから）
    const modeNow = screen.mode();
    if (modeNow === 'play') madeTracker.advance(1);
    else if (modeNow === 'inventory' && screen.timeScale() > 0) madeTracker.advance(1 / screen.timeScale());
    const craftEvents = craft.drainEvents();
    if (craftEvents.length > 0) {
      handleCraftEvents(craftEvents, { sound: fxSound, pickupLog, celebrate: true });
      for (const e of craftEvents) {
        if (e.type === 'craft') {
          log.fromTansu(e.fromTansu);
          log.craftMade(e.item, e.count);
        }
        madeTracker.handle(e);
        if (e.type === 'craftFail') celebrate.failed();
        rig.onCraftEvent(e);
      }
      achievements.feedCraft(craftEvents);
    }
    const digEvents = dig.drainEvents();
    if (digEvents.length > 0) {
      shared.digBuf = shared.digBuf === NO_DIG ? digEvents : shared.digBuf.concat(digEvents);
      achievements.feedDig(digEvents);
    }
    {
      const fe = farm.drainEvents();
      if (fe.length > 0) {
        for (const e of fe) {
          if (e.type === 'pour') waterFx.pour(farm.lastPourCells());
          else if (e.type === 'bucketPlace') waterFx.pour([{ x: e.x, y: e.y - 1, z: e.z }]); // 置いた マスの 上から しずく
        }
        farmFx.feed(fe);
      }
      // 目の 位置（キラキラ・しぶきの 遠さ）と つぶ の 1 ステップ
      eyePos.x = controller.state.position.x;
      eyePos.y = controller.state.position.y + controller.settings.eyeHeight;
      eyePos.z = controller.state.position.z;
      sparkle.step(game.tick, eyePos);
      sparkleView.update();
      waterFx.step();
      sprayFx.setPeriod(m7.farmSprinklerSprayTicks);
      sprayFx.update(game.tick, sprinklers.peek(), eyePos);
    }
    const storageA = storage.drainEvents();
    const storageB = dropper.drainEvents();
    if (storageA.length > 0 || storageB.length > 0) {
      achievements.feedStorage(storageB.length === 0 ? storageA : storageA.length === 0 ? storageB : storageA.concat(storageB));
    }
    const swings = tools.drainSwings();
    if (swings.length > 0) {
      const held = inventory.held()?.item ?? null;
      for (const sw of swings) playSwing(fxSound, sw.anim, held);
      shared.swingBuf = shared.swingBuf === NO_SWINGS ? swings : shared.swingBuf.concat(swings);
    }
    for (const e of arrowEvents) {
      if (e.type === 'noArrow') notice.showSignal('noArrow');
      else if (e.type === 'arrowHit') {
        impactBus.hit(impactOf({ kind: 'arrow', title: titleOfYokai(e.yokaiId) }));
        playCombat(fxSound, 'hit');
        achievements.feedArrow('hit');
      } else if (e.type === 'arrowShot') achievements.feedArrow('shot');
    }
    // NINJA-1: 追い打ちの 出来事（kodachiHit）は テストの 窓口 `combat.events()` へ
    { const ke = kodachi.drainEvents(); if (ke.length > 0) kodachiHookBuf.push(...ke); }
    const combatEvents = combat.drainEvents();
    if (combatEvents.length > 0) {
      for (const e of combatEvents) {
        rig.onCombatEvent(e);
        kodachi.onCombatEvent(e);
        if ((e.type === 'playerHit' && e.amount > 0 && (e as { blocked?: boolean }).blocked !== true) || e.type === 'fallHurt') sprite?.hurt();
        if (e.type === 'respawn') log.home();
        // やられた: だっこ中の にわとりは その場に おろす（A の putDown が 足もとに 置く）
        if (e.type === 'death' && animals.carrying() !== null) animals.dropCarried({ x: controller.state.position.x, y: controller.state.position.y, z: controller.state.position.z });
      }
      handleGuardEvents(combatEvents, fxSound);
      shared.combatBuf = combatEvents;
      achievements.feedCombat(combatEvents);
    }
    arrowVisuals.syncFlying(tools.bow().arrows());
    stuckVisuals.syncStuck(tools.bow().stuck());
    wearNotice.step();
    weaponFx.step();
    // WEAPON-7: 雷・ための 光（出来事は ここで 1 回 取り出す）
    {
      const evs = legend.drainEvents();
      const holdingLegend = legend.chargeable(inventory.held()?.item ?? null);
      for (const e of evs) {
        thunderFx.onEvent(e);
        windWaveFx.onEvent(e);
        if (e.type === 'lightningStrike' && e.hits.length > 0) impactBus.hit(impactOf({ kind: 'charged' }));
        // シャイニングの ドーム: 始めてから 最初の 当たりだけ 大。2 回目からは 止めなし（ゆれは 中の 量）
        if (e.type === 'waveHit' || e.type === 'spiralHit') impactBus.hit(impactOf({ kind: 'repeat' })); // 真空波・らせん: 止めなし
        if (e.type === 'shiningStart') domeFirstHit = true;
        if (e.type === 'domeHit') {
          impactBus.hit(impactOf({ kind: domeFirstHit ? 'charged' : 'repeat' }));
          domeFirstHit = false;
        }
        if (e.type === 'lightningStrike') {
          for (const id of e.hits) {
            const y = yokaiM.list().find((q) => q.id === id);
            if (y) weaponFx.hitStarsAt({ x: y.position.x, y: y.position.y + 0.7, z: y.position.z });
          }
        }
        // 虹: ドームが 当たった 妖怪に 小さな 光の つぶ
        if (e.type === 'domeHit') {
          const y = yokaiM.list().find((q) => q.id === e.yokaiId);
          if (y) weaponFx.hitStarsAt({ x: y.position.x, y: y.position.y + 0.7, z: y.position.z });
        }
      }
      const reducedNow = reducedMotionMq?.matches ?? false;
      windWaveFx.step(waveSys.list(), reducedNow);
      // WEAPON-8: らせんの かぜ（見た目は 当たりの P(a)）と 土と 草の つぶ
      const sp = waveSys.list().find((w) => w.kind === 'spiral');
      for (const e of evs) spiralFx.onEvent(e);
      spiralDebris.step(sp ? { id: sp.id, age: sp.age, position: sp.position, dir: sp.dir } : null, reducedNow);
      spiralFx.step(sp, spiralDebris);
      const lv = holdingLegend ? legend.view() : null;
      const st = lv && lv.ready ? legend.state() : null;
      thunderFx.step(lv && lv.kind !== 'shining' ? { charging: lv.charging, ready: lv.ready, aimS: st && st.aim && st.aim.skyVisible ? st.aim.S : null } : IDLE_THUNDER_LOOK, reducedNow);
      // WEAPON-8 §3.5: ため中の 手もとの 光（雷神剣も 風神剣も）。手は 三人称は 体から、一人称は 画面の 右下の にぎり
      const cp = controller.state.position;
      const cl = chargeLight.step({ ticks: lv ? lv.chargeTicks : null, kind: lv ? lv.kind : null, reduced: reducedNow, full: chargeOf(w2, inventory.held()?.item ?? null)?.chargeTicks, cut: legend.state().move === 'shining' });
      if (cl.phase !== 'off') {
        handNow();
        chargeLightFx.step(cl, handInfo, chargeChest());
      } else chargeLightFx.step(cl, handInfo, null);
      // WEAPON-9: 虹の ドーム（シャイニング中）。音: 弾が 消えた ステップに domeErase を 1 つ
      {
        const dv = legend.view();
        const mv = legend.state();
        domeGrains.step({ F: mv.move === 'shining' ? mv.moveF : 0, center: nijiCenter(cp), radius: dv.dome, pulled: legend.pullers(), reduced: reducedNow });
        nijiFx.step(dv.dome > 0 ? { radius: dv.dome, center: nijiCenter(cp), groundY: dv.groundY, F: mv.moveF } : null, domeGrains, reducedNow, rig.getInfo().hideChar);
        slashFx.step(reducedNow);
        kodachiFx.step(reducedNow);
        fujinFx.step(reducedNow);
        raijinFx.step(reducedNow);
        rainbowFx.step(reducedNow);
        if (shared.domeEraseThisStep) {
          playLegend(fxSound, 'domeErase');
          shared.domeEraseThisStep = false;
        }
      }
      // WEAPON-8 §2.4: 速さバフの アイコン（手に 持つ 物の 速さの 倍率が 1 より 大きい 間）
      const heldNow = inventory.held()?.item ?? null;
      buffIcons.sync(buffModel.step(buffsOfHeld(heldNow, (i) => legendMoveMulOf(w2, i)), reducedNow));
    }
    for (const n of parry.sounds()) if (isParrySound(n)) playParry(fxSound, n);
    {
      const ps = parry.state();
      parryFx.step({ visible: ps.glowLeft > 0, level: parryGlowLevel(ps.glowLeft, w2), position: controller.state.position, reduced: reducedMotionMq?.matches ?? false, facingDeg: controller.state.facingDeg });
    }
    combatUi.inkDim.set(yokaiM.inkDim());
    combatUi.hearts.setArmor(armor.snapshot().hudIcons);
    craftHud.update(dt);
    fx.update(dt);
    combatFx.update(dt);
    weaponFx.update(dt);
    parryFx.update();
    for (const e of level.drainEvents()) {
      if (e.type === 'levelUp') {
        levelHud.celebrate();
        log.level(e.level);
        fxSound.play('levelUp');
      }
    }
    levelHud.update(level.get());
    levelHud.tick(dt);
    updateFurnaceFx(dt);
    // 箱人形は 白い弧・星のために残す。板の絵が出せない（たつ の絵も読めない）ときだけ からだも見せる
    rig.doll.setBoxBody(blockDollOnly || (sprite?.needsBoxDoll() ?? false));
    sprite?.render();
    {
      const playing = screen.mode() === 'play' && !rig.isOverview();
      const bs = blade.state();
      aimMarks.update({ stance: playing && bs.item !== null ? bs.stance : null, bowStage: playing ? tools.bow().pose().stage : 0 });
    }
    sky.update(game.camera);
    combatUi.clock.setTime(time.dayTick(), timeSettings, time.day() + 1);
    crosshair.setVisible(rig.crosshairVisible() && screen.mode() === 'play');
    yokaiFocus.update(hintVisible() ? dig.aimedYokaiId() : null);
    titleAnnounce.sync(yokaiM.announce());
    // 持ち物・メニューを開いている間は 名前を出さない
    {
      // LIVE-4: 「！」と 顔（ねらい の 妖怪 の バー の 上）
      const fm = animals.fightMarks();
      machoMarkIn.bang = fm.bang && { x: fm.bang.x, y: fm.bang.y, z: fm.bang.z, age: fm.bang.age };
      machoMarkIn.face = fm.target === null ? null : yokaiM.markAnchor(fm.target);
      machoMarks.update(machoMarkIn, game.camera, screen.mode() === 'play');
    }
    yokaiNameplates.update(screen.mode() === 'play' ? yokaiM.nameplates(plateBuf) : NO_PLATES, game.camera);
    staggerIcons.update(yokaiM.staggerIcons(stagIconBuf), game.camera, screen.mode() === 'play');
    {
      // GOLD-1: なかよし パネル（なかま の 大人 を ねらって いる あいだ。案内 と 同じ とき）
      const tid = hintVisible() ? dig.animalTarget() : null;
      natsukiPanel.update(tid === null ? null : animals.natsukiView(tid));
    }
    actionHint.update(hintVisible() ? actionHintLines(dig.previewRightClick(), dig.previewLeftClick(), { carryProgress: dig.carryProgress(), carrying: animals.carrying() !== null, held: tools.current().item, heldIsPickaxe: tools.current().kind === 'pickaxe', heldIsBlade: tools.current().kind === 'blade' }) : {});
    farmHint.step();
    {
      // 農業の合図: 出ていない状態から 出たとき 1 件（見た目の文は ふりがなを 読みに直す）
      const k = farmHint.model.current();
      for (const kind of Object.keys(FARM_HINT_VIEW) as (keyof typeof FARM_HINT_VIEW)[]) {
        log.edge(`farm:${kind}`, k === kind, () => {
          const v = FARM_HINT_VIEW[kind];
          const art = v.art.find((a) => a !== 'heart');
          log.farmHint(plainReading(v.html), (art ?? null) as ItemId | null);
        });
      }
    }
    {
      const tb = hintVisible() ? dig.target() : null;
      const a = tb ? farm.aim(tb.block.x, tb.block.y, tb.block.z) : null;
      const ck = tb ? cropKindOfBlock(tb.id) : null;
      farmAimHud.update(a, ck ? nameOf(VEG_ITEM[ck.kind]) : a ? 'はたけ' : '');
    }
    // #264: シャイニングの 休み 10 秒の のこりを 虹の マスに 出す
    hotbar.update(dig.toolHint()?.slot ?? null, cooldownCells(inventory.slots(), shiningCooldownOf, legend.state().cooldownLeft));
    inventoryScreen.update();
    storageScreen.update();
    achievementsPage.update();
    logPage.update(screen.inventoryOpen() && inventoryScreen.tab() === 'log');
    if (screen.inventoryOpen()) inventoryTabs.update();
    updateAchievements();
    celebrate.step();
    notice.update(dt);
    const pp = controller.state.position;
    waterWaveUniforms.uWaveTime.value = water.waveTime(); // WATER-1: 水面の ゆらめきの 時間(ステップ ÷ 60。一時停止で とまる)
    waterWaveUniforms.uWaveAmp.value = waterSettings.waveAmp; // 設定 waveAmp(§4.1)
    renderer.setGlowTime(game.tick / STEPS_PER_SECOND); // ほたるいしの いき（一時停止で とまる。スクショが きまる）
    renderer.update({ x: pp.x, z: pp.z });
    save.update(game.tick + 1);
    // #276: このステップの 当たりを まとめて 1 回（ヒットストップ・画面の ゆれ）
    impactBus.flush();
  };
}
