# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Bonsai — a hierarchical goal tracker. Goals form a tree (draggable React Flow canvas) down to daily habits and weekly commitments; parent progress is computed from children. Backend: .NET 10 minimal API + MongoDB. Frontend: React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui + TanStack Query, in `web/`.

## Commands

```sh
# Backend (from api/)
dotnet test Bonsai.Api.Tests                       # all xUnit tests
dotnet test Bonsai.Api.Tests --filter "FullyQualifiedName~NextGoalSuggesterTests"  # one class
dotnet run --project Bonsai.Api --launch-profile http   # API on http://localhost:5264
# Secrets come from user-secrets: Mongo:ConnectionString, Jwt:Key (32+ chars),
# optional Google:ClientId and Anthropic:ApiKey.

# Frontend (from web/)
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # tsc -b && vite build (this is the typecheck — run it before finishing)
npm run lint       # oxlint

# Full stack
docker compose up --build    # mongo + api :8080 + nginx web :3000

# Browser E2E (needs full stack running)
node web/e2e-dashboard.mjs
```

## Architecture

**Goal tree in MongoDB.** Each `Goal` stores both `parentId` (cheap child listing) and an `ancestors` array — all ids from root to parent — so fetching/deleting a whole subtree is a single indexed query (`ancestors: goalId`), no recursion. When creating a goal, set `Ancestors = [..parent.Ancestors, parent.Id]`. Hard delete cascades to checkins and weekly attempts.

**Time-series in separate collections.** `Checkin` (userId+goalId+date) and `WeeklyAttempt` (userId+goalId+weekOf, Monday `yyyy-MM-dd`) are their own collections with unique indexes, written as idempotent upserts — never embedded arrays in the goal document.

**Pure logic vs. I/O — the key pattern.** Decision/math logic lives in pure static classes with no I/O so tests need no Mongo mocks:
- `Services/ProgressCalculator.cs` — progress math for all 7 progress types (stages, numeric, checklist, manual, rollup, daily, weekly) + streaks
- `Services/Llm/BreakdownTreeBuilder.cs` — validates the LLM's flat item list (single root, no cycles, depth ≤ 6) and materialises it parents-first
- `Services/WeeklySuggestionCalculator.cs` — layer 1 of "suggest next weekly goal": picks a `Direction` (harder/same/retry/easier) from recent results + child checkin rate. Layer 2 (optional LLM content) lives behind `BreakdownService.SuggestNextWeeklyAsync` and degrades to rule-only on any failure.

Endpoints/services only gather inputs and call these. New logic of this kind should follow the same pattern, with tests in `api/Bonsai.Api.Tests/`.

**Progress is computed, never trusted from storage.** `ProgressService.ComputeTreeAsync` loads all of a user's goals and evaluates deepest-first so rollup parents see already-computed children. Endpoints that mutate goals recompute the tree before responding. It also writes a daily `ProgressSnapshot` per goal (idempotent upsert on userId+goalId+UTC-date) — `Goal.Progress` is overwritten each recompute and keeps no history, so the snapshot collection is the only time series (read via `GET /goals/{id}/history`, rendered as a sparkline).

**Time-series collections beyond checkins/attempts:** `progressSnapshots` (trend history, above) and `suggestionEvents` (what the user did with a next-goal suggestion: used/custom/skipped). Both are per-user and cascade-deleted on account delete.

**Endpoints** are minimal-API extension methods in `Endpoints/*.cs` (`MapGoalEndpoints` etc.), grouped under `RequireAuthorization()`. Every query filters by `user.UserId()` (extension on `ClaimsPrincipal`) — per-user isolation is enforced in every single query, not middleware. Rate limiting applies to auth and AI routes.

**AI breakdown (BYOK).** `ILlmProvider` has one implementation per vendor (Anthropic/OpenAI/Gemini), each using its native structured-output mode; the schema is a *flat* list `{ tempId, parentTempId, title, description, progressType, weeklyTarget?, stages?, numericTarget?, numericUnit? }` because no provider allows recursive schemas — the model picks each node's type (stages get real step titles, numeric gets target+unit) instead of forcing everything into rollup→weekly→daily. User keys are validated live, encrypted with ASP.NET Data Protection (key ring persisted in Mongo via `MongoXmlRepository`), and only the last 4 chars are ever returned.

**Sub-breakdown** (`POST /goals/{nodeId}/sub-breakdown` + `/confirm`, `Endpoints/BreakdownEndpoints.cs`) reuses `ILlmProvider` and `BreakdownTreeBuilder` unchanged — the only new piece is `SubBreakdownPrompt`, which folds the node's ancestor path and existing children into the free-text `context` param `BreakdownPrompt.Build` already accepts. New children attach under the selected node's own `ancestors`, not a fresh root, because `BreakdownTreeBuilder.Build` is called with that node as `root` — this is why the ancestor-chain math (`[...node.Ancestors, node.Id]`) must never be reset to `[]` here. The preview step calls the LLM and validates but does not persist; the client resends the same flat `items` list to `/confirm`, which is the only step that touches the database — a confirm-time failure never needs a second LLM call.

**Full-tree breakdown vs. sub-breakdown is a hard boundary, not a merge.** `POST /goals/breakdown` checks `db.Goals.Find(g => g.ParentId == existingRoot.Id).AnyAsync()` *before* calling the LLM and returns `409` (`code: "already_has_children"`) if the target already has any child — it never de-dupes or merges against an existing subtree. Once a goal has children, growing it further is sub-breakdown's job, which is deliberately given the existing-children list so the model can avoid recreating them. The frontend disables "Break down with AI" whenever the selected goal's subtree has more than just itself, so this 409 is normally only reachable via a stale-state race, not the happy path.

**Timezone handling.** The client computes and sends its local date / local Monday (`localDate()` / `localMonday()` in `web/src/lib/api.ts`); the server never derives "today" from UTC for user-facing tracking. `GET /me/weekly-review` (the in-app weekly digest, `WeeklyReviewEndpoints.cs`) likewise takes `?monday=&today=` from the client.

**Integration tests** (`ApiIntegrationTests.cs`) boot the real app via `WebApplicationFactory<Program>` against Mongo from `BONSAI_TEST_MONGO` (default `mongodb://localhost:27017`) in a throwaway DB, using `[SkippableFact]` to skip (not fail) when no Mongo is reachable. Everything else in `Bonsai.Api.Tests` is pure-logic and needs no DB.

## Frontend conventions

- All API calls go through typed wrappers in `web/src/lib/api.ts` (`goalsApi`, `habitsApi`, …) using the shared `api<T>()` fetch helper (JWT header, 401 → login redirect).
- Server state via TanStack Query; after mutations invalidate the relevant keys (`['goals']`, `['this-week']`, `['today']`).
- Every user-facing string goes through `t('key')` from `web/src/lib/i18n.tsx` — add both `en` and `th` entries. No interpolation support; use `.replace()` in the component if needed.
- UI primitives are shadcn/ui in `web/src/components/ui/`; styling is Tailwind with theme tokens (`bg-card`, `text-muted-foreground`, `border-border`, …) so dark mode works.

## Gotchas

- Demo mode: a shared demo account is reseeded hourly and guarded against destructive requests (`DemoService`) — consider it when touching auth or delete paths.
- Node positions on the canvas use a dedicated `PATCH /goals/{id}/position` endpoint, deliberately separate from the main PATCH so drags can't race progress edits.
- Weekly attempts are one-per-goal-per-week upserts keyed on `weekOf`; the weekly progress window is the 4 most recent *recorded* weeks by `weekOf`, not list order.
