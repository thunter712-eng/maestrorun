import { useEffect, useRef, useState } from 'react'
import conductorUrl from './assets/conductor_body.png'
import enemy1Url from './assets/enemy1_body.png'
import enemy2Url from './assets/enemy2_body.png'
import {
  fetchScores,
  submitScore,
  isProfane,
  cleanInitials,
  getLastInitials,
  qualifies,
} from './scores'

/* ----------------------------------------------------------------------------
 * The Maestro's Run — a Washington DC endless runner.
 * Canvas engine, requestAnimationFrame loop, no game libraries.
 * Logical resolution is fixed (16:9); the canvas is scaled to fit via CSS,
 * and rendered at devicePixelRatio for crispness on retina / phone screens.
 *
 * Two verbs: JUMP (space / up / tap) and SLIDE (down / swipe-down) to duck
 * under hanging banner beams. The score multiplier is rhythmic — collecting
 * music on the beat builds a combo. The run moves through four "Movements",
 * each with its own palette and ambient flourish.
 * -------------------------------------------------------------------------- */

const W = 960 // logical width
const H = 540 // logical height
const GROUND_Y = H - 84 // y of the ground line (player's feet rest here)

const GRAVITY = 2400 // px / s^2
const JUMP_V = -880 // px / s  (single jump)
const START_SPEED = 270 // px / s
const MAX_SPEED = 520
const SPEED_RAMP = 5.0 // px/s added per second of play

const PLAYER_H = 188 // standing sprite height in px (feet at GROUND_Y)
const ENEMY_H = 182

const SLIDE_TIME = 0.62 // how long a slide/duck lasts
const BEAM_Y = GROUND_Y - 150 // hanging beam height (slide under it)
const BEAM_W = 88

const ONBEAT_WIN = 0.12 // +/- seconds around a beat that counts as "on beat"
const COMBO_MAX = 5
const COMBO_DECAY = 3.0 // seconds of no on-beat pickup before the combo resets

const ACT_LEN = 800 // score points per Movement
const ACT_FADE = 1.6 // seconds to cross-fade palettes between Movements

const PLAYER_X = 170 // player's fixed x position
// Enemies (jump) and beams (slide) ask for opposite verbs, and a slide only
// works on the ground — so they must never arrive close enough that you can't
// land from a jump and then duck. This is the minimum spacing, in seconds of
// travel time *measured at the player*, between consecutive obstacles. It must
// exceed jump airtime (~0.73s) plus reaction time.
const MIN_OBSTACLE_GAP = 1.05

const MUTE_KEY = 'maestro-muted' // a sound preference, not a score

// Collectible kinds
const KINDS = {
  note: { value: 10, r: 16, color: '#f5ecd8' },
  treble: { value: 25, r: 20, color: '#e8b84b' },
  page: { value: 50, r: 22, color: '#f2d489' },
}

/* ------------------------------- Characters ------------------------------- */
// Three playable characters. Whoever you DON'T pick becomes your "rivals" (the
// runners coming at you). Each has a signature weapon on a short cooldown.
// NOTE: the character id doubles as its image key in imagesRef.
const CHARACTERS = {
  john: { name: 'John', weapon: 'soccer', weaponName: 'Soccer kick', icon: '⚽' },
  brent: { name: 'Brent', weapon: 'eraser', weaponName: 'Chalk eraser', icon: '🧽' },
  dan: { name: 'Dan', weapon: 'trombone', weaponName: 'Trombone whack', icon: '🎺' },
}
const CHARACTER_ORDER = ['john', 'brent', 'dan']
const CHARACTER_KEY = 'maestro-character'
// id -> sprite url (reuses the existing body art)
const CHAR_IMG = { john: conductorUrl, brent: enemy1Url, dan: enemy2Url }

const WEAPON_COOLDOWN = 1.0 // seconds between attacks
const PROJECTILE_SPEED = 780 // px/s, kicked/served forward (screen space)
const MELEE_RANGE = 156 // px in front the trombone can reach
const SWING_TIME = 0.28 // trombone swing animation length

const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const lerp = (a, b, t) => a + (b - a) * t

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mixHex(a, b, t) {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return `rgb(${lerp(A[0], B[0], t) | 0},${lerp(A[1], B[1], t) | 0},${lerp(A[2], B[2], t) | 0})`
}

/* ------------------------------- Movements -------------------------------- */
// Each act swaps the palette, ambient flourish, and the backing music's key.
const ACTS = [
  {
    name: 'Movement I · Allegro',
    sky: ['#0b1030', '#1a1f4d', '#7d3a63', '#c8607a', '#e7a06a'],
    far: '#14183a',
    mid: '#10153a',
    ground: ['#15183a', '#090b1f'],
    haze: '#e7a06a',
    accent: '#e8b84b',
    stars: 1,
    moon: 0.9,
    ambient: 'none',
    bpm: 112,
    music: { bass: [65.41, 98.0, 110.0, 87.31], chord: [1, 1.26, 1.5] },
  },
  {
    name: 'Movement II · Andante',
    sky: ['#7fb6e6', '#a9d2f0', '#dfeaf6', '#f6dbe6', '#f4c9d9'],
    far: '#6b86b8',
    mid: '#3b4f86',
    ground: ['#3a4a6a', '#1a2238'],
    haze: '#f4c9d9',
    accent: '#e86a8c',
    stars: 0,
    moon: 0,
    ambient: 'petal',
    bpm: 120,
    music: { bass: [98.0, 130.81, 146.83, 123.47], chord: [1, 1.26, 1.5] },
  },
  {
    name: 'Movement III · Notturno',
    sky: ['#05060f', '#0a0e26', '#161a3a', '#241247', '#3a1a4a'],
    far: '#0e1230',
    mid: '#080a1f',
    ground: ['#0c0f24', '#04050f'],
    haze: '#3a1a4a',
    accent: '#9b7be0',
    stars: 1,
    moon: 1,
    ambient: 'firework',
    bpm: 96,
    music: { bass: [110.0, 82.41, 98.0, 87.31], chord: [1, 1.19, 1.5] },
  },
  {
    name: 'Finale · Maestoso',
    sky: ['#2a1840', '#7a2f55', '#d06a55', '#f2a85a', '#ffe39c'],
    far: '#5a3a6a',
    mid: '#3a2150',
    ground: ['#2a1c10', '#120a06'],
    haze: '#ffe39c',
    accent: '#ffd56a',
    stars: 0.3,
    moon: 0.4,
    ambient: 'confetti',
    bpm: 128,
    music: { bass: [87.31, 130.81, 116.54, 98.0], chord: [1, 1.26, 1.5] },
  },
]

/* ----------------------------------------------------------------------------
 * Audio: tiny WebAudio synth. SFX (pickups, fanfare) plus a per-beat backing
 * track that the gameplay drives, so the music and the combo timing share a
 * clock. Everything is gated by a mute flag.
 * -------------------------------------------------------------------------- */
function makeAudio() {
  let ctx = null
  let muted = false
  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC) ctx = new AC()
    }
    if (ctx && ctx.state === 'suspended') ctx.resume()
    return ctx
  }
  const tone = (freq, t0, dur, type = 'sine', gain = 0.12) => {
    const c = ctx
    if (!c) return
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(c.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }
  return {
    unlock: ensure,
    setMuted(m) {
      muted = m
    },
    // backing track: one bass note per beat, a chord pad on downbeats,
    // and a faint tick. `bar` is the running beat index.
    beat(music, bar) {
      const c = ensure()
      if (!c || muted) return
      const t0 = c.currentTime
      const root = music.bass[((bar % music.bass.length) + music.bass.length) % music.bass.length]
      tone(root, t0, 0.2, 'sine', 0.09)
      if (bar % 2 === 0) {
        music.chord.forEach((mult) => tone(root * 2 * mult, t0, 0.34, 'triangle', 0.04))
      }
      tone(2100, t0, 0.025, 'square', 0.012) // soft tick
    },
    blip(value, perfect) {
      const c = ensure()
      if (!c || muted) return
      const base = value >= 50 ? 880 : value >= 25 ? 660 : 523.25
      tone(base, c.currentTime, 0.12, 'triangle', 0.1)
      tone(base * 1.5, c.currentTime + 0.04, 0.1, 'sine', 0.06)
      if (perfect) {
        // a brighter sparkle for an on-beat catch
        tone(base * 2, c.currentTime + 0.02, 0.14, 'sine', 0.07)
        tone(base * 3, c.currentTime + 0.07, 0.1, 'sine', 0.04)
      }
    },
    fanfare() {
      const c = ensure()
      if (!c || muted) return
      const notes = [523.25, 659.25, 783.99, 1046.5]
      notes.forEach((f, i) => {
        const t = c.currentTime + i * 0.085
        tone(f, t, 0.26, 'triangle', 0.14)
        tone(f * 2, t, 0.18, 'sine', 0.05)
      })
    },
    thud() {
      const c = ensure()
      if (!c || muted) return
      tone(160, c.currentTime, 0.3, 'sawtooth', 0.12)
      tone(80, c.currentTime, 0.4, 'sine', 0.12)
    },
    stomp() {
      const c = ensure()
      if (!c || muted) return
      tone(420, c.currentTime, 0.1, 'square', 0.12)
      tone(210, c.currentTime + 0.05, 0.14, 'square', 0.1)
      tone(90, c.currentTime, 0.16, 'sine', 0.12)
    },
    buzz() {
      const c = ensure()
      if (!c || muted) return
      tone(220, c.currentTime, 0.22, 'sawtooth', 0.11)
      tone(233, c.currentTime, 0.22, 'sawtooth', 0.09)
      tone(110, c.currentTime + 0.1, 0.26, 'square', 0.1)
    },
    chime() {
      const c = ensure()
      if (!c || muted) return
      tone(1320, c.currentTime, 0.12, 'sine', 0.07)
      tone(1760, c.currentTime + 0.05, 0.14, 'sine', 0.05)
    },
  }
}

