#!/usr/bin/env python3
"""Writes icons/icon.svg: six nested rings, one per cycle, each partly drawn, a tick in the middle."""
from math import pi
from pathlib import Path

COLS = ['#e0812f', '#3f9468', '#3a78c9', '#8559c4', '#cc4f78', '#ad8524']  # day..year, inside out
FILL = [1.0, .82, .66, .55, .42, .3]
rings = []
for i, (c, f) in enumerate(zip(COLS, FILL)):
    r = 92 + i * 30
    circ = 2 * pi * r
    rings.append(f'<circle cx="256" cy="256" r="{r}" fill="none" stroke="{c}" stroke-opacity=".16" stroke-width="18"/>')
    rings.append(f'<circle cx="256" cy="256" r="{r}" fill="none" stroke="{c}" stroke-width="18" stroke-linecap="round" '
                 f'stroke-dasharray="{circ * f:.1f} {circ:.1f}" transform="rotate(-90 256 256)"/>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#f7f3ec"/>
{"".join(rings)}
<path d="M216 258l28 28 54-58" fill="none" stroke="#1f1c18" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'''
out = Path(__file__).resolve().parent.parent / 'icons' / 'icon.svg'
out.write_text(svg)
print(out)
