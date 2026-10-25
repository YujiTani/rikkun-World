/** LIVE-3 いただきます の 演出（ねぐら へ 歩く・とびら・一言・にく） */
import type { AnimalCore } from './animalCore';
import type { AnimalView } from '../contracts';
import { DIR_VEC } from './coop';
import { meatEligible } from './meat';
import type { Coop, Ent } from './animalTypes';
import { MEAT_DOOR_FROM, MEAT_DOOR_TICKS, MEAT_NEST_DIST, MEAT_SAY_AT, MEAT_SAY_FADE, MEAT_WALK } from './animalConsts';
import { yawTo } from './animalMath';

/** この 係 が 使う ものだけ（`AnimalCore` の 一部） */
type MeatCtx = Pick<AnimalCore, 'coopById' | 'coopList' | 'd' | 'ents' | 'find' | 'getPlayer' | 'push' | 'setState' | 'settings' | 'targetId' | 'tryAdd' | 'world'>;

/** その 小屋 の えらべる 子 の id（§2.1）: `meatEligible` で、だっこ 中・演出 中・とんで いる 子 は のぞく */
export function meatList(core: MeatCtx, coopId: number): number[] {
  const out: number[] = [];
  for (const e of core.ents) if (e.home === coopId && canMeat(e)) out.push(e.id);
  return out;
}

function canMeat(e: Ent): boolean {
  return meatEligible(e) && !e.carried && !e.meat && !e.flight && !e.glide;
}

/**
 * いただきます を はじめる（メニュー の 「いただきます」と 同じ）。えらべない 子 は `notEligible`（演出 中 の 小屋 でも 先 に 見る）、
 * その 小屋 で すでに 演出 中 なら `busy`
 */
export function startMeat(core: MeatCtx, coopId: number, id: number): { ok: boolean; reason: null | 'notEligible' | 'busy' } {
  const c = core.coopById(coopId);
  const e = core.find(id);
  if (!c || !e || e.home !== c.id || !canMeat(e)) return { ok: false, reason: 'notEligible' };
  if (c.meat) return { ok: false, reason: 'busy' };
  c.meat = { id: e.id, t: 0, sx: e.x, sz: e.z };
  e.meat = true;
  e.lock = 0;
  e.egg = false;
  e.walking = false;
  e.following = false;
  e.look = false;
  core.setState(e, 'meat');
  core.push({ type: 'meatStart', id: e.id, coop: c.id });
  return { ok: true, reason: null };
}

/** ねぐら の 中 の 場所（小屋 の まん中 から もん の 反対 がわ） */
function nestSpot(c: Coop): { x: number; z: number } {
  const [fx, fz] = DIR_VEC[c.dir]!;
  return { x: c.x + 0.5 - fx * MEAT_NEST_DIST, z: c.z + 0.5 - fz * MEAT_NEST_DIST };
}

/** とびら の ようす（演出 の ステップ `t` から）。60 まで あいて いる・60〜80 おりる・80〜(meatTicks−20) しまって いる・そのあと あがる */
export function doorOf(core: MeatCtx, c: Coop): { door: 'open' | 'closed' | 'moving'; t: number } {
  const job = c.meat;
  if (!job) return { door: 'open', t: 0 };
  const t = job.t;
  const give = core.settings.meatTicks - MEAT_DOOR_TICKS;
  if (t <= MEAT_DOOR_FROM) return { door: 'open', t: 0 };
  if (t < MEAT_DOOR_FROM + MEAT_DOOR_TICKS) return { door: 'moving', t: (t - MEAT_DOOR_FROM) / MEAT_DOOR_TICKS };
  if (t < give) return { door: 'closed', t: 1 };
  if (t < core.settings.meatTicks) return { door: 'moving', t: 1 - (t - give) / MEAT_DOOR_TICKS };
  return { door: 'open', t: 0 };
}

/** 演出 の 一言 の ふわっと 度（0〜1。出て いなければ null）。複数 の 小屋 なら いちばん 濃い もの */
export function meatSay(core: MeatCtx): number | null {
  let best: number | null = null;
  const give = core.settings.meatTicks - MEAT_DOOR_TICKS;
  for (const c of core.coopList) {
    const job = c.meat;
    if (!job || job.t < MEAT_SAY_AT) continue;
    const t = job.t;
    const a = t < MEAT_SAY_AT + MEAT_SAY_FADE ? (t - MEAT_SAY_AT) / MEAT_SAY_FADE : t < give ? 1 : 1 - (t - give) / MEAT_SAY_FADE;
    const v = Math.max(0, Math.min(1, a));
    if (best === null || v > best) best = v;
  }
  return best;
}

