/* school_utils.js
 *
 * Client-side port of the school-name restoration logic from fill_template.py
 * (shorten_school + initials_list). Kept byte-for-byte faithful to the Python
 * so the browser-rendered graphic produces the exact same names as the old
 * PowerPoint pipeline.
 *
 * Usage:
 *   const schools = await fetch('schools.json').then(r => r.json());
 *   shortenSchool('TC West (Traverse City)', schools)  // -> 'Traverse City West'
 *   initialsList('Dylan Gamnje, Gideon Gash')          // -> 'D. Gamnje, G. Gash'
 *
 * Mirrors: fill_template.py  (USE_ABBREVIATIONS, initials_list, shorten_school)
 */

// Set to false to show full school names instead of the schools.json mapping.
var USE_ABBREVIATIONS = true;

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// 'Dylan Gamnje, Gideon Gash' -> 'D. Gamnje, G. Gash'
function initialsList(members) {
  if (!members) return '';
  const out = [];
  for (let full of members.split(',')) {
    full = full.trim();
    if (!full) continue;
    const parts = full.split(/\s+/);
    if (parts.length >= 2) {
      out.push(parts[0][0] + '. ' + parts.slice(1).join(' '));
    } else {
      out.push(full);
    }
  }
  return out.join(', ');
}

function shortenSchool(name, schools) {
  if (!name) return name;
  // Always clean up athletic.net truncation artifacts (trailing ".")
  name = name.split(' - ')[0].trim();
  name = name.replace(/\.+$/, '').trim();            // Python: name.rstrip('.')
  // Only strip a "(" fragment if it's an INCOMPLETE truncation (no closing paren).
  // Keep complete "City (School)" formats like "LaGrange (Lyons)".
  if (name.indexOf('(') !== -1 && name.indexOf(')') === -1) {
    name = name.split('(')[0].trim();
  }

  if (!USE_ABBREVIATIONS) return name;

  // 1. Exact match
  if (has(schools, name)) return schools[name];
  // 2. Strip relay suffix like " - A"
  const clean = name.split(' - ')[0].trim();
  if (has(schools, clean)) return schools[clean];
  // 3. Strip trailing ellipsis/truncation and any "(..." fragment
  const stripped = clean.replace(/\.+$/, '').split('(')[0].trim();
  if (has(schools, stripped)) return schools[stripped];
  // 4. Truncation match — athletic.net cuts names off, so if our (shorter)
  //    name is the start of a known key, use that key's full name
  for (const key in schools) {
    if (!has(schools, key)) continue;
    if (stripped.length >= 10 && key.startsWith(stripped)) {
      return schools[key];
    }
  }
  return name;
}

// Make available to Node too (for any future headless tests).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { shortenSchool, initialsList, USE_ABBREVIATIONS };
}