// Shown as a big banner every 500 points.
const MILESTONES = [
  'Go Sports',
  'Ticklish Reuben Rocks!',
  'Bring It!',
  'No Shenanigans',
]

/* --------------------------- Landmark silhouettes -------------------------- */
function capitol(ctx, x, baseY, s, fill) {
  ctx.fillStyle = fill
  const w = 150 * s
  const bodyH = 70 * s
  ctx.fillRect(x - w / 2, baseY - bodyH, w, bodyH)
  ctx.fillRect(x - w / 2 - 22 * s, baseY - bodyH * 0.7, 22 * s, bodyH * 0.7)
  ctx.fillRect(x + w / 2, baseY - bodyH * 0.7, 22 * s, bodyH * 0.7)
  const drumW = 50 * s
  ctx.fillRect(x - drumW / 2, baseY - bodyH - 30 * s, drumW, 30 * s)
  ctx.beginPath()
  ctx.arc(x, baseY - bodyH - 30 * s, drumW / 2, Math.PI, 0)
  ctx.fill()
  ctx.fillRect(x - 5 * s, baseY - bodyH - 30 * s - 26 * s, 10 * s, 26 * s)
  ctx.beginPath()
  ctx.arc(x, baseY - bodyH - 30 * s - 30 * s, 4 * s, 0, Math.PI * 2)
  ctx.fill()
}

function monument(ctx, x, baseY, s, fill) {
  ctx.fillStyle = fill
  const topW = 14 * s
  const botW = 26 * s
  const h = 168 * s
  ctx.beginPath()
  ctx.moveTo(x - botW / 2, baseY)
  ctx.lineTo(x - topW / 2, baseY - h + 16 * s)
  ctx.lineTo(x, baseY - h)
  ctx.lineTo(x + topW / 2, baseY - h + 16 * s)
  ctx.lineTo(x + botW / 2, baseY)
  ctx.closePath()
  ctx.fill()
}

function lincoln(ctx, x, baseY, s, fill) {
  ctx.fillStyle = fill
  const w = 132 * s
  const h = 52 * s
  ctx.fillRect(x - w / 2 - 10 * s, baseY - 10 * s, w + 20 * s, 10 * s)
  ctx.fillRect(x - w / 2, baseY - h, w, h - 10 * s)
  ctx.fillRect(x - w / 2 - 6 * s, baseY - h - 10 * s, w + 12 * s, 10 * s)
  ctx.fillRect(x - w / 2 + 4 * s, baseY - h - 16 * s, w - 8 * s, 6 * s)
}

function farBuilding(ctx, x, baseY, w, h, fill) {
  ctx.fillStyle = fill
  ctx.fillRect(x, baseY - h, w, h)
}

