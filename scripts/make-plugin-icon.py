# -*- coding: utf-8 -*-
"""生成 dsh-quick-launcher 图标：圆角渐变底 + 白色小火箭（256x256 PNG）。"""
from PIL import Image, ImageDraw

S = 256
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
px = img.load()

# 圆角方形 + 对角渐变（蓝 -> 紫）
r = 56
mask = Image.new('L', (S, S), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)
for y in range(S):
    for x in range(S):
        t = (x + y) / (2.0 * (S - 1))
        # #4C6FFF -> #8A5CFF
        cr = int(0x4C + (0x8A - 0x4C) * t)
        cg = int(0x6F + (0x5C - 0x6F) * t)
        cb = int(0xFF + (0xFF - 0xFF) * t)
        px[x, y] = (cr, cg, cb, 255)
img.putalpha(mask)

d = ImageDraw.Draw(img)

# 火箭机身：竖向尖顶椭圆 + 尾部收窄
body = [(128, 34), (166, 96), (166, 170), (128, 196), (90, 170), (90, 96)]
d.polygon(body, fill='white')

# 火箭尾翼
d.polygon([(90, 150), (56, 196), (90, 182)], fill='white')
d.polygon([(166, 150), (200, 196), (166, 182)], fill='white')

# 舷窗
d.ellipse([110, 96, 146, 132], fill=(0x4C, 0x6F, 0xFF, 255))
d.ellipse([118, 104, 138, 124], fill=(255, 255, 255, 255))

# 尾焰
d.polygon([(112, 196), (128, 232), (144, 196)], fill=(255, 214, 102, 255))
d.polygon([(120, 196), (128, 220), (136, 196)], fill=(255, 145, 64, 255))

import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(ROOT, 'dsh-quick-launcher', 'icon.png')
img.save(out, 'PNG')
print('saved', out)
