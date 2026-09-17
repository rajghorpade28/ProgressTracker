import glob
import re
import json
import os
import sys

BUILD_VERSION = "20260914_quote_v2"

def clean_latex_and_math(text):
    if not text:
        return ""
    
    # 1. LaTeX arrows & operators with or without $ wrappers
    subs = [
        (r'\$?\\\s*rightarrow\$?', '&rarr;'),
        (r'\$?\\\s*Rightarrow\$?', '&rArr;'),
        (r'\$?\\\s*cdot\$?', '&middot;'),
        (r'\$?\\\s*times\$?', '&times;'),
        (r'\$?\\\s*approx\$?', '&asymp;'),
        (r'\$?\\\s*le(?![a-zA-Z])\$?', '&le;'),
        (r'\$?\\\s*ge(?![a-zA-Z])\$?', '&ge;'),
        (r'\$?\\\s*alpha\$?', '&alpha;'),
        (r'\$?\\\s*beta\$?', '&beta;'),
        (r'\$?\\\s*varepsilon\$?', '&epsilon;'),
        (r'\$?\\\s*epsilon\$?', '&epsilon;'),
        (r'\$?\\\s*theta\$?', '&theta;'),
        (r'\$?\\\s*sigma\$?', '&sigma;'),
        (r'\$?\\\s*lambda\$?', '&lambda;'),
    ]
    for p, r in subs:
        text = re.sub(p, f' {r} ', text)

    # 2. $math$ expressions
    def math_repl(m):
        c = m.group(1).strip()
        c = re.sub(r'\^2', '<sup>2</sup>', c)
        c = re.sub(r'\^3', '<sup>3</sup>', c)
        c = re.sub(r'_0', '<sub>0</sub>', c)
        c = re.sub(r'_1', '<sub>1</sub>', c)
        c = re.sub(r'_i', '<sub>i</sub>', c)
        c = re.sub(r'\\cdot', '&middot;', c)
        if c.startswith('O(') or c.startswith('R<') or len(c) <= 20:
            return f'<code class="px-1 py-0.5 rounded bg-surface-container/80 font-mono text-[11px] text-primary border border-white/5">{c}</code>'
        return f'<span class="font-mono text-[11px] text-primary">{c}</span>'

    text = re.sub(r'\$([^\$]+)\$', math_repl, text)
    text = re.sub(r'\s{2,}', ' ', text).strip()
    return text

def format_cell_html(text):
    if not text:
        return ""
    
    # 1. Clean LaTeX & Math
    text = clean_latex_and_math(text)
    
    # 2. Markdown links [text](url)
    def link_repl(m):
        label = m.group(1)
        url = m.group(2)
        if not url.startswith('http://') and not url.startswith('https://'):
            url = 'https://' + url
        return f'<a href="{url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 text-primary hover:text-primary-container underline underline-offset-2 transition-colors font-medium">{label}<span class="material-symbols-outlined text-[11px] inline-block align-middle ml-0.5">open_in_new</span></a>'
    
    text = re.sub(r'\[([^\]]+)\]\(([^\)]+)\)', link_repl, text)
    
    # 3. Parenthesized URLs: (youtube.com/...) or (cs50.harvard.edu/...)
    def paren_url_repl(m):
        url = m.group(1).strip()
        label = "Resource"
        if "youtube.com" in url or "youtu.be" in url:
            label = "YouTube"
        elif "cs50" in url:
            label = "CS50"
        elif "khanacademy" in url:
            label = "Khan Academy"
        elif "leetcode" in url:
            label = "LeetCode"
        elif "huggingface" in url:
            label = "HuggingFace"
        elif "arxiv" in url:
            label = "Paper"
        elif "fast.ai" in url:
            label = "Fast.ai"
        elif "github" in url:
            label = "GitHub"
        full_url = url if url.startswith('http') else 'https://' + url
        return f'(<a href="{full_url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 text-primary hover:text-primary-container underline underline-offset-2 transition-colors font-medium">[{label}]<span class="material-symbols-outlined text-[11px] inline-block align-middle ml-0.5">open_in_new</span></a>)'

    bare_domain_pattern = r'\(((?:https?://)?(?:www\.)?(?:youtube\.com|youtu\.be|cs50\.harvard\.edu|khanacademy\.org|arxiv\.org|immersivemath\.com|course\.fast\.ai|modelcontextprotocol\.io|docs\.spring\.io|docs\.langchain4j\.dev|developer\.confluent\.io|testcontainers\.com|docs\.ragas\.io|huggingface\.co|baeldung\.com|github\.com)[^\s\)]*)\)'
    text = re.sub(bare_domain_pattern, paren_url_repl, text)

    # 4. Bare URLs not in parentheses and not in href
    def raw_url_repl(m):
        url = m.group(0)
        full_url = url if url.startswith('http') else 'https://' + url
        label = "Link"
        if "youtube" in url: label = "YouTube"
        elif "huggingface" in url: label = "Docs"
        return f'<a href="{full_url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 text-primary hover:text-primary-container underline underline-offset-2 transition-colors font-medium">[{label}]<span class="material-symbols-outlined text-[11px] inline-block align-middle ml-0.5">open_in_new</span></a>'

    text = re.sub(r'(?<!href=")(?<!">)(?:https?://[^\s<>`"\)]+)', raw_url_repl, text)
    
    # 5. Bold: **text**
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong class="text-on-surface font-semibold">\1</strong>', text)
    
    # 6. Italic: *text*
    text = re.sub(r'(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)', r'<em>\1</em>', text)
    
    # 7. Inline code: `code`
    text = re.sub(r'`([^`]+)`', r'<code class="px-1 py-0.5 rounded bg-surface-container font-mono text-[11px] text-primary border border-white/5">\1</code>', text)
    
    return text