/** 保存 の 前: 演出 中 の 子 を その場 で おわらせる（にく は 持ち物 か 足もと。読み直し に 演出 の 続き は 出ない） */
export function finishMeat(core: MeatCtx): void {
  for (const c of core.coopList) if (c.meat) finishJob(core, c);
}

/** 毎ステップ（子 の 前）: 時計 を すすめ、とびら・一言・にく の とき を 出す */
export function meatTick(core: MeatCtx, c: Coop): void {
  const job = c.meat!;
  const give = core.settings.meatTicks - MEAT_DOOR_TICKS;
  const e = core.find(job.id);
  // 読みこまない 所 に なった・子 が いなく なった（にく が 入る 前）: その場 で おわらせる
  if (job.t < give && (!e || !core.world.isLoaded(Math.floor(c.x), Math.floor(c.z)))) {
    finishJob(core, c);
    return;
  }
  job.t++;
  const t = job.t;
  if (t === MEAT_DOOR_FROM + MEAT_DOOR_TICKS) core.push({ type: 'meatDoor', coop: c.id, closed: true });
  if (t === MEAT_SAY_AT && e) core.push({ type: 'meatSay', id: e.id, coop: c.id });
  if (t === give && e) giveMeat(core, c, e);
  if (t >= core.settings.meatTicks) {
    core.push({ type: 'meatDoor', coop: c.id, closed: false });
    c.meat = null;
  }
}

/** 演出 を いま おわらせる（子 は いなく なり、にく が 入る。とびら は ひらく） */
function finishJob(core: MeatCtx, c: Coop): void {
  const job = c.meat;
  if (!job) return;
  const e = core.find(job.id);
  c.meat = null;
  if (e) giveMeat(core, c, e);
}

/** 子 を 消して、にく を 持ち物 へ（入らない 分 は プレイヤー の 足もと に おとしもの） */
function giveMeat(core: MeatCtx, c: Coop, e: Ent): void {
  const n = Math.max(0, Math.round(core.settings.meatPerBird));
  let dropped = 0;
  const p = core.getPlayer().position;
  for (let i = 0; i < n; i++) {
    if (core.tryAdd('momo_nama')) continue;
    dropped++;
    const at = { x: p.x, y: p.y + 0.5, z: p.z };
    if (core.d.dropItem) core.d.dropItem(at, 'momo_nama');
    else core.d.addItem('momo_nama');
  }
  const i = core.ents.indexOf(e);
  if (i >= 0) core.ents.splice(i, 1);
  if (core.targetId === e.id) core.targetId = null;
  core.push({ type: 'meat', id: e.id, coop: c.id, count: n, dropped });
}

/** 演出 中 の 子 の 1 ステップ: ねぐら の 中 へ とことこ 歩き、そのあと は ねぐら の 中 で じっと */
export function meatBird(core: MeatCtx, e: Ent): void {
  const c = e.home === null ? undefined : core.coopById(e.home);
  const job = c?.meat;
  if (!c || !job || job.id !== e.id) {
    e.meat = false;
    core.setState(e, 'rest');
    return;
  }
  core.setState(e, 'meat');
  const to = nestSpot(c);
  const k = Math.min(1, job.t / (MEAT_WALK - 5));
  const nx = job.sx + (to.x - job.sx) * k;
  const nz = job.sz + (to.z - job.sz) * k;
  if (k < 1) {
    const dx = nx - e.x;
    const dz = nz - e.z;
    if (Math.hypot(dx, dz) > 1e-4) {
      e.yaw = yawTo(dx, dz);
      e.headYaw = e.yaw;
    }
  }
  e.x = nx;
  e.z = nz;
  e.y = c.y;
  e.vy = 0;
}

/** 描く 側 に わたす 場所: ねぐら に 着く ころ、ねぐら の ゆか（とびら の うしろ）へ そっと のぼる */
export function meatDraw(core: MeatCtx, e: Ent, v: AnimalView): void {
  const c = e.home === null ? undefined : core.coopById(e.home);
  const job = c?.meat;
  if (!c || !job) return;
  const k = Math.max(0, Math.min(1, (job.t - (MEAT_WALK - 15)) / 15));
  const [fx, fz] = DIR_VEC[c.dir]!;
  v.x = e.x - fx * 0.7 * k;
  v.z = e.z - fz * 0.7 * k;
  v.y = e.y + 0.9 * k;
}
