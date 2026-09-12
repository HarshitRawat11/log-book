/**
 * Generates the PWA icons into public/.
 *
 * Zero dependencies: a minimal PNG encoder over node:zlib is about eighty
 * lines, which is cheaper than pulling in sharp or an asset-generator plugin
 * for four flat-colour images. Run with `npm run icons`.
 *
 * Output is gitignored and regenerated on demand, so the source of truth for
 * the app icon is this file rather than a binary nobody can diff.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [0x0b, 0x0f, 0x14] // --bg
const FG = [0x4e, 0xa3, 0xff] // --accent
const SS = 4 // supersample factor, then box-downsample for antialiasing

// ---------------------------------------------------------------- PNG bits --

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** rgba: Uint8Array of size*size*4 */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  // 10..12 = compression, filter, interlace: all 0

  // Each scanline is prefixed with filter type 0 (None).
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const at = y * (size * 4 + 1)
    raw[at] = 0
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, at + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ------------------------------------------------------------------ drawing --

/** Renders at SS x resolution, then box-downsamples to `size`. */
function render(size, { rounded }) {
  const S = size * SS
  const buf = new Uint8Array(S * S * 4)

  const radius = rounded ? S * 0.22 : 0
  const put = (x, y, [r, g, b]) => {
    const i = (y * S + x) * 4
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b
    buf[i + 3] = 255
  }

  const insideRounded = (x, y) => {
    if (!rounded) return true
    const cx = Math.min(Math.max(x, radius), S - radius)
    const cy = Math.min(Math.max(y, radius), S - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
  }

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (insideRounded(x + 0.5, y + 0.5)) put(x, y, BG)
    }
  }

  // Barbell: bar, inner plates, outer plates. Kept inside the middle 60% so it
  // survives the maskable safe zone (a circle of radius 40% of the canvas).
  const rect = (fx, fy, fw, fh) => {
    const x0 = Math.round(fx * S)
    const y0 = Math.round(fy * S)
    const x1 = Math.round((fx + fw) * S)
    const y1 = Math.round((fy + fh) * S)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (x >= 0 && y >= 0 && x < S && y < S && insideRounded(x + 0.5, y + 0.5)) put(x, y, FG)
      }
    }
  }

  rect(0.28, 0.4725, 0.44, 0.055) // bar
  rect(0.315, 0.35, 0.055, 0.3) // inner plate, left
  rect(0.63, 0.35, 0.055, 0.3) // inner plate, right
  rect(0.245, 0.395, 0.05, 0.21) // outer plate, left
  rect(0.705, 0.395, 0.05, 0.21) // outer plate, right

  // Box-downsample SS x SS blocks -> one pixel.
  const out = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * S + (x * SS + dx)) * 4
          r += buf[i]
          g += buf[i + 1]
          b += buf[i + 2]
          a += buf[i + 3]
        }
      }
      const n = SS * SS
      const o = (y * size + x) * 4
      out[o] = Math.round(r / n)
      out[o + 1] = Math.round(g / n)
      out[o + 2] = Math.round(b / n)
      out[o + 3] = Math.round(a / n)
    }
  }
  return out
}

// --------------------------------------------------------------------- main --

mkdirSync(OUT, { recursive: true })

const targets = [
  ['icon-192.png', 192, { rounded: true }],
  ['icon-512.png', 512, { rounded: true }],
  // Maskable: full bleed, no rounding. Android applies its own mask shape and
  // will crop up to 20% off each edge.
  ['icon-maskable-512.png', 512, { rounded: false }],
  ['apple-touch-icon.png', 180, { rounded: false }],
]

for (const [name, size, opts] of targets) {
  const png = encodePng(size, render(size, opts))
  writeFileSync(join(OUT, name), png)
  console.log(`${name.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`)
}