def parse_task_content(cell_text):
    if not cell_text:
        return {"ref": "", "title": "", "desc": ""}
    
    raw = cell_text.strip()
    
    # 1. Detect LeetCode / LC reference
    ref = ""
    lc_match = re.search(r'(?:LeetCode|LC)\s*#?([0-9,\s#&and]+)', raw, re.IGNORECASE)
    if lc_match:
        ref = f"LC #{lc_match.group(1).strip()}"

    title = ""
    desc = ""

    # Pattern A: **Bold Prefix** [:—–-] Rest of content
    m_bold = re.match(r'^\*\*([^*]+)\*\*\s*[:—–-]\s*(.*)$', raw)
    if m_bold:
        title = m_bold.group(1).strip()
        desc = m_bold.group(2).strip()
    # Pattern B: **Bold Prefix:** Rest of content (colon inside bold)
    elif re.match(r'^\*\*([^*]+):\*\*\s*(.*)$', raw):
        m = re.match(r'^\*\*([^*]+):\*\*\s*(.*)$', raw)
        title = m.group(1).strip()
        desc = m.group(2).strip()
    # Pattern C: Standard em-dash/en-dash separator (e.g. "Topic — Details")
    elif ' — ' in raw or ' – ' in raw:
        parts = re.split(r'\s*[—–]\s*', raw, maxsplit=1)
        title = re.sub(r'^\*\*([^*]+)\*\*$', r'\1', parts[0].strip())
        desc = parts[1].strip()
    # Pattern D: Short topic prefix before colon (e.g. "Java Program Lifecycle: ...")
    elif ': ' in raw and not any(k in raw.split(': ', 1)[0] for k in ['http', 'https', 'youtube.com', 'youtu.be', 'e.g', 'i.e']):
        prefix, rest = raw.split(': ', 1)
        if len(prefix) <= 40 and not any(ch in prefix for ch in [';', ',', '(', ')']):
            title = prefix.strip()
            desc = rest.strip()
        else:
            title = raw
            desc = ""
    # Pattern E: Standalone text (e.g. "Majority Element-I, Leaders in an Array")
    else:
        title = raw
        desc = ""

    # Strip any accidental redundant bold tags from title
    title = re.sub(r'^\*\*([^*]+)\*\*$', r'\1', title).strip()
    title = title.rstrip(' :—–-')

    return {
        "ref": ref,
        "title": format_cell_html(title),
        "desc": format_cell_html(desc) if desc else ""
    }

def categorize_track(col_name):
    name_lower = col_name.lower()
    if 'dsa' in name_lower or 'modern java' in name_lower:
        return 'dsa', 'DSA & Java'
    elif 'ai/ml' in name_lower or ('capstone' in name_lower and 'ai' in name_lower):
        return 'aiml', 'AI / ML'
    elif 'core cs' in name_lower or 'oops' in name_lower or 'dbms' in name_lower or 'os' in name_lower or 'cn' in name_lower or 'lld' in name_lower or 'hld' in name_lower or 'ddia' in name_lower:
        return 'corecs', 'Core CS'
    elif 'aptitude' in name_lower or 'backend' in name_lower or 'spring' in name_lower:
        if 'spring' in name_lower or 'backend' in name_lower:
            return 'backend', 'Java Backend'
        return 'aptitude', 'Aptitude'
    return 'other', col_name

def parse_roadmap():
    roadmap_pattern = 'Roadmap/*Phase*.md'
    if not glob.glob(roadmap_pattern):
        roadmap_pattern = '../Roadmap/*Phase*.md'
    if not glob.glob(roadmap_pattern):
        roadmap_pattern = os.path.join(os.path.dirname(__file__), '../../Roadmap/*Phase*.md')
    files = sorted(glob.glob(roadmap_pattern))
    roadmap = []
    
    day_order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    day_full_names = {
        'Mon': 'Monday',
        'Tue': 'Tuesday',
        'Wed': 'Wednesday',
        'Thu': 'Thursday',
        'Fri': 'Friday',
        'Sat': 'Saturday',
        'Sun': 'Sunday'
    }

    for f in files:
        with open(f, 'r', encoding='utf-8') as fp:
            content = fp.read()
            
        p_match = re.search(r'^#\s+Phase\s+(\d+)\s+[—-]\s+(.+)', content, re.MULTILINE)
        if p_match:
            phase_num = int(p_match.group(1))
            phase_title = f"Phase {phase_num}: " + p_match.group(2).strip()
        else:
            phase_num = len(roadmap) // 5 + 1
            phase_title = f"Phase {phase_num}"
            
        week_blocks = re.split(r'\n(?=## Week \d+)', content)
        for block in week_blocks[1:]:
            lines = [l.strip() for l in block.strip().split('\n')]
            header = lines[0]
            w_match = re.search(r'##\s+Week\s+(\d+)\s+[—-]\s+(.+)', header)
            if not w_match:
                continue
            w_num = int(w_match.group(1))
            w_title = w_match.group(2).strip()
            w_title_clean = re.sub(r'\*\*([^*]+)\*\*', r'\1', w_title)
            
            table_lines = [l for l in lines if l.startswith('|') and l.endswith('|')]
            if not table_lines:
                continue
                
            col_headers = [c.strip() for c in table_lines[0].split('|')[1:-1]]
            col_meta = []
            for col in col_headers[1:]:
                cat_id, cat_name = categorize_track(col)
                col_meta.append({
                    'original': col,
                    'cat_id': cat_id,
                    'cat_name': cat_name
                })
                
            days_data = []
            for r in table_lines[2:]:
                cells = [c.strip() for c in r.split('|')[1:-1]]
                if not cells or len(cells) < len(col_headers):
                    continue
                day_code = cells[0]
                if day_code not in day_order:
                    continue
                    
                day_tasks = []
                for idx, cell in enumerate(cells[1:]):
                    if idx >= len(col_meta):
                        break
                    cell_trimmed = cell.strip()
                    if not cell_trimmed or cell_trimmed == '-':
                        continue
                    
                    track_code = col_meta[idx]['cat_id']
                    task_id = f"w{w_num}_{day_code.lower()}_{track_code}"
                    
                    parsed = parse_task_content(cell_trimmed)
                    
                    if cell_trimmed.lower() in ['rest', 'catch up', 'rest / catch up', 'open — catch up']:
                        day_tasks.append({
                            'id': task_id,
                            'track_original': col_meta[idx]['original'],
                            'track_id': col_meta[idx]['cat_id'],
                            'track_name': col_meta[idx]['cat_name'],
                            'raw_text': cell_trimmed,
                            'ref': '',
                            'title': 'Rest / Catch up',
                            'desc': '',
                            'html': '<em>Rest / Catch up</em>',
                            'is_rest': True
                        })
                    else:
                        day_tasks.append({
                            'id': task_id,
                            'track_original': col_meta[idx]['original'],
                            'track_id': col_meta[idx]['cat_id'],
                            'track_name': col_meta[idx]['cat_name'],
                            'raw_text': cell_trimmed,
                            'ref': parsed['ref'],
                            'title': parsed['title'],
                            'desc': parsed['desc'],
                            'html': format_cell_html(cell_trimmed),
                            'is_rest': False
                        })
                        
                days_data.append({
                    'day_code': day_code,
                    'day_name': day_full_names[day_code],
                    'tasks': day_tasks
                })
                
            deliverables = []
            notes = []
            for l in lines:
                if l.startswith('|') or l.startswith('##') or l.startswith('---'):
                    continue
                if l.startswith('**Deliverable') or l.startswith('**Checkpoint'):
                    deliv_id = f"w{w_num}_deliv_{len(deliverables) + 1}"
                    deliverables.append({
                        'id': deliv_id,
                        'raw_text': l,
                        'html': format_cell_html(l)
                    })
                elif l.startswith('>') or l.startswith('Next:') or l.startswith('Run a 1-hour') or l.startswith('Phase'):
                    notes.append(format_cell_html(l))
                elif deliverables and l.startswith('- '):
                    deliv_id = f"w{w_num}_deliv_{len(deliverables) + 1}"
                    deliverables.append({
                        'id': deliv_id,
                        'raw_text': l[2:],
                        'html': format_cell_html(l[2:])
                    })
            
            if not deliverables:
                for l in lines:
                    if 'deliverable' in l.lower() and not l.startswith('|'):
                        deliv_id = f"w{w_num}_deliv_1"
                        deliverables.append({
                            'id': deliv_id,
                            'raw_text': l,
                            'html': format_cell_html(l)
                        })
                        
            roadmap.append({
                'week_num': w_num,
                'title': w_title_clean,
                'phase_num': phase_num,
                'phase_title': phase_title,
                'days': days_data,
                'deliverables': deliverables,
                'notes': notes
            })
            
    roadmap.sort(key=lambda x: x['week_num'])
    return roadmap

