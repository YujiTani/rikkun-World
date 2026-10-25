// main.ts の 流れ 8: がしゃどくろ（少女と 大きな 姿）の 入り口と 起動。
import { bladeMidInto } from '../../fx/parryFx';
import { playCombat } from '../../fx/combatSounds';
import { playLegend } from '../../fx/legendSounds';
import { tekkoBladeMulOf, knockbackMulOf, tekkoDefIgnoreOf } from '../../craft/samuraiPower';
import { legendPowerOf } from '../../legend/defs';
import { FX_SETTINGS } from '../../fx/config';
import { type GirlHooks, type BossHandle, createGashaRelease, gashaHook } from '../../gasha/release';
import { gashaEnabled } from '../../gasha/spawnRule';
import type { GashaBigDeps } from '../../gasha/gashaBig';
import type { GashaGirlDeps } from '../../gasha/gashaGirl';
import { blockIndexOf } from '../../world/blocks/blockTypes';
import type { WiredLoop } from './save';

export function wireGasha(deps: WiredLoop) {
  const {
    shared, game, world, controller, combat, parry, parryFx, sparkAt, reducedMotionMq, mixer, island,
    lighting, armor, inventory, lock, fx, fxSound, rig, blade, waveSys, legend, w2, toolConfig, kodachi,
    seed, drops, achievements, log, ninjaBook, ninjaHave, celebrate, time,
  } = deps;
  // #293: 少女（第二形態）の 入り口。試作ページ（?proto=gashaGirl、開発サーバーだけ）と ふだんの ゲーム（src/gasha/release.ts。体力 1/3 で きりかえる）の 両方が 使う
  const girlDeps = (): GashaGirlDeps => ({ scene: game.scene, camera: game.camera, onUpdate: (fn) => game.onUpdate(fn), onBeforeRender: (fn) => game.onBeforeRender(fn), solid: (x, y, z) => world.isSolid(x, y, z), player: () => ({ ...controller.state.position, yawDeg: controller.state.yawDeg, vx: controller.state.velocity.x, vz: controller.state.velocity.z }), hurt: (amount, from) => combat.damage(amount, 'karakasa', from), parry: (h) => { const r = parry.hit({ dirDeg: h.dirDeg, yawDeg: controller.state.yawDeg, by: h.by, yokaiId: null, amount: h.amount }); if (r.first) parryFx.spark(bladeMidInto(sparkAt, controller.state.position, controller.state.facingDeg), reducedMotionMq?.matches ?? false, controller.state.facingDeg); return { result: r.result, amount: r.amount }; }, bgmOut: () => { const o = mixer.output(); const b = mixer.bgmInput(); return o && b ? { ctx: o.ctx, bus: b } : null; }, sfxOut: () => mixer.output(), suppressBgm: (on, f) => { shared.girlBgmOn = on; if (f) shared.gashaBgmFade = { ...shared.gashaBgmFade, ...f }; }, hp: () => combat.hp(), maxHp: () => combat.maxHp(), groundY: (x, z) => island.groundHeight(x, z) });
  const startGirlBoss = (hooks: GirlHooks) =>
    import('../../gasha/gashaGirl').then((m) => m.startGashaGirl(girlDeps(), { dormant: true, ...hooks }));
  // #293 試作（開発サーバーだけ）: ?proto=gashaGirl で 少女の 大きさくらべ
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('proto') === 'gashaGirl') {
    void import('../../gasha/gashaGirl').then((m) => m.startGashaGirl(girlDeps()));
  }
  // #293: がしゃどくろ（大きな 姿）を 作って 動かす 口。試作ページ（?proto=gashaBig、開発サーバーだけ）と ふだんの ゲーム（src/gasha/release.ts。wrap で 入り口を すりかえる）の 両方が 使う。当たりは「追加の 固いマス」として プレイヤーの 当たりに 重ねる
  const startBigBoss = (wrap: (d: GashaBigDeps) => GashaBigDeps = (d) => d, at?: { x: number; z: number; yawDeg?: number }) =>
    Promise.all([import('../../gasha/gashaBig'), import('../../gasha/gashaBigHitWire')]).then(([m, hw]) => m.startGashaBig(wrap({ scene: game.scene, camera: game.camera, player: () => ({ ...controller.state.position, yawDeg: controller.state.yawDeg }), groundY: (x, z) => island.groundHeight(x, z), lighting, addPlayerSolid: (fn) => { const orig = world.isSolidForPlayer.bind(world); world.isSolidForPlayer = (x, y, z) => orig(x, y, z) || fn(x, y, z); }, onUpdate: (fn) => game.onUpdate(fn), playerBody: () => controller.state, setPlayerVelocity: (v) => { controller.set({ velocity: v }); }, nudgePlayer: (dx, dz) => { const st = controller.state; st.position.x += dx; st.position.z += dz; }, setNoFall: (on) => { shared.protoNoFall = on; }, blockAt: (x, y, z) => world.getBlock(x, y, z), setGeyserBlock: (x, y, z) => world.setBlock(x, y, z, 'geyser_dirt'), restoreGeyserBlock: (x, y, z, id) => world.setBlock(x, y, z, id as Parameters<typeof world.setBlock>[3]), scanGeyserBlocks: (found) => { const si = blockIndexOf('geyser_dirt'); world.scanBlocks((i) => i === si, (x, y, z) => found(x, y, z)); }, giveNinjaTabi: () => { if (armor.equipped('legs') === 'ninja_tabi') return; const old = armor.equippedStack('legs'); if (old) inventory.add(old.item, 1); armor.set(armor.equipped('head'), armor.equipped('body'), armor.equipped('arms'), 'ninja_tabi'); }, bgmOut: () => { const o = mixer.output(); const b = mixer.bgmInput(); return o && b ? { ctx: o.ctx, bus: b } : null; }, sfxOut: () => mixer.output(), suppressBgm: (on, f) => { shared.girlBgmOn = on; if (f) shared.gashaBgmFade = { ...shared.gashaBgmFade, ...f }; }, carryPlayer: (dx, dy, dz, dYaw) => { const st = controller.state; st.position.x += dx; st.position.y += dy; st.position.z += dz; st.yawDeg = (((st.yawDeg + dYaw) % 360) + 360) % 360; }, hurt: (amount, from) => combat.damage(amount, 'karakasa', from), blockPlayerInput: (fn) => { const orig = lock.playInputEnabled.bind(lock); lock.playInputEnabled = () => orig() && !fn(); }, onBeforeRender: (fn) => game.onBeforeRender(fn), reducedMotion: () => reducedMotionMq?.matches ?? false, setBlockAir: (x, y, z) => world.setBlock(x, y, z, 'air'), onCrushBlocks: (cells) => { for (const c of cells.slice(0, 40)) fx.particles.burst({ x: c.x, y: c.y, z: c.z }, c.from as Parameters<typeof fx.particles.burst>[1], FX_SETTINGS); fxSound.play('break'); }, onGlassBreak: (cells) => { for (const c of cells.slice(0, 24)) fx.particles.burst({ x: Math.floor(c.x), y: Math.floor(c.y), z: Math.floor(c.z) }, 'snow', FX_SETTINGS); fxSound.play('break'); }, hitStop: (n) => game.hitStop(n), shake: (a) => { if (FX_SETTINGS.fxShake) rig.addTrauma(a); }, onCoreWarn: () => playLegend(fxSound, 'lightning'), onCoreThrow: () => playLegend(fxSound, 'spiralWind'), onBodyBlocks: (port) => { shared.gashaBodyBlocks = port; }, onSaveOverrides: (get) => { shared.gashaSaveOverrides = get; },
      // 本物の 攻撃（刀・ためわざ・波・矢・パンチ）を がしゃどくろの 箱に 当てる 口
      hit: hw.makeHitSources({ blade, waves: () => waveSys.list(), legend, held: () => { const h = inventory.held(); return h ? { item: h.item, power: h.power } : null; }, settings: w2, weaponDamage: (item) => (legendPowerOf(w2, item, item === 'niji' ? (inventory.held()?.power ?? null) : null) ?? toolConfig.weaponDamage[item] ?? 1) * tekkoBladeMulOf(armor, item), powerMul: (item) => tekkoBladeMulOf(armor, item), yokai: () => shared.yokaiManager, sound: () => playCombat(fxSound, 'hit') }),
      // NINJA-1: 刀・パンチが 部位に 当たった → 忍びの手甲の 追い打ち
      onStrike: (i) => kodachi.onBigHit(i.part), knockbackMul: () => knockbackMulOf(armor), defIgnore: () => tekkoDefIgnoreOf(armor) }), at)).then((h) => { shared.bigBossHandle = h as unknown as BossHandle; return h; });
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('proto') === 'gashaBig') void startBigBoss();
  // #293 リリース: がしゃどくろを ふだんの ゲームに 出す（ゲームの 1 日の あさごとに 約 3 割で、プレイヤーから 150〜250 ブロック先に 1 体。たおすか 遠くへ はなれると 消える。たおすと 赤い コアが 出て、たたく たびに アイテムが ばらまかれる）。数は src/gasha/releaseTuning.ts
  // 開発用に すぐ 出すには コンソールで `__rikkun.gasha.spawn()`（距離・向きは `{ distance: 40, angleDeg: 0 }`）。たおした ことに するのは `__rikkun.gasha.defeat()`
  shared.gashaRelease = createGashaRelease({
    seed,
    enabled: gashaEnabled(location.search, navigator.webdriver === true),
    player: () => ({ x: controller.state.position.x, y: controller.state.position.y, z: controller.state.position.z, yawDeg: controller.state.yawDeg }),
    isLand: (x, z) => !island.terrainAt(Math.floor(x), Math.floor(z)).sea,
    isLoaded: (x, z) => world.isLoaded(x, z),
    terrainTop: (x, z) => island.terrainAt(Math.floor(x), Math.floor(z)).h,
    groundY: (x, z) => {
      // 読みこんだ 列の 本当の いちばん 上（置いた ブロック・家・畑も ふくむ。木の 葉は 数えない）。体を 出す 高さ用
      const ix = Math.floor(x), iz = Math.floor(z), base = island.groundHeight(x, z);
      for (let y = base + 40; y > base; y--) {
        if (!world.isSolid(ix, y, iz)) continue;
        const b = world.getBlock(ix, y, iz) as string;
        if (b === 'leaves' || b === 'matsu_leaves' || b === 'momiji_leaves') continue;
        return y;
      }
      return base;
    },
    start: (wrap, at) => startBigBoss(wrap, at) as Promise<BossHandle>,
    startGirl: (hooks) => startGirlBoss(hooks),
    scatter: (at, stacks, opts) => { drops.scatter(at, stacks, opts); },
    record: (key) => { achievements.record(key); },
    say: () => { log.defeat('がしゃどくろ'); },
    bgmReset: () => { (globalThis as unknown as { __gashaBgm?: { reset(): void } }).__gashaBgm?.reset(); },
    sound: (name) => { fxSound.play(name); },
    showBar: (on) => { const e = document.getElementById('gashaBigHp'); if (e) e.style.display = on ? '' : 'none'; },
    // NINJA-1: 忍者帳と 今 持って いる 物（まだ 手に 入れて いない 物から 1 つ）／袋が 出た ことの 知らせ（上の 帯の テロップ）
    ninja: () => ({ book: ninjaBook.got(), have: ninjaHave() }),
    dropped: (item, from) => celebrate.enqueueTelop(item, from),
  });
  const gashaRel = shared.gashaRelease;
  if (shared.gashaSavedPending) gashaRel.deserialize(shared.gashaSavedPending);
  game.onUpdate((dt) => gashaRel.step(dt));
  time.onPhaseChange((p) => { if (p === 'day') gashaRel.onMorning(time.day()); });
  if (window.__rikkun) window.__rikkun.gasha = gashaHook(gashaRel);
  game.start();
}
