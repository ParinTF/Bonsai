using System.Security.Claims;
using Bonsai.Api.Models;
using Bonsai.Api.Services;
using Bonsai.Api.Services.Llm;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Bonsai.Api.Endpoints;

public record CreateGoalRequest(string Title, string? ParentId, string ProgressType,
    List<Stage>? Stages, NumericProgress? Numeric, string? Description);

public record UpdateGoalRequest(string? Title, string? Status, string? ProgressType,
    List<Stage>? Stages, NumericProgress? Numeric, double? Progress, int? Order, string? Description);

public static class GoalEndpoints
{
    public static string UserId(this ClaimsPrincipal user) =>
        user.FindFirstValue(ClaimTypes.NameIdentifier)!;

    public static void MapGoalEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/goals").RequireAuthorization();

        // Full tree with computed progress
        group.MapGet("/", async (ClaimsPrincipal user, ProgressService progress) =>
            Results.Ok(await progress.ComputeTreeAsync(user.UserId())));

        group.MapGet("/this-week", async (ClaimsPrincipal user, MongoContext db, ProgressService progress) =>
        {
            var userId = user.UserId();
            var all = await progress.ComputeTreeAsync(userId);
            var statusById = all.ToDictionary(g => g.Id, g => g.Status);
            // Once a bigger goal above it has been marked a success, its weekly
            // commitments stop needing a pass/fail every week.
            var weekly = all.Where(g => g.ProgressType == ProgressTypes.Weekly && g.Status == GoalStatuses.Active
                && !ProgressCalculator.HasDoneAncestor(g.Ancestors, statusById)).ToList();

            var ids = weekly.Select(g => g.Id).ToList();
            var attempts = await db.WeeklyAttempts
                .Find(a => a.UserId == userId && ids.Contains(a.GoalId))
                .ToListAsync();

            return Results.Ok(weekly.Select(g => new
            {
                goal = g,
                weeklyStreak = ProgressCalculator.WeeklyStreak(attempts.Where(a => a.GoalId == g.Id)),
                attempts = attempts
                    .Where(a => a.GoalId == g.Id)
                    .OrderByDescending(a => a.WeekOf)
                    .Take(4)
                    .Select(a => new { weekOf = a.WeekOf, result = a.Result }),
            }));
        });

        group.MapPost("/", async (CreateGoalRequest req, ClaimsPrincipal user, MongoContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Title))
                return Results.BadRequest(new { error = "Title is required" });
            if (!ProgressTypes.All.Contains(req.ProgressType))
                return Results.BadRequest(new { error = $"progressType must be one of: {string.Join(", ", ProgressTypes.All)}" });

            var userId = user.UserId();
            var ancestors = new List<string>();
            if (req.ParentId is not null)
            {
                var parent = await db.Goals.Find(g => g.Id == req.ParentId && g.UserId == userId).FirstOrDefaultAsync();
                if (parent is null) return Results.NotFound(new { error = "Parent goal not found" });
                ancestors = [.. parent.Ancestors, parent.Id];
            }

            var siblingCount = await db.Goals.CountDocumentsAsync(g => g.UserId == userId && g.ParentId == req.ParentId);

            var goal = new Goal
            {
                Id = ObjectId.GenerateNewId().ToString(),
                UserId = userId,
                ParentId = req.ParentId,
                Ancestors = ancestors,
                Title = req.Title.Trim(),
                Description = Normalize(req.Description),
                ProgressType = req.ProgressType,
                Stages = req.ProgressType == ProgressTypes.Stages ? req.Stages ?? [] : null,
                Numeric = req.ProgressType == ProgressTypes.Numeric ? req.Numeric ?? new NumericProgress() : null,
                Order = (int)siblingCount,
            };

