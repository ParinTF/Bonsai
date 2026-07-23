# 🌱 Bonsai

A hierarchical goal tracker that breaks big goals into a draggable node graph, down to daily habits and weekly commitments — with progress that rolls up automatically.

**🔗 Live: [bonsai-dww.pages.dev](https://bonsai-dww.pages.dev)** — click **Try Demo**, no signup needed (backend is on a free tier that sleeps when idle — first load can take ~30–60s)

![Bonsai goal graph](docs/screenshots/goal-graph.png)

| Dashboard | Today |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Today](docs/screenshots/today.png) |

## Why I built this

Most goal apps store goals as a flat list, but real goals are trees: "get fit this year" only means something once it's broken into "run daily" and "gym 3× a week". I wanted the tree to be *visible* — a canvas you can drag around, not an indented list — and I wanted the parent's progress to be computed from its children instead of guessed. It's also my playground for shipping a full .NET + React stack end to end.

## Tech stack

| Layer | Technologies |
|---|---|
| Backend | .NET 10 minimal API, MongoDB, JWT auth (BCrypt), Google Sign-In (ID-token flow), ASP.NET Data Protection (key ring in Mongo), built-in rate limiting |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query, React Flow (@xyflow/react), dark mode, EN/TH i18n, installable PWA |
| AI | BYOK — Anthropic, OpenAI, or Gemini via a provider abstraction, all with structured outputs |
| Testing | xUnit (backend), Playwright scripts (browser E2E) |
| DevOps | Docker Compose (mongo + api + nginx web) for local dev; GitHub Actions CI (backend tests, frontend build, Playwright E2E); deployed on MongoDB Atlas + Render (API) + Cloudflare Pages (frontend) — see [DEPLOY.md](DEPLOY.md) |

## Features

