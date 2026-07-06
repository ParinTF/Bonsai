using System.Security.Claims;
using Bonsai.Api.Models;
using Bonsai.Api.Services;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Bonsai.Api.Endpoints;

public record CreateGoalRequest(string Title, string? ParentId, string ProgressType,
    List<Stage>? Stages, NumericProgress? Numeric);

public record UpdateGoalRequest(string? Title, string? Status, string? ProgressType,
    List<Stage>? Stages, NumericProgress? Numeric, double? Progress, int? Order);

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
            var weekly = all.Where(g => g.ProgressType == ProgressTypes.Weekly && g.Status == GoalStatuses.Active).ToList();

            var ids = weekly.Select(g => g.Id).ToList();
            var attempts = await db.WeeklyAttempts
                .Find(a => a.UserId == userId && ids.Contains(a.GoalId))
                .ToListAsync();

            return Results.Ok(weekly.Select(g => new
            {
                goal = g,
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
    }

    public static DateOnly MondayOf(DateOnly date)
    {
        var diff = ((int)date.DayOfWeek + 6) % 7; // Monday = 0
        return date.AddDays(-diff);
    }
}

public record WeeklyAttemptRequest(string Result, string? WeekOf);
public record PositionRequest(double X, double Y);