COMMON_TAILWIND_CONFIG = """
<script id="tailwind-config">
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            "surface-dim": "#121316",
            "surface": "#121316",
            "background": "#121316",
            "surface-container-lowest": "#0d0e11",
            "surface-container-low": "#1b1b1f",
            "surface-container": "#1f1f23",
            "surface-container-high": "#292a2d",
            "surface-container-highest": "#343538",
            "on-surface": "#e3e2e6",
            "on-surface-variant": "#c7c4d7",
            "outline-variant": "#464554",
            "outline": "#908fa0",
            "primary": "#c0c1ff",
            "primary-container": "#8083ff",
            "on-primary": "#1000a9",
            "tertiary": "#b9c8de",
            "secondary": "#c1c7cf",
            "error": "#ffb4ab"
          },
          borderRadius: {
            "DEFAULT": "0.25rem",
            "lg": "0.5rem",
            "xl": "0.75rem",
            "full": "9999px"
          },
          fontFamily: {
            "headline": ["Space Grotesk", "Plus Jakarta Sans", "sans-serif"],
            "body": ["Inter", "sans-serif"],
            "mono": ["JetBrains Mono", "monospace"]
          }
        }
      }
    };
</script>
"""

def generate_week_page(week, total_weeks, all_weeks):
    w_num = week['week_num']
    w_pad = f"{w_num:02d}"
    
    prev_w = f"week-{(w_num - 1):02d}.html" if w_num > 1 else None
    next_w = f"week-{(w_num + 1):02d}.html" if w_num < total_weeks else None
    
    # Phase week tabs
    phase_weeks = [ow for ow in all_weeks if ow['phase_num'] == week['phase_num']]
    if not phase_weeks:
        phase_weeks = all_weeks[max(0, w_num - 3):min(total_weeks, w_num + 2)]
    phase_tabs_html = []
    for pw in phase_weeks:
        pwn = pw['week_num']
        if pwn == w_num:
            phase_tabs_html.append(f'''<span class="px-3 py-1 rounded bg-primary/20 text-primary font-semibold border border-primary/40 shadow-sm flex items-center gap-1.5"><span class="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>W{pwn:02d} Active</span>''')
        else:
            phase_tabs_html.append(f'''<a href="week-{pwn:02d}.html" class="px-2.5 py-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">W{pwn:02d}</a>''')
    phase_tabs_joined = "\n".join(phase_tabs_html)

    # Calculate track counts
    total_tasks = sum(len(d['tasks']) for d in week['days'])
    dsa_count = sum(sum(1 for t in d['tasks'] if t['track_id'] == 'dsa') for d in week['days'])
    aiml_count = sum(sum(1 for t in d['tasks'] if t['track_id'] == 'aiml') for d in week['days'])
    corecs_count = sum(sum(1 for t in d['tasks'] if t['track_id'] == 'corecs') for d in week['days'])
    backend_count = sum(sum(1 for t in d['tasks'] if t['track_id'] in ['aptitude', 'backend']) for d in week['days'])

    # Weekly Deliverable text
    if week['deliverables']:
        deliv_text = '<div class="space-y-2">' + "".join([f'<div class="leading-relaxed">{d["html"]}</div>' for d in week['deliverables']]) + '</div>'
    else:
        deliv_text = f'<div class="leading-relaxed">Complete all scheduled DSA problem reps, AI/ML theory and implementations, and Core CS modules for Week {w_pad}.</div>'

    # Days HTML: Weekdays vs Weekend
    weekday_cards = []
    weekend_cards = []

    for day in week['days']:
        tasks_html = []
        is_weekend = day['day_code'] in ['Sat', 'Sun']
        for t in day['tasks']:
            task_id = t['id']
            track_class = t['track_id']
            track_name = t['track_name']
            ref = t.get('ref', '')
            title = t.get('title', '')
            desc = t.get('desc', '')
            rest_class = 'is-rest' if t['is_rest'] else ''
            
            if track_class == 'dsa':
                duration = '1.5h'
                track_tag = 'DSA'
            elif is_weekend and track_class == 'aiml':
                duration = '4.0h'
                track_tag = 'AI/ML'
            elif track_class == 'aiml':
                duration = '2.5h'
                track_tag = 'AI/ML'
            elif track_class == 'corecs':
                duration = '2.5h'
                track_tag = 'CORE'
            elif track_class == 'backend':
                duration = '2.5h'
                track_tag = 'JAVA'
            elif track_class == 'aptitude':
                duration = '2.5h'
                track_tag = 'APT'
            else:
                duration = '2.5h'
                track_tag = 'CORE'

            clean_title = re.sub(r'<[^>]*>', '', title).replace('"', '&quot;').strip()
            ref_badge = f'<span class="task-ref font-mono text-[10px] text-on-surface-variant/60 ml-1.5 shrink-0">{ref}</span>' if ref else ''
            desc_html = f'<div class="task-desc text-[12px] text-on-surface-variant leading-relaxed break-words font-normal pl-0.5 pt-0.5">{desc}</div>' if desc else ''

            tasks_html.append(f'''
            <div class="task-card group flex items-start justify-between px-4 sm:px-5 py-3 hover:bg-surface-container-highest/30 transition-colors duration-150 cursor-pointer {rest_class}" data-completed="false" data-hours="{duration.replace('h','')}" data-task-id="{task_id}" data-track="{track_class}">
              <div class="flex items-start gap-3.5 min-w-0 flex-1">
                <button role="checkbox" aria-checked="false" aria-label="Toggle task: {clean_title}" class="task-toggle-btn task-checkbox checkbox-spring shrink-0 mt-0.5 w-4 h-4 rounded-[3px] bg-surface-container-lowest border border-outline-variant/50 group-hover:border-primary flex items-center justify-center shadow-sm cursor-pointer" data-task-id="{task_id}" type="button">
                  <span class="material-symbols-outlined text-[13px] text-on-primary font-bold opacity-0 transition-opacity">check</span>
                </button>
                <div class="flex flex-col gap-1 min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2 min-w-0">
                    <span class="task-tag shrink-0 px-2 py-0.5 rounded bg-surface-container border border-outline-variant/20 font-label-caps text-[10px] text-on-surface-variant font-semibold uppercase">{track_tag}</span>
                    <span class="task-title font-body-md text-xs sm:text-[13px] text-on-surface font-semibold leading-snug break-words transition-all duration-150" title="{clean_title}">{title}</span>
                    {ref_badge}
                  </div>
                  {desc_html}
                </div>
              </div>
              <div class="flex items-center gap-2.5 shrink-0 pl-3 pt-0.5">
                <span class="text-xs text-on-surface-variant/60 font-mono-metric-md">{duration}</span>
              </div>
            </div>''')
            
        day_tasks_joined = "\n".join(tasks_html)
        
        if is_weekend:
            deferred_box = f'<div class="weekend-deferred-container px-5 pt-3" data-day="{day["day_code"]}"></div>'
            card_html = f'''
            <div class="day-card rounded-xl cockpit-glass overflow-hidden shadow-xl border border-white/5 flex flex-col" data-day="{day['day_code']}">
              <div class="px-5 py-3.5 border-b border-outline-variant/15 flex items-center justify-between gap-3 bg-surface-container-lowest/50">
                <div class="flex items-center gap-2.5">
                  <h3 class="font-headline text-sm font-semibold text-on-surface">{day['day_name']}</h3>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="day-badge day-progress font-mono text-xs text-on-surface-variant">0 / {len(day['tasks'])} done</span>
                </div>
              </div>
              {deferred_box}
              <div class="divide-y divide-outline-variant/10 text-body">
                {day_tasks_joined}
              </div>
            </div>'''
            weekend_cards.append(card_html)
        else:
            card_html = f'''
            <div class="day-card rounded-xl cockpit-glass overflow-hidden shadow-xl border border-white/5 flex flex-col" data-day="{day['day_code']}">
              <div class="px-5 py-3.5 border-b border-outline-variant/15 flex items-center justify-between gap-3 bg-surface-container-lowest/50">
                <div class="flex items-center gap-2.5">
                  <h3 class="font-headline text-sm font-semibold text-on-surface">{day['day_name']}</h3>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="day-badge day-progress font-mono text-xs text-on-surface-variant">0 / {len(day['tasks'])} done</span>
                </div>
              </div>
              <div class="divide-y divide-outline-variant/10 text-body">
                {day_tasks_joined}
              </div>
            </div>'''
            weekday_cards.append(card_html)

    weekday_cards_html = "\n".join(weekday_cards)
    weekend_cards_html = "\n".join(weekend_cards)

    prev_btn = f'''<a href="{prev_w}" class="h-8 w-8 rounded-lg cockpit-glass border border-outline-variant/20 hover:border-primary/40 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors shrink-0" title="Previous Week (W{(w_num-1):02d})"><span class="material-symbols-outlined text-[18px]">chevron_left</span></a>''' if prev_w else '<span class="h-8 w-8 rounded-lg cockpit-glass border border-outline-variant/10 opacity-30 flex items-center justify-center text-on-surface-variant shrink-0"><span class="material-symbols-outlined text-[18px]">chevron_left</span></span>'
    next_btn = f'''<a href="{next_w}" class="h-8 w-8 rounded-lg cockpit-glass border border-outline-variant/20 hover:border-primary/40 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors shrink-0" title="Next Week (W{(w_num+1):02d})"><span class="material-symbols-outlined text-[18px]">chevron_right</span></a>''' if next_w else '<span class="h-8 w-8 rounded-lg cockpit-glass border border-outline-variant/10 opacity-30 flex items-center justify-center text-on-surface-variant shrink-0"><span class="material-symbols-outlined text-[18px]">chevron_right</span></span>'

    clean_week_title = re.sub(r'<[^>]*>', '', week['title']).replace('"', '&quot;').strip()
    html_content = f'''<!DOCTYPE html>
<html class="dark" data-theme="dark" lang="en">
<head>
  <meta charset="utf-8">
  <meta content="width=device-width, initial-scale=1.0" name="viewport">
  <title>Progress Tracker &bull; Week {w_pad}</title>
  <meta name="google-site-verification" content="uKnD8wt6kniI25IpAMVkaCIqsAQ9eGbGhSE2MGY5CPc" />
  <link rel="icon" type="image/svg+xml" href="../favicon.svg">
  <meta name="description" content="Phase {week['phase_num']} Week {w_pad}: {clean_week_title}. Track daily tasks, deliverables, and technical journal.">
  <meta property="og:title" content="Progress Tracker &bull; Week {w_pad}">
  <meta property="og:description" content="Phase {week['phase_num']} Week {w_pad}: {clean_week_title}. Track daily tasks, deliverables, and technical notes.">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Progress Tracker">
  <meta name="twitter:card" content="summary">
  <meta name="theme-color" content="#121316">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Rozha+One&family=Yatra+One&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..24,400,0..1,0" rel="stylesheet">
  <link rel="stylesheet" href="../css/tailwind.min.css?v={BUILD_VERSION}">
  <link rel="stylesheet" href="../css/style.css?v={BUILD_VERSION}">
</head>
<body class="bg-background font-body text-on-surface antialiased selection:bg-primary selection:text-on-primary min-h-screen relative overflow-x-hidden transition-colors duration-200">

  <!-- Subtle Ambient Glow Overlay (Matching index.html) -->
  <div class="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[850px] h-[340px] bg-gradient-to-b from-primary/10 via-primary/3 to-transparent blur-3xl -z-10 dark:opacity-70 opacity-30"></div>
  <div class="pointer-events-none fixed top-24 right-0 w-[420px] h-[350px] bg-tertiary/5 blur-3xl -z-10"></div>

  <!-- Semi-Transparent Glassmorphism Top Bar (Borderless, highly transparent) -->
  <header class="sticky top-0 z-50 w-full backdrop-blur-md bg-background/25 select-none py-3 transition-all border-none">
    <div class="max-w-6xl mx-auto px-6 flex items-center justify-between gap-4">
      <a href="../index.html" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg cockpit-glass border border-outline-variant/20 hover:border-primary/40 text-on-surface-variant hover:text-on-surface transition-all duration-150 group shrink-0">
        <span class="material-symbols-outlined text-[20px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        <span class="font-calligraphy leading-none text-on-surface" style="font-size: 1.7rem;">Progress Tracker</span>
      </a>

      <div class="flex flex-col items-center text-center min-w-0 flex-1 px-3">
        <span class="text-[11px] font-mono text-on-surface-variant uppercase tracking-wider">Phase {week['phase_num']} &bull; Week {w_pad}</span>
        <h1 class="font-headline text-sm sm:text-base font-bold text-on-surface tracking-tight truncate max-w-full">{week['title']}</h1>
      </div>

      <div id="week-header-actions" class="flex items-center gap-1.5 shrink-0 transition-opacity">
        {prev_btn}
        {next_btn}
      </div>
    </div>
  </header>

  <!-- Main Executive Console Content -->
  <main class="w-full pt-6 pb-16 min-h-screen">
    <div class="max-w-6xl mx-auto px-6">
      <div class="flex flex-col w-full gap-7">

        <!-- Weekly Deliverable Card -->
        <section class="p-4 sm:p-5 rounded-xl cockpit-glass hover:border-primary/40 transition-all duration-200">
          <div class="flex items-center justify-between pb-3 mb-3 border-b border-outline-variant/15">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] text-primary">verified_user</span>
              <h2 class="text-xs sm:text-sm font-semibold text-on-surface tracking-tight">Weekly Production Deliverable</h2>
            </div>
            <span class="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Target Output</span>
          </div>
          <div class="text-xs sm:text-sm font-medium text-on-surface leading-relaxed deliverable-text">{deliv_text}</div>
        </section>

        <!-- Phase Navigation Tabs -->
        <section class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-mono">
          <span class="text-on-surface-variant font-medium pr-1 select-none">Weeks:</span>
          {phase_tabs_joined}
        </section>

        <!-- Days Grid (2 columns on desktop) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {weekday_cards_html}

          <!-- Weekend Section Header / Divider -->
          <div class="md:col-span-2 flex items-center gap-3 py-1">
            <div class="h-px flex-1 bg-outline-variant/15"></div>
            <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-mono text-primary">
              <span>⚡</span>
              <span class="font-semibold">Weekend High-Load Execution</span>
              <span class="text-primary/70">&bull; 8.0h Daily Deep Focus Lab</span>
            </div>
            <div class="h-px flex-1 bg-outline-variant/15"></div>
          </div>

          {weekend_cards_html}
        </div>

        <!-- Reflection & Technical Notes Journal -->
        <section class="rounded-xl cockpit-glass overflow-hidden shadow-xl border border-white/5 p-5 sm:p-6 flex flex-col gap-4" id="journal">
          <div class="flex items-center gap-2.5 pb-3 border-b border-outline-variant/15">
            <span class="material-symbols-outlined text-[18px] text-primary">edit_note</span>
            <h3 class="text-sm font-semibold text-on-surface tracking-tight">Week {w_pad} Technical Notes &amp; Journal</h3>
          </div>
          <div class="relative rounded-lg bg-surface-container-lowest/60 border border-outline-variant/20 focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20 transition-all p-3.5">
            <textarea class="w-full bg-transparent font-mono text-xs text-on-surface leading-relaxed placeholder:text-outline/50 border-0 outline-none focus:outline-none focus:ring-0 focus:border-transparent resize-none overflow-hidden block" style="outline: none !important; box-shadow: none !important; border: none !important;" id="week-notes" placeholder="Type Markdown notes, LeetCode edge-cases, Kaggle validation scores..." rows="5"></textarea>
          </div>
          <div class="flex items-center gap-1.5 pt-1">
            <span class="px-2 py-0.5 rounded bg-surface-container border border-outline-variant/20 font-mono text-[10px] text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">#LeetCode</span>
            <span class="px-2 py-0.5 rounded bg-surface-container border border-outline-variant/20 font-mono text-[10px] text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">#Java</span>
            <span class="px-2 py-0.5 rounded bg-surface-container border border-outline-variant/20 font-mono text-[10px] text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">#DSA</span>
            <span class="px-2 py-0.5 rounded bg-surface-container border border-outline-variant/20 font-mono text-[10px] text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">#Week{w_pad}</span>
          </div>
        </section>

      </div>
    </div>
  </main>

  <script src="../js/dashboard-summary.js?v={BUILD_VERSION}"></script>
  <script src="../js/app.js?v={BUILD_VERSION}"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {{
      initWeekPage({w_num});
    }});
  </script>
</body>
</html>'''

    return html_content