- **7 progress-tracking types** — stages, numeric target, checklist, manual %, daily habit, weekly commitment, and rollup (parent = average of children), each with its own inline editor; a goal's type can be switched later from its panel in the graph view
- **"Mark as success" on a rollup goal** — force a big goal's own progress to 100% regardless of what its sub-goals say, without touching them: they stay exactly as they were, tracked independently, and un-marking reverts the parent to the real computed average. It also quietly drops that goal's daily habits and weekly commitments from Today/This Week/the dashboard To Do list — the goals themselves aren't touched (still visible, still their real status, if you open the tree), they just stop asking to be checked off once you've called the whole branch done
- **Draggable node-graph view** of each goal tree (React Flow) with Dagre auto-layout for new nodes; dragged positions persist through a dedicated `PATCH /goals/{id}/position` endpoint so canvas drags can't race progress edits. Zoom/pan controls and a color-coded MiniMap (dot color = progressType) make large trees easy to navigate, auto-fitting to the whole tree on open — all view-only, camera pan/zoom never touches a node's persisted position
- **Daily habit check-ins with streak tracking** — streak survives an unchecked *today*, breaks on a real gap
- **Consistency calendar heatmap** — each day of the current month shaded by the fraction of habits completed
- **Weekly pass/fail commitments** — one result per goal per ISO week (upserted), progress = pass rate over the last 4 recorded weeks
- **Dashboard "To Do" section** — active stages/numeric/checklist/manual goals from every level of every tree, each with its inline editor, so one-off work is actionable without opening each goal's graph; goal cards and graph nodes also show a type-specific data peek (4/12 books, 2/3 steps, subgoal count) instead of only a percentage
- **AI goal breakdown (bring your own key)** — one click turns a vague goal into a subtree whose depth *and progress types* the model chooses to fit each piece of work: habit branches bottom out in a weekly commitment backed by daily habits, one-off work becomes stages (with real step titles) or a numeric target (with amount + unit) instead of a fake recurring habit. Every node gets a concrete "how to do it" description, and breaking down a goal whose type can't aggregate children auto-promotes it to rollup so its progress actually moves. Works with an Anthropic, OpenAI, or Gemini key configured in Settings
- **AI sub-breakdown on any existing node** (rollup/weekly only) — add children under a goal deep inside an already-built tree without touching anything else in it; the prompt is told the node's ancestor path and its current children so it doesn't recreate what's already there, and nothing is written until you review a preview and confirm. Full-tree "Break down with AI" is reserved for goals that are still blank — once a goal has children the button disables itself (and the server backs that up with a 409) so the two flows can never pile duplicate subtrees onto each other
- **Goal descriptions** — an optional "how to do this" note on any goal: shown under each habit right where you check it off, as a hover tooltip on graph nodes, and prefilled from AI suggestions
- **Weekly streaks + AI-assisted "what's next"** — after logging a pass/fail, a rule-based layer picks a direction (harder / same / retry / easier) from recent results and daily-checkin rate; if the user has an LLM key, it fleshes that out into a concrete titled suggestion with a one-line reason. Accept it, tweak the title, or dismiss it — every outcome is logged for later tuning
- **Progress history + sparkline** — a daily snapshot of every goal's computed progress is kept, so each goal detail page can chart its trend over the last N days instead of only showing the current number
- **In-app weekly review digest** (`/review`) — a single "how did this week go" page: which weekly commitments were recorded/passed and their streak, and how many days each daily habit was checked off, with a shareable weekOf/today window driven by the client's local dates
- **Public landing page at `/`** — logged-out visitors see a marketing page (hero, feature cards, screenshot preview) before the login form, with Try Demo/Sign Up/Log In front and center; an already-logged-in visit to `/` redirects straight to `/dashboard` instead of showing it again
- **Basic SEO for the one page that can actually be indexed** — meaningful `<title>`/description, Open Graph + Twitter Card so shared links get a real preview card instead of a bare URL, `robots.txt`/`sitemap.xml`, and a single `<h1>` with real `<a>` links (not just `onClick`) for the nav buttons. Authenticated pages are `React.lazy()`-loaded so the landing page's first paint doesn't pull in React Flow/Dagre — see [Architecture](#architecture) below for why an SPA's SEO surface is deliberately this narrow
- **One-click demo mode** — a shared demo account with a fully seeded goal tree (live streaks, weekly history, colored heatmap), guarded against destructive requests and reseeded hourly
- **Auth options** — email/password, Google Sign-In (Google Identity Services ID-token flow, no client secret), or the demo account
- **Archive & restore** — soft-delete any goal from the graph view and bring it back from the dashboard; hard delete still cascades the whole subtree
- **Dark mode + English/Thai UI** — both toggles live in the nav bar and persist
- **Timezone-correct tracking** — the client sends its local date, so a check-in at 11 pm in Bangkok lands on the right day
- **Account management** — change password (Google-only accounts can set one), full JSON data export, delete account with full data wipe
- **Per-user data isolation** on every endpoint; rate limiting on auth and AI routes; subtree delete cascades to check-ins and weekly attempts

## Architecture

**Goal tree in MongoDB.** Each goal stores both `parentId` and an `ancestors` array (all ids from root to parent). `parentId` gives cheap child listing; `ancestors` makes "fetch/delete an entire subtree" a single indexed query (`ancestors: goalId`) with no recursion.

**Time-series data lives in separate collections.** Check-ins (`userId + goalId + date`, unique) and weekly attempts (`userId + goalId + weekOf`, unique) are their own collections rather than arrays embedded in the goal document — unbounded growth stays out of the hot document, and the unique indexes make check-in toggles and weekly results idempotent upserts. Progress snapshots (`userId + goalId + date`, one per day) and suggestion events (what the user did with a next-goal suggestion) follow the same pattern.

**Progress is computed, not stored as truth.** [`ProgressCalculator.cs`](api/Bonsai.Api/Services/ProgressCalculator.cs) is a pure static class (no I/O) with the math for all 7 types plus weekly/daily streaks; [`ProgressService.cs`](api/Bonsai.Api/Services/ProgressService.cs) loads a user's goals and evaluates deepest-first so rollup parents always see already-computed children, then upserts a daily progress snapshot per goal for the trend chart. One override sits on top of all of it: `ProgressCalculator.Effective(status, computed)` forces a goal marked "done" to read 100% no matter what its type computed — the "Mark as success" button on a rollup goal — without ever writing to its children, so it composes correctly up the tree and reverts cleanly on undo.

**"Suggest next" is two decoupled layers.** [`WeeklySuggestionCalculator.cs`](api/Bonsai.Api/Services/WeeklySuggestionCalculator.cs) is a pure, unit-tested rule (harder/same/retry/easier from recent pass/fail + checkin rate) that always returns an answer; an optional LLM layer behind [`BreakdownService.SuggestNextWeeklyAsync`](api/Bonsai.Api/Services/BreakdownService.cs) turns that direction into a concrete titled suggestion and degrades silently to the rule-only response on any failure or missing key.

**API keys are encrypted at rest.** BYOK keys are validated with a live test request, encrypted with ASP.NET Data Protection before storage, and only their last 4 characters are ever returned to the client. Keys never appear in logs, and the Data Protection key ring itself is persisted in MongoDB so encrypted keys survive container rebuilds and multi-instance deploys.

**Why SEO only really covers the landing page.** Bonsai is a client-rendered SPA — no SSR, no prerendering. Every route past `/`, `/login`, and `/register` sits behind `RequireAuth`, which redirects an unauthenticated request to `/login` before any real content renders, so a crawler hitting `/dashboard` or `/goals/{id}` sees a login form either way, `robots.txt` or not (the `Disallow` lines there are just hygiene, not a security boundary — the actual gate is the client-side token check). That makes `index.html` and `LandingPage.tsx` the entire SEO surface worth investing in: real `<title>`/description, Open Graph + Twitter Card so a shared link renders as a preview card instead of a bare URL in LINE/X/Discord/Facebook, `sitemap.xml` listing just the three public routes, and a single `<h1>` with genuine `<a>` elements (not `onClick`-only buttons) for the Sign Up/Log In links so crawlers can actually follow them. Authenticated pages are `React.lazy()`-loaded per route so the landing page's JS payload doesn't pay for React Flow/Dagre before first paint.

## Testing

Four layers, all wired into CI: backend pure-logic unit tests, backend integration tests against a real (throwaway) database, a frontend typecheck/lint, and Playwright end-to-end scripts against the full Docker stack.

```sh
# Backend — from api/
dotnet test Bonsai.Api.Tests                        # everything (integration tests skip without Mongo)
dotnet test Bonsai.Api.Tests --filter "FullyQualifiedName~RollupTests"   # one class

# Frontend — from web/
npm run build   # tsc -b && vite build — this IS the typecheck, no separate `tsc --noEmit`
npm run lint    # oxlint

# End-to-end — needs the full stack running (docker compose up --build) — from web/
node e2e-smoke.mjs   # the one CI actually runs; the rest are local-only dev tools
```

### Backend: pure-logic unit tests (118 tests, no I/O)

These test static classes with no Mongo, no HTTP, no mocks — see "Pure logic vs. I/O" in [CLAUDE.md](CLAUDE.md) for why the codebase is shaped this way. All 118 run in milliseconds and never touch a database.

| File | Classes | Tests | Covers |
|---|---|---|---|
| [`ProgressCalculatorTests.cs`](api/Bonsai.Api.Tests/ProgressCalculatorTests.cs) | `StagesTests`, `NumericTests`, `ChecklistTests`, `RollupTests`, `ManualTests`, `DailyTests`, `WeeklyTests`, `StreakTests`, `AggregatesChildrenTests`, `EffectiveTests`, `HasDoneAncestorTests` | 64 | Progress math for all 7 types: divide-by-zero and negative-target guards on numeric goals, empty/null collections for every type, archived children excluded from checklist/rollup averages, daily-streak edge cases (an unchecked *today* doesn't break it, a mid-run gap does), which types aggregate children (rollup/checklist only — drives auto-promotion on breakdown), the "done always reads 100%" override passing every other status through unchanged, and the done-ancestor check that hides a goal from Today/This Week no matter how many levels up the "done" sits |
| [`WeeklyStreakTests.cs`](api/Bonsai.Api.Tests/WeeklyStreakTests.cs) | `WeeklyStreakTests` | 7 | Weekly streak counts consecutive passes newest-first by `weekOf` (not list order) and stops at the first fail |
| [`WeeklySuggestionCalculatorTests.cs`](api/Bonsai.Api.Tests/WeeklySuggestionCalculatorTests.cs) | `WeeklySuggestionCalculatorTests` | 17 | The "suggest next weekly goal" direction rule — two fails in a row → easier, a lone fail → retry, a comfortable pass (checkin rate > 85%) → harder, a strained pass → same; recent-results ordering, empty-history guard |
| [`BreakdownTreeBuilderTests.cs`](api/Bonsai.Api.Tests/BreakdownTreeBuilderTests.cs) | `BreakdownTreeBuilderTests` | 21 | AI flat-list → tree conversion: 2-level and 6-level builds with parents-first ordering and correct ancestor chains; a sub-breakdown target node already deep in an existing tree gets *its own* ancestor chain extended (not a fresh one), and the 6-level depth budget is counted from that node, not the real root; stage/numeric payloads materialise only on their own type (and survive a response that omits them); rejection — typed exception, never a crash — of cycles, unknown/self/duplicate parent references, multiple roots, and >6-level depth |
| [`SubBreakdownPromptTests.cs`](api/Bonsai.Api.Tests/SubBreakdownPromptTests.cs) | `SubBreakdownPromptTests` | 8 | The sub-breakdown prompt context: ancestor path, node description, existing-children dedup warning, and user instruction are each included only when present; a regression test asserting the prompt keeps restating "still emit exactly one root item" so the model can't drop it under a narrow instruction (see [CLAUDE.md](CLAUDE.md)'s sub-breakdown section for the bug this caught) |
| [`UnitTest1.cs`](api/Bonsai.Api.Tests/UnitTest1.cs) | `UnitTest1` | 1 | The empty scaffold `dotnet new xunit` leaves behind — asserts nothing, never deleted, harmless |

### Backend: integration tests (7 tests, real MongoDB)

[`ApiIntegrationTests.cs`](api/Bonsai.Api.Tests/ApiIntegrationTests.cs) boots the *actual* app via `WebApplicationFactory<Program>` — real routing, real auth, real Mongo driver — against a throwaway database (`bonsai_test_<random>`, dropped on teardown) on the server given by `BONSAI_TEST_MONGO` (default `mongodb://localhost:27017`). Each test is a `[SkippableFact]`: **skip, not fail**, when no Mongo is reachable, so the suite stays green on a machine with nothing running. To actually execute them locally:

```sh
docker run -d --rm -p 27017:27017 --name bonsai-test-mongo mongo:7
BONSAI_TEST_MONGO=mongodb://localhost:27017 dotnet test Bonsai.Api.Tests
docker stop bonsai-test-mongo
```

What they check: goals are isolated per user (one user's goals never leak into another's `GET /goals`); deleting a root cascades to children, check-ins, and weekly attempts everywhere, including the account data export; a weekly attempt is a true upsert (posting twice for the same `weekOf` leaves one record, last write wins); `/goals/suggest-next` falls back to the rule-only response with no LLM key configured; breaking down a goal that already has children returns `409` and inserts nothing; marking a rollup "done" shows 100% while its unfinished child keeps its own real progress and status untouched; and that "done" also drops that child from `/today` and `/goals/this-week` (restored the moment you un-mark it) without deleting or archiving anything.

CI's `backend-test` job runs the whole `Bonsai.Api.Tests` project with no Mongo available, so in CI these 7 always report as **skipped**, not passed — the integration coverage is real but only exercised locally or in an environment that provisions Mongo (which is exactly what the `e2e` and `screenshots` jobs do, indirectly, by hitting the API through a real Docker Compose stack instead).

### End-to-end (Playwright)

All five scripts seed data through the real API (not the UI) for speed, then drive the actual browser for the parts that matter. None of them need anything beyond a running stack (`docker compose up --build`, or `dotnet run` + `npm run dev` for the two halves separately) and `WEB_URL`/`API_URL` env vars.

| Script | In CI? | What it does |
|---|---|---|
| [`e2e-smoke.mjs`](web/e2e-smoke.mjs) | ✅ `e2e` job | The golden path through the UI itself (not the API): register → add a root goal → add a daily-habit subgoal → check it in on Today → back to the dashboard and confirm progress rolled up. No explicit assertions beyond the flow completing — a broken selector or missing element fails the script naturally |
| [`e2e-readme-screenshots.mjs`](web/e2e-readme-screenshots.mjs) | ✅ `screenshots` job | Regenerates the three screenshots at the top of this README (see below) |
| [`e2e-dashboard.mjs`](web/e2e-dashboard.mjs) | local only | Regression test: seeds a root + 2 daily habits + a weekly goal with 4 weeks of pass/fail history, checks both habits *without reloading the page*, and asserts the "all done" celebration banner appears and exactly 4 weekly-history dots render — catches any regression in optimistic UI updates |
| [`e2e-graph.mjs`](web/e2e-graph.mjs) | local only | Regression test for the exact bug class node-drag persistence is prone to: drags a node, clicks empty canvas, clicks another node to select it, and asserts the dragged node's position doesn't jump by more than 2px either time; also confirms the position round-trips through `GET /goals` afterward |
| [`e2e-design.mjs`](web/e2e-design.mjs) | local only | Not a test — no assertions. Seeds a believable goal tree (weekly history, a week of mixed checkin data for the heatmap) and screenshots dashboard/graph/today at both a desktop (1280×800) and mobile (375×720) viewport, for eyeballing visual/design changes |

The three screenshots at the top of this README are themselves CI output: after `e2e` passes on a push to `main`/`master`, the `screenshots` job seeds a fresh account (dates computed relative to "today", never hardcoded), captures the dashboard/today/graph views with Playwright, and commits any changed PNGs straight back to the branch — so they never drift from the current UI. It runs only on a direct push (not a PR — a PR's `GITHUB_TOKEN` can't push back to the branch), and `paths-ignore: [docs/screenshots/**]` on the workflow trigger stops that commit from re-triggering itself.

### CI pipeline

Four jobs in [`.github/workflows/ci.yml`](.github/workflows/ci.yml), gated in sequence:

```
backend-test ─┐
              ├─▶ e2e ─▶ screenshots (push to main/master only)
frontend-build┘
```

- **`backend-test`** — `dotnet restore`/`build`/`test` on the whole solution. No Mongo, so the 7 integration tests report skipped.
- **`frontend-build`** — `npm ci`, `tsc -b` (typecheck), `npm run build`.
- **`e2e`** — waits on both of the above; writes a throwaway `.env`, boots the full Docker Compose stack, waits for `/health`, then runs `e2e-smoke.mjs` against it. Dumps `docker compose logs` on failure.
- **`screenshots`** — waits on `e2e`; only runs on a real push (not PRs); repeats the same stack-boot dance, runs `e2e-readme-screenshots.mjs`, and commits any changed PNGs.

## AI integration (BYOK)

`POST /goals/breakdown` asks an LLM to split a goal into a tree whose **depth and progress types the model chooses** (capped at 6 levels) based on the goal's real complexity: habit-building branches end in weekly + daily nodes, one-off work becomes stages or a numeric target rather than a fake recurring habit. The structured output is a *flat* item list — `{ tempId, parentTempId, title, description, progressType, weeklyTarget?, stages?, numericTarget?, numericUnit? }` — which sidesteps the no-recursive-schema limitation of every provider's structured-output mode, and carries enough payload that stages/numeric goals are trackable the moment they're created (step titles, target + unit) instead of sitting at 0%. [`BreakdownTreeBuilder.cs`](api/Bonsai.Api/Services/Llm/BreakdownTreeBuilder.cs) (pure, unit-tested) then validates the list — single root, no unknown/duplicate references, no cycles, depth ≤ 6 — and materialises it parents-first into real goal documents with correct `parentId`/`ancestors` links. Invalid model output is rejected with a clean error, never a crash.

Users bring their own key: the Settings page accepts an Anthropic, OpenAI, or Gemini key ("Test & Save" validates it against the provider before storing). Behind [`BreakdownService.cs`](api/Bonsai.Api/Services/BreakdownService.cs) sits an [`ILlmProvider`](api/Bonsai.Api/Services/Llm/ILlmProvider.cs) abstraction with one implementation per vendor, each using that vendor's native structured-output mechanism (the shared JSON schema is unrolled per level, since none of them allow recursive schemas):

| Provider | Structured output mechanism |
|---|---|
| Anthropic | `output_config.format` json_schema (official C# SDK) |
| OpenAI | `response_format: json_schema` with `strict: true` |
| Gemini | `responseMimeType` + OpenAPI-style `responseSchema` |

**Sub-breakdown** (`POST /goals/{nodeId}/sub-breakdown` + `/confirm`) attaches new children under one existing node — anywhere in the tree, not just the top — without regenerating or touching the rest of it. It reuses `ILlmProvider` and `BreakdownTreeBuilder` as-is: the only new piece is a context builder that folds the node's ancestor path and its current children into the same free-text `context` parameter the top-level breakdown already accepts, so the model sees what's already there and is told not to recreate it. `BreakdownTreeBuilder.Build` is called with the selected node as `root`, so new children extend *that node's own* `ancestors` chain rather than starting a fresh one, and the same depth cap (6 levels) applies from that node down. The first call only previews — the LLM runs and the tree is validated, but nothing is written; the client resends the exact same flat item list to `/confirm` to persist it, so a confirm-time failure never needs a second model call. The button only appears on `rollup`/`weekly` nodes; attaching children under any other type would silently flip its progressType to `rollup` to make room for them, so a confirmed warning is shown instead of doing that quietly.

## Quick Start with Docker

```sh
cp .env.example .env       # then fill in JWT_KEY (GOOGLE_CLIENT_ID / ANTHROPIC_API_KEY optional)
docker compose up --build
```

Open http://localhost:3000 — the stack runs MongoDB (internal-only), the API on :8080, and the web app served by nginx on :3000, with data persisted in a named volume. Click **Try Demo** on the login page to explore with seeded data, or sign up and add your own LLM key under **Settings** to enable AI breakdown.

## Getting started (local dev)

Prerequisites: .NET 10 SDK, Node 20+, a MongoDB instance (Atlas free tier works).

```sh
git clone <repo-url> && cd Bonsai

# Backend secrets (stored via user-secrets, never committed)
cd api/Bonsai.Api
dotnet user-secrets set "Mongo:ConnectionString" "mongodb+srv://..."
dotnet user-secrets set "Jwt:Key" "<any random string, 32+ chars>"
dotnet user-secrets set "Google:ClientId" "....apps.googleusercontent.com"   # optional — enables Sign in with Google
dotnet user-secrets set "Anthropic:ApiKey" "sk-ant-..."   # optional — server-wide dev fallback for AI breakdown

# Run backend (http://localhost:5264)
dotnet run --launch-profile http

# Run frontend (http://localhost:5173)
cd ../../web
npm install
# optional — Google button on the login page (same client id as the backend):
# cp .env.example .env.local  and fill in VITE_GOOGLE_CLIENT_ID
npm run dev
```

The app is fully usable without any LLM key; only the "Break down with AI" button needs one, and each user can set their own in Settings (the `Anthropic:ApiKey` secret is just a dev fallback).

## Deploying

See [DEPLOY.md](DEPLOY.md) for a step-by-step free-tier deployment guide (MongoDB Atlas M0 + Render for the API + Cloudflare Pages for the frontend), including environment-variable tables and a troubleshooting matrix.

## Live demo

**[bonsai-dww.pages.dev](https://bonsai-dww.pages.dev)** — click **Try Demo** on the landing page, no signup needed. (Free-tier backend on Render sleeps after 15 minutes idle — the first request after a while can take ~30–60s to wake up.)
