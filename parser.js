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
var YEAR_RE       = /^(\d{1,2}|FR|SO|JR|SR)$/i; // class year: HS grade 9-12 OR college Fr/So/Jr/Sr

// Team name from a performance-list detail line — always the column right before the
// date. Works for every layout (HS has a state + grade col, college has just a year col,
// XC adds an age col, field events prefix an imperial mark). e.g.
//   "Jr   Ashland   May 01   G-MAC..."        -> Ashland
//   "MI 16 11   Whitehall   Oct 25  ..."      -> Whitehall
//   "60' 2.5\"  Sr   Hillsdale   May 01  ..." -> Hillsdale
function teamFromDetail(line) {
  var cells = line.split(/\t+|\s{2,}/).map(function (s) { return s.trim(); })
                  .filter(function (s) { return s.length; });
  for (var k = 0; k < cells.length; k++) if (DATE_PAT.test(cells[k])) return k > 0 ? cells[k - 1] : '';
  return '';
}

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
      time = cleanMark(t); i++; break;
    }

    // 3) Team — first following line that carries a date. Team sits between the
    //    grade and the date: "MI  12   <Team>   May 07   <Meet>".
    var team = '';
    var scanned = 0;
    while (i < lines.length && scanned < 6) {
      var d = lines[i];
      if (DATE_PAT.test(d)) {
        team = teamFromDetail(d);
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
  m = m.replace(/\([^)]*\)/g, ' ');                       // strip wind / notes e.g. (0.2)
  // record tags, whether spaced ("10.66 PB") or glued to the FAT letter ("47.90aPB")
  m = m.replace(/\s*(PB|SB|PR|SR|NR|AR|WR|MR)\b/gi, ' ');
  m = m.trim();
  m = m.replace(/([\d."'])\s*[ahq]$/i, '$1');             // trailing FAT letter: 47.90a, 16:23.4a
  return m.trim();
}

function parseEventHeader(line) {
  // "100 Meters D2 - Finals", "4x100 Relay D2 - Finals", "Shot Put - 12lb D2 - Finals",
  // "110m Hurdles - 39\" / 0.991m D2 - Finals", "100 Meters - Ambulatory D2 Adaptive - Finals"
  var m = line.match(/^(.*?)\s+(D[1-5])(\s+Adaptive)?\s*-\s*(Finals|Prelims|Semifinals|Quarterfinals|Final|Prelim)\b/i);
  if (m) return { event: m[1].trim(), division: m[2].toUpperCase(), adaptive: !!m[3], round: m[4] };
  // College meets: "100 Meters Results - Finals" / "4x100 Relay Results - Prelims" (no division)
  var c = line.match(/^(.+?)\s+Results\s*-\s*(Finals|Prelims|Semifinals|Quarterfinals|Final|Prelim)\b/i);
  if (c) return { event: c[1].trim(), division: '', adaptive: false, round: c[2] };
  return null;
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
    var grade = (cells[1] && YEAR_RE.test(cells[1])) ? cells[1] : '';
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
  var gradeRe   = YEAR_RE;             // grade number (HS) or Fr/So/Jr/Sr (college)
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

function parseTrackMeet(raw) {
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

var FOOTER_RE = /Latest Videos|Meet managed|Upgrade to Athletic|All rights reserved|View All Latest/i;
var GENDER_DIST = /^(Men|Mens|Women|Womens)\s+([\d,]+)\s*Meters?\b(?:.*?(D[1-5]|[123]A))?/i;

function genderOf(label) { return /^W/i.test(label) ? 'Girls' : 'Boys'; }

// ── Track/XC TEAM SCORES — "Mens D2" sections of "rank.  Team  score" ───────
function parseTrackTeamScores(lines) {
  var events = [], cur = null, any = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (FOOTER_RE.test(line)) break;
    var gh = line.match(/^(Men|Mens|Women|Womens)(?:\s+(D[1-5]|[123]A|Open))?(?:\s+Results)?\s*$/i);
    if (gh) {
      if (cur && cur.rows.length) events.push(cur);
      cur = { gender: genderOf(gh[1]), event: 'Team Scores', division: (gh[2] || '').toUpperCase(),
              sport: undefined, type: 'team', scoring: 'points', award: 'Rankings', round: '', rows: [] };
      continue;
    }
    if (!cur) continue;
    var p = line.split(/\t+|\s{2,}/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
    if (p.length >= 3 && /^\d+\.$/.test(p[0]) && /^\d+(\.\d+)?$/.test(p[p.length - 1])) {
      cur.rows.push({ rank: parseInt(p[0], 10), name: p.slice(1, p.length - 1).join(' '), school: '', time: p[p.length - 1] });
      any = true;
    }
  }
  if (cur && cur.rows.length) events.push(cur);
  return any ? events : [];
}

// ── XC MEET individual results — rank / avatar / name / team / time / "Yr:" ─
function parseXcMeet(lines) {
  var header = null;
  for (var h = 0; h < lines.length; h++) {
    var hm = lines[h].match(GENDER_DIST);
    if (hm) { header = { gender: genderOf(hm[1]), event: cleanEvent(hm[2] + ' Meters'), division: (hm[3] || '').toUpperCase() }; break; }
  }
  if (!header) return null;
  if (!lines.some(function (l) { return /Yr:\s*\S/.test(l); })) return null;   // XC meet has "Yr: 11"/"Yr: Sr" lines
  var rows = [], i = 0;
  while (i < lines.length) {
    if (FOOTER_RE.test(lines[i])) break;
    if (!/^\d{1,3}$/.test(lines[i])) { i++; continue; }
    var rank = parseInt(lines[i], 10); i++;
    var name = '';
    while (i < lines.length) {
      var s = lines[i];
      if (s === '' || s === '*' || /^[A-Z]{1,4}$/.test(s) || /^[A-Z]\($/.test(s)) { i++; continue; }
      if (/^\d{1,3}$/.test(s)) break;
      name = s; i++; break;
    }
    if (!name) continue;
    var team = '';
    while (i < lines.length && lines[i] === '') i++;
    if (i < lines.length) { team = lines[i]; i++; }
    var time = '';
    while (i < lines.length && lines[i] === '') i++;
    if (i < lines.length) { time = cleanMark(lines[i]); i++; }
    if (i < lines.length && /Yr:\s*\S/.test(lines[i])) i++;
    if (name && time && /[:.]/.test(time) && !/^\d+$/.test(name)) {
      rows.push({ rank: rank, name: name, school: team, time: time });
    }
  }
  rows.sort(function (a, b) { return a.rank - b.rank; });
  return rows.length ? { gender: header.gender, event: header.event, division: header.division,
                         sport: 'Cross Country', type: 'individual', award: undefined, round: '', rows: rows } : null;
}

// ── XC TEAM SCORES — "Official Team Scores" + "rank  Team  score  places…" ──
function parseXcTeamScores(lines) {
  if (!lines.some(function (l) { return /^Official Team Scores$/i.test(l); })) return null;
  var header = null;
  for (var h = 0; h < lines.length; h++) {
    var hm = lines[h].match(GENDER_DIST);
    if (hm) { header = { gender: genderOf(hm[1]), division: (hm[3] || '').toUpperCase() }; break; }
  }
  var rows = [], started = false;
  for (var i = 0; i < lines.length; i++) {
    if (FOOTER_RE.test(lines[i])) break;
    if (/^Official Team Scores$/i.test(lines[i])) { started = true; continue; }
    if (!started) continue;
    var p = lines[i].split(/\t+|\s{2,}/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
    if (p.length >= 4 && /^\d+$/.test(p[0]) && !/^\d+$/.test(p[1]) && /^\d+$/.test(p[2])) {
      rows.push({ rank: parseInt(p[0], 10), name: p[1], school: p.slice(3, 8).join(', '), time: p[2] });
    }
  }
  rows.sort(function (a, b) { return a.rank - b.rank; });
  return rows.length ? { gender: (header ? header.gender : 'Boys'), event: 'Team Scores',
                         division: (header ? header.division : ''), sport: 'Cross Country',
                         type: 'team', scoring: 'score', award: 'Rankings', round: '', rows: rows } : null;
}

// ── XC HYPOTHETICAL team rankings — 4-line blocks ───────────────────────────
function parseHypothetical(lines) {
  if (!lines.some(function (l) { return /Hypothetical XC Meet/i.test(l); })) return null;
  var division = '';
  for (var h = 0; h < lines.length; h++) {
    var dm = lines[h].match(/Division\s+(\d)\s+Hypothetical/i);
    if (dm) { division = 'D' + dm[1]; break; }
  }
  var rows = [];
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^(\d{1,3})[\t ]+(\d{1,4})[\t ]+(.+?),\s*[A-Z]{2}\s*-\s*Team Time \(1st 5\)\s*([\d:.]+)/i);
    if (m) rows.push({ rank: parseInt(m[1], 10), name: m[3].trim(), school: '', time: m[2] });
  }
  rows.sort(function (a, b) { return a.rank - b.rank; });
  return rows.length ? { gender: 'Boys', event: 'Team Rankings', division: division, sport: 'Cross Country',
                         type: 'team', scoring: 'score', award: 'Rankings', round: '', rows: rows } : null;
}

// ── Relay rows on a performance list (college relay rankings) ───────────────
//   rank "1." / avatar initials / 4 athlete names / time / "-  Team  Date  Meet"
function parsePerfListRelay(section) {
  var rows = [], i = 0;
  var rankDot = /^(\d{1,3})\.$/;
  while (i < section.length) {
    var rm = section[i].match(rankDot);
    if (!rm) { i++; continue; }
    var rank = parseInt(rm[1], 10); i++;
    var members = [], time = '', team = '';
    while (i < section.length) {
      var s = section[i];
      if (rankDot.test(s)) break;
      if (DATE_PAT.test(s)) { team = teamFromDetail(s); i++; break; }
      if (s === '' || s === '*' || s === '-' || /^[A-Z]{1,4}$/.test(s)) { i++; continue; } // avatar / blank
      if (/^\d{1,2}:\d{2}\.\d{1,2}$/.test(s) || /^\d{1,2}\.\d{2}$/.test(s)) { time = cleanMark(s); i++; continue; }
      members.push(s.replace(/\.{2,}$/, '').trim()); i++;
    }
    if (team) rows.push({ rank: rank, name: team, school: members.join(', '), time: time });
  }
  rows.sort(function (a, b) { return a.rank - b.rank; });
  return rows;
}

// ── Performance list split into events by "<EventName>Compare top N" headers ─
// HS rankings = one event; college track rankings list every event on one page.
function parsePerfListEvents(lines, fallbackEvent) {
  var idxs = [];
  for (var i = 0; i < lines.length; i++) if (/Compare top \d+\s*$/i.test(lines[i])) idxs.push(i);
  if (!idxs.length) return [];
  var events = [];
  for (var k = 0; k < idxs.length; k++) {
    var name = lines[idxs[k]].replace(/Compare top \d+\s*$/i, '').trim() || fallbackEvent || '';
    var to = (k + 1 < idxs.length) ? idxs[k + 1] : lines.length;
    var section = lines.slice(idxs[k] + 1, to);
    var isRelay = /relay/i.test(name) || /\dx\d/i.test(name);
    var rows = isRelay ? parsePerfListRelay(section) : parsePerformanceList(section, { maxResults: 50 });
    if (!rows.length) continue;
    events.push({ event: cleanEvent(String(name).split(' - ')[0]), eventRaw: name,
                  type: isRelay ? 'relay' : 'individual', award: 'Rankings', round: '', rows: rows });
  }
  return events;
}

// ── Universal router: returns an array of events (1 = single graphic, N = batch) ─
function parseEvents(raw) {
  var lines = raw.split('\n').map(function (l) { return l.trim(); });

  var hyp = parseHypothetical(lines);    if (hyp) return [hyp];
  var xts = parseXcTeamScores(lines);    if (xts) return [xts];
  var tm  = parseTrackMeet(raw);         if (tm.length) return tm;   // event headers => meet
  var tts = parseTrackTeamScores(lines); if (tts.length) return tts; // no headers => team scores
  var xc  = parseXcMeet(lines);          if (xc) return [xc];

  // Rankings / performance lists (HS = 1 event, college track = many).
  if (looksLikePerformanceList(lines) || /Compare top \d+/i.test(raw)) {
    var meta = detectMeta(raw);
    var evs = parsePerfListEvents(lines, meta.event);
    if (!evs.length) {
      var rows = parsePerformanceList(lines, { maxResults: 50 });
      if (rows.length) evs = [{ event: meta.event || '', type: 'individual', award: 'Rankings', round: '', rows: rows }];
    }
    for (var e = 0; e < evs.length; e++) evs[e].sport = meta.sport;   // form supplies gender
    if (evs.length) return evs;
  }
  return [];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseResults: parseResults, detectMeta: detectMeta,
                     looksLikePerformanceList: looksLikePerformanceList,
                     parsePerformanceList: parsePerformanceList,
                     parseEvents: parseEvents, parseEventHeader: parseEventHeader,
                     splitEventBlocks: splitEventBlocks, parseTrackMeet: parseTrackMeet,
                     parseTrackTeamScores: parseTrackTeamScores, parseXcMeet: parseXcMeet,
                     parseXcTeamScores: parseXcTeamScores, parseHypothetical: parseHypothetical,
                     parsePerfListEvents: parsePerfListEvents, teamFromDetail: teamFromDetail };
}
