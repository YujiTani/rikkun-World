// MINE-1F: ようかいの やかたの つなぎ込み（docs/design/MINE-1F.md §4.7・§6.1）。
// 挑戦の 係〔world/gen/mineYakataRun〕が 使う 出入り口 `YakataPorts` を 本物に つなぎ、出来事を 画面・音・実績・ログに 配る。
import { FX_SETTINGS } from '../../fx/config';
import { CHEST_SOUNDS } from '../../fx/chestSounds';
import { CRAFT_SOUNDS } from '../../fx/craftSounds';
import type { Tone } from '../../fx/sound';
import { createBrowserYakataSound } from '../../fx/yakataSound';
import type { YakataSceneReq } from '../../fx/bgm/yakataScene';
import { YakataLeft } from '../../ui/yakataLeft';
import { YAKATA_TEXT } from '../../ui/yakataText';
import type { YokaiKind } from '../../contracts';
import type { YakataEvent, YakataPlayer, YakataPorts, YakataYokaiRow } from '../../world/gen/mineYakataPorts';
import type { YakataLightBox } from '../../world/light/yakataLight';
import type { WiredDuo } from './duo';

/** 光の 箱を 作りなおす 間かく〔ステップ〕 */
const LIGHT_EVERY = 30;

type Router = { run(who: 1 | 2, fn: () => void): void };

