# Project: GLRR Results Formatter

A local tool for **Great Lakes Run Rankings** (Instagram/TikTok handle: **@greatlakestrack**), an
account that posts XC and track rankings/results for the Great Lakes region across high school and
college levels. **Current active scope: Michigan, Indiana, Illinois only** (Ohio/Wisconsin deferred).

The tool takes raw results pasted from athletic.net, parses them, and auto-generates:
- A formatted top-10 rankings preview
- An Instagram caption
- A hashtag bank
- A filled-in PowerPoint graphic (from a template) exported as a PNG ready to post
- A Google Sheets TSV export
- Carousel mode: batch multiple events into a set of numbered PNGs for a single carousel post

## Tech stack
- Python 3 + Flask (local web server, runs on http://localhost:5000)
- python-pptx for filling PowerPoint templates
- LibreOffice (headless) OR PowerPoint COM (via comtypes) for PNG export
- Plain HTML/CSS/JS frontend (no framework)

## File structure
```
GLRR/
  app.py                        # Flask server — serves the HTML, handles /generate and /generate_carousel
  fill_template.py              # Core logic: parse-independent template filling + PNG export
  glrr-results-formatter.html   # The frontend UI (parser lives here in JS)
  schools.json                  # School name -> abbreviation lookup (371+ MHSAA schools + truncated variants)
  mhsaa_template.pptx           # Fallback template
  templates/                    # Per-state and per-conference templates
    michigan.pptx
    ohio.pptx                   # (to be built)
    big_ten.pptx                # (to be built)
    ...
```

## Commands
- Start the app: `python app.py` (must be run from the GLRR folder; it auto-opens the browser)
- Stop the app: Ctrl+C in the terminal
- Install deps: `pip install flask python-pptx comtypes pillow`
- The folder lives at: `C:\Users\trlar\OneDrive\Desktop\GLRR`

## How it works

### Parsing (in glrr-results-formatter.html, parseResults function)
The parser auto-detects three athletic.net formats:
1. **Individual** — `rank  grade  name  time` on one line, school on the NEXT line
2. **Relay** — rank alone on a line, then grade+name pairs, then time, then school
3. **Team** — `rank. School Name  score` (detected when Event Type dropdown = "team")

It strips:
- Grade numbers (9-12)
- Wind readings like `(-1.1)` and `(NWI)`
- PB/SB/PR/SR/NR/AR/WR/MR personal/season best tags
- Trailing ellipsis from truncated names

It handles field event marks (`58' 6"`, `6.23m`) the same way as track times.

### Template filling (fill_template.py)
- `{{name_N}}`, `{{school_N}}`, `{{time_N}}` placeholders for N=1..9
- `{{sport}}`, `{{division}}`, `{{meet}}`, `{{gender}}`, `{{event}}`, `{{type}}` for the header
- IMPORTANT: placeholders can be split across multiple runs in PowerPoint XML.
  `replace_in_paragraph()` handles this by merging runs before replacing.
- Relay mode: name field = team/school name, school field blank
- Team mode: name field = school, time field = score (with "pts" suffix if scoring=points)
- Individual mode: name + school + time

### School abbreviations (schools.json + shorten_school in fill_template.py)
- Exact match first, then strips " - A" relay suffix, then strips trailing "." and "(..." fragments
- Then fuzzy PREFIX matching: athletic.net truncates long names, so it matches the
  truncated name against the start of full school names
- Abbreviation conventions: Detroit->Det., Grand Rapids->GR, Ann Arbor->AA, Kalamazoo->Kzoo,
  Traverse City->TC, Bloomfield Hills->BH, Dearborn->Dbn, Dearborn Heights->Dbn Hts,
  Walled Lake->WL, Sterling Heights->SH, Battle Creek->BC, Forest Hills->FH, Birmingham->Bhm

### Template routing (get_template_path in fill_template.py)
- State mode -> templates/{state}.pptx (e.g. templates/michigan.pptx)
- Conference mode -> templates/{conference}.pptx (e.g. templates/big_ten.pptx)
- Falls back to mhsaa_template.pptx if the specific template isn't found

### PNG export (export_png in fill_template.py)
Tries in order:
1. LibreOffice (hardcoded path: C:\Program Files\LibreOffice\program\soffice.exe)
2. PowerPoint COM automation (comtypes) — slides are 1-indexed
3. Pillow placeholder (blank fallback — means the real methods failed)

### Browser-rendered graphic (IN PROGRESS — replacing the PPTX→PNG pipeline)
Goal: drop the LibreOffice/PowerPoint dependency so the app runs on a phone or hosted online.
Instead of filling a .pptx and converting it, the ranking graphic is rebuilt as HTML/CSS and
exported to PNG client-side with **html2canvas**.
- `preview_graphic.html` — standalone proof-of-concept of the graphic (1080x1350, brand styling,
  Download PNG button). Confirmed visually against the Canva template.
- Brand colors: red `#c0392b`, gold `#e8c840`, off-white `#f5f5f0`, dark navy `#15181c`.
- Layout per row: red rank square · white skewed name box (athlete over school) · red skewed
  parallelogram with the time. #1 row uses gold. Vertical "RUN" watermark top-right.
- The existing PPTX pipeline stays intact during the transition (do not remove it yet).

## State-specific rules
Currently only MI / IN / IL are in active use.
- Michigan (MHSAA): D1, D2, D3, D4 — top 8 All-State
- Indiana (IHSAA): no divisions ("Open") — top 9 All-State
- Illinois (IHSA): 1A, 2A, 3A — top 9 All-State
- Ohio (OHSAA): D1, D2, D3, D4, D5 — top 8 *(deferred)*
- Wisconsin (WIAA): D1, D2, D3 — top 8 *(deferred)*
- College: Men's/Women's instead of Boys/Girls; divisions D1/D2/D3/NAIA

### Row count per award type
- **All-State**: Michigan = 8, Indiana = 9, Illinois = 9 (the cutoffs above)
- **Rankings** (early/mid-season posts): top **10** for all three states
- See `getMaxResults(state, award)` in the frontend.

## Sports
Outdoor Track, Indoor Track, Cross Country

## Conferences (college, by division)
- D1: Big Ten, MAC
- D2: GLIAC, G-MAC, GLVC
- D3: MIAA, CCIW, OAC, HCAC
- NAIA: Crossroads League, WHAC, CCAC

## Conventions / gotchas
- Always run from the GLRR folder so relative paths resolve (app.py does os.chdir(BASE_DIR) to enforce this)
- PowerPoint must be CLOSED when running — it locks the .pptx file and python-pptx can't open it
- All paths in fill_template.py resolve relative to BASE_DIR (the script's own folder), NOT the working directory
- When editing the JS parser, remember there are 3 separate parser branches (team/relay/individual) in an if/else chain

## Roadmap / TODO
- **Browser-rendered graphic (active):** replace the PPTX→PNG pipeline with HTML/CSS + html2canvas
  so there's no LibreOffice/PowerPoint dependency. Then it can run on a phone or be hosted online.
- Weekly rankings automation: pull from athletic.net and TFRRS on a schedule (the big one)
- Package as a Windows .exe with PyInstaller so it's one double-click to launch
- Expand schools.json as new truncated school names appear
