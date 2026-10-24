# -*- coding: utf-8 -*-
"""把 ChatGPT 的 .ico 图标转成启动坞用的 PNG（256×256 以内，保留透明通道）。

用法：
    python scripts/convert-gpt-icon.py <源.ico> [--out <输出.png>]
默认输出到 assets/gpt-icon.png。

说明：ChatGPT 标志版权归 OpenAI，本仓库只用于个人本地使用，请勿再分发图标资源。
"""
import argparse
import os

from PIL import Image


def main():
    parser = argparse.ArgumentParser(description='Convert ChatGPT .ico to launcher PNG')
    parser.add_argument('src', help='源 .ico 文件路径')
    parser.add_argument('--out', default=None, help='输出 PNG 路径（默认 assets/gpt-icon.png）')
    args = parser.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = args.out or os.path.join(root, 'assets', 'gpt-icon.png')

    img = Image.open(args.src)
    print('format:', img.format, 'size:', img.size)
    img = img.convert('RGBA')
    if max(img.size) > 256:
        img.thumbnail((256, 256), Image.LANCZOS)

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    img.save(out, 'PNG')
    print('saved', out, os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    main()
