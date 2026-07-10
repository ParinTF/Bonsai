using Bonsai.Api.Models;
using MongoDB.Driver;

namespace Bonsai.Api.Services;

/// <summary>
/// Loads a user's goals and fills in Goal.Progress for every progressType.
/// The math itself lives in <see cref="ProgressCalculator"/>.
/// </summary>
public class ProgressService(MongoContext db)
{
    public async Task<List<Goal>> ComputeTreeAsync(string userId)
    {
        var goals = await db.Goals.Find(g => g.UserId == userId).SortBy(g => g.Order).ToListAsync();
        if (goals.Count == 0) return goals;

        var since = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-6).ToString("yyyy-MM-dd");
        var checkins = await db.Checkins
            .Find(c => c.UserId == userId && c.Done && string.Compare(c.Date, since) >= 0)
            .ToListAsync();
        var attempts = await db.WeeklyAttempts.Find(a => a.UserId == userId).ToListAsync();

        var checkinsByGoal = checkins.GroupBy(c => c.GoalId).ToDictionary(g => g.Key, g => g.Count());
        var attemptsByGoal = attempts.GroupBy(a => a.GoalId).ToDictionary(g => g.Key, g => g.ToList());
        var childrenByParent = goals.Where(g => g.ParentId != null)
            .GroupBy(g => g.ParentId!)
            .ToDictionary(g => g.Key, g => g.ToList());

        // Deepest first so rollup parents see already-computed children.
        foreach (var goal in goals.OrderByDescending(g => g.Ancestors.Count))
        {
            goal.Progress = goal.ProgressType switch
            {
                ProgressTypes.Stages => ProgressCalculator.Stages(goal.Stages),
                ProgressTypes.Numeric => ProgressCalculator.Numeric(goal.Numeric),
                ProgressTypes.Checklist => ProgressCalculator.Checklist(childrenByParent.GetValueOrDefault(goal.Id)),
                ProgressTypes.Rollup => ProgressCalculator.Rollup(childrenByParent.GetValueOrDefault(goal.Id)),
                ProgressTypes.Daily => ProgressCalculator.Daily(checkinsByGoal.GetValueOrDefault(goal.Id)),
                ProgressTypes.Weekly => ProgressCalculator.Weekly(attemptsByGoal.GetValueOrDefault(goal.Id)),
                _ => goal.Progress, // manual
            };
        }

        // Persist computed values so list queries elsewhere stay consistent.
        var writes = goals.Select(g => new UpdateOneModel<Goal>(
            Builders<Goal>.Filter.Eq(x => x.Id, g.Id),
            Builders<Goal>.Update.Set(x => x.Progress, g.Progress))).ToList<WriteModel<Goal>>();
        await db.Goals.BulkWriteAsync(writes);

        return goals;
    }

    public async Task<int> CurrentStreakAsync(string userId, string goalId, DateOnly? today = null)
    {
        var dates = (await db.Checkins
                .Find(c => c.UserId == userId && c.GoalId == goalId && c.Done)
                .Project(c => c.Date)
                .ToListAsync())
            .Select(DateOnly.Parse)
            .ToHashSet();

        return ProgressCalculator.Streak(dates, today ?? DateOnly.FromDateTime(DateTime.UtcNow));
    }
}
