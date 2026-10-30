// HOUSE-1B 試作: エディターの 小さな 絵（SVG。色は currentColor か 下の 数）。字を 読まなくても 分かる ように する ための 絵。
// 色は 見本の 家（houseLook.ts の 案 C）と そろえる。UI の 色の きまり（トークン）には SVG の 中身は 入らない。
import { HOUSE_LOOK } from './houseLook';

const P = HOUSE_LOOK.pal;
type OpenOpt = { fill?: string; stroke?: string; sw?: number };
const open = (o: OpenOpt = {}): string =>
  `<svg class="ed-ico" viewBox="0 0 24 24" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? 'currentColor'}" stroke-width="${o.sw ?? 2.4}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`;

/** すすみ ①②③・ボタンの 絵（24×24。currentColor） */
export const ICONS = {
  /** ① そと: 平らな 屋根の 家 */
  soto: `${open()}<rect x="2.5" y="6" width="19" height="4" rx="1" fill="currentColor"/><path d="M5 10v10h14V10"/><rect x="10" y="14" width="4" height="6" fill="currentColor" stroke="none"/></svg>`,
  /** ② なか: 屋根を はずした 部屋（かべの わくに ふとんと いす） */
  naka: `${open()}<rect x="3" y="3" width="18" height="18" rx="1.5"/><rect x="6" y="6" width="5" height="9" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="12" width="4" height="4" rx="1" fill="currentColor" stroke="none"/></svg>`,
  /** ③ なまえ: 名札 */
  namae: `${open()}<path d="M3 6h14l4 6-4 6H3z"/><circle cx="7.5" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>`,
  undo: `${open()}<path d="M8 4 3 9l5 5"/><path d="M3 9h11a6 6 0 0 1 0 12H9"/></svg>`,
  redo: `${open()}<g transform="translate(24 0) scale(-1 1)"><path d="M8 4 3 9l5 5"/><path d="M3 9h11a6 6 0 0 1 0 12H9"/></g></svg>`,
  prev: `${open({ fill: 'currentColor', stroke: 'none' })}<path d="M17 4 6 12l11 8z"/></svg>`,
  next: `${open({ fill: 'currentColor', stroke: 'none' })}<path d="M7 4l11 8-11 8z"/></svg>`,
  close: `${open({ sw: 3.2 })}<path d="M5 5l14 14M19 5 5 19"/></svg>`,
  /** ↻（みぎに まわす） */
  rotR: `${open()}<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3v6h-6"/></svg>`,
  /** ↺（ひだりに まわす） */
  rotL: `${open()}<g transform="translate(24 0) scale(-1 1)"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3v6h-6"/></g></svg>`,
  minus: `${open({ sw: 4.4 })}<path d="M5 12h14"/></svg>`,
  plus: `${open({ sw: 4.4 })}<path d="M5 12h14M12 5v14"/></svg>`,
  check: `${open({ sw: 3.4 })}<path d="M4 12.5 9.5 18 20 6"/></svg>`,
  /** よこ ↔・たて ↕ */
  width: `${open()}<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/></svg>`,
  depth: `${open()}<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/></svg>`,
  /** まど（しょうじ） */
  window: `${open()}<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M12 4v16M4 12h16"/></svg>`,
  /** まどの しゅるい（しょうじ: たてに ほそい さん） */
  shoji: `${open()}<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9.3 3v18M14.7 3v18M4 12h16"/></svg>`,
  /** やね（平らな やねの 板と はしら） */
  roof: `${open()}<rect x="2.5" y="6" width="19" height="5" rx="1" fill="currentColor"/><path d="M6 11v9M18 11v9"/></svg>`,
  /** 見本の すみの しるし（さわる 前だけ）: よこへ うごかす 矢じるし ＋ 手。手は ゆらゆら「くるっ」と うごく（CSS の .ed-swipe__hand） */
  swipe: `${open({ sw: 2 })}<path d="M4 3.6h16M6.6 1.2 4 3.6 6.6 6M17.4 1.2 20 3.6 17.4 6"/><g class="ed-swipe__hand"><path d="M8.2 15.2V9.4a1.4 1.4 0 0 1 2.8 0v3.4M11 11.9a1.4 1.4 0 0 1 2.8 0v1.3M13.8 12.5a1.4 1.4 0 0 1 2.8 0v1.5"/><path d="M16.6 13.2a1.4 1.4 0 0 1 2.7.5v3.8c0 2.7-2 4.5-4.7 4.5h-1.8c-1.9 0-3.3-.7-4.3-2.1l-3.1-4.4a1.3 1.3 0 0 1 2-1.6l1.8 1.6"/></g></svg>`,
  /** ゛（てんてん）・゜（まる）: 50 音の 11 列めの ボタン */
  dakuten: `${open({ sw: 3.4 })}<path d="M7.5 4.5l2.6 6.5M14.5 3.5l2.6 6.5"/></svg>`,
  handakuten: `${open({ sw: 3 })}<circle cx="12" cy="8.5" r="4.2"/></svg>`,
  /** 足あと（戸の 前） */
  foot: `<svg class="ed-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><g><ellipse cx="7" cy="16.4" rx="3" ry="4.2"/><circle cx="4.6" cy="10.4" r="1.15"/><circle cx="7" cy="9.4" r="1.15"/><circle cx="9.4" cy="10.4" r="1.15"/></g><g transform="translate(10 -5.5)"><ellipse cx="7" cy="16.4" rx="3" ry="4.2"/><circle cx="4.6" cy="10.4" r="1.15"/><circle cx="7" cy="9.4" r="1.15"/><circle cx="9.4" cy="10.4" r="1.15"/></g></svg>`,
  /** 天井の ちょうちんの 印 */
  lantern: `<svg class="ed-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="1.5" width="8" height="3" rx="1" fill="${P.fascia}"/><rect x="4.5" y="4" width="15" height="16" rx="5.5" fill="#E8453C" stroke="#57361F" stroke-width="1.6"/><path d="M5 9.5h14M4.6 14.5h14.8" stroke="#57361F" stroke-width="1.4" fill="none"/><rect x="8" y="19.5" width="8" height="3" rx="1" fill="${P.fascia}"/></svg>`,
  /** 建築士さんの 顔（はちまき） */
  face: `<svg class="ed-ico" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="27" r="16" fill="#F2CBA2" stroke="#6A4428" stroke-width="2"/><path d="M8.6 20.5C12 8.5 36 8.5 39.4 20.5l-1 4.5H9.6z" fill="#34446C" stroke="#28355A" stroke-width="1.6"/><rect x="8" y="19.5" width="32" height="6" rx="2" fill="#FFFFFF" stroke="#CFC6B0" stroke-width="1"/><circle cx="18" cy="31" r="2.2" fill="#2E2620"/><circle cx="30" cy="31" r="2.2" fill="#2E2620"/><path d="M19.5 37q4.5 4 9 0" fill="none" stroke="#2E2620" stroke-width="2" stroke-linecap="round"/><circle cx="12.5" cy="34" r="2.6" fill="#F0A090" opacity=".7"/><circle cx="35.5" cy="34" r="2.6" fill="#F0A090" opacity=".7"/></svg>`,
  /** 動きを 見せる 手（GIF 用） */
  hand: `<svg class="ed-ico" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 3v21l5.5-4.8 3.6 8.4 4.2-1.8-3.6-8.2H23z" fill="#FFFFFF" stroke="#141414" stroke-width="2" stroke-linejoin="round"/></svg>`,
} as const;
