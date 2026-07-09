# 🌱 Bonsai

A hierarchical goal tracker that breaks big goals into a draggable node graph, down to daily habits and weekly commitments — with progress that rolls up automatically.

![Bonsai goal graph](docs/screenshots/goal-graph.png)

| Dashboard | Today |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Today](docs/screenshots/today.png) |

## Why I built this

Most goal apps store goals as a flat list, but real goals are trees: "get fit this year" only means something once it's broken into "run daily" and "gym 3× a week". I wanted the tree to be *visible* — a canvas you can drag around, not an indented list — and I wanted the parent's progress to be computed from its children instead of guessed. It's also my playground for shipping a full .NET + React stack end to end.

## Tech stack

| Layer | Technologies |
|---|---|
| Backend | .NET 10 minimal API, MongoDB, JWT auth (BCrypt), Google Sign-In (ID-token flow), ASP.NET Data Protection |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query, React Flow (@xyflow/react) |
| AI | BYOK — Anthropic, OpenAI, or Gemini via a provider abstraction, all with structured outputs |
| Testing | xUnit (backend), Playwright scripts (browser E2E) |
| DevOps | Docker Compose (mongo + api + nginx web), GitHub Actions CI (build + test on every push/PR) |

## Features

- **7 progress-tracking types** — stages, numeric target, checklist, manual %, daily habit, weekly commitment, and rollup (parent = average of children), each with its own inline editor
- **Draggable node-graph view** of each goal tree (React Flow) with Dagre auto-layout for new nodes; dragged positions persist through a dedicated `PATCH /goals/{id}/position` endpoint so canvas drags can't race progress edits
- **Daily habit check-ins with streak tracking** — streak survives an unchecked *today*, breaks on a real gap
- **Consistency calendar heatmap** — each day of the current month shaded by the fraction of habits completed
- **Weekly pass/fail commitments** — one result per goal per ISO week (upserted), progress = pass rate over the last 4 recorded weeks
- **AI goal breakdown (bring your own key)** — one click turns a vague goal into a ≤3-level subtree whose leaves are concrete daily/weekly actions; works with an Anthropic, OpenAI, or Gemini key configured in Settings
- **One-click demo mode** — a shared demo account with a fully seeded goal tree (live streaks, weekly history, colored heatmap), guarded against destructive requests and reseeded hourly
- **Auth options** — email/password, Google Sign-In (Google Identity Services ID-token flow, no client secret), or the demo account
- **Per-user data isolation** on every endpoint; subtree delete cascades to check-ins and weekly attempts

## Architecture

**Goal tree in MongoDB.** Each goal stores both `parentId` and an `ancestors` array (all ids from root to parent). `parentId` gives cheap child listing; `ancestors` makes "fetch/delete an entire subtree" a single indexed query (`ancestors: goalId`) with no recursion.

**Time-series data lives in separate collections.** Check-ins (`userId + goalId + date`, unique) and weekly attempts (`userId + goalId + weekOf`, unique) are their own collections rather than arrays embedded in the goal document — unbounded growth stays out of the hot document, and the unique indexes make check-in toggles and weekly results idempotent upserts.

**Progress is computed, not stored as truth.** [`ProgressCalculator.cs`](api/Bonsai.Api/Services/ProgressCalculator.cs) is a pure static class (no I/O) with the math for all 7 types; [`ProgressService.cs`](api/Bonsai.Api/Services/ProgressService.cs) loads a user's goals and evaluates deepest-first so rollup parents always see already-computed children.

**API keys are encrypted at rest.** BYOK keys are validated with a live test request, encrypted with ASP.NET Data Protection before storage, and only their last 4 characters are ever returned to the client. Keys never appear in logs.

## Testing

49 xUnit tests cover the progress math in [`ProgressCalculatorTests.cs`](api/Bonsai.Api.Tests/ProgressCalculatorTests.cs):

- divide-by-zero and negative-target guards on numeric goals; current value clamped to [0, 100]
- empty/null collections for every type (no children, no stages, no attempts)
- archived children excluded from both checklist and rollup averages
- weekly window selected by `weekOf` date, not list order (only the 4 most recent weeks count)
- streak edge cases: unchecked *today* doesn't break the streak, a mid-run gap does

Separating the math into a pure class keeps these tests free of MongoDB mocks. CI runs them on every push. Playwright scripts (`web/e2e-*.mjs`) exercise the real browser flow, including a regression test that drags a node, clicks empty canvas, and asserts zero position drift.

## AI integration (BYOK)

`POST /goals/breakdown` asks an LLM to split a goal into a tree at most 3 levels deep whose leaf nodes must be `daily` or `weekly` actions, then persists the validated tree as real goal documents with correct `parentId`/`ancestors` links — no free-text parsing.

Users bring their own key: the Settings page accepts an Anthropic, OpenAI, or Gemini key ("Test & Save" validates it against the provider before storing). Behind [`BreakdownService.cs`](api/Bonsai.Api/Services/BreakdownService.cs) sits an [`ILlmProvider`](api/Bonsai.Api/Services/Llm/ILlmProvider.cs) abstraction with one implementation per vendor, each using that vendor's native structured-output mechanism (the shared JSON schema is unrolled per level, since none of them allow recursive schemas):

| Provider | Structured output mechanism |
|---|---|
| Anthropic | `output_config.format` json_schema (official C# SDK) |
| OpenAI | `response_format: json_schema` with `strict: true` |
| Gemini | `responseMimeType` + OpenAPI-style `responseSchema` |

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

## Live demo

Deployment coming soon.
