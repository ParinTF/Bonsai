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
| Backend | .NET 10 minimal API, MongoDB (Atlas), JWT auth (BCrypt), Google Sign-In (ID-token flow) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query, React Flow (@xyflow/react) |
| AI | Anthropic API (structured outputs) for goal breakdown |
| Testing | xUnit (backend), Playwright scripts (browser E2E) |
| DevOps | GitHub Actions CI (build + test on every push/PR) |

## Features

- **7 progress-tracking types** — stages, numeric target, checklist, manual %, daily habit, weekly commitment, and rollup (parent = average of children), each with its own inline editor
- **Draggable node-graph view** of each goal tree (React Flow) with Dagre auto-layout for new nodes; dragged positions persist through a dedicated `PATCH /goals/{id}/position` endpoint so canvas drags can't race progress edits
- **Daily habit check-ins with streak tracking** — streak survives an unchecked *today*, breaks on a real gap
- **Consistency calendar heatmap** — each day of the current month shaded by the fraction of habits completed
- **Weekly pass/fail commitments** — one result per goal per ISO week (upserted), progress = pass rate over the last 4 recorded weeks
- **AI goal breakdown** — one click turns a vague goal into a ≤3-level subtree whose leaves are concrete daily/weekly actions
- **Per-user data isolation** on every endpoint; subtree delete cascades to check-ins and weekly attempts

## Architecture

**Goal tree in MongoDB.** Each goal stores both `parentId` and an `ancestors` array (all ids from root to parent). `parentId` gives cheap child listing; `ancestors` makes "fetch/delete an entire subtree" a single indexed query (`ancestors: goalId`) with no recursion.

**Time-series data lives in separate collections.** Check-ins (`userId + goalId + date`, unique) and weekly attempts (`userId + goalId + weekOf`, unique) are their own collections rather than arrays embedded in the goal document — unbounded growth stays out of the hot document, and the unique indexes make check-in toggles and weekly results idempotent upserts.

**Progress is computed, not stored as truth.** [`ProgressCalculator.cs`](api/Bonsai.Api/Services/ProgressCalculator.cs) is a pure static class (no I/O) with the math for all 7 types; [`ProgressService.cs`](api/Bonsai.Api/Services/ProgressService.cs) loads a user's goals and evaluates deepest-first so rollup parents always see already-computed children.

## Testing

49 xUnit tests cover the progress math in [`ProgressCalculatorTests.cs`](api/Bonsai.Api.Tests/ProgressCalculatorTests.cs):

- divide-by-zero and negative-target guards on numeric goals; current value clamped to [0, 100]
- empty/null collections for every type (no children, no stages, no attempts)
- archived children excluded from both checklist and rollup averages
- weekly window selected by `weekOf` date, not list order (only the 4 most recent weeks count)
- streak edge cases: unchecked *today* doesn't break the streak, a mid-run gap does

Separating the math into a pure class keeps these tests free of MongoDB mocks. CI runs them on every push. Playwright scripts (`web/e2e-*.mjs`) exercise the real browser flow, including a regression test that drags a node, clicks empty canvas, and asserts zero position drift.

## AI integration

`POST /goals/breakdown` ([`BreakdownService.cs`](api/Bonsai.Api/Services/BreakdownService.cs)) calls the Anthropic API with **structured outputs**: a JSON schema constrains the response to a goal tree at most 3 levels deep whose leaf nodes must be `daily` or `weekly` actions (the schema is unrolled per level, since structured outputs don't allow recursive schemas). The validated tree is then persisted as real goal documents with correct `parentId`/`ancestors` links — no free-text parsing.

## Getting started

Prerequisites: .NET 10 SDK, Node 20+, a MongoDB instance (Atlas free tier works).

```sh
git clone <repo-url> && cd Bonsai

# Backend secrets (stored via user-secrets, never committed)
cd api/Bonsai.Api
dotnet user-secrets set "Mongo:ConnectionString" "mongodb+srv://..."
dotnet user-secrets set "Jwt:Key" "<any random string, 32+ chars>"
dotnet user-secrets set "Anthropic:ApiKey" "sk-ant-..."   # optional — only the AI breakdown button needs it
dotnet user-secrets set "Google:ClientId" "....apps.googleusercontent.com"   # optional — enables Sign in with Google

# Run backend (http://localhost:5264)
dotnet run --launch-profile http

# Run frontend (http://localhost:5173)
cd ../../web
npm install
# optional — Google button on the login page (same client id as the backend):
# cp .env.example .env.local  and fill in VITE_GOOGLE_CLIENT_ID
npm run dev
```

The app is fully usable without an Anthropic key; only the "Break down with AI" button requires it.

## Live demo

Deployment coming soon.
