/* parser.js
 *
 * Athletic.net results parser for the GLRR graphic generator.
 *
 *   parseResults(raw, { isTeam: bool, maxResults: number })
 *
 * Handles four shapes:
 *   1. Performance List / Rankings  — athletic.net's modern page, ONE field per line
 *      (this is what the bookmarklet grabs from a rankings page). NEW.
 *   2. Individual  — "rank grade name time" on one line, school on the next  (clean paste)
 *   3. Relay       — rank alone, then athlete names, then time, then school   (clean paste)
 *   4. Team        — "rank. School  score" (when opts.isTeam is true)
 *
 * detectMeta(raw) sniffs the page text for state / division / event / sport / award so the
 * grab can auto-fill the form.
 */

// ── Shared patterns ─────────────────────────────────────────────────────────
var PB_TAG        = /\s*(PB|SB|PR|SR|NR|AR|WR|MR)\b/gi;
var DATE_PAT      = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}\b/;
var RANK_DOT_LINE = /^(\d{1,3})\.$/;            // "1." alone on a line (performance list)
var AVATAR_LINE   = /^[A-Z]{1,4}$/;             // initials shown when no athlete photo (e.g. "DB")
var WIND_LINE     = /^\([-+]?\s*\d*\.?\d+\s*(m\/s)?\)$|^\(NWI\)$/i;
var BLURRED_NAME  = /^[Xx][Xx'’.\s]*$/;         // paywalled rows render as "Xxxxx Xxxxx"

// ── Detection ───────────────────────────────────────────────────────────────
// A performance list has rank-dot lines, each followed (within a few lines) by a
// detail line carrying a "Mon DD" date. That combination is unique to athletic.net's
// modern rankings/results pages and never appears in clean hand-pasted text.
function looksLikePerformanceList(lines) {
  var hits = 0;
  for (var i = 0; i < lines.length; i++) {
    if (!RANK_DOT_LINE.test(lines[i])) continue;
    for (var j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      if (DATE_PAT.test(lines[j])) { hits++; break; }
    }
  }
  return hits >= 2;
}

// ── Performance-list parser (one field per line) ────────────────────────────
function parsePerformanceList(lines, opts) {
  var results = [];
  var i = 0;
  while (i < lines.length) {
    var rm = lines[i].match(RANK_DOT_LINE);
    if (!rm) { i++; continue; }
    var rank = parseInt(rm[1], 10);
    i++;

    // 1) Athlete name — skip blank lines, the "*" marker, and avatar initials.
    var name = '';
    while (i < lines.length) {
      var s = lines[i];
      if (RANK_DOT_LINE.test(s)) break;                 // ran into next entry, no name
      if (s === '' || s === '*' || AVATAR_LINE.test(s)) { i++; continue; }
      name = s; i++; break;
    }
    if (!name) continue;
    if (BLURRED_NAME.test(name)) break;                 // hit the Athletic+ paywall — stop

    // 2) Mark / time — first non-empty line after the name.
    var time = '';
    while (i < lines.length) {
      var t = lines[i];
      if (t === '') { i++; continue; }
      time = t.replace(PB_TAG, '').trim(); i++; break;
    }

    // 3) Team — first following line that carries a date. Team sits between the
    //    grade and the date: "MI  12   <Team>   May 07   <Meet>".
    var team = '';
    var scanned = 0;
    while (i < lines.length && scanned < 6) {
      var d = lines[i];
      var dm = d.match(DATE_PAT);
      if (dm) {
        var before = d.slice(0, dm.index).replace(/[\t ]+/g, ' ').trim();
        before = before.replace(/^[A-Z]{2}\s+/, '');     // drop leading state code (MI/IN/IL)
        before = before.replace(/^(\d{1,2}|-)\s+/, '');  // drop grade (number or "-")
        team = before.trim();
        i++;
        break;
      }
      if (RANK_DOT_LINE.test(d)) break;                  // next entry, no detail line found
      i++; scanned++;
    }

    results.push({ rank: rank, name: name, school: team, time: time });
  }

  results.sort(function (a, b) { return a.rank - b.rank; });
  var max = (opts && opts.maxResults) ? opts.maxResults : 10;
  return results.slice(0, max);
}

// ── Main entry point ────────────────────────────────────────────────────────
function parseResults(raw, opts) {
  opts = opts || {};
  var markPattern     = /\b(\d{1,3}'\s*\d{1,2}(?:\.\d+)?"|\d{1,2}\.\d{2}m|\d{1,3}-\d{1,2}(?:\.\d+)?)/;
  var timePattern     = /\b(\d{0,2}:?\d{1,2}:\d{2}\.\d{1,3}[a-zA-Z]?|\d{1,2}:\d{2}\.\d{1,3}[a-zA-Z]?|\d{1,2}\.\d{2,3}[a-zA-Z]?)\b/;
  var windPattern     = /\([-+]?\d*\.?\d+(\s*m\/s)?\)|\(NWI\)/gi;
  var rankLinePattern = /^(\d{1,2})\.?\s*$/;
  var gradePattern    = /^(6|7|8|9|10|11|12)$/;
  var skipPattern     = /^(place|rank|#|athlete|name|school|time|mark|result)/i;
  var inlineRankPattern = /^(\d{1,2})[.\t\s]/;

  var lines = raw.split('\n').map(function (l) { return l.trim(); });
  var results = [];

  var teamFormat = !!opts.isTeam;

  // Performance list / rankings page (modern athletic.net, one field per line).
  if (!teamFormat && looksLikePerformanceList(lines)) {
    return parsePerformanceList(lines, opts);
  }

  // ── Detect relay vs individual for clean hand-pasted text ──────────────────
  var relayFormat = false;
  if (!teamFormat) {
    for (var i0 = 0; i0 < Math.min(lines.length, 20); i0++) {
      if (rankLinePattern.test(lines[i0]) && lines[i0 + 1] && gradePattern.test(lines[i0 + 1])) {
        relayFormat = true;
        break;
      }
    }
  }

  if (teamFormat) {
    // ── TEAM PARSER ───────────────────────────────────────────────────────
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (!line || skipPattern.test(line)) { i++; continue; }
      var rankMatch = line.match(inlineRankPattern);
      if (!rankMatch) { i++; continue; }
      var rank = parseInt(rankMatch[1]);

      var remainder = line.replace(inlineRankPattern, '').replace(/\t/g, ' ').trim();
      var parts = remainder.split(/\s+/);

      var scoreIdx = -1;
      for (var k = 0; k < parts.length; k++) {
        if (/^\d+$/.test(parts[k])) { scoreIdx = k; break; }
      }

      var score = '', schoolName = remainder, extra = '';
      if (scoreIdx >= 0) {
        score      = parts[scoreIdx];
        schoolName = parts.slice(0, scoreIdx).join(' ').trim();
        extra      = parts.slice(scoreIdx + 1).join(' ').trim();
      }

      var advanced = false;
      if (scoreIdx === -1) {
        var j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length && /^\d+/.test(lines[j].trim())) {
          var nextParts = lines[j].trim().split(/\s+/);
          score = nextParts[0];
          extra = nextParts.slice(1).join(' ').trim();
          i = j + 1;
          advanced = true;
        }
      }
      if (!advanced) i++;

      if (schoolName.length > 1) {
        results.push({ rank: rank, name: schoolName, school: extra, time: score });
      }
    }

  } else if (relayFormat) {
    // ── RELAY PARSER ──────────────────────────────────────────────────────
    var ir = 0;
    while (ir < lines.length) {
      var lr = lines[ir];
      if (!lr || skipPattern.test(lr)) { ir++; continue; }
      if (!rankLinePattern.test(lr)) { ir++; continue; }
      var rrank = parseInt(lr);
      ir++;

      var athletes = [];
      var rtime = '';
      var rschool = '';

      while (ir < lines.length) {
        var cur = lines[ir].trim();
        if (!cur) { ir++; continue; }
        var timeMatch = cur.match(timePattern);
        if (timeMatch && cur.replace(timePattern, '').replace(/[a-zA-Z\s]/g, '').length === 0) {
          rtime = timeMatch[1].replace(/[a-zA-Z]$/, '');
          ir++;
          break;
        }
        if (gradePattern.test(cur)) { ir++; continue; }
        if (rankLinePattern.test(cur)) break;
        athletes.push(cur.replace(/\.{2,}$/, '').trim());
        ir++;
      }

      while (ir < lines.length && lines[ir].trim() === '') ir++;
      if (ir < lines.length) {
        var nextLine = lines[ir].trim();
        if (!rankLinePattern.test(nextLine) && !skipPattern.test(nextLine) && nextLine.length > 1) {
          rschool = nextLine.replace(/\.{2,}$/, '').trim();
          ir++;
        }
      }

      var teamName = rschool || athletes[0] || '';
      var memberList = athletes.join(', ');
      if (teamName.length > 1) {
        results.push({ rank: rrank, name: teamName, school: memberList, time: rtime });
      }
    }

  } else {
    // ── INDIVIDUAL PARSER (clean paste) ───────────────────────────────────
    var ii = 0;
    while (ii < lines.length) {
      var li = lines[ii];
      if (!li || skipPattern.test(li)) { ii++; continue; }
      var rmI = li.match(inlineRankPattern);
      if (!rmI) { ii++; continue; }
      var irank = parseInt(rmI[1]);

      var cleanLine = li.replace(PB_TAG, '');
      var mMatch = cleanLine.match(markPattern);
      var tMatch = cleanLine.match(timePattern);
      var itime = '';
      if (mMatch) itime = mMatch[1].trim();
      else if (tMatch) itime = tMatch[1].replace(/[a-zA-Z]$/, '');

      var namePart = cleanLine
        .replace(inlineRankPattern, '')
        .replace(windPattern, '')
        .replace(markPattern, '')
        .replace(timePattern, '')
        .replace(/\b(6|7|8|9|10|11|12)\b/, '')
        .replace(/\t/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/\.{2,}$/, '')
        .trim();

      var ischool = '';
      var jj = ii + 1;
      while (jj < lines.length && lines[jj].trim() === '') jj++;

      if (jj < lines.length) {
        var nl = lines[jj].trim();
        if (!inlineRankPattern.test(nl) && !skipPattern.test(nl) && nl.length > 1) {
          ischool = nl.replace(/\.{2,}$/, '').trim();
          ii = jj + 1;
        } else { ii++; }
      } else { ii++; }

      if (namePart.length > 1) {
        results.push({ rank: irank, name: namePart, school: ischool, time: itime });
      }
    }
  }

  results.sort(function (a, b) { return a.rank - b.rank; });
  var max = (opts && opts.maxResults) ? opts.maxResults : 8;
  return results.slice(0, max);
}

// ── Meta detection (auto-fill the form from the grabbed page text) ──────────
function cleanEvent(s) {
  if (!s) return s;
  s = s.trim();
  s = s.replace(/\bMeters?\b/i, 'm');     // "100 Meters" -> "100 m"
  s = s.replace(/(\d)\s+m\b/, '$1m');     // "100 m" -> "100m"
  s = s.replace(/\s{2,}/g, ' ');
  return s.trim();
}

function detectMeta(raw) {
  var meta = {};
  if (!raw) return meta;

  // State
  var states = ['Michigan', 'Indiana', 'Illinois', 'Ohio', 'Wisconsin'];
  for (var s = 0; s < states.length; s++) {
    if (raw.indexOf(states[s]) !== -1) { meta.state = states[s]; break; }
  }

  // Division — "Division 2" -> D2 ; Illinois "2A" style
  var dm = raw.match(/Division\s+(\d)/i);
  if (dm) meta.division = 'D' + dm[1];
  var am = raw.match(/\b([123]A)\b/);
  if (am) meta.division = am[1];

  // Event — from "Performance List | 100 Meters" or "...Results | Boys 100 Meters"
  var em = raw.match(/Performance List\s*\|\s*([^\n|]+)/i);
  if (em) meta.event = cleanEvent(em[1]);

  // Award type
  if (/Performance List|Top\s+\d+|Rankings/i.test(raw)) meta.awardtype = 'Rankings';

  // Sport
  if (/Cross\s*Country/i.test(raw)) meta.sport = 'Cross Country';
  else if (/Indoor/i.test(raw)) meta.sport = 'Indoor Track';
  else if (/Track\s*&\s*Field|Track and Field|Outdoor/i.test(raw)) meta.sport = 'Outdoor Track';

  return meta;
}

// ── Meet results page (MANY events → batch of graphics) ─────────────────────
// athletic.net meet pages list every event on one page. parseEvents splits the
// page into individual events so each can become its own graphic.

var STATUS_RE = /^(SCR|DQ|DNF|DNS|FS|ND|NH|NM|NT|FOUL)$/i;

function cleanMark(m) {
  if (!m) return '';
  m = m.replace(/\([^)]*\)/g, '');                  // wind / notes e.g. (0.2)
  m = m.replace(/\b(PB|SB|PR|SR|NR|AR|WR|MR)\b/gi, '');
  m = m.trim();
  m = m.replace(/([\d.")])\s*[ahq]$/i, '$1');        // trailing timing letter: 10.79a, 14.20a
  return m.trim();
}

function parseEventHeader(line) {
  // "100 Meters D2 - Finals", "4x100 Relay D2 - Finals", "Shot Put - 12lb D2 - Finals",
  // "110m Hurdles - 39\" / 0.991m D2 - Finals", "100 Meters - Ambulatory D2 Adaptive - Finals"
  var m = line.match(/^(.*?)\s+(D[1-5])(\s+Adaptive)?\s*-\s*(Finals|Prelims|Semifinals|Quarterfinals|Final|Prelim)\b/i);
  if (!m) return null;
  return { event: m[1].trim(), division: m[2].toUpperCase(), adaptive: !!m[3], round: m[4] };
}

function isMeetRow(line) {
  var c = line.split('\t')[0].trim();
  return /^\d{1,3}\.$/.test(c);
}

function splitEventBlocks(raw) {
  var lines = raw.split('\n').map(function (l) { return l.trim(); });
  var blocks = [], gender = 'Boys', cur = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^Mens?\s+Results$/i.test(line))   { gender = 'Boys';  continue; }
    if (/^Womens?\s+Results$/i.test(line)) { gender = 'Girls'; continue; }
    var h = parseEventHeader(line);
    if (h) { if (cur) blocks.push(cur); cur = { gender: gender, header: h, lines: [] }; continue; }
    if (!cur) continue;
    if (/^(Field Series|Splits)$/i.test(line)) continue;                  // sub-headers
    if (/Latest Videos|Meet managed|Upgrade to Athletic|All rights reserved/i.test(line)) {
      blocks.push(cur); cur = null; continue;                            // page footer
    }
    cur.lines.push(line);
  }
  if (cur) blocks.push(cur);
  return blocks;
}

function parseIndivBlock(lines) {
  var rows = [], i = 0;
  while (i < lines.length) {
    if (!isMeetRow(lines[i])) { i++; continue; }
    var cells = lines[i].split('\t').map(function (s) { return s.trim(); })
                        .filter(function (s) { return s.length; });
    var rank = parseInt(cells[0], 10);
    var grade = (cells[1] && /^\d{1,2}$/.test(cells[1])) ? cells[1] : '';
    var nameIdx = grade ? 2 : 1;
    var name = cells[nameIdx] || '';
    var markCell = cells[cells.length - 1] || '';
    i++;
    var school = '';
    while (i < lines.length && lines[i] === '') i++;
    if (i < lines.length && !isMeetRow(lines[i])) { school = lines[i]; i++; }
    if (cells.length <= nameIdx || STATUS_RE.test(markCell)) continue;    // scratch / no mark
    var mark = cleanMark(markCell);
    if (name && mark) rows.push({ rank: rank, name: name, school: school, time: mark });
  }
  rows.sort(function (a, b) { return a.rank - b.rank; });
  return rows;
}

function parseRelayBlock(lines) {
  var rows = [], i = 0;
  var rankAlone = /^(\d{1,3})\.$/;     // relay ranks always carry a period
  var splitTime = /^[\d:.]+h$/;        // leg split (11.6h, 50.5h, 2:04.3h) — ignore
  var gradeRe   = /^\d{1,2}$/;
  var endMark   = /[\d.]a$/;           // official relay time ends in 'a'
  while (i < lines.length) {
    var first = lines[i].split('\t')[0].trim();
    if (!rankAlone.test(first)) { i++; continue; }
    var rank = parseInt(first, 10);
    i++;
    var members = [], time = '';
    while (i < lines.length) {
      var cur = lines[i].split('\t')[0].trim();
      if (cur === '') { i++; continue; }
      if (rankAlone.test(cur)) break;                              // next team
      if (gradeRe.test(cur) || splitTime.test(cur)) { i++; continue; }
      if (endMark.test(cur) || STATUS_RE.test(cur)) { time = cleanMark(cur); i++; break; }
      members.push(cur); i++;
    }
    var school = '';
    while (i < lines.length && lines[i] === '') i++;
    if (i < lines.length) {
      var nx = lines[i].split('\t')[0].trim();
      if (!rankAlone.test(nx) && !gradeRe.test(nx)) { school = lines[i]; i++; }
    }
    if (school && time && !STATUS_RE.test(time)) {
      rows.push({ rank: rank, name: school, school: members.join(', '), time: time });
    }
  }
  rows.sort(function (a, b) { return a.rank - b.rank; });
  return rows;
}

function parseEvents(raw) {
  var blocks = splitEventBlocks(raw);
  var events = [];
  for (var b = 0; b < blocks.length; b++) {
    var blk = blocks[b];
    var nm = blk.header.event;
    var isRelay = /relay/i.test(nm) || /\dx\d/i.test(nm);
    var rows = isRelay ? parseRelayBlock(blk.lines) : parseIndivBlock(blk.lines);
    if (!rows.length) continue;
    var ev = cleanEvent(nm.split(' - ')[0]);
    if (blk.header.adaptive) ev += ' Adaptive';
    events.push({
      gender:   blk.gender,
      event:    ev,
      eventRaw: nm,
      division: blk.header.division,
      adaptive: blk.header.adaptive,
      round:    blk.header.round,
      type:     isRelay ? 'relay' : 'individual',
      rows:     rows
    });
  }
  return events;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseResults: parseResults, detectMeta: detectMeta,
                     looksLikePerformanceList: looksLikePerformanceList,
                     parsePerformanceList: parsePerformanceList,
                     parseEvents: parseEvents, parseEventHeader: parseEventHeader,
                     splitEventBlocks: splitEventBlocks };
}
