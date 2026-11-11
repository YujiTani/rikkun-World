#!/usr/bin/env python3
"""はっぱ・たけの 試し絵の 見本シート。画素の 正本は src/world/render/leafBambooArt.ts。"""
import os
import re
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, '.claude', 'skills', 'pixel-art-studio', 'scripts'))

ART = os.path.join(ROOT, 'src', 'world', 'render', 'leafBambooArt.ts')
OUT = os.path.dirname(__file__)

GREEN = {'.': (0, 0, 0, 0), '3': (0x2E, 0x7D, 0x22, 255), '4': (0x3E, 0x9B, 0x2F, 255), '5': (0x5D, 0xAA, 0x45, 255)}
MOMIJI = {'.': (0, 0, 0, 0), '3': (0xA3, 0x34, 0x18, 255), '4': (0xD9, 0x50, 0x2B, 255), '5': (0xDE, 0x9A, 0x38, 255)}
MATSU = {'.': (0, 0, 0, 0), '3': (0x17, 0x40, 0x2A, 255), '4': (0x2F, 0x7A, 0x4A, 255), '5': (0x3D, 0x9A, 0x58, 255)}
BAMBOO = {
    '.': (0x6D, 0xB8, 0x4F, 0),
    '5': (0xC5, 0xE0, 0x8A, 255),
    '4': (0x8F, 0xCB, 0x63, 255),
    '3': (0x5F, 0xA8, 0x44, 255),
    '2': (0x3E, 0x7A, 0x32, 255),
    '1': (0x2A, 0x5C, 0x28, 255),
}


def arrays():
    text = open(ART, encoding='utf-8').read()
    found = {}
    for m in re.finditer(r'const (SHELL_\w+|CROSS_\w+) = \[([\s\S]*?)\];', text):
        found[m.group(1)] = re.findall(r"'([^']*)'", m.group(2))
    return found


def tile(rows, ink):
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            px[x, y] = ink.get(ch, (0, 0, 0, 0))
    return im


def bamboo_rows():
    leaf = ['55.55.', '555554', '.5554.', '..554.', '...54.', '....4.', '.5.5..', '5544..']
    rows = []
    for y in range(16):
        row = ''
        node = y % 5 == 0
        for x in range(16):
            if y < 8 and x < 6:
                row += leaf[y][x]
                continue
            if x < 6:
                row += '3'
                continue
            edge = x == 6 or x == 15
            bright = x in (9, 10)
            row += '1' if node else ('2' if edge else ('4' if bright else '3'))
        rows.append(row)
    return rows


def sheet():
    a = arrays()
    sky = (110, 168, 224, 255)
    names = [
        ('はっぱ shell', a['SHELL_LEAF'], GREEN),
        ('はっぱ cross', a['CROSS_LEAF'], GREEN),
        ('もみじ shell', a['SHELL_MOMIJI'], MOMIJI),
        ('もみじ cross', a['CROSS_MOMIJI'], MOMIJI),
        ('まつ shell', a['SHELL_MATSU'], MATSU),
        ('まつ cross', a['CROSS_MATSU'], MATSU),
        ('たけ', bamboo_rows(), BAMBOO),
    ]
    scale = 8
    pad = 8
    cell = 16 * scale
    w = pad + len(names) * (cell + pad)
    h = pad + cell + pad
    canvas = Image.new('RGBA', (w, h), sky)
    for i, (_n, rows, ink) in enumerate(names):
        im = tile(rows, ink).resize((cell, cell), Image.NEAREST)
        canvas.alpha_composite(im, (pad + i * (cell + pad), pad))
    canvas.save(os.path.join(OUT, 'sheet.png'))
    # 1 倍も 残す
    strip = Image.new('RGBA', (16 * len(names), 16), sky)
    for i, (_n, rows, ink) in enumerate(names):
        strip.alpha_composite(tile(rows, ink), (i * 16, 0))
    strip.save(os.path.join(OUT, 'tiles-1x.png'))
    # 稈の 帯と 葉だけを 大きく（面に 貼る 範囲）
    stalk = tile(bamboo_rows(), BAMBOO).crop((6, 0, 10, 16)).resize((32, 128), Image.NEAREST)
    blades = tile(bamboo_rows(), BAMBOO).crop((0, 0, 6, 8)).resize((96, 128), Image.NEAREST)
    zoom = Image.new('RGBA', (32 + 16 + 96, 128), (40, 28, 24, 255))
    zoom.alpha_composite(stalk, (0, 0))
    zoom.alpha_composite(blades, (32 + 16, 0))
    zoom.save(os.path.join(OUT, 'bamboo-parts.png'))
    print('wrote', OUT)


if __name__ == '__main__':
    sheet()
