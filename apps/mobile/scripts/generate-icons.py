"""Rasterize the simple original Playground monogram for Xcode's app icon catalog.
The source geometry matches assets/icon.svg and the Android vector drawable.
No imaging packages or external assets are required.
"""
from pathlib import Path
import json, struct, zlib

catalog = Path(__file__).resolve().parents[1] / 'ios/Playground/Images.xcassets/AppIcon.appiconset'

def color(x, y):
    ink, paper, accent = (27,81,73), (244,243,232), (223,121,83)
    inside = (34 <= x <= 47 and 25 <= y <= 84) or (34 <= x <= 57 and 25 <= y <= 69) or (x >= 57 and (x-57)**2+(y-47)**2 <= 22**2)
    cutout = (47 <= x <= 57 and 37 <= y <= 57) or (x >= 57 and (x-57)**2+(y-47)**2 <= 10**2)
    if (x-78)**2+(y-78)**2 <= 7**2: return accent
    return paper if inside and not cutout else ink

def chunk(kind, payload):
    return struct.pack('>I',len(payload))+kind+payload+struct.pack('>I',zlib.crc32(kind+payload)&0xffffffff)

def png(size):
    pixels=bytearray()
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            samples=[color((x+dx)/size*108,(y+dy)/size*108) for dx,dy in ((.25,.25),(.75,.25),(.25,.75),(.75,.75))]
            pixels.extend(round(sum(c[i] for c in samples)/4) for i in range(3))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels,9))+chunk(b'IEND',b'')

contents=json.loads((catalog/'Contents.json').read_text())
for image in contents['images']:
    size=round(float(image['size'].split('x')[0])*float(image['scale'].removesuffix('x')))
    image['filename']=f'AppIcon-{size}.png'
    (catalog/image['filename']).write_bytes(png(size))
(catalog/'Contents.json').write_text(json.dumps(contents,indent=2)+'\n')
