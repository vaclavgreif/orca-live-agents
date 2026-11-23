"""Generate small antialiased status dots for Orca's PNG-only Image component."""
from pathlib import Path
import math
import struct
import zlib

COLORS = {
    'working': (217, 119, 6),
    'waiting': (217, 119, 6),
    'blocked': (220, 38, 38),
    'done': (22, 163, 74),
    'unread': (37, 99, 235),
}


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


output = Path(__file__).resolve().parents[1] / 'assets'
output.mkdir(exist_ok=True)
for name, color in COLORS.items():
    size = 32
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            distance = math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2)
            alpha = round(255 * max(0, min(1, 14.5 - distance)))
            rows.extend((*color, alpha))
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')
    (output / f'dot-{name}.png').write_bytes(png)
