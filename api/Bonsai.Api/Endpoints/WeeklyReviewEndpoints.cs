using System.Security.Claims;
using Bonsai.Api.Models;
using Bonsai.Api.Services;
using MongoDB.Driver;

namespace Bonsai.Api.Endpoints;

public static class WeeklyReviewEndpoints
{
    public static void MapWeeklyReviewEndpoints(this WebApplication app)
    {
        // A single "how did this week go" digest: weekly commitments (recorded yet?
        // passed?) and daily habits (days done / streak). ?monday= and ?today= are the
        // CLIENT's local dates so the window matches the user's timezone.
        app.MapGet("/me/weekly-review", async (string? monday, string? today,
            ClaimsPrincipal user, MongoContext db, ProgressService progress) =>
        {
            var userId = user.UserId();

            var todayDate = DateOnly.TryParse(today, out var td) ? td : DateOnly.FromDateTime(DateTime.UtcNow);
            var mondayDate = DateOnly.TryParse(monday, out var md) ? md : GoalEndpoints.MondayOf(todayDate);
            var weekOf = mondayDate.ToString("yyyy-MM-dd");
            var weekDates = Enumerable.Range(0, 7).Select(i => mondayDate.AddDays(i).ToString("yyyy-MM-dd")).ToHashSet();

            var goals = await db.Goals
                .Find(g => g.UserId == userId && g.Status == GoalStatuses.Active)
                .ToListAsync();

            // --- Weekly commitments ---
            var weeklyGoals = goals.Where(g => g.ProgressType == ProgressTypes.Weekly).ToList();
            var weeklyIds = weeklyGoals.Select(g => g.Id).ToList();
            var attempts = await db.WeeklyAttempts
                .Find(a => a.UserId == userId && weeklyIds.Contains(a.GoalId))
                .ToListAsync();

            var weekly = weeklyGoals.Select(g =>
            {
                var mine = attempts.Where(a => a.GoalId == g.Id).ToList();
                var thisWeek = mine.FirstOrDefault(a => a.WeekOf == weekOf);
                return new
                {
                    goal = g,
                    recorded = thisWeek is not null,
                    result = thisWeek?.Result,
                    streak = ProgressCalculator.WeeklyStreak(mine),
                };
            }).ToList();

            // --- Daily habits ---
            var dailyGoals = goals.Where(g => g.ProgressType == ProgressTypes.Daily).ToList();
            var dailyIds = dailyGoals.Select(g => g.Id).ToList();
            var doneCheckins = await db.Checkins
                .Find(c => c.UserId == userId && dailyIds.Contains(c.GoalId) && c.Done)
                .ToListAsync();
            var doneByGoal = doneCheckins
                .GroupBy(c => c.GoalId)
                .ToDictionary(g => g.Key, g => g.Select(c => c.Date).ToHashSet());

            var daily = new List<object>();
            foreach (var g in dailyGoals)
            {
                var dates = doneByGoal.GetValueOrDefault(g.Id) ?? [];
                daily.Add(new
                {
                    goal = g,
                    daysDone = dates.Count(weekDates.Contains),
                    streak = await progress.CurrentStreakAsync(userId, g.Id, todayDate),
                });
            }

            return Results.Ok(new
            {
                weekOf,
                weekly,
                daily,
                weeklyRecorded = weekly.Count(w => w.recorded),
                weeklyTotal = weekly.Count,
            });
        }).RequireAuthorization();
    }
}