/* ------------------------------ Collectibles ------------------------------ */
function drawNote(ctx, x, y, r, color, glow) {
  ctx.save()
  ctx.translate(x, y)
  if (glow) {
    ctx.shadowColor = color
    ctx.shadowBlur = 16
  }
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.22
  ctx.beginPath()
  ctx.moveTo(r * 0.55, r * 0.2)
  ctx.lineTo(r * 0.55, -r * 0.95)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(r * 0.55, -r * 0.95)
  ctx.quadraticCurveTo(r * 1.25, -r * 0.8, r * 0.95, -r * 0.15)
  ctx.quadraticCurveTo(r * 1.05, -r * 0.6, r * 0.55, -r * 0.55)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(0, r * 0.2, r * 0.62, r * 0.46, -0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawTreble(ctx, x, y, r, color, glow) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(r / 20, r / 20)
  if (glow) {
    ctx.shadowColor = color
    ctx.shadowBlur = 18
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 3.4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(2, -20)
  ctx.bezierCurveTo(14, -14, 12, 2, -2, 6)
  ctx.bezierCurveTo(-14, 9, -12, -8, 2, -6)
  ctx.bezierCurveTo(12, -4, 10, 18, -2, 20)
  ctx.bezierCurveTo(-9, 21, -11, 14, -8, 11)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(2, -20)
  ctx.lineTo(2, 22)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(-2, 24, 2.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawPage(ctx, x, y, r, color, glow, t) {
  ctx.save()
  ctx.translate(x, y)
  if (glow) {
    ctx.shadowColor = color
    ctx.shadowBlur = 18
  }
  const w = r * 1.5
  const h = r * 1.9
  ctx.rotate(Math.sin(t * 2 + x) * 0.06)
  ctx.fillStyle = '#fbf4e2'
  ctx.strokeStyle = 'rgba(17,21,46,0.25)'
  ctx.lineWidth = 1
  roundRect(ctx, -w / 2, -h / 2, w, h, 3)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = 'rgba(17,21,46,0.55)'
  ctx.lineWidth = 1
  for (let i = 0; i < 4; i++) {
    const yy = -h / 2 + h * (0.28 + i * 0.15)
    ctx.beginPath()
    ctx.moveTo(-w / 2 + 4, yy)
    ctx.lineTo(w / 2 - 4, yy)
    ctx.stroke()
  }
  ctx.fillStyle = '#11152e'
  ctx.beginPath()
  ctx.arc(-w * 0.1, -h * 0.04, 1.8, 0, Math.PI * 2)
  ctx.arc(w * 0.12, h * 0.12, 1.8, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/* --------------------------- Character rendering -------------------------- */
// Full-body cartoon sprites. The art is static, so a run is faked with a
// vertical bob plus a little rocking lean; sliding squashes the figure down.
// Feet are anchored at (x, feetY).
function drawSprite(ctx, opts) {
  const {
    img,
    x,
    feetY,
    h,
    facing = 1,
    crouch = 0,
    bob = 0,
    lean = 0,
    glow = false,
    invinciblePulse = 0,
    shadow = true,
  } = opts
  if (!img || !img.complete || !img.naturalWidth) return

  const ar = img.naturalWidth / img.naturalHeight
  const drawH = h * (1 - crouch * 0.5)
  const drawW = drawH * ar * (1 + crouch * 0.22) // squash: shorter + a touch wider

  // contact shadow on the ground
  if (shadow) {
    ctx.save()
    ctx.globalAlpha = 0.26
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.ellipse(x, feetY + 2, drawW * 0.34, 7, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // invincibility glow
  if (glow) {
    ctx.save()
    const gy = feetY - drawH * 0.5 + bob
    const a = 0.32 + 0.22 * Math.sin(invinciblePulse * 12)
    const g = ctx.createRadialGradient(x, gy, 12, x, gy, drawH * 0.62)
    g.addColorStop(0, `rgba(242,212,137,${a})`)
    g.addColorStop(1, 'rgba(242,212,137,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, gy, drawH * 0.62, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  ctx.translate(x, feetY + bob)
  ctx.rotate(lean)
  ctx.scale(facing, 1)
  ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH)
  ctx.restore()
}

/* ----------------------- The golden baton power-up ------------------------ */
function drawGoldenBaton(ctx, x, y, t) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.6 + Math.sin(t * 3) * 0.12)
  const pulse = 0.6 + 0.4 * Math.sin(t * 6)
  ctx.shadowColor = `rgba(242,212,137,${0.6 * pulse + 0.3})`
  ctx.shadowBlur = 26
  const grad = ctx.createLinearGradient(-22, 0, 22, 0)
  grad.addColorStop(0, '#b8860b')
  grad.addColorStop(0.5, '#f2d489')
  grad.addColorStop(1, '#fff6d8')
  ctx.strokeStyle = grad
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-20, 14)
  ctx.lineTo(20, -14)
  ctx.stroke()
  ctx.fillStyle = '#8a5a12'
  ctx.beginPath()
  ctx.arc(-20, 14, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff6d8'
  ctx.beginPath()
  ctx.arc(20, -14, 3.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = `rgba(255,246,216,${pulse})`
  ctx.lineWidth = 1.4
  const sp = 9 * pulse
  ctx.beginPath()
  ctx.moveTo(20 - sp, -14)
  ctx.lineTo(20 + sp, -14)
  ctx.moveTo(20, -14 - sp)
  ctx.lineTo(20, -14 + sp)
  ctx.stroke()
  ctx.restore()
}

/* --------------------- The purple-heart hazard (avoid!) -------------------- */
function drawHeart(ctx, x, y, r, t) {
  ctx.save()
  ctx.translate(x, y)
  const pulse = 0.85 + 0.15 * Math.sin(t * 5 + x)
  ctx.scale((r / 20) * pulse, (r / 20) * pulse)
  ctx.shadowColor = 'rgba(150,110,230,0.85)'
  ctx.shadowBlur = 22
  const grad = ctx.createLinearGradient(0, -18, 0, 20)
  grad.addColorStop(0, '#a472e6')
  grad.addColorStop(1, '#6a3bb0')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(0, 18)
  ctx.bezierCurveTo(-20, 2, -16, -18, 0, -8)
  ctx.bezierCurveTo(16, -18, 20, 2, 0, 18)
  ctx.closePath()
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.ellipse(-6, -4, 3.4, 5, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/* ----------------- The hanging banner beam (slide under it!) --------------- */
function drawBeam(ctx, x, y, w, t, accent) {
  ctx.save()
  const sway = Math.sin(t * 2 + x * 0.01) * 3
  ctx.translate(x, y + sway)
  // suspension chains up out of frame
  ctx.strokeStyle = 'rgba(245,236,216,0.45)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-w / 2 + 12, -12)
  ctx.lineTo(-w / 2 + 12, -120)
  ctx.moveTo(w / 2 - 12, -12)
  ctx.lineTo(w / 2 - 12, -120)
  ctx.stroke()
  // the bar
  const grad = ctx.createLinearGradient(0, -12, 0, 14)
  grad.addColorStop(0, '#2a2030')
  grad.addColorStop(1, '#11101c')
  ctx.fillStyle = grad
  roundRect(ctx, -w / 2, -12, w, 24, 6)
  ctx.fill()
  ctx.strokeStyle = accent
  ctx.lineWidth = 2
  ctx.stroke()
  // bunting triangles hanging below — what you must duck under
  ctx.fillStyle = accent
  const n = 6
  for (let i = 0; i < n; i++) {
    const bx = -w / 2 + (i + 0.5) * (w / n)
    ctx.beginPath()
    ctx.moveTo(bx - 6, 12)
    ctx.lineTo(bx + 6, 12)
    ctx.lineTo(bx, 30)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/* -------------------------------- Weapons --------------------------------- */
function pentagon(ctx, cx, cy, r) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2
    const px = cx + Math.cos(a) * r
    const py = cy + Math.sin(a) * r
    if (i) ctx.lineTo(px, py)
    else ctx.moveTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
}

function drawSoccerBall(ctx, x, y, r, rot) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.fillStyle = '#f6f6f2'
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#16181d'
  pentagon(ctx, 0, 0, r * 0.42)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2
    pentagon(ctx, Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74, r * 0.2)
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

// A chalkboard eraser: wooden top, felt base, chalk streaks + a little dust.
function drawEraser(ctx, x, y, r, rot) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot * 0.5) // tumbles slower than a ball
  const w = r * 2.3
  const h = r * 1.35
  // felt base (light)
  ctx.fillStyle = '#ece7d8'
  roundRect(ctx, -w / 2, -h / 2, w, h, 3)
  ctx.fill()
  // wooden top half
  ctx.fillStyle = '#7a4a24'
  roundRect(ctx, -w / 2, -h / 2, w, h * 0.5, 3)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1
  roundRect(ctx, -w / 2, -h / 2, w, h, 3)
  ctx.stroke()
  // chalk streaks across the felt
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 1.3
  for (let i = -1; i <= 1; i++) {
    const yy = h * 0.14 + i * 3
    ctx.beginPath()
    ctx.moveTo(-w / 2 + 3, yy)
    ctx.lineTo(w / 2 - 3, yy)
    ctx.stroke()
  }
  ctx.restore()
}

// `prog` 0→1 over the swing (0 = wound up, ~0.5 = full extension forward).
function drawTrombone(ctx, x, y, prog, scale = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  const swing = Math.sin(prog * Math.PI) // 0..1..0
  ctx.rotate(-0.55 + swing * 0.6)
  ctx.strokeStyle = '#e8b84b'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.shadowColor = 'rgba(232,184,75,0.6)'
  ctx.shadowBlur = 10
  const reach = 50 + swing * 16 // the slide extends on the whack
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(reach, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(reach - 10, 0)
  ctx.lineTo(reach - 10, 14)
  ctx.lineTo(6, 14)
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.fillStyle = '#f2d489'
  ctx.beginPath()
  ctx.ellipse(reach + 8, 0, 9, 14, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawWeaponSmall(ctx, weapon, x, y, t) {
  if (weapon === 'soccer') drawSoccerBall(ctx, x, y, 10, t * 2)
  else if (weapon === 'eraser') drawEraser(ctx, x, y, 7, t * 2)
  else drawTrombone(ctx, x - 6, y, 0.5, 0.42)
}

/* ------------------------------- Particles -------------------------------- */
function drawParticle(ctx, p) {
  const a = clamp01(p.life / p.life0)
  ctx.save()
  ctx.globalAlpha = a
  if (p.kind === 'petal') {
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (p.kind === 'confetti') {
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    ctx.fillStyle = p.color
    ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size)
  } else if (p.kind === 'trail') {
    ctx.fillStyle = p.color
    ctx.shadowColor = p.color
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // spark, dust, firework
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/* =========================================================================== */
export default function Game() {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)

  const [phase, setPhase] = useState('ready') // ready | running | gameover
  const [finalScore, setFinalScore] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [muted, setMuted] = useState(false)
  const [character, setCharacter] = useState('john') // chosen playable character

  const [leaderboard, setLeaderboard] = useState([])
  const [entering, setEntering] = useState(false) // awaiting initials input
  const [initials, setInitials] = useState('')
  const [initialsError, setInitialsError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const phaseRef = useRef('ready')
  const audioRef = useRef(null)
  const imagesRef = useRef({})
  const gameRef = useRef(null)
  const mutedRef = useRef(false)
  const gameoverAtRef = useRef(0)
  const touchRef = useRef({ x: 0, y: 0, handled: false })
  const enteringRef = useRef(false)
  const boardRef = useRef([]) // latest fetched leaderboard
  const characterRef = useRef('john') // mirror of `character` for the game loop
  const actionBtnRef = useRef(null) // mobile attack button (for cooldown styling)

  const isTouch =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0)

  // Load images + audio + mute preference once.
  useEffect(() => {
    audioRef.current = makeAudio()
    const savedMute = localStorage.getItem(MUTE_KEY) === '1'
    mutedRef.current = savedMute
    setMuted(savedMute)
    audioRef.current.setMuted(savedMute)

    const savedChar = localStorage.getItem(CHARACTER_KEY)
    if (savedChar && CHARACTERS[savedChar]) {
      characterRef.current = savedChar
      setCharacter(savedChar)
    }

    const load = (src) => {
      const im = new Image()
      im.src = src
      return im
    }
    // image keys match character ids (john/brent/dan)
    imagesRef.current = {
      john: load(conductorUrl),
      brent: load(enemy1Url),
      dan: load(enemy2Url),
    }

    // load the leaderboard (local now; remote once published)
    fetchScores().then((board) => {
      boardRef.current = board
      setLeaderboard(board)
    })
  }, [])

  function toggleMute() {
    const m = !mutedRef.current
    mutedRef.current = m
    setMuted(m)
    audioRef.current?.setMuted(m)
    localStorage.setItem(MUTE_KEY, m ? '1' : '0')
    audioRef.current?.unlock()
  }

  // Fresh game state.
  function resetGame() {
    gameRef.current = {
      t: 0,
      worldX: 0,
      speed: START_SPEED,
      score: 0,
      player: {
        x: 170,
        y: GROUND_Y,
        vy: 0,
        onGround: true,
        prevOnGround: true,
        runPhase: 0,
        sliding: false,
        slideUntil: 0,
        crouch: 0,
      },
      collectibles: [],
      enemies: [],
      powerups: [],
      hazards: [], // purple hearts to avoid
      beams: [], // overhead banner beams to slide under
      particles: [],
      floats: [], // score popups
      // weapons: the two characters you didn't pick are your rivals
      rivals: CHARACTER_ORDER.filter((c) => c !== characterRef.current),
      projectiles: [], // soccer balls / chalk erasers in flight
      weaponReadyAt: 0, // g.t at which you can attack again
      meleeSwing: 0, // trombone swing animation timer
      meleePending: false, // a melee whack to resolve this frame
      invincibleUntil: 0,
      spawnTimer: 0.6,
      enemyTimer: 1.8,
      powerTimer: rand(9, 14),
      hazardTimer: rand(5, 9),
      beamTimer: 4.0,
      lastObstacleArrival: -100, // when the last enemy/beam reaches the player

      fireTimer: 0.5,
      milestone: 0,
      lastBanner: -1,
      shake: 0,
      hitStop: 0,
      // rhythm
      combo: 1,
      comboTimer: 0,
      perfectFlash: 0,
      beatIndex: -1,
      beatFlash: 0,
      // acts
      actIndex: 0,
      prevActIndex: 0,
      actBlend: 1,
      actScoreNext: ACT_LEN,
    }
  }

  function startGame() {
    audioRef.current?.unlock()
    resetGame()
    enteringRef.current = false
    setEntering(false)
    setInitials('')
    setInitialsError('')
    phaseRef.current = 'running'
    setPhase('running')
    setShowHint(true)
    setTimeout(() => setShowHint(false), 4200)
  }

  function endGame() {
    const g = gameRef.current
    const score = Math.floor(g.score)
    phaseRef.current = 'gameover'
    gameoverAtRef.current = performance.now()
    audioRef.current?.thud()

    const qual = qualifies(score, boardRef.current)
    setFinalScore(score)
    setLeaderboard(boardRef.current)
    setInitials(qual ? getLastInitials() : '')
    setInitialsError('')
    enteringRef.current = qual
    setEntering(qual)
    setShowHint(false)
    setPhase('gameover')
  }

  // Save the entered initials to the leaderboard (with a profanity guard).
  async function submitInitials() {
    const ini = cleanInitials(initials)
    if (ini.length < 1) {
      setInitialsError('Enter 1–3 letters.')
      return
    }
    if (isProfane(ini)) {
      setInitialsError('Whoa, maestro — keep it classy.')
      return
    }
    setSubmitting(true)
    const board = await submitScore(ini, finalScore)
    boardRef.current = board
    setLeaderboard(board)
    setSubmitting(false)
    enteringRef.current = false
    setEntering(false)
  }

  function doJump() {
    const g = gameRef.current
    if (!g) return
    const p = g.player
    p.sliding = false
    if (p.onGround) {
      p.vy = JUMP_V
      p.onGround = false
    }
  }

  function doSlide() {
    const g = gameRef.current
    if (!g) return
    const p = g.player
    if (p.onGround) {
      p.sliding = true
      p.slideUntil = g.t + SLIDE_TIME
    }
  }

  // Fire the chosen character's weapon (gated by a cooldown). Projectiles are
  // pushed as data here; the update loop resolves their hits (and the melee).
  function doAttack() {
    const g = gameRef.current
    if (!g || phaseRef.current !== 'running') return
    if (g.t < g.weaponReadyAt) return
    g.weaponReadyAt = g.t + WEAPON_COOLDOWN
    const weapon = CHARACTERS[characterRef.current].weapon
    const p = g.player
    const curH = PLAYER_H * (1 - p.crouch * 0.5)
    if (weapon === 'trombone') {
      g.meleeSwing = SWING_TIME
      g.meleePending = true
      audioRef.current?.stomp()
    } else {
      g.projectiles.push({
        kind: weapon,
        x: p.x + 34,
        y: p.y - curH * 0.5,
        vx: PROJECTILE_SPEED,
        rot: 0,
        dead: false,
      })
      audioRef.current?.blip(50, false)
    }
  }

  function chooseCharacter(id) {
    if (!CHARACTERS[id]) return
    characterRef.current = id
    setCharacter(id)
    try {
      localStorage.setItem(CHARACTER_KEY, id)
    } catch {
      /* ignore */
    }
    audioRef.current?.unlock()
  }

  // Unified jump/start handler.
  function handlePress() {
    const ph = phaseRef.current
    if (ph === 'ready') {
      startGame()
    } else if (ph === 'running') {
      doJump()
    } else if (ph === 'gameover') {
      if (enteringRef.current) return // typing initials — don't restart
      if (performance.now() - gameoverAtRef.current > 500) startGame()
    }
  }

  // Keyboard.
  useEffect(() => {
    const onKey = (e) => {
      // never hijack keys while the player is typing their initials
      if (enteringRef.current) return
      if (e.code === 'KeyM') {
        toggleMute()
        return
      }
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ') {
        e.preventDefault()
        if (phaseRef.current === 'gameover') startGame()
        else handlePress()
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault()
        if (phaseRef.current === 'running') doSlide()
      } else if (e.code === 'KeyF' || e.code === 'KeyE') {
        e.preventDefault()
        if (phaseRef.current === 'running') doAttack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ----- main loop -----
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    let raf
    let last = performance.now()
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const stars = Array.from({ length: 70 }, () => ({
      x: Math.random() * W * 2,
      y: Math.random() * (GROUND_Y - 200),
      r: Math.random() * 1.3 + 0.2,
      tw: Math.random() * Math.PI * 2,
    }))

    /* ---- particle spawners ---- */
    function burst(g, x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = rand(40, 180)
        g.particles.push({
          kind: 'spark',
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 40,
          grav: 320,
          size: rand(1.5, 3.2),
          color,
          life: rand(0.4, 0.7),
          life0: 0.7,
          rot: 0,
          spin: 0,
        })
      }
    }
    function dust(g, x, y) {
      for (let i = 0; i < 7; i++) {
        g.particles.push({
          kind: 'dust',
          x: x + rand(-6, 6),
          y,
          vx: rand(-70, 70),
          vy: rand(-30, -90),
          grav: 200,
          size: rand(2, 4),
          color: 'rgba(220,210,188,0.7)',
          life: rand(0.3, 0.55),
          life0: 0.55,
        })
      }
    }
    function firework(g) {
      const x = rand(W * 0.2, W * 0.95)
      const y = rand(H * 0.12, H * 0.42)
      const hue = pick(['#f2d489', '#e86a8c', '#9b7be0', '#7fd0e6', '#fff6d8'])
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2
        const sp = rand(60, 150)
        g.particles.push({
          kind: 'firework',
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          grav: 70,
          size: rand(1.5, 2.8),
          color: hue,
          life: rand(0.8, 1.3),
          life0: 1.3,
        })
      }
      audioRef.current?.chime()
    }

    function spawnAmbient(g, act, dt) {
      if (act.ambient === 'petal') {
        if (Math.random() < dt * 7) {
          const fromTop = Math.random() < 0.5
          g.particles.push({
            kind: 'petal',
            x: fromTop ? rand(0, W) : W + 10,
            y: fromTop ? -10 : rand(0, GROUND_Y - 120),
            vx: -(g.speed * 0.12) - rand(8, 30),
            vy: rand(12, 30),
            grav: 6,
            sway: rand(0.6, 1.4),
            phase: Math.random() * Math.PI * 2,
            size: rand(4, 7),
            color: pick(['#f9d3e0', '#f4b8cf', '#ffe1ec']),
            rot: Math.random() * Math.PI,
            spin: rand(-2, 2),
            life: 14,
            life0: 14,
          })
        }
      } else if (act.ambient === 'confetti') {
        if (Math.random() < dt * 14) {
          g.particles.push({
            kind: 'confetti',
            x: rand(0, W),
            y: -10,
            vx: -(g.speed * 0.1) - rand(0, 20),
            vy: rand(40, 90),
            grav: 30,
            sway: rand(1, 2.5),
            phase: Math.random() * Math.PI * 2,
            size: rand(3, 5),
            color: pick(['#ffd56a', '#e86a8c', '#7fd0e6', '#f5ecd8', '#9b7be0']),
            rot: Math.random() * Math.PI,
            spin: rand(-6, 6),
            life: 9,
            life0: 9,
          })
        }
      } else if (act.ambient === 'firework') {
        g.fireTimer -= dt
        if (g.fireTimer <= 0) {
          firework(g)
          g.fireTimer = rand(0.7, 1.5)
        }
      }
    }

    function spawnCollectible(g) {
      const r = Math.random()
      const kind = r < 0.6 ? 'note' : r < 0.88 ? 'treble' : 'page'
      const low = GROUND_Y - 40
      const high = GROUND_Y - 230
      const y = rand(high, low)
      g.collectibles.push({ x: W + 40, y, kind, bob: Math.random() * Math.PI * 2, dead: false })
    }

    function spawnEnemy(g, extra) {
      const pool = g.rivals && g.rivals.length ? g.rivals : ['brent', 'dan']
      const which = pool[(Math.random() * pool.length) | 0]
      g.enemies.push({
        x: W + 60,
        feetY: GROUND_Y,
        which,
        runPhase: Math.random() * Math.PI * 2,
        extra,
      })
    }

    // Reserve an obstacle slot if it lands far enough after the previous one.
    // `vx` is the obstacle's total leftward speed; arrival is when it reaches
    // the player. Returns false (caller should retry shortly) if it's too soon.
    function reserveSlot(g, spawnX, vx) {
      const arrival = g.t + (spawnX - PLAYER_X) / vx
      if (arrival < g.lastObstacleArrival + MIN_OBSTACLE_GAP) return false
      g.lastObstacleArrival = arrival
      return true
    }

    function knockEnemy(g, e) {
      e.knocked = true
      e.knockVy = -300
      e.spin = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3)
      e.rot = 0
      e.alpha = 1
      g.score += 75
      g.floats.push({ x: e.x, y: e.feetY - 130, text: '+75', life: 1.0, color: '#f2d489' })
      g.floats.push({
        x: e.x,
        y: e.feetY - 162,
        text: pick(['BRAVO!', 'MAESTRO!', 'TEMPO!', 'ENCORE!']),
        life: 1.0,
        color: '#f5ecd8',
      })
      burst(g, e.x, e.feetY - 110, '#f2d489', 14)
      g.hitStop = Math.max(g.hitStop, 0.06)
      audioRef.current?.stomp()
    }

    function spawnPowerup(g) {
      g.powerups.push({
        x: W + 50,
        y: GROUND_Y - rand(120, 200),
        bob: Math.random() * Math.PI * 2,
      })
    }

    function spawnHazard(g) {
      g.hazards.push({
        x: W + 50,
        y: GROUND_Y - rand(40, 215),
        bob: Math.random() * Math.PI * 2,
        dead: false,
        px: W + 50,
      })
    }

    function spawnBeam(g) {
      g.beams.push({ x: W + 60, w: BEAM_W, dead: false, px: W + 60, scored: false })
    }

    function update(dt, g) {
      g.t += dt
      g.speed = Math.min(MAX_SPEED, START_SPEED + g.t * SPEED_RAMP)
      const dx = g.speed * dt
      g.worldX += dx
      g.score += dt * 6 // distance points
      if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 4)
      if (g.perfectFlash > 0) g.perfectFlash = Math.max(0, g.perfectFlash - dt * 3)
      if (g.beatFlash > 0) g.beatFlash = Math.max(0, g.beatFlash - dt * 4)

      const act = ACTS[g.actIndex]
      const beatInt = 60 / act.bpm

      // ---- act / Movement progression ----
      if (g.actBlend < 1) g.actBlend = Math.min(1, g.actBlend + dt / ACT_FADE)
      if (g.score >= g.actScoreNext && g.actIndex < ACTS.length - 1) {
        g.prevActIndex = g.actIndex
        g.actIndex += 1
        g.actBlend = 0
        g.actScoreNext += ACT_LEN
        const a = ACTS[g.actIndex]
        g.banner = { t0: g.t, dur: 2.6, lines: [a.name], fill: a.accent, glow: 'rgba(255,255,255,0.4)' }
        audioRef.current?.fanfare()
      }

      // ---- backing track: fire a beat when the index ticks over ----
      const bi = Math.floor(g.t / beatInt)
      if (bi !== g.beatIndex) {
        g.beatIndex = bi
        g.beatFlash = 1
        audioRef.current?.beat(act.music, bi)
      }

      // ---- player physics ----
      const p = g.player
      const wasGround = p.onGround
      p.vy += GRAVITY * dt
      p.y += p.vy * dt
      if (p.y >= GROUND_Y) {
        p.y = GROUND_Y
        if (!wasGround && p.vy > 200) dust(g, p.x, GROUND_Y)
        p.vy = 0
        p.onGround = true
      } else {
        p.onGround = false
      }
      if (!p.onGround) p.runPhase += dt * 4
      else p.runPhase += dx * 0.07

      // slide state + crouch easing
      if (p.sliding && (g.t > p.slideUntil || !p.onGround)) p.sliding = false
      const crouchTarget = p.sliding ? 1 : 0
      p.crouch += (crouchTarget - p.crouch) * Math.min(1, dt * 18)

      const invincible = g.t < g.invincibleUntil
      if (invincible) {
        g.particles.push({
          kind: 'trail',
          x: p.x - 6,
          y: p.y - 70 + p.crouch * 40,
          vx: -g.speed * 0.2,
          vy: rand(-10, 10),
          grav: 0,
          size: rand(3, 6),
          color: 'rgba(242,212,137,0.9)',
          life: 0.4,
          life0: 0.4,
        })
      }

      spawnAmbient(g, act, dt)

      // combo decay
      if (g.comboTimer > 0) {
        g.comboTimer -= dt
        if (g.comboTimer <= 0) g.combo = 1
      }

      // ---- spawns ----
      g.spawnTimer -= dt
      if (g.spawnTimer <= 0) {
        spawnCollectible(g)
        g.spawnTimer = rand(0.7, 1.5) * (START_SPEED / g.speed)
      }
      g.enemyTimer -= dt
      if (g.enemyTimer <= 0) {
        const extra = rand(70, 150)
        if (reserveSlot(g, W + 60, g.speed + extra)) {
          spawnEnemy(g, extra)
          g.enemyTimer = rand(1.9, 3.4) * (START_SPEED / g.speed)
        } else {
          g.enemyTimer = 0.15 // too close to the last obstacle — retry soon
        }
      }
      g.powerTimer -= dt
      if (g.powerTimer <= 0) {
        spawnPowerup(g)
        g.powerTimer = rand(12, 20)
      }
      g.hazardTimer -= dt
      if (g.hazardTimer <= 0) {
        spawnHazard(g)
        g.hazardTimer = rand(4, 8)
      }
      g.beamTimer -= dt
      if (g.beamTimer <= 0) {
        if (reserveSlot(g, W + 60, g.speed)) {
          spawnBeam(g)
          // a touch more frequent as the run goes on
          g.beamTimer = rand(5.5, 9) * (START_SPEED / g.speed)
        } else {
          g.beamTimer = 0.15 // too close to the last obstacle — retry soon
        }
      }

      // milestone banner every 500 points (skip if an act banner just fired)
      const ms = Math.floor(g.score / 500)
      if (ms > g.milestone) {
        g.milestone = ms
        if (!g.banner || g.t - g.banner.t0 > 0.4) {
          let idx = (Math.random() * MILESTONES.length) | 0
          if (idx === g.lastBanner) idx = (idx + 1) % MILESTONES.length
          g.lastBanner = idx
          g.banner = { t0: g.t, dur: 2.2, lines: [MILESTONES[idx]] }
        }
      }

      // player collision references
      const pcx = p.x
      const curH = PLAYER_H * (1 - p.crouch * 0.5) // current sprite height
      const pcy = p.y - curH * 0.5 // body core, lower while sliding
      const headTop = p.y - curH // top of the head — must clear an overhead beam

      // ---- collectibles (rhythm scoring) ----
      const frac = (g.t / beatInt) % 1
      const beatDist = Math.min(frac, 1 - frac) * beatInt
      const onBeat = beatDist < ONBEAT_WIN
      for (const c of g.collectibles) {
        c.x -= dx
        c.bob += dt * 3
        const cy = c.y + Math.sin(c.bob) * 5
        const dxp = c.x - pcx
        const dyp = cy - pcy
        if (!c.dead && dxp * dxp + dyp * dyp < 46 * 46) {
          c.dead = true
          const base = KINDS[c.kind].value
          if (onBeat) {
            g.combo = Math.min(COMBO_MAX, g.combo + 1)
            g.comboTimer = COMBO_DECAY
            g.perfectFlash = 1
          }
          const val = base * g.combo
          g.score += val
          burst(g, c.x, cy, KINDS[c.kind].color, onBeat ? 12 : 6)
          g.floats.push({ x: c.x, y: cy, text: `+${val}`, life: 0.9, color: KINDS[c.kind].color })
          if (onBeat) {
            g.floats.push({
              x: c.x,
              y: cy - 24,
              text: g.combo > 1 ? `PERFECT ×${g.combo}` : 'PERFECT',
              life: 0.9,
              color: '#fff6d8',
            })
          }
          audioRef.current?.blip(base, onBeat)
        }
      }
      g.collectibles = g.collectibles.filter((c) => !c.dead && c.x > -60)

      // ---- powerups ----
      for (const pw of g.powerups) {
        pw.x -= dx
        pw.bob += dt * 3
        const cy = pw.y + Math.sin(pw.bob) * 6
        const dxp = pw.x - pcx
        const dyp = cy - pcy
        if (!pw.dead && dxp * dxp + dyp * dyp < 52 * 52) {
          pw.dead = true
          g.invincibleUntil = g.t + 5
          g.banner = {
            t0: g.t,
            dur: 2.6,
            lines: ["I'M NOT ANGRY,", "I'M PASSIONATE!"],
          }
          burst(g, pw.x, cy, '#f2d489', 18)
          audioRef.current?.fanfare()
        }
      }
      g.powerups = g.powerups.filter((pw) => !pw.dead && pw.x > -60)

      // ---- hazards (purple hearts) — touching one costs points + combo ----
      for (const hz of g.hazards) {
        hz.x -= dx
        hz.bob += dt * 3
        const cy = hz.y + Math.sin(hz.bob) * 5
        const dxp = hz.x - pcx
        const dyp = cy - pcy
        if (!hz.dead && dxp * dxp + dyp * dyp < 48 * 48) {
          hz.dead = true
          g.score = Math.max(0, g.score - 250)
          g.combo = 1
          g.comboTimer = 0
          g.shake = Math.max(g.shake, 0.6)
          g.floats.push({ x: hz.x, y: cy, text: '-250', life: 1.0, color: '#c9a8ff' })
          g.banner = {
            t0: g.t,
            dur: 2.0,
            lines: ['I HATE PURPLE'],
            fill: '#c9a8ff',
            glow: 'rgba(150,110,230,0.7)',
          }
          audioRef.current?.buzz()
        } else if (!hz.dead && hz.px > pcx && hz.x <= pcx) {
          // just passed the player without a hit — reward a close call
          const miss = Math.abs(dyp)
          if (miss > 30 && miss < 74) {
            g.score += 40
            g.floats.push({ x: pcx + 30, y: cy, text: 'CLOSE! +40', life: 0.9, color: act.accent })
            burst(g, pcx + 20, cy, act.accent, 6)
          }
        }
        hz.px = hz.x
      }
      g.hazards = g.hazards.filter((hz) => !hz.dead && hz.x > -60)

      // ---- beams (slide under them) ----
      for (const b of g.beams) {
        b.x -= dx
        const xOverlap = Math.abs(b.x - pcx) < b.w / 2 + 22
        if (!b.dead && xOverlap && !invincible && headTop < BEAM_Y + 18) {
          // standing into the beam ends the run
          g.shake = 1
          endGame()
          return
        }
        if (!b.dead && b.px > pcx && b.x <= pcx) {
          // cleared it — graze bonus for a last-moment duck
          if (!invincible && headTop >= BEAM_Y + 18 && headTop < BEAM_Y + 60) {
            g.score += 40
            g.floats.push({ x: pcx + 30, y: BEAM_Y + 40, text: 'CLOSE! +40', life: 0.9, color: act.accent })
            burst(g, pcx + 20, BEAM_Y + 30, act.accent, 6)
          }
        }
        b.px = b.x
      }
      g.beams = g.beams.filter((b) => !b.dead && b.x > -80)

      // ---- enemies ----
      for (const e of g.enemies) {
        if (e.knocked) {
          e.knockVy += GRAVITY * dt
          e.feetY += e.knockVy * dt
          e.x -= dx * 0.4
          e.rot += e.spin * dt
          e.alpha = Math.max(0, e.alpha - dt * 0.6)
          continue
        }
        e.x -= dx + e.extra * dt
        e.runPhase += dt * 12
        const dxp = e.x - pcx
        if (Math.abs(dxp) < 36) {
          const feet = p.y
          const topLine = e.feetY - 118
          const headBand = e.feetY - 60
          const descending = p.vy > 0
          if (feet > topLine) {
            if (invincible) {
              knockEnemy(g, e)
            } else if (descending && feet < headBand) {
              knockEnemy(g, e)
              p.vy = JUMP_V * 0.62
              p.onGround = false
            } else {
              g.shake = 1
              endGame()
              return
            }
          }
        }
      }
      g.enemies = g.enemies.filter((e) =>
        e.knocked ? e.alpha > 0 && e.feetY < H + 160 : e.x > -70
      )

      // ---- weapons ----
      if (g.meleeSwing > 0) g.meleeSwing = Math.max(0, g.meleeSwing - dt)
      // trombone whack: knock any rival within reach in front of the player
      if (g.meleePending) {
        g.meleePending = false
        for (const e of g.enemies) {
          if (e.knocked) continue
          const dxp = e.x - p.x
          if (dxp > -16 && dxp < MELEE_RANGE && Math.abs(e.feetY - p.y) < 90) {
            knockEnemy(g, e)
          }
        }
      }
      // projectiles (soccer / eraser) fly forward and knock the first rival hit
      for (const pr of g.projectiles) {
        pr.x += pr.vx * dt
        pr.rot += dt * 16
        if (pr.dead) continue
        for (const e of g.enemies) {
          if (e.knocked) continue
          if (
            pr.x > e.x - 36 &&
            pr.x < e.x + 36 &&
            pr.y > e.feetY - ENEMY_H &&
            pr.y < e.feetY - 16
          ) {
            knockEnemy(g, e)
            pr.dead = true
            break
          }
        }
      }
      g.projectiles = g.projectiles.filter((pr) => !pr.dead && pr.x < W + 80)

      // ---- particles ----
      for (const pt of g.particles) {
        if (pt.sway != null) {
          pt.phase += dt * pt.sway * 3
          pt.x += pt.vx * dt + Math.sin(pt.phase) * pt.sway
        } else {
          pt.x += pt.vx * dt
        }
        pt.vy += (pt.grav || 0) * dt
        pt.y += pt.vy * dt
        if (pt.spin) pt.rot += pt.spin * dt
        pt.life -= dt
      }
      g.particles = g.particles.filter(
        (pt) => pt.life > 0 && pt.x > -30 && pt.x < W + 60 && pt.y < H + 40
      )

      // ---- floats ----
      for (const f of g.floats) {
        f.life -= dt
        f.y -= dt * 40
      }
      g.floats = g.floats.filter((f) => f.life > 0)
    }

    function resolvePalette(g) {
      const a0 = ACTS[g.prevActIndex]
      const a1 = ACTS[g.actIndex]
      const bl = g.actBlend
      return {
        sky: a1.sky.map((c, i) => mixHex(a0.sky[i], c, bl)),
        far: mixHex(a0.far, a1.far, bl),
        mid: mixHex(a0.mid, a1.mid, bl),
        g0: mixHex(a0.ground[0], a1.ground[0], bl),
        g1: mixHex(a0.ground[1], a1.ground[1], bl),
        haze: mixHex(a0.haze, a1.haze, bl),
        accent: mixHex(a0.accent, a1.accent, bl),
        stars: lerp(a0.stars, a1.stars, bl),
        moon: lerp(a0.moon, a1.moon, bl),
      }
    }

    function drawBackground(ctx, g, pal) {
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, pal.sky[0])
      sky.addColorStop(0.45, pal.sky[1])
      sky.addColorStop(0.72, pal.sky[2])
      sky.addColorStop(0.88, pal.sky[3])
      sky.addColorStop(1, pal.sky[4])
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      // moon
      if (pal.moon > 0.02) {
        ctx.save()
        ctx.globalAlpha = pal.moon
        ctx.fillStyle = 'rgba(245,236,216,0.92)'
        ctx.shadowColor = 'rgba(245,236,216,0.5)'
        ctx.shadowBlur = 40
        ctx.beginPath()
        ctx.arc(W * 0.8, H * 0.22, 30, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // stars
      if (pal.stars > 0.02) {
        const so = (g.worldX * 0.05) % (W * 2)
        ctx.fillStyle = '#f5ecd8'
        for (const s of stars) {
          let sx = s.x - so
          if (sx < 0) sx += W * 2
          if (sx > W) continue
          const a = (0.35 + 0.35 * Math.sin(g.t * 2 + s.tw)) * pal.stars
          ctx.globalAlpha = a
          ctx.beginPath()
          ctx.arc(sx, s.y, s.r, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      // far skyline (slow)
      ctx.save()
      ctx.globalAlpha = 0.88
      const farFill = pal.far
      const farPattern = 320
      const farOff = (g.worldX * 0.18) % farPattern
      for (let base = -farOff - farPattern; base < W + farPattern; base += farPattern) {
        const y = GROUND_Y - 8
        farBuilding(ctx, base + 20, y, 34, 70, farFill)
        farBuilding(ctx, base + 70, y, 22, 100, farFill)
        farBuilding(ctx, base + 110, y, 40, 56, farFill)
        farBuilding(ctx, base + 170, y, 26, 120, farFill)
        farBuilding(ctx, base + 215, y, 48, 78, farFill)
        farBuilding(ctx, base + 275, y, 24, 92, farFill)
      }
      ctx.restore()

      // mid landmark layer (Capitol, Monument, Lincoln)
      const midFill = pal.mid
      const midPattern = 640
      const midOff = (g.worldX * 0.42) % midPattern
      for (let base = -midOff - midPattern; base < W + midPattern; base += midPattern) {
        const y = GROUND_Y + 2
        capitol(ctx, base + 110, y, 1.0, midFill)
        monument(ctx, base + 320, y, 1.0, midFill)
        lincoln(ctx, base + 520, y, 1.0, midFill)
      }

      // atmospheric haze band near horizon
      const haze = ctx.createLinearGradient(0, GROUND_Y - 120, 0, GROUND_Y)
      const hz = hexToRgb(pal.haze)
      haze.addColorStop(0, `rgba(${hz[0]},${hz[1]},${hz[2]},0)`)
      haze.addColorStop(1, `rgba(${hz[0]},${hz[1]},${hz[2]},0.22)`)
      ctx.fillStyle = haze
      ctx.fillRect(0, GROUND_Y - 120, W, 120)
    }

    function drawGround(ctx, g, pal) {
      const gg = ctx.createLinearGradient(0, GROUND_Y, 0, H)
      gg.addColorStop(0, pal.g0)
      gg.addColorStop(1, pal.g1)
      ctx.fillStyle = gg
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
      ctx.strokeStyle = 'rgba(232,184,75,0.55)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, GROUND_Y + 1)
      ctx.lineTo(W, GROUND_Y + 1)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(245,236,216,0.18)'
      ctx.lineWidth = 3
      const dash = 46
      const off = g.worldX % dash
      ctx.beginPath()
      for (let x = -off; x < W; x += dash) {
        ctx.moveTo(x, GROUND_Y + 22)
        ctx.lineTo(x + 20, GROUND_Y + 22)
      }
      ctx.stroke()
    }

    function drawHUD(ctx, g, act) {
      const score = Math.floor(g.score)
      ctx.save()
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#f5ecd8'
      ctx.font = '800 46px "Bodoni Moda", Georgia, serif'
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = 10
      ctx.fillText(String(score), W - 28, 22)
      ctx.shadowBlur = 0
      ctx.font = '600 13px "Bodoni Moda", Georgia, serif'
      ctx.fillStyle = '#e8b84b'
      ctx.fillText('S C O R E', W - 30, 74)
      // current Movement label
      ctx.font = 'italic 14px "Spectral", Georgia, serif'
      ctx.fillStyle = 'rgba(245,236,216,0.65)'
      ctx.fillText(act.name, W - 30, 96)

      // ---- metronome + combo (top-left) ----
      ctx.textAlign = 'left'
      const beatInt = 60 / act.bpm
      const frac = (g.t / beatInt) % 1
      const dist = Math.min(frac, 1 - frac) * beatInt
      const onWin = dist < ONBEAT_WIN
      const mx = 44
      const my = 44
      // outer ring pulses on the beat
      const pulse = 1 + g.beatFlash * 0.5
      ctx.beginPath()
      ctx.arc(mx, my, 15 * pulse, 0, Math.PI * 2)
      ctx.strokeStyle = onWin ? '#f2d489' : 'rgba(245,236,216,0.35)'
      ctx.lineWidth = onWin ? 3.5 : 2
      ctx.stroke()
      // core dot brightens in the on-beat window
      ctx.beginPath()
      ctx.arc(mx, my, 5, 0, Math.PI * 2)
      ctx.fillStyle = onWin ? '#fff6d8' : 'rgba(245,236,216,0.5)'
      ctx.fill()

      if (g.combo > 1) {
        const cs = 1 + g.perfectFlash * 0.25
        ctx.save()
        ctx.translate(mx + 30, my - 12)
        ctx.scale(cs, cs)
        ctx.font = '800 26px "Bodoni Moda", Georgia, serif'
        ctx.fillStyle = '#f2d489'
        ctx.shadowColor = 'rgba(242,212,137,0.6)'
        ctx.shadowBlur = 10
        ctx.fillText(`×${g.combo}`, 0, 0)
        ctx.restore()
        ctx.font = '600 10px "Bodoni Moda", serif'
        ctx.fillStyle = 'rgba(245,236,216,0.7)'
        ctx.fillText('COMBO', mx + 31, my + 16)
        // decay bar
        const bw = 70
        const frac2 = clamp01(g.comboTimer / COMBO_DECAY)
        ctx.fillStyle = 'rgba(13,19,48,0.5)'
        roundRect(ctx, mx + 31, my + 28, bw, 5, 2.5)
        ctx.fill()
        ctx.fillStyle = '#e8b84b'
        roundRect(ctx, mx + 31, my + 28, bw * frac2, 5, 2.5)
        ctx.fill()
      }

      // invincibility timer bar (below the metronome)
      const remain = g.invincibleUntil - g.t
      if (remain > 0) {
        const bw = 180
        const fracInv = clamp01(remain / 5)
        const by = 78
        ctx.fillStyle = 'rgba(13,19,48,0.6)'
        roundRect(ctx, 28, by, bw, 16, 8)
        ctx.fill()
        const bg = ctx.createLinearGradient(28, 0, 28 + bw, 0)
        bg.addColorStop(0, '#f2d489')
        bg.addColorStop(1, '#e8b84b')
        ctx.fillStyle = bg
        roundRect(ctx, 28, by, bw * fracInv, 16, 8)
        ctx.fill()
        ctx.fillStyle = '#11152e'
        ctx.font = '700 11px "Bodoni Moda", serif'
        ctx.fillText('INVINCIBLE', 38, by + 3)
      }
      ctx.restore()
    }

    function drawBanner(ctx, g) {
      if (!g.banner) return
      const age = g.t - g.banner.t0
      if (age > g.banner.dur) {
        g.banner = null
        return
      }
      const tIn = Math.min(1, age / 0.16)
      const tOut = Math.min(1, Math.max(0, (g.banner.dur - age) / 0.55))
      const alpha = Math.min(tIn, tOut)
      const pop = 1 + 0.22 * Math.exp(-age * 7)
      const wob = Math.sin(age * 7) * 0.018
      const lines = g.banner.lines
      const fill = g.banner.fill
      const glow = g.banner.glow || 'rgba(232,184,75,0.65)'

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(W / 2, H * 0.32)
      ctx.rotate(wob)
      ctx.scale(pop, pop)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'

      let fontPx = 66
      const maxW = W * 0.84
      ctx.font = `800 ${fontPx}px "Bodoni Moda", Georgia, serif`
      const widest = Math.max(...lines.map((ln) => ctx.measureText(ln).width))
      if (widest > maxW) {
        fontPx = Math.max(34, Math.floor((fontPx * maxW) / widest))
        ctx.font = `800 ${fontPx}px "Bodoni Moda", Georgia, serif`
      }
      const lh = fontPx * 0.98

      ctx.shadowColor = glow
      ctx.shadowBlur = 34
      lines.forEach((ln, i) => {
        const y = (i - (lines.length - 1) / 2) * lh
        ctx.lineWidth = fontPx * 0.16
        ctx.strokeStyle = 'rgba(7,10,28,0.92)'
        ctx.strokeText(ln, 0, y)
        ctx.fillStyle = fill || (i === lines.length - 1 ? '#f2d489' : '#f5ecd8')
        ctx.fillText(ln, 0, y)
      })
      ctx.restore()
    }

    function render(g) {
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, W, H)

      if (g.shake > 0) {
        const s = g.shake * 8
        ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s)
      }

      const pal = resolvePalette(g)
      const act = ACTS[g.actIndex]
      drawBackground(ctx, g, pal)
      drawGround(ctx, g, pal)

      const imgs = imagesRef.current
      const t = g.t

      // ambient + effect particles that sit behind the action
      for (const pt of g.particles) {
        if (pt.kind === 'petal' || pt.kind === 'confetti' || pt.kind === 'firework') {
          drawParticle(ctx, pt)
        }
      }

      // collectibles
      for (const c of g.collectibles) {
        const cy = c.y + Math.sin(c.bob) * 5
        const k = KINDS[c.kind]
        if (c.kind === 'note') drawNote(ctx, c.x, cy, k.r, k.color, true)
        else if (c.kind === 'treble') drawTreble(ctx, c.x, cy, k.r, k.color, true)
        else drawPage(ctx, c.x, cy, k.r, k.color, true, t)
      }

      // powerups
      for (const pw of g.powerups) {
        const cy = pw.y + Math.sin(pw.bob) * 6
        drawGoldenBaton(ctx, pw.x, cy, t)
      }

      // hazards (purple hearts)
      for (const hz of g.hazards) {
        const cy = hz.y + Math.sin(hz.bob) * 5
        drawHeart(ctx, hz.x, cy, 22, t)
      }

      // beams (slide under)
      for (const b of g.beams) {
        drawBeam(ctx, b.x, BEAM_Y, b.w, t, pal.accent)
      }

      // enemies
      for (const e of g.enemies) {
        ctx.save()
        if (e.knocked) {
          ctx.globalAlpha = e.alpha
          ctx.translate(e.x, e.feetY)
          ctx.rotate(e.rot)
          ctx.translate(-e.x, -e.feetY)
        }
        const bobE = e.knocked ? 0 : -Math.abs(Math.sin(e.runPhase)) * 5
        const leanE = e.knocked ? 0 : Math.sin(e.runPhase) * 0.06
        drawSprite(ctx, {
          img: imgs[e.which],
          x: e.x,
          feetY: e.feetY,
          h: ENEMY_H,
          facing: 1,
          bob: bobE,
          lean: leanE,
          shadow: !e.knocked,
        })
        ctx.restore()
      }

      // projectiles in flight (behind the player)
      for (const pr of g.projectiles) {
        if (pr.kind === 'soccer') drawSoccerBall(ctx, pr.x, pr.y, 14, pr.rot)
        else drawEraser(ctx, pr.x, pr.y, 11, pr.rot)
      }

      // player
      const p = g.player
      const invincible = g.t < g.invincibleUntil
      const air = !p.onGround
      const bobP = air ? 0 : -Math.abs(Math.sin(p.runPhase)) * 5
      const leanP = (air ? 0.07 : Math.sin(p.runPhase) * 0.05) + p.crouch * 0.32
      drawSprite(ctx, {
        img: imgs[characterRef.current],
        x: p.x,
        feetY: p.y,
        h: PLAYER_H,
        facing: 1,
        crouch: p.crouch,
        bob: bobP,
        lean: leanP,
        glow: invincible,
        invinciblePulse: g.t,
      })

      // trombone swing in front of the player while whacking
      if (CHARACTERS[characterRef.current].weapon === 'trombone' && g.meleeSwing > 0) {
        const curH = PLAYER_H * (1 - p.crouch * 0.5)
        drawTrombone(ctx, p.x + 26, p.y - curH * 0.52 + bobP, 1 - g.meleeSwing / SWING_TIME)
      }

      // foreground sparks/dust/trail
      for (const pt of g.particles) {
        if (pt.kind === 'spark' || pt.kind === 'dust' || pt.kind === 'trail') {
          drawParticle(ctx, pt)
        }
      }

      // score floats
      for (const f of g.floats) {
        ctx.save()
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6))
        ctx.fillStyle = f.color
        ctx.font = '800 22px "Bodoni Moda", serif'
        ctx.textAlign = 'center'
        ctx.shadowColor = 'rgba(0,0,0,0.5)'
        ctx.shadowBlur = 6
        ctx.fillText(f.text, f.x, f.y)
        ctx.restore()
      }

      drawHUD(ctx, g, act)

      // weapon cooldown feedback: dim the mobile button, or draw a laptop gauge
      const wReady = g.t >= g.weaponReadyAt
      const wFrac = wReady ? 1 : clamp01(1 - (g.weaponReadyAt - g.t) / WEAPON_COOLDOWN)
      if (isTouch) {
        if (actionBtnRef.current) actionBtnRef.current.style.opacity = wReady ? '1' : '0.4'
      } else {
        const gx = 42
        const gy = H - 44
        ctx.save()
        ctx.globalAlpha = wReady ? 1 : 0.7
        ctx.beginPath()
        ctx.arc(gx, gy, 21, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(13,19,48,0.55)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(245,236,216,0.22)'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(gx, gy, 21, -Math.PI / 2, -Math.PI / 2 + wFrac * Math.PI * 2)
        ctx.strokeStyle = wReady ? '#f2d489' : '#e8b84b'
        ctx.lineWidth = 3
        ctx.stroke()
        drawWeaponSmall(ctx, CHARACTERS[characterRef.current].weapon, gx, gy, g.t)
        ctx.fillStyle = 'rgba(245,236,216,0.7)'
        ctx.font = '700 11px "Bodoni Moda", serif'
        ctx.textAlign = 'center'
        ctx.fillText('F', gx, gy + 30)
        ctx.restore()
      }

      drawBanner(ctx, g)
      ctx.restore()
    }

    function frame(now) {
      let dt = (now - last) / 1000
      last = now
      if (dt > 0.05) dt = 0.05 // clamp big gaps (tab switches)

      const g = gameRef.current
      if (g) {
        if (phaseRef.current === 'running') {
          if (g.hitStop > 0) {
            g.hitStop -= dt // brief freeze for impact
          } else {
            update(dt, g)
          }
        }
        // gameRef may have been swapped by endGame; guard render
        if (gameRef.current) render(gameRef.current)
      }
      raf = requestAnimationFrame(frame)
    }

    if (!gameRef.current) resetGame()
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  /* ---- pointer / touch input on the stage ---- */
  const isControl = (target) =>
    target && target.closest && target.closest('button, input, .entry, .mute-btn')

  const onMouseDown = (e) => {
    if (isControl(e.target)) return
    // Ignore the emulated mouse event iOS fires right after a real tap, so a
    // single touch doesn't trigger twice (touchstart already handled it).
    if (performance.now() - (touchRef.current.t0 || 0) < 700) return
    e.preventDefault()
    handlePress()
  }

  const onTouchStart = (e) => {
    if (isControl(e.target)) return
    const t = e.touches[0]
    touchRef.current = { x: t.clientX, y: t.clientY, t0: performance.now(), handled: false }
    if (phaseRef.current !== 'running') {
      handlePress() // start / restart
      touchRef.current.handled = true
      return
    }
    // Running: jump on PRESS for zero latency. A deliberate down-swipe is
    // caught in onTouchMove a few ms later and converted to a slide.
    doJump()
  }

  const onTouchMove = (e) => {
    if (phaseRef.current !== 'running' || touchRef.current.handled) return
    const t = e.touches[0]
    const dx = t.clientX - touchRef.current.x
    const dy = t.clientY - touchRef.current.y
    // Quick downward swipe = slide. Undo the jump we just fired on touchstart
    // if the player has barely left the ground, then duck.
    const quick = performance.now() - touchRef.current.t0 < 160
    if (quick && dy > 24 && dy > Math.abs(dx)) {
      const g = gameRef.current
      if (g && g.player.y > GROUND_Y - 90) {
        g.player.y = GROUND_Y
        g.player.vy = 0
        g.player.onGround = true
      }
      doSlide()
      touchRef.current.handled = true
    }
  }

  return (
    <div
      className="stage"
      ref={stageRef}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      role="application"
      aria-label="The Maestro's Run game"
    >
      <canvas ref={canvasRef} />

      <button
        className="mute-btn"
        onClick={(e) => {
          e.stopPropagation()
          toggleMute()
        }}
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Unmute (M)' : 'Mute (M)'}
      >
        {muted ? '🔇' : '🔊'}
      </button>

      {isTouch && phase === 'running' && (
        <button
          ref={actionBtnRef}
          className="action-btn"
          onTouchStart={(e) => {
            e.stopPropagation()
            doAttack()
          }}
          onMouseDown={(e) => {
            e.stopPropagation()
            doAttack()
          }}
          aria-label="Attack"
          title="Attack"
        >
          {CHARACTERS[character].icon}
        </button>
      )}

      {showHint && phase === 'running' && (
        <div className="tap-hint">
          {isTouch
            ? 'Tap to jump · swipe down to slide · ⚔ to attack'
            : 'Space jump · ↓ slide · F attack'}
        </div>
      )}

      {phase === 'ready' && (
        <div className="overlay">
          <div className="kicker">National Mall · Dusk</div>
          <h1 className="title">
            The Maestro's <span className="amp">Run</span>
          </h1>
          <p className="subtitle">
            Catch the music <i>on the beat</i> to build your combo, leap the
            rivals or knock them flat with your weapon, and slide under the banners.
          </p>

          <div className="char-pick-label">Choose your fighter</div>
          <div
            className="char-select"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {CHARACTER_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                className={`char-card char-${id}${character === id ? ' sel' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  chooseCharacter(id)
                }}
                aria-pressed={character === id}
              >
                <span className="char-stage">
                  <img src={CHAR_IMG[id]} alt="" className="char-img" />
                  <span className="char-icon">{CHARACTERS[id].icon}</span>
                </span>
                <span className="char-name">{CHARACTERS[id].name}</span>
                <span className="char-weapon">{CHARACTERS[id].weaponName}</span>
              </button>
            ))}
          </div>

          <button className="cta" onClick={(e) => { e.stopPropagation(); startGame() }}>
            ▸ Take the Podium
          </button>
          <p className="hint-input">
            {isTouch ? (
              <>Tap to jump · swipe to slide · ⚔ button to attack</>
            ) : (
              <>
                <b>Space</b> jump · <b>↓</b> slide · <b>F</b> attack · <b>M</b> mute
              </>
            )}
          </p>
        </div>
      )}

      {phase === 'gameover' && (
        <div className="overlay">
          <div className="kicker">Curtain Call</div>
          <div className="score-caption">Final Score</div>
          <div className="final-score">{finalScore}</div>

          {entering ? (
            <div className="entry">
              <div className="hi-line new">★ You made the program! ★</div>
              <label className="entry-label" htmlFor="initials">
                Enter your initials
              </label>
              <input
                id="initials"
                className="initials-input"
                value={initials}
                onChange={(e) => {
                  setInitials(cleanInitials(e.target.value))
                  setInitialsError('')
                }}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submitInitials()
                  }
                }}
                maxLength={3}
                autoFocus
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="AAA"
                aria-label="Your initials, up to three letters"
              />
              {initialsError && <div className="entry-error">{initialsError}</div>}
              <button
                className="cta"
                disabled={submitting}
                onClick={(e) => {
                  e.stopPropagation()
                  submitInitials()
                }}
              >
                {submitting ? '…' : '✓ Take a Bow'}
              </button>
            </div>
          ) : (
            <>
              {leaderboard.length > 0 && (
                <ol className="leaderboard">
                  {leaderboard.map((row, i) => (
                    <li key={i} className={row.score === finalScore ? 'me' : ''}>
                      <span className="lb-rank">{i + 1}</span>
                      <span className="lb-ini">{row.initials}</span>
                      <span className="lb-dots" />
                      <span className="lb-score">{row.score}</span>
                    </li>
                  ))}
                </ol>
              )}
              <button
                className="cta"
                onClick={(e) => {
                  e.stopPropagation()
                  startGame()
                }}
              >
                ↻ Run Again
              </button>
              <p className="hint-input">
                {isTouch ? (
                  <>or tap anywhere to run again</>
                ) : (
                  <>or press <b>Space</b></>
                )}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
