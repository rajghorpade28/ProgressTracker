# Progress Tracker

> **50-Week Placement Engineering Roadmap & Minimalist Execution Console**  
> Live site: **[missionplaced.rajghorpade.tech](https://missionplaced.rajghorpade.tech)**

[![Status](https://img.shields.io/badge/Status-Ready%20to%20Deploy-8083ff?style=flat-square)](#-multi-user-setup)
[![Stack](https://img.shields.io/badge/Architecture-Local--First%20%2B%20Supabase-c0c1ff?style=flat-square)](#-architecture--tech-stack)
[![Theme](https://img.shields.io/badge/Design-Obsidian%20Dark-121316?style=flat-square)](#-design-system)
[![Search](https://img.shields.io/badge/Search-Sub--1ms%20Global%20Find-8083ff?style=flat-square)](#-minimal-global-roadmap-search)
[![Recall](https://img.shields.io/badge/Recall-SM--2%20Spaced%20Repetition-10b981?style=flat-square)](#-spaced-repetition-recall-engine)
[![Wisdom](https://img.shields.io/badge/Wisdom-Animated%20Dot--Matrix%20Engine-c0c1ff?style=flat-square)](#-wisdom--animated-dot-matrix-portrait-engine)
[![License](https://img.shields.io/badge/License-MIT-gray?style=flat-square)](LICENSE)

---

## ⚡ Overview

**Progress Tracker** is an ultra-minimalist, distraction-free execution tracker engineered for 50 weeks of rigorous placement preparation across Data Structures & Algorithms, System Design (HLD & LLD), Machine Learning / AI, and Core Computer Science.

Built with a **local-first, zero-runtime-hydration** philosophy, Progress Tracker delivers instant rendering from browser cache, seamless optimistic UI updates, multi-tab broadcast synchronization, and background PostgreSQL synchronization via Supabase. Everyone can sign in with Google or create an email-and-password account; the one editor email configured in Supabase can update shared progress, while every other signed-in account remains read-only.

---

## 🎯 Core Capabilities & Systems

### 🔍 Minimal Global Roadmap Search
- **Browser-Find Native Widget**: Floating dark pill widget (`#1c1c1f`, `rounded-xl`) engineered with zero visual clutter. Hidden until shortcut keys are pressed.
- **Sub-Millisecond Indexing**: Scans all 800+ tasks, deliverables, and titles across 50 weeks in under 1ms entirely in-memory.
- **Horizontal Arrow Iteration**: Navigate search results forward (`>`) and backward (`<`) across weeks using on-screen chevrons or keyboard arrows (`ArrowRight` / `ArrowLeft`, `Enter` / `Shift+Enter`).
- **Cross-Week Auto-Routing**: When advancing to a match in another week, Progress Tracker automatically routes to that page (`week-XX.html?q=...&m=...#taskId`), highlights the card with a pulsing violet outline (`.task-search-highlight`), and smoothly centers it in the viewport.
- **Clickable Week Badges**: Interactive pill tags (e.g. `W08 Sun`) display match location and jump immediately to that week when clicked.
- **Instant Hotkeys**: Trigger anytime via `Ctrl+F`, `Cmd+F`, `Ctrl+K`, or `/`. Press `Escape` to close.

### 🧠 Spaced Repetition Recall Engine
- **SM-2 & Leitner Hybrid Algorithm**: Purpose-built for engineering algorithms, system design patterns, and CS fundamentals.
- **Dynamic Consolidation Stages**:
  - **Stage 1**: Consolidation (+1 day)
  - **Stage 2**: Early Retrieval (+3 days)
  - **Stage 3**: Deep Encoding (+7 days)
  - **Stage 4**: Long-Term Retention (+16 days)
  - **Stage 5**: Permanent Mastery (+35 days)
- **Minimal 1-Line Dashboard Widget**: Displays due cards, mastery count, and next unlock countdown without cluttering the daily focus view.
- **5:30 AM IST Daily Unlock**: Syncs review schedules strictly with the daily rollover boundary.
- **Interactive Review Modal**: Rate difficulty with `Again` (reset to interval 1), `Good` (advance stage), or `Easy` (bonus leap).

### 📊 Calendar-Accurate 365-Day Activity Heatmap
- **Exact Trailing 1-Year Matrix**: Full 52-week contribution grid ending on today's exact date and beginning exactly 365 days prior.
- **Sunday-Saturday Grid Alignment**: Accurately computes day-of-week offsets so every day lands on its precise calendar weekday.
- **Dynamic Month Labels**: Month headers are positioned precisely based on the Sunday date of each week column.
- **4-Tier Intensity Scaling**: LeetCode/GitHub-style visual tiers reflecting daily task completions.
- **Interactive Tooltips**: Hover over any cell to see exact completion counts, date, and activity status.

### 🔄 Local-First + Supabase Cloud Synchronization
- **Zero-Latency Optimistic State**: Checkbox toggles and notes save immediately to `localStorage` and broadcast to all open browser tabs via `StorageEvent` and `BroadcastChannel`.
- **Bidirectional Cloud Sync**: Automatic reconciliation with Supabase PostgreSQL. Background polling ensures changes on mobile or other devices reflect everywhere in real time.
- **Multi-User Sign-In**: Google OAuth and email-and-password accounts are handled by Supabase Auth, so each participant has their own session.
- **One Server-Enforced Editor**: The database checks the caller's signed JWT email before every write. Changing client-side JavaScript cannot grant a viewer edit access.
- **Read-Only Sharing**: Everyone else can inspect the shared roadmap, notes, and search results without being able to modify progress.

### ⏱️ Execution Rules & Daily Focus Mechanics
- **5:30 AM IST (00:00:00 UTC) Rollover**: Late-night coding sessions count toward the active study day without premature date transitions.
- **Weekend High-Load Execution**: Weekends feature dedicated 8.0-hour deep-focus blocks for comprehensive labs, implementations from scratch, and project building.
- **Anti-Guilt Weekend Spillover**: Weekday tasks that couldn't be completed can be deferred to Saturday/Sunday with a single click.
- **Weekly Production Deliverables**: Every week specifies a tangible production output (e.g. custom ML algorithm from scratch, working Raft consensus node, deployed microservice).

### 🎨 Wisdom & Animated Dot-Matrix Portrait Engine
- **High-Precision Atkinson Dithering**: Custom offline Python pipeline transforms high-contrast reference portraits into fine 2.0px dithered halftone dot matrices rendered in theme primary color (`#c0c1ff`).
- **Strictly Equal Padding Geometry**: Top margin, bottom margin, and right margin from the portrait to the card borders are strictly identical (`25.4px` / `p-7`).
- **Dynamic Width with Left Expansion**: Uniform 300px portrait height across all personal figures. When switching from non-square silhouettes (Shri Krishna: $275 \times 300\text{px}$) to 1:1 square portraits (Swami Vivekananda, Dr. Kalam, Andrew Ng, Linus Torvalds, Jensen Huang: $300 \times 300\text{px}$), the portrait expands towards the left while the right border margin stays fixed.
- **Refined Editorial Typography**:
  - Devanagari Sanskrit verses rendered in majestic **Rozha One** calligraphic display font with typographic double quotes (`“कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।”`).
  - English quotes typeset in elegant **Playfair Display** italic serif (`“Arise, awake, and stop not till the goal is reached.”`).
  - Authors distinguished in spaced **Space Grotesk** tracking with em-dash (`—`).
  - Vertically centered inside the card canvas for balanced aesthetic harmony.
- **Serene 10-Second Auto-Rotation**: Continuous 10s auto-rotation across all 6 inspirations with subtle cross-fade transitions and minimal bottom indicator pills.

---

## 🗺️ 10-Phase Curriculum Roadmap

The 50-week roadmap spans 10 cohesive engineering phases:

| Phase | Duration | Focus Area | Core Technologies & Concepts |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Weeks 01–05 | Foundations & Core Language Mastery | Java OOPs Refresh, CS50P, Python Ecosystem, Git Automation |
| **Phase 2** | Weeks 06–10 | Advanced Data Structures & SQL Mastery | Binary Search, Recursion, Relational DBs, Complex SQL Joins & Window Functions |
| **Phase 3** | Weeks 11–15 | Advanced DSA & Data Engineering | Trees, Graphs, Dynamic Programming, Database Internals, Indexing (B-Trees/LSM) |
| **Phase 4** | Weeks 16–20 | Low-Level Design (LLD) & Clean Architecture | SOLID Principles, Design Patterns, Concurrency in Java/Go, Multi-threading Labs |
| **Phase 5** | Weeks 21–25 | High-Level Design (HLD) & Distributed Systems | CAP Theorem, Sharding, Consistent Hashing, Message Queues (Kafka/RabbitMQ), Caching |
| **Phase 6** | Weeks 26–30 | Production Backend & Cloud Infrastructure | Microservices, Docker, Kubernetes, gRPC, API Gateways, Observability (Prometheus/Grafana) |
| **Phase 7** | Weeks 31–35 | Practical Machine Learning & Deep Learning | NumPy from scratch, Scikit-Learn, PyTorch, Linear/Logistic Regression, Neural Nets |
| **Phase 8** | Weeks 36–40 | Applied Generative AI & Large Language Models | Transformers, Attention Mechanism, RAG Systems, Vector Databases, Fine-Tuning |
| **Phase 9** | Weeks 41–45 | Competitive Programming & Interview Drills | LeetCode Hard Patterns, Timed Mock Interviews, Behavioral STAR Framework |
| **Phase 10** | Weeks 46–50 | Production Portfolio & Placement Sprint | Capstone System Deployment, Resume Polishing, Live Technical Interview Simulation |

---

## 🏗️ Architecture & Tech Stack

```
tracker/
├── index.html                    # Pre-rendered Dashboard
├── favicon.svg                   # Calligraphic Devanagari 'अ' vector icon
├── assets/
│   └── quotes/                   # Precomputed high-contrast WebP/PNG portrait assets
├── css/
│   ├── style.css                 # Custom glassmorphism, calligraphic typography & design tokens
│   ├── tailwind-input.css        # Tailwind base and utilities entrypoint
│   └── tailwind.min.css          # Purged, precompiled production CSS bundle
├── js/
│   ├── app.js                    # Global Search, Spaced Repetition, Cloud Sync & State
│   ├── dashboard-summary.js      # Compact precomputed roadmap dataset (218 KB)
│   ├── quote-matrix.js           # Dot-matrix canvas engine, rotation & HiDPI rendering
│   ├── quotes-data.js            # Precomputed Atkinson dithered dot arrays & base64 URIs
│   └── roadmap-data.js           # Full syllabus dataset with extended deliverables
├── scripts/
│   ├── build_website.py          # Python static site generator & precompiler
│   └── process_user_cropped.py   # Atkinson dither precompiler & asset generator
├── supabase_security_setup.sql   # PostgreSQL RLS & server-side auth procedures
├── tailwind.config.js            # Custom Obsidian Dark design tokens
└── weeks/
    ├── week-01.html              # Pre-rendered weekly execution consoles
    └── ... (weeks 02 to 50)
```

### Technology Matrix

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Core Client** | Vanilla ES6+ JavaScript | Zero-framework runtime, instant boot, lightweight memory footprint |
| **Markup** | Semantic HTML5 + WCAG 2.1 | Accessible buttons, ARIA state announcements, screen-reader friendly |
| **Styling** | Tailwind CSS + Vanilla CSS | Purged utility bundle + custom calligraphic typography & animations |
| **Persistence** | Browser `localStorage` | Instant local-first writes, offline resiliency, `StorageEvent` tab sync |
| **Cloud Backend** | Supabase (PostgreSQL 15) | Real-time database sync, Row Level Security, transactional RPC |
| **Authentication** | Supabase Auth | Google OAuth or email-and-password accounts; a database allowlist selects the sole editor |
| **Static Generator** | Python 3 AST Parser | Pre-renders 50 weekly pages and precomputes summary datasets |
| **Hosting & CDN** | Vercel + Custom Domain | Deploy the static app globally with environment-based configuration |

---

## ⌨️ Keyboard Shortcuts & Quick Actions

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| `Ctrl + F` / `Cmd + F` | Open Minimal Global Search | Global (any page) |
| `Ctrl + K` | Alternative Search Trigger | Global (any page) |
| `/` | Quick-open search (when not in text input) | Global (any page) |
| `Enter` | Navigate to first / next search match | Search Bar active |
| `Shift + Enter` | Navigate to previous search match | Search Bar active |
| `ArrowRight` | Iterate to next match across weeks | Search Bar active |
| `ArrowLeft` | Iterate to previous match across weeks | Search Bar active |
| `Escape` | Close search bar & clear highlight rings | Search Bar active |
| Click Week Badge (`W08`) | Jump directly to matching week console | Search Bar active |

---

## 🛠️ Development & Build Pipeline

### Prerequisites
- **Python 3.9+** (for static generation)
- **Node.js 18+** (for Tailwind CLI compilation)

### 1. Rebuild Entire Website & Data Bundles
To parse all roadmap markdown files from `../Roadmap`, rebuild `dashboard-summary.js`, regenerate `index.html`, and update all 50 `weeks/*.html` files:

```bash
cd tracker
python scripts/build_website.py
```

### 2. Regenerate Quote Dot Matrices & Portrait Assets (Optional)
To re-process reference portraits and update `assets/quotes/` and `js/quotes-data.js`:

```bash
python scripts/process_user_cropped.py
```

### 3. Compile Production Tailwind CSS
To purge unused utility classes and compile the minimal CSS bundle:

```bash
npx tailwindcss -i ./css/tailwind-input.css -o ./css/tailwind.min.css --minify
```

### 4. Local Preview Server
Start a local HTTP server to verify animations, search routing, and sync:

```bash
python -m http.server 8088
# Visit: http://localhost:8088/
```

---

## 🔐 Multi-User Setup

This copy deliberately does not use the source project's Supabase instance. Create your own Supabase project, then:

1. Create a Supabase project. In its **Connect** panel, copy the project URL and browser-safe publishable/anon key. Never use a `service_role` key in the browser.
2. In [`supabase_security_setup.sql`](supabase_security_setup.sql), replace `YOUR_EDITOR_EMAIL@example.com` with the exact email address of the one person permitted to edit, then run the entire script in the Supabase SQL Editor.
3. Under **Authentication → URL Configuration**, set the production Site URL and add it plus `/**` to Redirect URLs. This lets account confirmation emails, if enabled, return to the site.
4. Under **Authentication → Providers**, enable **Email**. To offer Google sign-in, also enable **Google** and configure its OAuth client ID and secret. In Google Cloud, authorize `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` as the redirect URI.
5. In your Vercel project, add environment variables named `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for **Production**. Add the same variables to **Preview** and **Development** too if you want those deployments to run. The included build script inserts those browser-safe values only into Vercel's build artifact; they are not committed to the repository.

Every visitor must sign in with Google or an email-and-password account before shared progress is loaded. Only the configured editor JWT can call `sync_tracker_state`; the database rejects direct browser writes and altered client JavaScript. To transfer edit control later, run the update shown at the bottom of the SQL file.

### Vercel deployment

Import the GitHub repository into Vercel. The supplied [`vercel.json`](vercel.json) automatically runs [`scripts/build-vercel.js`](scripts/build-vercel.js). It fails safely if either Supabase environment variable is missing, so an unconfigured deployment can never pretend that login works. After the first successful deployment, use its `https://…vercel.app` URL as the Supabase Site URL and redirect URL from step 3 above.

---

## 🎨 Design System & Palette

Progress Tracker employs a customized **Obsidian Dark** aesthetic engineered for prolonged visual comfort during 8+ hour study sessions:

- **Surface Background**: `#121316` (Deep Matte Obsidian)
- **Container Glass**: `rgba(27, 27, 31, 0.75)` with `backdrop-filter: blur(12px)`
- **Primary Accent**: `#8083ff` (Electric Indigo / Violet)
- **Secondary Accent**: `#c0c1ff` (Soft Lavender Highlight)
- **Success Tone**: `#10b981` (Vibrant Emerald for completed tasks and streaks)
- **Typography Hierarchy**:
  - **Brand Title**: Rozha One / Yatra One (Calligraphic Devanagari)
  - **Headlines**: Space Grotesk (technical, high-legibility geometric sans)
  - **Body Copy**: Inter (clean, optimized UI text)
  - **Telemetry & Badges**: JetBrains Mono (monospaced metrics, timers, and code references)