export function wireYakata(deps: WiredDuo, router: Router) {
  const { shared, game, controller, combat, yokaiM, achievements, notice, fxSound, titleSound, mixer, audioSettings, yakataScene, hud, reducedMotionMq, renderer, shafts } = deps;
  const sound = createBrowserYakataSound(
    () => FX_SETTINGS.fxVolume,
    () => mixer.output()?.ctx ?? null,
    () => mixer.output()?.destination ?? null,
    { volume: () => audioSettings.bgmVolume, output: () => mixer.output()?.destination ?? null },
  );
  const left = { 1: new YakataLeft(hud, 1), 2: new YakataLeft(hud, 2) } as const;
  let opener: 1 | 2 = 1;
  const reduce = (): boolean => reducedMotionMq?.matches ?? false;

  // 人 2 人ぶんの 行を 使いまわす〔毎ステップ 作らない〕
  const rows: YakataPlayer[] = [
    { who: 1, x: 0, y: 0, z: 0, dead: false },
    { who: 2, x: 0, y: 0, z: 0, dead: false },
  ];
  const list: YakataPlayer[] = [];

  const ports: YakataPorts = {
    players() {
      list.length = 0;
      const p = controller.state.position;
      Object.assign(rows[0]!, { x: p.x, y: p.y, z: p.z, dead: combat.dead() });
      list.push(rows[0]!);
      const mate = shared.duoYokai();
      if (mate) {
        Object.assign(rows[1]!, { x: mate.position.x, y: mate.position.y, z: mate.position.z, dead: !mate.targetable });
        list.push(rows[1]!);
      }
      return list;
    },
    yokai: {
      spawn: (kind, x, y, z, o) => yokaiM.spawn(kind as YokaiKind, x, y, z, o),
      list: (): YakataYokaiRow[] => yokaiM.list().map((q) => ({ id: q.id, kind: q.kind, title: q.title, x: q.position.x, y: q.position.y, z: q.position.z })),
      leave: (ids) => yokaiM.leave(ids),
    },
    run: (who, fn) => router.run(who, fn),
    movePlayer(who, to) {
      if (who === 1) controller.set({ position: { x: to.x, y: to.y, z: to.z }, velocity: { x: 0, y: 0, z: 0 } });
      else shared.duoMate()?.moveTo?.({ x: to.x, y: to.y, z: to.z });
    },
    emit(e: YakataEvent) {
      switch (e.type) {
        case 'enter':
          return; // 実績は 'achievement'〔found〕
        case 'start':
          opener = e.who;
          left[e.who].show(e.foes.length);
          yakataScene.event('start');
          return;
        case 'count':
          left[opener].set(e.left, reduce());
          return;
        case 'win':
          left[opener].hide();
          yakataScene.event('win');
          return;
        case 'lose':
          left[1].hide();
          left[2].hide();
          yakataScene.event('lose');
          return;
        case 'achievement':
          achievements.feedMine([{ type: 'yakata', tick: game.tick, kind: e.kind }]);
          return;
        case 'say':
          shared.log.chestSay(e.text);
          return;
        case 'notice':
          notice.showName(e.text === 'start' ? YAKATA_TEXT.start : YAKATA_TEXT.win);
          return;
        case 'celebrate':
          celebrateAt(e.what);
          return;
        case 'sfx':
          return; // 音は ぜんぶ 場面の 頼み〔drain〕で 1 回だけ 鳴らす
        case 'locked':
          notice.showSignal('yakataLocked');
          return;
        default: {
          const never: never = e;
          return never;
        }
      }
    },
  };

  // かちの お祝い〔紙ふぶき・花火〕: 世界の つぶを 時間を ずらして 何回か。おわったら 空
  const FIREWORKS_AT = [0, 25, 50, 80]; // 花火を 上げる ステップの ずれ
  const CONFETTI_BURSTS = 3; // 紙ふぶきを まく 回数
  const SHOW_BLOCKS = ['maou_taimatsu', 'onibi_taimatsu', 'maou_dan', 'otera_dan'] as const;
  let showAt: { step: number; high: number; n: number }[] = [];
  const celebrateAt = (what: 'confetti' | 'fireworks'): void => {
    const s = game.tick;
    if (what === 'confetti') for (let i = 0; i < CONFETTI_BURSTS; i++) showAt.push({ step: s + i * 10, high: 3, n: i });
    else for (const d of FIREWORKS_AT) showAt.push({ step: s + d, high: 7, n: d });
  };
  const showStep = (): void => {
    if (showAt.length === 0) return;
    const p = controller.state.position;
    showAt = showAt.filter((b) => {
      if (b.step > game.tick) return true;
      const id = SHOW_BLOCKS[b.n % SHOW_BLOCKS.length]!;
      const dx = ((b.n * 7) % 5) - 2;
      shared.fx.particles.burst({ x: Math.floor(p.x) + dx, y: Math.floor(p.y) + b.high, z: Math.floor(p.z) }, id as never, FX_SETTINGS);
      return false;
    });
  };

  const serve = (r: YakataSceneReq): void => {
    switch (r.kind) {
      case 'loop':
        sound.startLoop(r.name === 'yakataAmbience' ? 'ambience' : 'challenge', r.db);
        return;
      case 'stop':
        sound.stopLoop(r.name === 'yakataAmbience' ? 'ambience' : 'challenge', r.sec);
        return;
      case 'swap':
      case 'back':
        return; // BGM の 入れかえは 場面の 状態〔bgmDuck〕で 見る
      case 'sfx':
        if (r.name === 'yakataGateClose') sound.playOnce('gate_close');
        else if (r.name === 'yakataGateOpen') sound.playOnce('gate_open');
        else if (r.name === 'title') titleSound.play('taisho'); // 仕様 §3.4: いちばん 強い たいしょうの 版
        else if (r.name === 'chest') fxSound.playTones(CHEST_SOUNDS.chestOpen4);
        else if (r.name === 'fanfare') fxSound.playTones(CRAFT_SOUNDS.fanfare as readonly Tone[]);
        else if (r.name === 'achievement') fxSound.playTones(CRAFT_SOUNDS.modalSparkle as readonly Tone[]);
        return;
      default: {
        const never: never = r;
        return never;
      }
    }
  };

  /** 毎ステップ〔妖怪の 更新の あと〕 */
  const step = (mine: { yakataStep(): void; yakataStage(): { present: boolean; chosen: boolean; katta: boolean } }): void => {
    mine.yakataStep();
    showStep();
    const st = mine.yakataStage();
    yakataScene.tick({ present: st.present, chosen: st.chosen, katta: st.katta, battle: false });
    for (const r of yakataScene.drain()) serve(r);
    if (game.tick % LIGHT_EVERY === 0) {
      const p = controller.state.position;
      const boxes: YakataLightBox[] = [];
      for (const y of shafts.yakataNear(Math.floor(p.x) >> 4, Math.floor(p.z) >> 4)) {
        boxes.push({ x0: y.hall.x0, y0: y.hall.y, z0: y.hall.z0, x1: y.hall.x1, y1: y.hall.y + 6, z1: y.hall.z1, look: y.look });
        const xs = y.passage.map((c) => c.x);
        const zs = y.passage.map((c) => c.z);
        boxes.push({ x0: Math.min(...xs) - 1, y0: y.passage[0]!.y, z0: Math.min(...zs) - 1, x1: Math.max(...xs) + 1, y1: y.passage[0]!.y + 3, z1: Math.max(...zs) + 1, look: y.look });
      }
      renderer.light.setYakataBoxes(boxes);
    }
  };
  void sound.preload();
  return { ports, step };
}
