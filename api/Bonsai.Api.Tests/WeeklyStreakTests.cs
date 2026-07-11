using Bonsai.Api.Models;
using Bonsai.Api.Services;

namespace Bonsai.Api.Tests;

public class WeeklyStreakTests
{
    // weekOf values just need to sort correctly; results are given newest-last here
    // and the calculator orders by weekOf descending internally.
    private static List<WeeklyAttempt> Make(params (string week, string result)[] items) =>
        [.. items.Select(i => new WeeklyAttempt { WeekOf = i.week, Result = i.result })];

    [Fact]
    public void Null_IsZero() => Assert.Equal(0, ProgressCalculator.WeeklyStreak(null));

    [Fact]
    public void Empty_IsZero() => Assert.Equal(0, ProgressCalculator.WeeklyStreak([]));

    [Fact]
    public void LatestFail_IsZero() =>
        Assert.Equal(0, ProgressCalculator.WeeklyStreak(Make(
            ("2026-06-29", "pass"), ("2026-07-06", "fail"))));

    [Fact]
    public void SinglePass_IsOne() =>
        Assert.Equal(1, ProgressCalculator.WeeklyStreak(Make(("2026-07-06", "pass"))));

    [Fact]
    public void ThreeConsecutivePasses_IsThree() =>
        Assert.Equal(3, ProgressCalculator.WeeklyStreak(Make(
            ("2026-06-22", "pass"), ("2026-06-29", "pass"), ("2026-07-06", "pass"))));

    [Fact]
    public void PassRunBrokenByEarlierFail_CountsOnlyRecentRun() =>
        Assert.Equal(2, ProgressCalculator.WeeklyStreak(Make(
            ("2026-06-15", "pass"), ("2026-06-22", "fail"), ("2026-06-29", "pass"), ("2026-07-06", "pass"))));

    [Fact]
    public void OrderingIsByWeekOf_NotListOrder() =>
        // newest (2026-07-06) is a pass, previous a fail → streak 1, regardless of list order
        Assert.Equal(1, ProgressCalculator.WeeklyStreak(Make(
            ("2026-07-06", "pass"), ("2026-06-29", "fail"))));
}
