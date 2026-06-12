# Shared leaderboard setup (Google Sheet + Apps Script)

GitHub Pages only serves static files, so the shared scores live in a Google
Sheet that a tiny Apps Script web app reads and writes. The game talks to it
over `fetch`. Free, no servers to run.

## 1. Make the Sheet
1. Create a new Google Sheet named **Maestro Run Scores**.
2. In row 1, add headers: `initials`, `score`, `at`.

## 2. Add the script
In the Sheet: **Extensions → Apps Script**, delete the placeholder, paste the
code in [`server/leaderboard.gs`](server/leaderboard.gs), and **Save**.

## 3. Deploy as a web app
1. **Deploy → New deployment → type: Web app**.
2. **Execute as:** Me. **Who has access:** **Anyone**.
3. **Deploy**, authorize, and copy the **/exec** URL.

> Re-deploy (or "Manage deployments → edit → new version") any time you change
> the script.

## 4. Point the game at it
In [`src/scores.js`](src/scores.js):
```js
const USE_REMOTE = true
const REMOTE_URL = 'https://script.google.com/macros/s/AKfy.../exec'
```
Commit, push to GitHub Pages, done.

## Notes
- The POST is sent as `text/plain` so the browser skips a CORS preflight that
  Apps Script can't answer.
- Profanity is filtered **both** in the browser and in the script — anyone can
  hit the endpoint directly, so the server check is the real one.
- This is a casual board: the endpoint is public, so a determined person could
  POST a fake score. The script does basic sanity caps (see `MAX_SCORE`). If you
  later want it tamper-resistant, add a shared secret or a signed token.