def generate_dashboard(roadmap):
    phases_dict = {}
    for w in roadmap:
        p_num = w['phase_num']
        if p_num not in phases_dict:
            phases_dict[p_num] = {
                'title': w['phase_title'],
                'weeks': []
            }
        phases_dict[p_num]['weeks'].append(w)

    phases_html = []
    for p_num in sorted(phases_dict.keys()):
        p_info = phases_dict[p_num]
        weeks = p_info['weeks']
        w_start = weeks[0]['week_num']
        w_end = weeks[-1]['week_num']
        
        week_tiles = []
        for w in weeks:
            num = w['week_num']
            padded = f"{num:02d}"
            title = w['title']
            task_count = sum(len(d['tasks']) for d in w['days'])
            
            week_tiles.append(f'''
            <a href="weeks/week-{padded}.html" class="p-3 rounded-lg cockpit-subglass flex flex-col justify-between hover:border-primary/50 transition-colors group cursor-pointer" id="dash-week-{num}">
              <div class="flex items-center justify-between mb-1.5">
                <span class="font-mono text-[11px] text-on-surface font-semibold">WEEK {padded}</span>
                <span class="material-symbols-outlined text-[15px] text-outline-variant group-hover:text-primary transition-colors">arrow_forward</span>
              </div>
              <span class="text-xs text-on-surface font-medium truncate mb-2">{title}</span>
              <div class="flex items-center justify-between">
                <span class="font-mono text-[10px] text-on-surface-variant week-task-count" id="dash-week-{num}-tasks">{task_count} Tasks</span>
                <span class="font-mono text-[10px] text-primary font-bold week-pct" id="dash-week-{num}-pct">0%</span>
              </div>
            </a>''')

        weeks_grid_html = "\n".join(week_tiles)

        is_expanded = (p_num == 1)
        expanded_card_style = "border border-primary/40 bg-surface-container-low/95" if is_expanded else "cockpit-glass"
        content_class = "max-h-[800px] opacity-100 border-outline-variant/20" if is_expanded else "max-h-0 opacity-0 border-transparent"
        chevron_class = "rotate-180 text-primary" if is_expanded else "text-on-surface-variant"

        phases_html.append(f'''
        <div class="rounded-xl {expanded_card_style} overflow-hidden transition-all duration-200 phase-accordion-card shadow-sm" data-phase-card="{p_num}">
          <button type="button" class="phase-toggle w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-surface-container-high/40 transition-colors cursor-pointer" data-phase="{p_num}">
            <div class="flex items-center gap-3.5">
              <span class="w-5 h-5 rounded-full bg-surface-container border border-outline-variant/40 flex items-center justify-center text-primary font-mono text-[10px] font-bold shadow-sm">
                {p_num}
              </span>
              <div>
                <span class="font-mono text-[10px] text-on-surface-variant font-semibold block uppercase">Phase {p_num:02d} &bull; Weeks {w_start:02d}–{w_end:02d}</span>
                <h4 class="font-headline text-sm sm:text-base font-semibold text-on-surface">{p_info['title']}</h4>
              </div>
            </div>
            <div class="flex items-center gap-4">
              <span class="font-mono text-xs font-semibold text-primary phase-status-pill" id="phase-{p_num}-status">0% ({len(weeks)} Weeks)</span>
              <span class="chevron-icon material-symbols-outlined text-[20px] transition-transform duration-200 {chevron_class}">expand_more</span>
            </div>
          </button>
          
          <div class="phase-content accordion-content {content_class} px-5 border-t text-xs text-on-surface-variant bg-surface-container-lowest/50">
            <div class="py-4 flex flex-col gap-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
                {weeks_grid_html}
              </div>
            </div>
          </div>
        </div>''')

    all_phases_html = "\n".join(phases_html)

    html_content = f'''<!DOCTYPE html>
<html class="dark" data-theme="dark" lang="en">
<head>
  <meta charset="utf-8">
  <meta content="width=device-width, initial-scale=1.0" name="viewport">
  <title>Progress Tracker</title>
  <meta name="google-site-verification" content="uKnD8wt6kniI25IpAMVkaCIqsAQ9eGbGhSE2MGY5CPc" />
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  <meta name="description" content="Progress Tracker: 50-Week Placement Engineering Roadmap. Track daily progress, streaks, and focus queues.">
  <meta property="og:title" content="Progress Tracker">
  <meta property="og:description" content="Progress Tracker: 50-Week Placement Engineering Roadmap. Track daily progress, streaks, and focus queues.">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Progress Tracker">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Progress Tracker">
  <meta name="twitter:description" content="Progress Tracker: 50-Week Placement Engineering Roadmap.">
  <meta name="theme-color" content="#121316">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,400;1,500;1,600&family=Rozha+One&family=Yatra+One&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..24,400,0..1,0" rel="stylesheet">
  <link rel="stylesheet" href="css/tailwind.min.css?v={BUILD_VERSION}">
  <link rel="stylesheet" href="css/style.css?v={BUILD_VERSION}">
</head>
<body class="bg-background font-body text-on-surface antialiased selection:bg-primary selection:text-on-primary min-h-screen relative overflow-x-hidden transition-colors duration-200">

  <!-- Subtle Ambient Glow Overlay (Code 1 Exact) -->
  <div class="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[850px] h-[340px] bg-gradient-to-b from-primary/10 via-primary/3 to-transparent blur-3xl -z-10 dark:opacity-70 opacity-30"></div>

  <!-- Main Executive Console Content -->
  <main class="w-full pt-8 sm:pt-10 pb-16 min-h-screen">
    <div class="max-w-6xl mx-auto px-6">
      <div class="flex flex-col w-full gap-7">

        <!-- Brand Masthead -->
        <header class="flex items-center justify-center pt-2 pb-2 select-none">
          <h1 class="font-calligraphy text-on-surface font-normal leading-none tracking-wide text-center" style="font-size: 3.5rem;">Progress Tracker</h1>
        </header>

        <!-- 1. Executive Vitals Bar (Hero Metrics) -->
        <section class="grid grid-cols-1 md:grid-cols-4 gap-3.5">
          <div class="p-4 rounded-xl cockpit-glass hover:border-primary/40 transition-all duration-200 md:col-span-1">
            <div class="text-xs text-on-surface-variant font-medium mb-1">Target Countdown</div>
            <div class="font-mono text-2xl font-bold tracking-tight text-on-surface">
              <span id="vitals-countdown-val">487d</span> <span class="text-xs text-on-surface-variant font-normal">remaining</span>
            </div>
            <div class="mt-2 text-[11px] text-on-surface-variant">Target: July 2027</div>
          </div>

          <div class="p-4 rounded-xl cockpit-glass hover:border-primary/40 transition-all duration-200 md:col-span-3 flex flex-col justify-between">
            <div>
              <div class="text-xs text-on-surface-variant font-medium mb-1">Overall Progress</div>
              <div class="font-mono text-2xl font-bold text-on-surface tracking-tight" id="stat-pct-done">0.0%</div>
            </div>
            <div class="w-full h-1.5 rounded-full bg-surface-container overflow-hidden mt-3">
              <div class="h-full bg-primary rounded-full transition-all duration-500" id="global-progress-bar" style="width: 0%"></div>
            </div>
          </div>
        </section>

        <!-- 2. Today's Execution Queue (Code 1 Exact Architecture) -->
        <section class="rounded-xl cockpit-glass overflow-hidden shadow-xl" id="today">
          <div class="px-5 py-4 border-b border-outline-variant/15 flex items-center justify-between gap-3 bg-surface-container-lowest/50">
            <div class="flex items-center gap-3">
              <h2 class="font-headline text-base font-semibold text-on-surface">Today</h2>
              <span class="text-outline-variant/40">&bull;</span>
              <span class="text-xs text-on-surface-variant" id="today-day-title">Loading schedule...</span>
            </div>
            <div class="flex items-center gap-2 text-on-surface-variant font-mono text-xs">
              <span class="text-on-surface font-semibold" id="queue-completed-counter">0</span> of <span id="queue-total-counter">0</span> completed
            </div>
          </div>

          <!-- Micro Progress Bar -->
          <div class="w-full bg-surface-container h-1 overflow-hidden">
            <div class="h-full bg-primary transition-all duration-300 ease-out" id="queue-progress-bar" style="width: 0%"></div>
          </div>

          <!-- Task List (Code 1 Exact 1-line Rows) -->
          <div class="divide-y divide-outline-variant/10 text-body" id="today-tasks-list">
            <!-- Populated dynamically by app.js -->
          </div>
        </section>

        <!-- 2. Spaced Repetition // Recall Queue -->
        <section class="rounded-xl cockpit-glass overflow-hidden shadow-xl" id="memory-deck">
          <div class="px-5 py-4 border-b border-outline-variant/15 flex items-center justify-between gap-3 bg-surface-container-lowest/50">
            <div class="flex items-center gap-3">
              <h2 class="font-headline text-base font-semibold text-on-surface">Recall</h2>
              <span class="text-outline-variant/40">&bull;</span>
              <span class="text-xs text-on-surface-variant" id="deck-subtitle">Spaced repetition</span>
            </div>
            <div class="flex items-center gap-2 text-on-surface-variant font-mono text-xs">
              <span class="text-on-surface font-semibold" id="deck-due-counter">0</span> due
              <span class="text-outline-variant/40">&bull;</span>
              <span class="text-on-surface font-semibold" id="deck-mastered-counter">0</span> mastered
            </div>
          </div>

          <!-- Memory Deck List -->
          <div class="divide-y divide-outline-variant/10 text-body" id="memory-deck-list">
            <!-- Populated dynamically by app.js -->
          </div>
        </section>

        <!-- Backlog Execution Queue (Hidden when empty) -->
        <section class="rounded-xl cockpit-glass overflow-hidden shadow-xl" id="backlog-section" style="display: none;">
          <div class="px-5 py-4 border-b border-outline-variant/15 flex items-center justify-between gap-3 bg-surface-container-lowest/50">
            <div class="flex items-center gap-3">
              <h2 class="font-headline text-base font-semibold text-on-surface flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px] text-on-surface-variant">history</span>
                <span>Backlog</span>
              </h2>
            </div>
            <div class="flex items-center gap-2 text-on-surface-variant font-mono text-xs">
              <span class="text-on-surface font-semibold" id="backlog-completed-counter">0</span> of <span id="backlog-total-counter">0</span> completed
            </div>
          </div>

          <!-- Micro Progress Bar -->
          <div class="w-full bg-surface-container h-1 overflow-hidden">
            <div class="h-full bg-primary transition-all duration-300 ease-out" id="backlog-progress-bar" style="width: 0%"></div>
          </div>

          <!-- Backlog Task List -->
          <div class="divide-y divide-outline-variant/10 text-body" id="backlog-tasks-list">
            <!-- Populated dynamically by app.js -->
          </div>
        </section>


        <!-- 3. LeetCode-Style Activity Heatmap -->
        <section class="p-5 sm:p-6 rounded-2xl bg-[#1c1c1f] border border-white/[0.06] shadow-xl flex flex-col gap-4" id="telemetry">
          <!-- Top Stats Header (Exact LeetCode Style) -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-white text-lg sm:text-xl tracking-tight" id="heatmap-total-completed">0</span>
              <span class="text-xs sm:text-sm text-zinc-400 font-normal">tasks completion in past one year</span>
            </div>
            <div class="flex items-center gap-4 text-xs text-zinc-400 font-normal">
              <div>Total active days: <span class="text-white font-medium ml-1" id="heatmap-active-days">0</span></div>
              <div>Max streak: <span class="text-white font-medium ml-1" id="heatmap-max-streak">0</span></div>
            </div>
          </div>

          <!-- Heatmap Container (Grouped by Month with Month Labels at Bottom) -->
          <div class="overflow-x-auto pb-1 no-scrollbar">
            <div class="flex items-start justify-between gap-1.5 sm:gap-2 select-none w-full min-w-[850px]" id="heatmap-months-container">
              <!-- Populated dynamically by app.js -->
            </div>
          </div>
        </section>

        <!-- 5. 10-Phase Placement Roadmap (Quiet Accordion - Code 1 Exact) -->
        <section class="flex flex-col gap-3" id="roadmap">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h3 class="font-headline text-base font-semibold text-on-surface">Roadmap</h3>
            </div>
            <span class="text-xs text-on-surface-variant">Phase 1 of 10</span>
          </div>

          <div class="flex flex-col gap-2.5" id="roadmap-accordion">
            {all_phases_html}
          </div>
        </section>

        <!-- 6. Wisdom & Quote Component (Minimal) -->
        <section class="rounded-xl cockpit-glass border border-white/5 overflow-hidden" id="quote-matrix-card">
          <div class="p-7 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8">
            <!-- Left Side: Rotating Quote & Author -->
            <div class="flex-1 flex flex-col justify-center relative min-h-[220px] md:h-[300px] w-full pr-4">
              <div id="quote-text-container" class="transition-opacity duration-300 ease-out opacity-100 flex flex-col justify-center">
                <p id="quote-text" class="quote-text-sanskrit text-[26px] sm:text-[32px] md:text-[36px] text-on-surface font-normal leading-[1.35] tracking-wide">
                  “कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।”
                </p>
                
                <div class="mt-4 flex items-center text-xs sm:text-sm text-primary/80 font-medium">
                  <span id="quote-author" class="quote-author-style">
                    — Shri Krishna
                  </span>
                </div>
              </div>

              <!-- Bottom Indicator Pills -->
              <div class="absolute bottom-1 left-0 flex items-center gap-1.5" id="quote-dots-indicator">
                <!-- Generated dynamically (6 dots) -->
              </div>
            </div>

            <!-- Right Side: Clean Dot-Matrix Canvas -->
            <div class="flex-shrink-0 flex items-center justify-end h-[300px]">
              <canvas id="quote-dot-canvas" class="h-[300px] object-contain rounded-lg transition-opacity duration-300 ease-in-out opacity-100 block"></canvas>
            </div>
          </div>
        </section>

      </div>
    </div>
  </main>



  <script src="js/dashboard-summary.js?v={BUILD_VERSION}"></script>
  <script src="js/quotes-data.js?v={BUILD_VERSION}"></script>
  <script src="js/quote-matrix.js?v={BUILD_VERSION}"></script>
  <script src="js/app.js?v={BUILD_VERSION}"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {{
      if (window.DASHBOARD_DATA) {{
        initDashboard(window.DASHBOARD_DATA);
      }} else if (window.ROADMAP_DATA) {{
        initDashboard(window.ROADMAP_DATA);
      }}
    }});
  </script>
</body>
</html>'''

    return html_content

