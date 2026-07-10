using System.Security.Claims;
using Bonsai.Api.Models;
using Bonsai.Api.Services;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Bonsai.Api.Endpoints;

public static class HabitEndpoints
{
    public static void MapHabitEndpoints(this WebApplication app)
    {
        // ?date= is the CLIENT's local date — the server has no idea what "today"
        // means in the user's timezone.
        app.MapGet("/today", async (string? date, ClaimsPrincipal user, MongoContext db, ProgressService progress) =>
        {
            var userId = user.UserId();
            var today = date ?? DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd");
            if (!DateOnly.TryParse(today, out var todayDate))
                return Results.BadRequest(new { error = "date must be yyyy-MM-dd" });

            var habits = await db.Goals
                .Find(g => g.UserId == userId && g.ProgressType == ProgressTypes.Daily && g.Status == GoalStatuses.Active)
                .SortBy(g => g.Order)
                .ToListAsync();

            var todayCheckins = await db.Checkins
                .Find(c => c.UserId == userId && c.Date == today && c.Done)
                .ToListAsync();
            var checkedIds = todayCheckins.Select(c => c.GoalId).ToHashSet();

            var result = new List<object>();
            foreach (var h in habits)
            {
                result.Add(new
                {
                    goal = h,
                    checkedToday = checkedIds.Contains(h.Id),
                    streak = await progress.CurrentStreakAsync(userId, h.Id, todayDate),
                });
            }

            return Results.Ok(new { date = today, habits = result });
        }).RequireAuthorization();

        // Month view for the calendar heatmap: per-day done-checkin counts
        // plus the current number of active daily habits.
        app.MapGet("/checkins", async (string? month, ClaimsPrincipal user, MongoContext db) =>
        {
            var userId = user.UserId();
            var m = month ?? DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM");
            if (!System.Text.RegularExpressions.Regex.IsMatch(m, @"^\d{4}-\d{2}$"))
                return Results.BadRequest(new { error = "month must be yyyy-MM" });

            var habitCount = await db.Goals.CountDocumentsAsync(g =>
                g.UserId == userId && g.ProgressType == ProgressTypes.Daily && g.Status == GoalStatuses.Active);

            var prefix = m + "-";
            var checkins = await db.Checkins
                .Find(c => c.UserId == userId && c.Done && c.Date.StartsWith(prefix))
                .ToListAsync();

            var days = checkins
                .GroupBy(c => c.Date)
                .Select(g => new { date = g.Key, doneCount = g.Count() })
                .OrderBy(d => d.date);

            return Results.Ok(new { month = m, habitCount, days });
        }).RequireAuthorization();

        app.MapPatch("/habits/{id}/checkin", async (string id, string? date, bool? done, ClaimsPrincipal user, MongoContext db) =>
        {
            var userId = user.UserId();
            var goal = await db.Goals.Find(g => g.Id == id && g.UserId == userId).FirstOrDefaultAsync();
            if (goal is null) return Results.NotFound();
            if (goal.ProgressType != ProgressTypes.Daily)
                return Results.BadRequest(new { error = "Goal is not a daily habit" });

            var day = date ?? DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd");
            if (!DateOnly.TryParse(day, out _))
                return Results.BadRequest(new { error = "date must be yyyy-MM-dd" });

            // Default: toggle. Explicit ?done= overrides.
            var existing = await db.Checkins.Find(c => c.UserId == userId && c.GoalId == id && c.Date == day).FirstOrDefaultAsync();
            var newDone = done ?? !(existing?.Done ?? false);

            await db.Checkins.ReplaceOneAsync(
                c => c.UserId == userId && c.GoalId == id && c.Date == day,
                new Checkin
                {
                    Id = existing?.Id ?? ObjectId.GenerateNewId().ToString(),
                    UserId = userId,
                    GoalId = id,
                    Date = day,
                    Done = newDone,
                },
                new ReplaceOptions { IsUpsert = true });

            return Results.Ok(new { goalId = id, date = day, done = newDone });
        }).RequireAuthorization();
    }
}
