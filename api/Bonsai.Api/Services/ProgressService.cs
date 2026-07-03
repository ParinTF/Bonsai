using Bonsai.Api.Models;
using MongoDB.Driver;

namespace Bonsai.Api.Services;

/// <summary>
/// Computes Goal.Progress (0-100) for every progressType.
///
/// - stages:    % of stages marked done
/// - numeric:   current / target
/// - checklist: % of direct children with status "done"
/// - manual:    stored value, untouched
/// - rollup:    average progress of direct (non-archived) children
/// - daily:     % of days with a done checkin over the last 7 days
/// - weekly:    % of "pass" results over the last 4 recorded weeks
/// </summary>
public class ProgressService(MongoContext db)
{
    public async Task<List<Goal>> ComputeTreeAsync(string userId)
    {
        var goals = await db.Goals.Find(g => g.UserId == userId).SortBy(g => g.Order).ToListAsync();
        if (goals.Count == 0) return goals;

        var goalIds = goals.Select(g => g.Id).ToList();
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
                ProgressTypes.Stages => PercentDone(goal.Stages),
                ProgressTypes.Numeric => NumericPercent(goal.Numeric),
                ProgressTypes.Checklist => ChecklistPercent(childrenByParent.GetValueOrDefault(goal.Id)),
                ProgressTypes.Rollup => RollupPercent(childrenByParent.GetValueOrDefault(goal.Id)),
                ProgressTypes.Daily => Math.Round(checkinsByGoal.GetValueOrDefault(goal.Id) / 7.0 * 100, 1),
                ProgressTypes.Weekly => WeeklyPercent(attemptsByGoal.GetValueOrDefault(goal.Id)),
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

    private static double PercentDone(List<Stage>? stages) =>
        stages is not { Count: > 0 } ? 0 : Math.Round(stages.Count(s => s.Done) * 100.0 / stages.Count, 1);

    private static double NumericPercent(NumericProgress? n) =>
        n is null || n.Target <= 0 ? 0 : Math.Round(Math.Clamp(n.Current / n.Target, 0, 1) * 100, 1);

    private static double ChecklistPercent(List<Goal>? children)
    {
        var items = children?.Where(c => c.Status != GoalStatuses.Archived).ToList();
        return items is not { Count: > 0 } ? 0 : Math.Round(items.Count(c => c.Status == GoalStatuses.Done) * 100.0 / items.Count, 1);
    }

    private static double RollupPercent(List<Goal>? children)
    {
        var items = children?.Where(c => c.Status != GoalStatuses.Archived).ToList();
        return items is not { Count: > 0 } ? 0 : Math.Round(items.Average(c => c.Progress), 1);
    }

    private static double WeeklyPercent(List<WeeklyAttempt>? attempts)
    {
        var recent = attempts?.OrderByDescending(a => a.WeekOf).Take(4).ToList();
        return recent is not { Count: > 0 } ? 0 : Math.Round(recent.Count(a => a.Result == "pass") * 100.0 / recent.Count, 1);
    }

    /// <summary>Consecutive-day streak ending today (or yesterday if today not yet checked).</summary>
    public async Task<int> CurrentStreakAsync(string userId, string goalId)
    {
        var dates = (await db.Checkins
                .Find(c => c.UserId == userId && c.GoalId == goalId && c.Done)
                .Project(c => c.Date)
                .ToListAsync())
            .Select(DateOnly.Parse)
            .ToHashSet();

        var day = DateOnly.FromDateTime(DateTime.UtcNow);
        if (!dates.Contains(day)) day = day.AddDays(-1); // today not checked yet doesn't break the streak

        var streak = 0;
        while (dates.Contains(day))
        {
            streak++;
            day = day.AddDays(-1);
        }
        return streak;
    }
}
