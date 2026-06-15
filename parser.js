/* parser.js
 *
 * Athletic.net results parser, extracted verbatim from glrr-results-formatter.html
 * so it can be reused by the client-side graphic generator without duplicating logic.
 *
 * The ONLY changes from the inline version are that the two pieces of state it used
 * to read from the DOM are now passed in via `opts`:
 *   parseResults(raw, { isTeam: bool, maxResults: number })
 *
 * Detects three formats: Individual, Relay, Team (when opts.isTeam is true).
 */
function parseResults(raw, opts) {
  opts = opts || {};
  const pbPattern       = /\s*(PB|SB|PR|SR|NR|AR|WR|MR)\b/gi;
  const markPattern     = /\b(\d{1,3}'\s*\d{1,2}(?:\.\d+)?"|\d{1,2}\.\d{2}m|\d{1,3}-\d{1,2}(?:\.\d+)?)/;
  const metricMarkPattern = /\b(\d{1,2}\.\d{2}m)\b/;  // field events in meters e.g. 19.27m
  const timePattern     = /\b(\d{0,2}:?\d{1,2}:\d{2}\.\d{1,3}[a-zA-Z]?|\d{1,2}:\d{2}\.\d{1,3}[a-zA-Z]?|\d{1,2}\.\d{2,3}[a-zA-Z]?)\b/;
  const windPattern     = /\([-+]?\d*\.?\d+(\s*m\/s)?\)|\(NWI\)/gi;
  const rankLinePattern = /^(\d{1,2})\.?\s*$/;  // rank is alone on its own line in relay format
  const gradePattern    = /^(6|7|8|9|10|11|12)$/;        // grade alone on its own line
  const skipPattern     = /^(place|rank|#|athlete|name|school|time|mark|result)/i;
  const inlineRankPattern = /^(\d{1,2})[.\t\s]/; // rank inline with name (individual format)

  const lines = raw.split('\n').map(l => l.trim());
  const results = [];

  // ── Detect format ─────────────────────────────────────────────────────────
  let relayFormat = false;
  let teamFormat  = !!opts.isTeam;   // was: read from #eventtype dropdown

  if (!teamFormat) {
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      if (rankLinePattern.test(lines[i]) && lines[i+1] && gradePattern.test(lines[i+1])) {
        relayFormat = true;
        break;
      }
    }
  }

  if (teamFormat) {
    // ── TEAM PARSER ───────────────────────────────────────────────────────
    // Formats supported:
    //   "1. School Name  63"                        (school + score)
    //   "1. School Name  63  De-Mani Roberts"       (track: + top scorer)
    //   "1. School Name  47  3, 8, 12, 19, 24"      (xc: + scoring places)
    // Strategy: rank first, then the FIRST standalone integer is the score.
    // Everything before it = school, everything after it = extra info.
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line || skipPattern.test(line)) { i++; continue; }
      const rankMatch = line.match(inlineRankPattern);
      if (!rankMatch) { i++; continue; }
      const rank = parseInt(rankMatch[1]);

      let remainder = line.replace(inlineRankPattern, '').replace(/\t/g, ' ').trim();
      const parts = remainder.split(/\s+/);

      // Find the first token that is a pure integer — that's the team score
      let scoreIdx = -1;
      for (let k = 0; k < parts.length; k++) {
        if (/^\d+$/.test(parts[k])) { scoreIdx = k; break; }
      }

      let score = '', schoolName = remainder, extra = '';
      if (scoreIdx >= 0) {
        score      = parts[scoreIdx];
        schoolName = parts.slice(0, scoreIdx).join(' ').trim();
        extra      = parts.slice(scoreIdx + 1).join(' ').trim();
      }

      // If score wasn't found on this line, check the next line
      let advanced = false;
      if (scoreIdx === -1) {
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length && /^\d+/.test(lines[j].trim())) {
          const nextParts = lines[j].trim().split(/\s+/);
          score = nextParts[0];
          extra = nextParts.slice(1).join(' ').trim();
          i = j + 1;
          advanced = true;
        }
      }
      if (!advanced) i++;

      if (schoolName.length > 1) {
        // store extra scorer info in the school field; build_rows formats it
        results.push({ rank, name: schoolName, school: extra, time: score });
      }
    }

  } else if (relayFormat) {
    // ── RELAY PARSER ──────────────────────────────────────────────────────
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line || skipPattern.test(line)) { i++; continue; }

      // Look for a standalone rank number
      if (!rankLinePattern.test(line)) { i++; continue; }
      const rank = parseInt(line);

      i++; // move past rank line

      // Collect all tokens until we hit the time line
      const athletes = [];
      let time = '';
      let school = '';

      while (i < lines.length) {
        const cur = lines[i].trim();
        if (!cur) { i++; continue; }

        // Time line — marks end of athlete list
        const timeMatch = cur.match(timePattern);
        if (timeMatch && cur.replace(timePattern, '').replace(/[a-zA-Z\s]/g,'').length === 0) {
          time = timeMatch[1].replace(/[a-zA-Z]$/, '');
          i++;
          break;
        }

        // Grade line — skip
        if (gradePattern.test(cur)) { i++; continue; }

        // Next rank — stop, don't consume
        if (rankLinePattern.test(cur)) break;

        // Must be an athlete name
        athletes.push(cur.replace(/\.{2,}$/, '').trim());
        i++;
      }

      // Next non-blank line after time is the school
      while (i < lines.length && lines[i].trim() === '') i++;
      if (i < lines.length) {
        const nextLine = lines[i].trim();
        if (!rankLinePattern.test(nextLine) && !skipPattern.test(nextLine) && nextLine.length > 1) {
          school = nextLine.replace(/\.{2,}$/, '').trim();
          i++;
        }
      }

      // For relays: name field shows the team members, school is the team name
      const teamName = school || athletes[0] || '';
      const memberList = athletes.join(', ');

      if (teamName.length > 1) {
        results.push({ rank, name: teamName, school: memberList, time });
      }
    }

  } else {
    // ── INDIVIDUAL PARSER ─────────────────────────────────────────────────
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line || skipPattern.test(line)) { i++; continue; }

      const rankMatch = line.match(inlineRankPattern);
      if (!rankMatch) { i++; continue; }

      const rank = parseInt(rankMatch[1]);

      // Strip PB/SB before parsing
      const cleanLine = line.replace(pbPattern, '');

      // Field mark (feet-inches) takes priority over time
      const markMatch = cleanLine.match(markPattern);
      const timeMatch = cleanLine.match(timePattern);
      let time = '';
      if (markMatch) {
        time = markMatch[1].trim();
      } else if (timeMatch) {
        time = timeMatch[1].replace(/[a-zA-Z]$/, '');
      }

      let namePart = cleanLine
        .replace(inlineRankPattern, '')
        .replace(windPattern, '')
        .replace(markPattern, '')
        .replace(timePattern, '')
        .replace(/\b(6|7|8|9|10|11|12)\b/, '')
        .replace(/\t/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/\.{2,}$/, '')
        .trim();

      let school = '';
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;

      if (j < lines.length) {
        const nextLine = lines[j].trim();
        if (!inlineRankPattern.test(nextLine) && !skipPattern.test(nextLine) && nextLine.length > 1) {
          school = nextLine.replace(/\.{2,}$/, '').trim();
          i = j + 1;
        } else {
          i++;
        }
      } else {
        i++;
      }

      if (namePart.length > 1) {
        results.push({ rank, name: namePart, school, time });
      }
    }
  }

  results.sort((a, b) => a.rank - b.rank);
  const max = (opts && opts.maxResults) ? opts.maxResults : 8;   // was: getMaxResults()
  return results.slice(0, max);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseResults };
}
