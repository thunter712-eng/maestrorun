/* ----------------------------------------------------------------------------
 * Leaderboard storage — pluggable.
 *
 * TODAY: scores live in this browser's localStorage, so the board works fully
 * offline while you develop.
 *
 * TO GO LIVE (shared scores everyone can see):
 *   1. Follow LEADERBOARD.md to deploy the Google Apps Script web app.
 *   2. Paste its /exec URL into REMOTE_URL below.
 *   3. Set USE_REMOTE = true.
 * Nothing else in the game changes — the rest of the app only calls
 * fetchScores() and submitScore().
 * -------------------------------------------------------------------------- */

const LB_KEY = 'maestro-run-leaderboard'
const LAST_INITIALS_KEY = 'maestro-run-initials'

export const MAX_ENTRIES = 10

// --- flip these when you publish ---
const USE_REMOTE = true
const REMOTE_URL = 'https://script.google.com/macros/s/AKfycbwpGBK3PDQARmsyE8dzNRFHdMp3p2dyRNdzLe_bu1AHs8uCjP_tIQi_U-tQqvhbtmv4/exec'

/* ------------------------------ profanity guard ---------------------------- */
// Initials are A–Z only and at most 3 chars, so a substring match is enough.
// NOTE: the Apps Script enforces this same list server-side — never trust the
// client alone, since anyone can call the endpoint directly.
const PROFANITY = [
  'ASS', 'SEX', 'CUM', 'JIZ', 'JIS', 'TIT', 'FAP', 'FUK', 'FUC', 'FUX',
  'FUQ', 'FCK', 'FUG', 'SHT', 'SHI', 'DIK', 'DIC', 'DIX', 'COK', 'COC',
  'COX', 'CNT', 'KUM', 'KKK', 'NIG', 'NGR', 'NGA', 'FAG', 'FGT', 'HOE',
  'PIS', 'PUS', 'PRN', 'WAD', 'BUM', 'GAY', 'JEW', 'NAZ', 'SUK', 'SUC',
]

export function isProfane(s) {
  const u = (s || '').toUpperCase()
  return PROFANITY.some((w) => u.includes(w))
}

// Normalize any input into clean 1–3 letter uppercase initials.
export function cleanInitials(raw) {
  const s = raw === null || raw === undefined ? '' : String(raw)
  return s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
}

/* --------------------------- remembered initials --------------------------- */
export function getLastInitials() {
  try {
    return localStorage.getItem(LAST_INITIALS_KEY) || ''
  } catch {
    return ''
  }
}
function rememberInitials(ini) {
  try {
    localStorage.setItem(LAST_INITIALS_KEY, ini)
  } catch {
    /* ignore */
  }
}

/* ------------------------------- shaping ----------------------------------- */
// Coerce any source into a clean, sorted, capped array of {initials, score}.
function normalize(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter(
      (e) => e && typeof e.initials === 'string' && Number.isFinite(Number(e.score))
    )
    .map((e) => ({ initials: cleanInitials(e.initials) || '???', score: Math.floor(Number(e.score)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES)
}

// Whether a score earns a spot on the (already-fetched) board.
export function qualifies(score, board) {
  if (!(score > 0)) return false
  if (board.length < MAX_ENTRIES) return true
  return score > board[board.length - 1].score
}

/* ----------------------------- local backend ------------------------------- */
function localFetch() {
  try {
    return normalize(JSON.parse(localStorage.getItem(LB_KEY) || '[]'))
  } catch {
    return []
  }
}
function localSubmit(entry) {
  const board = localFetch()
  board.push(entry)
  const top = normalize(board)
  try {
    localStorage.setItem(LB_KEY, JSON.stringify(top))
  } catch {
    /* ignore */
  }
  return top
}

/* ------------------------------- public API -------------------------------- */
export async function fetchScores() {
  if (USE_REMOTE && REMOTE_URL) {
    try {
      const res = await fetch(REMOTE_URL, { method: 'GET' })
      return normalize(await res.json())
    } catch {
      return localFetch() // graceful fallback if the network/endpoint is down
    }
  }
  return localFetch()
}

export async function submitScore(initials, score) {
  const ini = cleanInitials(initials)
  rememberInitials(ini)
  const entry = { initials: ini, score: Math.floor(score), at: Date.now() }

  if (USE_REMOTE && REMOTE_URL) {
    try {
      // 'text/plain' keeps this a CORS "simple request" so Apps Script doesn't
      // need to answer a preflight. We don't read the POST response (opaque is
      // fine); we re-GET the fresh board afterward.
      await fetch(REMOTE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(entry),
      })
      return await fetchScores()
    } catch {
      return localSubmit(entry) // keep the user's score locally if the post fails
    }
  }
  return localSubmit(entry)
}