def main():
    tracker_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    os.chdir(tracker_root)
    print("Parsing roadmap files...")
    roadmap = parse_roadmap()
    print(f"Parsed {len(roadmap)} weeks.")

    # 1. Compact Dashboard Summary (Shrinks initial homepage bundle by >70%)
    dashboard_data = []
    for w in roadmap:
        days_clean = []
        for d in w['days']:
            tasks_clean = []
            for t in d['tasks']:
                tasks_clean.append({
                    'id': t['id'],
                    'track_id': t['track_id'],
                    'title': t.get('title', ''),
                    'desc': t.get('desc', ''),
                    'is_rest': t.get('is_rest', False)
                })
            days_clean.append({
                'day_code': d['day_code'],
                'day_name': d['day_name'],
                'tasks': tasks_clean
            })
        dashboard_data.append({
            'week_num': w['week_num'],
            'phase_num': w['phase_num'],
            'title': w['title'],
            'deliverables': w.get('deliverables', []),
            'days': days_clean
        })

    with open('js/dashboard-summary.js', 'w', encoding='utf-8') as f:
        f.write("window.DASHBOARD_DATA = ")
        json.dump(dashboard_data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(";\n")
    print("Written js/dashboard-summary.js (compact)")

    # 2. Legacy full roadmap dataset
    with open('js/roadmap-data.js', 'w', encoding='utf-8') as f:
        f.write("window.ROADMAP_DATA = ")
        json.dump(roadmap, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    print("Written js/roadmap-data.js")

    dash_html = generate_dashboard(roadmap)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(dash_html)
    print("Written index.html")

    for w in roadmap:
        pad = f"{w['week_num']:02d}"
        filepath = f"weeks/week-{pad}.html"
        week_html = generate_week_page(w, len(roadmap), roadmap)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(week_html)
    print(f"Generated {len(roadmap)} weekly HTML pages in weeks/")

    # 3. Compile purged production Tailwind CSS bundle
    print("Compiling production Tailwind CSS bundle...")
    try:
        import subprocess
        res = subprocess.run(
            ["npx", "-y", "tailwindcss@3", "-i", "./css/tailwind-input.css", "-o", "./css/tailwind.min.css", "--minify"],
            capture_output=True,
            text=True,
            shell=True
        )
        if res.returncode == 0:
            print("Successfully compiled css/tailwind.min.css")
        else:
            print("Tailwind compile notice:", res.stderr or res.stdout)
    except Exception as e:
        print("Tailwind compile warning:", e)

if __name__ == '__main__':
    main()
