/**
 * The Maestro's Run — leaderboard web app (Google Apps Script).
 * Backs a Google Sheet with columns: initials | score | at
 *
 * GET  /exec            -> JSON array of the top scores [{initials, score}]
 * POST /exec  body:     -> { "initials": "ABC", "score": 1234 }
 *                          validates + appends, returns the refreshed top list
 *
 * See LEADERBOARD.md for deployment steps.
 */

var MAX_ENTRIES = 10;
var MAX_SCORE = 10000000; // sanity cap to blunt obviously-fake submissions

// Keep this in sync with PROFANITY in src/scores.js — this is the real check.
var PROFANITY = [
  'ASS','SEX','CUM','JIZ','JIS','TIT','FAP','FUK','FUC','FUX',
  'FUQ','FCK','FUG','SHT','SHI','DIK','DIC','DIX','COK','COC',
  'COX','CNT','KUM','KKK','NIG','NGR','NGA','FAG','FGT','HOE',
  'PIS','PUS','PRN','WAD','BUM','GAY','JEW','NAZ','SUK','SUC'
];

function isProfane(s) {
  s = (s || '').toUpperCase();
  for (var i = 0; i < PROFANITY.length; i++) {
    if (s.indexOf(PROFANITY[i]) !== -1) return true;
  }
  return false;
}

function cleanInitials(raw) {
  // Coerce ANY input to a string first, then keep at most 3 A–Z letters.
  // This is the real guard — clients can post whatever they like.
  var s = (raw === null || raw === undefined) ? '' : String(raw);
  return s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

function sheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function topScores_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var rows = sh.getRange(2, 1, last - 1, 2).getValues(); // initials, score
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var ini = cleanInitials(rows[i][0]);
    var score = Math.floor(Number(rows[i][1]));
    if (ini && isFinite(score)) out.push({ initials: ini, score: score });
  }
  out.sort(function (a, b) { return b.score - a.score; });
  return out.slice(0, MAX_ENTRIES);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_(topScores_());
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var ini = cleanInitials(body.initials);
    var score = Math.floor(Number(body.score));

    if (ini.length < 1 || isProfane(ini)) return json_(topScores_());
    if (!isFinite(score) || score <= 0 || score > MAX_SCORE) return json_(topScores_());

    sheet_().appendRow([ini, score, new Date()]);
    return json_(topScores_());
  } catch (err) {
    return json_(topScores_());
  }
}
