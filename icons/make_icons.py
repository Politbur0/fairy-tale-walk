#!/usr/bin/env python3
"""Generate PWA PNG icons with no third-party deps (pure stdlib).

Draws a golden three-cap mushroom crown on a dark forest field — the emblem
for the Fairy Tale Walk. Re-run any time to regenerate:

    python3 icons/make_icons.py

Outputs icon-192.png, icon-512.png (transparent rounded corners) and
icon-maskable-512.png (full-bleed safe-zone version) into icons/.
"""
import os, zlib, struct, math

HERE = os.path.dirname(os.path.abspath(__file__))

# palette
BG       = (20, 24, 15)      # near-black forest green
BG2      = (28, 36, 22)      # subtle vignette lift
GOLD     = (196, 168, 130)   # --gold
GOLD_HI  = (224, 200, 162)   # lighter gold (cap highlight / spots)
BAND     = (160, 132, 94)    # crown band, slightly deeper gold


def write_png(path, w, h, px):
    def chunk(typ, data):
        body = typ + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)  # filter: none
        raw.extend(px[y * stride:(y + 1) * stride])
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(bytes(raw), 9)))
        f.write(chunk(b'IEND', b''))


def dome(px, py, cx, cy, rx, ry):
    """Upper-half ellipse (a mushroom cap dome)."""
    if py > cy:
        return False
    dx = (px - cx) / rx
    dy = (py - cy) / ry
    return dx * dx + dy * dy <= 1.0


def disc(px, py, cx, cy, r):
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def rounded_alpha(px, py, n, radius):
    """Alpha for a rounded square; 0 outside the corner radius."""
    r = radius
    for (cx, cy) in ((r, r), (n - r, r), (r, n - r), (n - r, n - r)):
        inx = (cx == r and px < r) or (cx != r and px > n - r)
        iny = (cy == r and py < r) or (cy != r and py > n - r)
        if inx and iny:
            return 1.0 if (px - cx) ** 2 + (py - cy) ** 2 <= r * r else 0.0
    return 1.0


def render(n, maskable=False):
    px = bytearray(n * n * 4)
    # emblem scale: shrink into the safe zone for maskable icons
    s = 0.74 if maskable else 1.0
    off = (1 - s) / 2
    def U(v):  # map normalized emblem coord -> pixel, honoring safe-zone inset
        return (off + v * s) * n
    radius = 0 if maskable else int(0.20 * n)

    # cap geometry (normalized)
    caps = [
        (0.30, 0.58, 0.155, 0.150),  # left
        (0.70, 0.58, 0.155, 0.150),  # right
        (0.50, 0.50, 0.205, 0.205),  # center (taller)
    ]
    spots = [(0.50, 0.44, 0.028), (0.43, 0.52, 0.020), (0.57, 0.52, 0.020),
             (0.26, 0.55, 0.018), (0.74, 0.55, 0.018)]
    band_y0, band_y1, band_x0, band_x1 = 0.585, 0.66, 0.235, 0.765

    for y in range(n):
        for x in range(n):
            i = (y * n + x) * 4
            # background with a soft vertical vignette
            t = y / n
            r = int(BG[0] + (BG2[0] - BG[0]) * (1 - t))
            g = int(BG[1] + (BG2[1] - BG[1]) * (1 - t))
            b = int(BG[2] + (BG2[2] - BG[2]) * (1 - t))
            col = (r, g, b)

            # crown band
            if U(band_x0) <= x <= U(band_x1) and U(band_y0) <= y <= U(band_y1):
                col = BAND
            # caps
            for (cx, cy, rx, ry) in caps:
                if dome(x, y, U(cx), U(cy), rx * s * n, ry * s * n):
                    col = GOLD
            # spots / highlights on caps
            for (sx, sy, sr) in spots:
                if disc(x, y, U(sx), U(sy), sr * s * n):
                    col = GOLD_HI

            a = 255
            if not maskable:
                a = int(255 * rounded_alpha(x, y, n, radius))
            px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = a
    return px


def main():
    write_png(os.path.join(HERE, 'icon-192.png'), 192, 192, render(192))
    write_png(os.path.join(HERE, 'icon-512.png'), 512, 512, render(512))
    write_png(os.path.join(HERE, 'icon-maskable-512.png'), 512, 512, render(512, maskable=True))
    print('wrote icon-192.png, icon-512.png, icon-maskable-512.png')


if __name__ == '__main__':
    main()