            await db.Goals.InsertOneAsync(goal);
            return Results.Created($"/goals/{goal.Id}", goal);
        });

        group.MapPatch("/{id}", async (string id, UpdateGoalRequest req, ClaimsPrincipal user, MongoContext db, ProgressService progress) =>
        {
            var userId = user.UserId();
            var goal = await db.Goals.Find(g => g.Id == id && g.UserId == userId).FirstOrDefaultAsync();
            if (goal is null) return Results.NotFound();

            if (req.Status is not null && !GoalStatuses.All.Contains(req.Status))
                return Results.BadRequest(new { error = $"status must be one of: {string.Join(", ", GoalStatuses.All)}" });
            if (req.ProgressType is not null && !ProgressTypes.All.Contains(req.ProgressType))
                return Results.BadRequest(new { error = $"progressType must be one of: {string.Join(", ", ProgressTypes.All)}" });

            var update = Builders<Goal>.Update.Set(g => g.UpdatedAt, DateTime.UtcNow);
            if (req.Title is not null) update = update.Set(g => g.Title, req.Title.Trim());
            // Description: sending "" (or whitespace) clears it; omitting it (null) leaves it untouched.
            if (req.Description is not null) update = update.Set(g => g.Description, Normalize(req.Description));
            if (req.Status is not null) update = update.Set(g => g.Status, req.Status);
            if (req.ProgressType is not null) update = update.Set(g => g.ProgressType, req.ProgressType);
            if (req.Stages is not null) update = update.Set(g => g.Stages, req.Stages);
            if (req.Numeric is not null) update = update.Set(g => g.Numeric, req.Numeric);
            if (req.Progress is not null) update = update.Set(g => g.Progress, Math.Clamp(req.Progress.Value, 0, 100));
            if (req.Order is not null) update = update.Set(g => g.Order, req.Order.Value);

            await db.Goals.UpdateOneAsync(g => g.Id == id, update);

            // Recompute so rollup parents reflect this change immediately.
            var all = await progress.ComputeTreeAsync(userId);
            return Results.Ok(all.First(g => g.Id == id));
        });

        // Position-only update, separate from the main PATCH so canvas drags
        // can't race with progress edits.
        group.MapPatch("/{id}/position", async (string id, PositionRequest req, ClaimsPrincipal user, MongoContext db) =>
        {
            var userId = user.UserId();
            var result = await db.Goals.UpdateOneAsync(
                g => g.Id == id && g.UserId == userId,
                Builders<Goal>.Update.Set(g => g.PositionX, req.X).Set(g => g.PositionY, req.Y));
            return result.MatchedCount == 0 ? Results.NotFound() : Results.Ok(new { id, x = req.X, y = req.Y });
        });

        group.MapDelete("/{id}", async (string id, ClaimsPrincipal user, MongoContext db) =>
        {
            var userId = user.UserId();
            var goal = await db.Goals.Find(g => g.Id == id && g.UserId == userId).FirstOrDefaultAsync();
            if (goal is null) return Results.NotFound();

            // Delete the goal and its whole subtree (anything with id in ancestors).
            var subtreeFilter = Builders<Goal>.Filter.Eq(g => g.UserId, userId) &
                (Builders<Goal>.Filter.Eq(g => g.Id, id) | Builders<Goal>.Filter.AnyEq(g => g.Ancestors, id));
            var subtreeIds = await db.Goals.Find(subtreeFilter).Project(g => g.Id).ToListAsync();

            await db.Goals.DeleteManyAsync(subtreeFilter);
            await db.Checkins.DeleteManyAsync(c => c.UserId == userId && subtreeIds.Contains(c.GoalId));
            await db.WeeklyAttempts.DeleteManyAsync(w => w.UserId == userId && subtreeIds.Contains(w.GoalId));

            return Results.NoContent();
        });

        group.MapPost("/{id}/weekly-attempt", async (string id, WeeklyAttemptRequest req, ClaimsPrincipal user, MongoContext db) =>
        {
            var userId = user.UserId();
            if (req.Result is not ("pass" or "fail"))
                return Results.BadRequest(new { error = "result must be \"pass\" or \"fail\"" });

            var goal = await db.Goals.Find(g => g.Id == id && g.UserId == userId).FirstOrDefaultAsync();
            if (goal is null) return Results.NotFound();

            var weekOf = req.WeekOf ?? MondayOf(DateOnly.FromDateTime(DateTime.UtcNow)).ToString("yyyy-MM-dd");

            // Upsert: one result per goal per week.
            await db.WeeklyAttempts.ReplaceOneAsync(
                w => w.UserId == userId && w.GoalId == id && w.WeekOf == weekOf,
                new WeeklyAttempt
                {
                    Id = ObjectId.GenerateNewId().ToString(),
                    UserId = userId,
                    GoalId = id,
                    WeekOf = weekOf,
                    Result = req.Result,
                },
                new ReplaceOptions { IsUpsert = true });

            return Results.Ok(new { goalId = id, weekOf, result = req.Result });
        });

        // Suggest the next weekly commitment after an attempt. Two layers:
        //   1. WeeklySuggestionCalculator (pure) picks a Direction from the recent results + checkin rate.
        //   2. If the user has an LLM key, ask it for concrete { title, progressType, reason }.
        // The LLM layer is best-effort: any failure degrades to the rule-only response.
        group.MapPost("/{weeklyGoalId}/suggest-next", async (string weeklyGoalId, ClaimsPrincipal user,
            MongoContext db, BreakdownService breakdown) =>
        {
            var userId = user.UserId();
            var allGoals = await db.Goals.Find(g => g.UserId == userId).ToListAsync();
            var goal = allGoals.FirstOrDefault(g => g.Id == weeklyGoalId);
            if (goal is null) return Results.NotFound();
            if (goal.ProgressType != ProgressTypes.Weekly)
                return Results.BadRequest(new { error = "suggest-next only applies to weekly goals" });

            // Latest attempt plus up to 2 weeks before it, newest first.
            var attempts = await db.WeeklyAttempts
                .Find(a => a.UserId == userId && a.GoalId == weeklyGoalId)
                .SortByDescending(a => a.WeekOf)
                .Limit(3)
                .ToListAsync();
            if (attempts.Count == 0)
                return Results.BadRequest(new { error = "No weekly attempts recorded for this goal yet" });

            // Checkin completion rate of daily-habit children during the latest attempt's week.
            double? checkinRate = null;
            var dailyChildIds = allGoals
                .Where(g => g.ParentId == weeklyGoalId && g.ProgressType == ProgressTypes.Daily
                    && g.Status == GoalStatuses.Active)
                .Select(g => g.Id)
                .ToList();
            if (dailyChildIds.Count > 0)
            {
                var monday = DateOnly.Parse(attempts[0].WeekOf);
                var weekDates = Enumerable.Range(0, 7).Select(i => monday.AddDays(i).ToString("yyyy-MM-dd")).ToList();
                var doneCount = await db.Checkins.CountDocumentsAsync(c =>
                    c.UserId == userId && dailyChildIds.Contains(c.GoalId) && weekDates.Contains(c.Date) && c.Done);
                checkinRate = Math.Round((double)doneCount / (7 * dailyChildIds.Count), 3);
            }

            // Layer 1 — rule-based direction.
            var results = attempts.Select(a => a.Result).ToList();
            var direction = WeeklySuggestionCalculator.Calculate(results, checkinRate);

            // Layer 2 — optional LLM content. Returns null when no key / on any failure.
            var bigPicture = RenderTree(allGoals);
            var recentWeeklyTitles = allGoals
                .Where(g => g.ProgressType == ProgressTypes.Weekly && g.ParentId == goal.ParentId)
                .OrderByDescending(g => g.UpdatedAt)
                .Select(g => g.Title)
                .Take(3)
                .ToList();
            var prompt = WeeklySuggestionPrompt.Build(direction, bigPicture, goal.Title, recentWeeklyTitles);
            var llm = await breakdown.SuggestNextWeeklyAsync(userId, prompt);

            return Results.Ok(new
            {
                goalId = weeklyGoalId,
                parentId = goal.ParentId,
                weekOf = attempts[0].WeekOf,
                latestResult = results[0],
                direction = direction.Token(),
                reasonCode = direction.ReasonCode(),
                checkinRate,
                consecutiveFails = results.TakeWhile(r => r == "fail").Count(),
                source = llm is null ? "rule" : "llm",
                // Present only when the LLM produced content:
                title = llm?.Title,
                progressType = llm is null ? null
                    : (ProgressTypes.All.Contains(llm.ProgressType) ? llm.ProgressType : ProgressTypes.Weekly),
                reason = llm?.Reason,
                description = llm?.Description,
            });
        });

        // Progress history (time series) for a single goal — for trend charts.
        group.MapGet("/{id}/history", async (string id, int? days, ClaimsPrincipal user, MongoContext db) =>
        {
            var userId = user.UserId();
            var goal = await db.Goals.Find(g => g.Id == id && g.UserId == userId).FirstOrDefaultAsync();
            if (goal is null) return Results.NotFound();

            var window = Math.Clamp(days ?? 30, 1, 365);
            var since = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-(window - 1)).ToString("yyyy-MM-dd");
            var points = await db.ProgressSnapshots
                .Find(s => s.UserId == userId && s.GoalId == id && string.Compare(s.Date, since) >= 0)
                .SortBy(s => s.Date)
                .Project(s => new { date = s.Date, progress = s.Progress })
                .ToListAsync();

            return Results.Ok(new { goalId = id, points });
        });

        // Record what the user did with a suggestion (used / custom / skipped).
        group.MapPost("/{weeklyGoalId}/suggestion-feedback", async (string weeklyGoalId,
            SuggestionFeedbackRequest req, ClaimsPrincipal user, MongoContext db) =>
        {
            var userId = user.UserId();
            if (!SuggestionActions.All.Contains(req.Action))
                return Results.BadRequest(new { error = $"action must be one of: {string.Join(", ", SuggestionActions.All)}" });

            var exists = await db.Goals.Find(g => g.Id == weeklyGoalId && g.UserId == userId).AnyAsync();
            if (!exists) return Results.NotFound();

            await db.SuggestionEvents.InsertOneAsync(new SuggestionEvent
            {
                Id = ObjectId.GenerateNewId().ToString(),
                UserId = userId,
                WeeklyGoalId = weeklyGoalId,
                Direction = req.Direction,
                Action = req.Action,
                NewGoalId = req.NewGoalId,
            });
            return Results.NoContent();
        });
    }

    /// <summary>Renders the goal forest as indented "- title (type)" lines for LLM context.</summary>
    private static string RenderTree(List<Goal> goals)
    {
        var childrenByParent = goals
            .Where(g => g.Status != GoalStatuses.Archived)
            .GroupBy(g => g.ParentId)
            .ToDictionary(g => g.Key ?? "", g => g.OrderBy(x => x.Order).ToList());
        var sb = new System.Text.StringBuilder();

        void Walk(string parentKey, int depth)
        {
            if (!childrenByParent.TryGetValue(parentKey, out var kids)) return;
            foreach (var g in kids)
            {
                sb.Append(new string(' ', depth * 2)).Append("- ").Append(g.Title)
                    .Append(" (").Append(g.ProgressType).Append(')').Append('\n');
                Walk(g.Id, depth + 1);
            }
        }

        Walk("", 0);
        return sb.Length == 0 ? "(empty)" : sb.ToString();
    }

    public static DateOnly MondayOf(DateOnly date)
    {
        var diff = ((int)date.DayOfWeek + 6) % 7; // Monday = 0
        return date.AddDays(-diff);
    }

    /// <summary>Trims a free-text field, collapsing empty/whitespace input to null so we never store "".</summary>
    private static string? Normalize(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}

public record WeeklyAttemptRequest(string Result, string? WeekOf);
public record PositionRequest(double X, double Y);
public record SuggestionFeedbackRequest(string Direction, string Action, string? NewGoalId);
