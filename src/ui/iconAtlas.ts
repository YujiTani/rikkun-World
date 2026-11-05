// アイテムアイコン 32×32 の アトラス（ICON-32。docs/design/ICON-32.md）。
// 元の 絵は art/icons32/<id>.png。`python3 art/ICON-32/pack.py` で src/assets/icons32.png・.json に まとめる。
// 2D の UI だけが 使う。アトラスに ない アイテムは 今の 16×16 の 絵（CSS で 同じ 大きさに 広げる = 2 倍）。
import atlasUrl from '../assets/icons32.png?url';
import index from '../assets/icons32.json';

/** アイコンの 大きさ（px）。変える ときは pack.py の ICON_SIZE と 絵を 作りなおす */
export const ICON_SIZE = 32;

const urls = new Map<string, string>();

/** アトラスに 絵が ある id か */
export function hasAtlasIcon(id: string): boolean {
  return index.ids.includes(id);
}

/** 起動の さいしょに 1 回: アトラスを 読んで 1 枚ずつ data URL に する（DOM が ない ところでは 何も しない） */
export async function loadIconAtlas(): Promise<void> {
  if (typeof document === 'undefined' || urls.size > 0) return;
  const img = new Image();
  img.src = atlasUrl;
  await img.decode();
  index.ids.forEach((id, i) => {
    const c = document.createElement('canvas');
    c.width = ICON_SIZE;
    c.height = ICON_SIZE;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, (i % index.cols) * ICON_SIZE, Math.floor(i / index.cols) * ICON_SIZE, ICON_SIZE, ICON_SIZE, 0, 0, ICON_SIZE, ICON_SIZE);
    urls.set(id, c.toDataURL());
  });
}

/** 読みこみ ずみの 32×32 の data URL（まだ・ない ときは undefined） */
export function atlasIconUrl(id: string): string | undefined {
  return urls.get(id);
}
