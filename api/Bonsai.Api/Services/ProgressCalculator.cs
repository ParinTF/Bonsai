using Bonsai.Api.Models;

namespace Bonsai.Api.Services;

/// <summary>
/// Pure progress math for every progressType — no I/O, fully unit-testable.
/// All results are 0-100, rounded to 1 decimal.
/// </summary>
public static class ProgressCalculator
{
    /// <summary>stages: % of stages marked done.</summary>
    public static double Stages(List<Stage>? stages) =>
        stages is not { Count: > 0 } ? 0 : Math.Round(stages.Count(s => s.Done) * 100.0 / stages.Count, 1);

    /// <summary>numeric: current / target, clamped to [0, 100]. target <= 0 yields 0.</summary>
    public static double Numeric(NumericProgress? n) =>
        n is null || n.Target <= 0 ? 0 : Math.Round(Math.Clamp(n.Current / n.Target, 0, 1) * 100, 1);

    /// <summary>checklist: % of non-archived children with status "done".</summary>
    public static double Checklist(IEnumerable<Goal>? children)
    {
        var items = children?.Where(c => c.Status != GoalStatuses.Archived).ToList();
        return items is not { Count: > 0 } ? 0 : Math.Round(items.Count(c => c.Status == GoalStatuses.Done) * 100.0 / items.Count, 1);
    }

    /// <summary>rollup: average progress of non-archived children; 0 with no children.</summary>
    public static double Rollup(IEnumerable<Goal>? children)
    {
        var items = children?.Where(c => c.Status != GoalStatuses.Archived).ToList();
        return items is not { Count: > 0 } ? 0 : Math.Round(items.Average(c => c.Progress), 1);
    }

    /// <summary>daily: % of the last 7 days with a done checkin. Count is clamped to [0, 7].</summary>
    public static double Daily(int doneCheckinsLast7Days) =>
        Math.Round(Math.Clamp(doneCheckinsLast7Days, 0, 7) / 7.0 * 100, 1);

    /// <summary>weekly: % of "pass" among the 4 most recent recorded weeks.</summary>
    public static double Weekly(IEnumerable<WeeklyAttempt>? attempts)
    {
        var recent = attempts?.OrderByDescending(a => a.WeekOf).Take(4).ToList();
        return recent is not { Count: > 0 } ? 0 : Math.Round(recent.Count(a => a.Result == "pass") * 100.0 / recent.Count, 1);
    }

    /// <summary>
    /// A goal the user has explicitly marked "done" always shows 100%, no matter what
    /// its type would otherwise compute — including a rollup whose children aren't all
    /// finished yet. Any other status passes the computed value through unchanged.
    /// </summary>
    public static double Effective(string status, double computed) =>
        status == GoalStatuses.Done ? 100 : computed;

    /// <summary>
    /// weekly streak: consecutive "pass" results counting back from the most recent
    /// recorded week. A "fail" (or no attempts) yields 0. Gaps in recorded weeks are
    /// not inspected — the streak is over the ordered sequence of recorded results.
    /// </summary>
    public static int WeeklyStreak(IEnumerable<WeeklyAttempt>? attempts)
    {
        var ordered = attempts?.OrderByDescending(a => a.WeekOf);
        if (ordered is null) return 0;

        var streak = 0;
        foreach (var a in ordered)
        {
            if (a.Result != "pass") break;
            streak++;
        }
        return streak;
    }

    /// <summary>
    /// Consecutive-day streak ending today, or yesterday if today isn't checked yet
    /// (an unchecked today doesn't break the streak).
    /// </summary>
    public static int Streak(IReadOnlySet<DateOnly> checkedDates, DateOnly today)
    {
        var day = today;
        if (!checkedDates.Contains(day)) day = day.AddDays(-1);

        var streak = 0;
        while (checkedDates.Contains(day))
        {
            streak++;
            day = day.AddDays(-1);
        }
        return streak;
    }
}
