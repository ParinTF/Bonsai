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
            var computed = goal.ProgressType switch
            {
                ProgressTypes.Stages => ProgressCalculator.Stages(goal.Stages),
                ProgressTypes.Numeric => ProgressCalculator.Numeric(goal.Numeric),
                ProgressTypes.Checklist => ProgressCalculator.Checklist(childrenByParent.GetValueOrDefault(goal.Id)),
                ProgressTypes.Rollup => ProgressCalculator.Rollup(childrenByParent.GetValueOrDefault(goal.Id)),
                ProgressTypes.Daily => ProgressCalculator.Daily(checkinsByGoal.GetValueOrDefault(goal.Id)),
                ProgressTypes.Weekly => ProgressCalculator.Weekly(attemptsByGoal.GetValueOrDefault(goal.Id)),
                _ => goal.Progress, // manual
            };
            // A goal marked "done" always reads 100%, even a rollup with unfinished
            // children — this must run AFTER the switch (using the freshly computed
            // value as the fallback) and BEFORE parents read goal.Progress below,
            // since Rollup() averages children by their already-written Progress.
            goal.Progress = ProgressCalculator.Effective(goal.Status, computed);
        }

        // Persist computed values so list queries elsewhere stay consistent.
        var writes = goals.Select(g => new UpdateOneModel<Goal>(
            Builders<Goal>.Filter.Eq(x => x.Id, g.Id),
            Builders<Goal>.Update.Set(x => x.Progress, g.Progress))).ToList<WriteModel<Goal>>();
        await db.Goals.BulkWriteAsync(writes);

        await SnapshotProgressAsync(userId, goals);
        return goals;
    }

    /// <summary>
    /// Records today's progress for each non-archived goal as an idempotent upsert
    /// (one row per goal per UTC day), building the time series that trend charts read.
    /// </summary>
    private async Task SnapshotProgressAsync(string userId, List<Goal> goals)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd");
        var snapshots = goals
            .Where(g => g.Status != GoalStatuses.Archived)
            .Select(g => new UpdateOneModel<ProgressSnapshot>(
                Builders<ProgressSnapshot>.Filter.Where(s =>
                    s.UserId == userId && s.GoalId == g.Id && s.Date == today),
                Builders<ProgressSnapshot>.Update
                    .Set(s => s.Progress, g.Progress)
                    .SetOnInsert(s => s.UserId, userId)
                    .SetOnInsert(s => s.GoalId, g.Id)
                    .SetOnInsert(s => s.Date, today))
            { IsUpsert = true })
            .ToList<WriteModel<ProgressSnapshot>>();

        if (snapshots.Count > 0)
            await db.ProgressSnapshots.BulkWriteAsync(snapshots, new BulkWriteOptions { IsOrdered = false });
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
