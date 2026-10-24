# -*- coding: utf-8 -*-
"""生成 dsh-gpt-button 的插件列表图标（256×256 PNG）：
DeepSeek 蓝渐变圆角底 + 白色圆形按钮 + 四角星 + 两颗漂浮光点。
运行：python scripts/make-plugin-icon.py
"""
import os

from PIL import Image, ImageDraw

S = 256
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
px = img.load()

# 对角渐变：#4D6BFE（DeepSeek 蓝）→ #7FA6FF（浅蓝）
C1 = (0x4D, 0x6B, 0xFE)
C2 = (0x7F, 0xA6, 0xFF)
for y in range(S):
    for x in range(S):
        t = (x + y) / (2.0 * (S - 1))
        px[x, y] = (
            int(C1[0] + (C2[0] - C1[0]) * t),
            int(C1[1] + (C2[1] - C1[1]) * t),
            int(C1[2] + (C2[2] - C1[2]) * t),
            255,
        )

# 圆角方形蒙版
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=60, fill=255)
img.putalpha(mask)

d = ImageDraw.Draw(img, 'RGBA')

# 按钮圆形的柔和投影
d.ellipse([74, 80, 194, 200], fill=(0, 20, 90, 55))
# 白色按钮
d.ellipse([68, 62, 188, 182], fill=(255, 255, 255, 255))
# 按钮内侧淡淡的高光边
d.ellipse([74, 68, 182, 176], outline=(255, 255, 255, 120), width=2)

# 中央四角星（AI 火花）
cx, cy = 128, 122
spark = [
    (cx, cy - 34), (cx + 10, cy - 10), (cx + 34, cy),
    (cx + 10, cy + 10), (cx, cy + 34), (cx - 10, cy + 10),
    (cx - 34, cy), (cx - 10, cy - 10),
]
d.polygon(spark, fill=(0x4D, 0x6B, 0xFE, 255))

# 两颗漂浮光点（暗示按钮会漂浮）
d.ellipse([184, 74, 200, 90], fill=(255, 255, 255, 225))
d.ellipse([58, 180, 72, 194], fill=(255, 255, 255, 150))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(ROOT, 'icon.png')
img.save(out, 'PNG')
print('saved', out)
