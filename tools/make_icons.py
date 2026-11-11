"""生成 ElementNote 扩展图标（128/48/32/16）。依赖 Pillow + numpy。"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(os.path.dirname(HERE), "icons")
MASTER = 512

C1 = (79, 124, 255)    # #4f7cff
C2 = (124, 58, 237)    # #7c3aed
INK = (15, 23, 42, 255)


def gradient_square(size: int) -> Image.Image:
    xs = np.linspace(0.0, 1.0, size)
    ys = np.linspace(0.0, 1.0, size)
    gx, gy = np.meshgrid(xs, ys)
    t = np.clip(gx * 0.58 + gy * 0.42, 0.0, 1.0)
    r = C1[0] + (C2[0] - C1[0]) * t
    g = C1[1] + (C2[1] - C1[1]) * t
    b = C1[2] + (C2[2] - C1[2]) * t
    return Image.fromarray(np.dstack([r, g, b]).astype("uint8"), "RGB")


def rounded_mask(size: int, radius_ratio: float = 0.27) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    radius = int(size * radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def scaled(points: list[tuple[int, int]], size: int, ox: int, oy: int) -> list[tuple[int, int]]:
    k = size / 128.0
    return [(int((x + ox) * k), int((y + oy) * k)) for x, y in points]


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    base = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    base.paste(gradient_square(MASTER), (0, 0), rounded_mask(MASTER))

    # 光标影子
    cursor = [(0, 0), (0, 58), (14, 45), (23, 65), (31, 61), (22, 41), (41, 41)]
    shadow = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).polygon(
        scaled(cursor, MASTER, 45, 37), fill=(15, 23, 42, 95)
    )
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(7)))

    # 取景框角标
    brackets = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    bd = ImageDraw.Draw(brackets)
    inset = int(MASTER * 0.175)
    arm = int(MASTER * 0.105)
    width = int(MASTER * 0.040)
    color = (255, 255, 255, 232)
    corners = [
        (inset, inset, 1, 1),
        (MASTER - 1 - inset, inset, -1, 1),
        (inset, MASTER - 1 - inset, 1, -1),
        (MASTER - 1 - inset, MASTER - 1 - inset, -1, -1),
    ]
    for x0, y0, sx, sy in corners:
        bd.line([(x0, y0), (x0 + sx * arm, y0)], fill=color, width=width)
        bd.line([(x0, y0), (x0, y0 + sy * arm)], fill=color, width=width)
        cap = width // 2
        bd.ellipse([x0 - cap, y0 - cap, x0 + cap, y0 + cap], fill=color)
    base.alpha_composite(brackets)

    # 光标
    layer = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    poly = scaled(cursor, MASTER, 45, 37)
    ld.polygon(poly, fill=(255, 255, 255, 255), outline=(37, 54, 120, 255))
    base.alpha_composite(layer)

    for size in (128, 48, 32, 16):
        resized = base.resize((size, size), Image.LANCZOS)
        resized.save(os.path.join(OUT_DIR, f"icon{size}.png"))
        print("wrote", os.path.join(OUT_DIR, f"icon{size}.png"))


if __name__ == "__main__":
    main()
