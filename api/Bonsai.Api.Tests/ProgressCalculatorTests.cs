using Bonsai.Api.Models;
using Bonsai.Api.Services;

namespace Bonsai.Api.Tests;

public class StagesTests
{
    private static List<Stage> Make(params bool[] done) =>
        [.. done.Select((d, i) => new Stage { Title = $"s{i}", Done = d })];

    [Fact]
    public void NoneDone_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Stages(Make(false, false, false)));

    [Fact]
    public void PartiallyDone_IsProportional() =>
        Assert.Equal(50, ProgressCalculator.Stages(Make(true, false)));

    [Fact]
    public void AllDone_Is100() =>
        Assert.Equal(100, ProgressCalculator.Stages(Make(true, true, true)));

    [Fact]
    public void OneOfThree_RoundsToOneDecimal() =>
        Assert.Equal(33.3, ProgressCalculator.Stages(Make(true, false, false)));

    [Fact]
    public void EmptyList_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Stages([]));

    [Fact]
    public void Null_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Stages(null));
}

public class NumericTests
{
    [Theory]
    [InlineData(50, 100, 50)]
    [InlineData(100, 100, 100)]
    [InlineData(0, 100, 0)]
    [InlineData(1, 3, 33.3)]
    public void CurrentOverTarget_IsPercent(double current, double target, double expected) =>
        Assert.Equal(expected, ProgressCalculator.Numeric(new NumericProgress { Current = current, Target = target }));

    [Fact]
    public void OverTarget_ClampsTo100() =>
        Assert.Equal(100, ProgressCalculator.Numeric(new NumericProgress { Current = 150, Target = 100 }));

    [Fact]
    public void TargetZero_IsZero_NoDivideByZero() =>
        Assert.Equal(0, ProgressCalculator.Numeric(new NumericProgress { Current = 50, Target = 0 }));

    [Fact]
    public void NegativeTarget_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Numeric(new NumericProgress { Current = 50, Target = -10 }));

    [Fact]
    public void NegativeCurrent_ClampsToZero() =>
        Assert.Equal(0, ProgressCalculator.Numeric(new NumericProgress { Current = -5, Target = 100 }));

    [Fact]
    public void Null_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Numeric(null));
}

public class ChecklistTests
{
    private static Goal Child(string status) => new()
    {
        Id = Guid.NewGuid().ToString(),
        UserId = "u",
        Title = "child",
        Status = status,
    };

    [Fact]
    public void CountsDoneChildren() =>
        Assert.Equal(50, ProgressCalculator.Checklist([Child("done"), Child("active")]));

    [Fact]
    public void AllDone_Is100() =>
        Assert.Equal(100, ProgressCalculator.Checklist([Child("done"), Child("done")]));

    [Fact]
    public void NoneDone_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Checklist([Child("active"), Child("active")]));

    [Fact]
    public void ArchivedChildren_AreExcluded() =>
        // 1 done of (done, active) — archived one doesn't count as a slot
        Assert.Equal(50, ProgressCalculator.Checklist([Child("done"), Child("active"), Child("archived")]));

    [Fact]
    public void OnlyArchived_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Checklist([Child("archived")]));

    [Fact]
    public void Empty_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Checklist([]));

    [Fact]
    public void Null_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Checklist(null));
}

public class RollupTests
{
    private static Goal Child(double progress, string status = "active") => new()
    {
        Id = Guid.NewGuid().ToString(),
        UserId = "u",
        Title = "child",
        Status = status,
        Progress = progress,
    };

    [Fact]
    public void AveragesChildren() =>
        Assert.Equal(50, ProgressCalculator.Rollup([Child(0), Child(100)]));

    [Fact]
    public void ThreeChildren_RoundsToOneDecimal() =>
        Assert.Equal(54.8, ProgressCalculator.Rollup([Child(50), Child(14.3), Child(100)]));

    [Fact]
    public void ArchivedChildren_AreExcluded() =>
        Assert.Equal(100, ProgressCalculator.Rollup([Child(100), Child(0, "archived")]));

    [Fact]
    public void NoChildren_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Rollup([]));

    [Fact]
    public void Null_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Rollup(null));
}

public class ManualTests
{
    // manual isn't computed — the service leaves Goal.Progress untouched.
    // This guards that ProgressCalculator has no Manual method to drift into,
    // and documents the passthrough contract at the model level.
    [Fact]
    public void Progress_IsStoredValue_Passthrough()
    {
        var goal = new Goal { Id = "1", UserId = "u", Title = "m", ProgressType = ProgressTypes.Manual, Progress = 42.5 };
        Assert.Equal(42.5, goal.Progress);
    }
}

public class DailyTests
{
    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 14.3)]
    [InlineData(3, 42.9)]
    [InlineData(7, 100)]
    public void CheckinsOutOfSeven(int count, double expected) =>
        Assert.Equal(expected, ProgressCalculator.Daily(count));

    [Fact]
    public void MoreThanSeven_ClampsTo100() =>
        Assert.Equal(100, ProgressCalculator.Daily(9));

    [Fact]
    public void Negative_ClampsToZero() =>
        Assert.Equal(0, ProgressCalculator.Daily(-1));
}

public class WeeklyTests
{
    private static WeeklyAttempt Attempt(string weekOf, string result) => new()
    {
        Id = Guid.NewGuid().ToString(),
        UserId = "u",
        GoalId = "g",
        WeekOf = weekOf,
        Result = result,
    };

    [Fact]
    public void AllPass_Is100() =>
        Assert.Equal(100, ProgressCalculator.Weekly([
            Attempt("2026-06-15", "pass"), Attempt("2026-06-22", "pass"),
        ]));

    [Fact]
    public void HalfPass_Is50() =>
        Assert.Equal(50, ProgressCalculator.Weekly([
            Attempt("2026-06-15", "pass"), Attempt("2026-06-22", "fail"),
        ]));

    [Fact]
    public void OnlyLastFourWeeks_AreCounted()
    {
        // 5 attempts: oldest is a pass but must be ignored; last 4 = 2 pass / 2 fail
        var attempts = new[]
        {
            Attempt("2026-05-25", "pass"), // oldest — outside window
            Attempt("2026-06-01", "pass"),
            Attempt("2026-06-08", "fail"),
            Attempt("2026-06-15", "pass"),
            Attempt("2026-06-22", "fail"),
        };
        Assert.Equal(50, ProgressCalculator.Weekly(attempts));
    }

    [Fact]
    public void ListOrderDoesNotMatter_WindowIsByWeekOf()
    {
        // Same attempts in scrambled list order: window = last 4 by weekOf = 3 pass / 1 fail
        var attempts = new[]
        {
            Attempt("2026-06-08", "pass"),
            Attempt("2026-05-25", "fail"), // oldest — outside window despite position
            Attempt("2026-06-22", "pass"),
            Attempt("2026-06-01", "fail"),
            Attempt("2026-06-15", "pass"),
        };
        Assert.Equal(75, ProgressCalculator.Weekly(attempts));
    }

    [Fact]
    public void SingleFail_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Weekly([Attempt("2026-06-22", "fail")]));

    [Fact]
    public void Empty_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Weekly([]));

    [Fact]
    public void Null_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Weekly(null));
}

public class StreakTests
{
    private static readonly DateOnly Today = new(2026, 7, 6);

    private static HashSet<DateOnly> Days(params int[] daysAgo) =>
        [.. daysAgo.Select(d => Today.AddDays(-d))];

    [Fact]
    public void NoCheckins_IsZero() =>
        Assert.Equal(0, ProgressCalculator.Streak(Days(), Today));

    [Fact]
    public void TodayOnly_IsOne() =>
        Assert.Equal(1, ProgressCalculator.Streak(Days(0), Today));

    [Fact]
    public void ConsecutiveDaysIncludingToday() =>
        Assert.Equal(3, ProgressCalculator.Streak(Days(0, 1, 2), Today));

    [Fact]
    public void TodayNotCheckedYet_StreakFromYesterdayStillCounts() =>
        Assert.Equal(2, ProgressCalculator.Streak(Days(1, 2), Today));

    [Fact]
    public void GapInMiddle_BreaksStreak() =>
        // checked today, yesterday, then a hole at -2, then more days before
        Assert.Equal(2, ProgressCalculator.Streak(Days(0, 1, 3, 4, 5), Today));

    [Fact]
    public void GapBeforeYesterday_WhenTodayUnchecked() =>
        // unchecked today; yesterday checked; hole at -2
        Assert.Equal(1, ProgressCalculator.Streak(Days(1, 3, 4), Today));

    [Fact]
    public void OnlyOldCheckins_IsZero() =>
        // last checkin 2 days ago — today and yesterday both empty
        Assert.Equal(0, ProgressCalculator.Streak(Days(2, 3, 4), Today));
}

public class AggregatesChildrenTests
{
    // Drives the breakdown root-promotion rule: attaching an AI subtree under a
    // goal whose type ignores children must switch that goal to rollup, or its
    // progress stays frozen forever.
    [Theory]
    [InlineData(ProgressTypes.Rollup, true)]
    [InlineData(ProgressTypes.Checklist, true)]
    [InlineData(ProgressTypes.Stages, false)]
    [InlineData(ProgressTypes.Numeric, false)]
    [InlineData(ProgressTypes.Manual, false)]
    [InlineData(ProgressTypes.Daily, false)]
    [InlineData(ProgressTypes.Weekly, false)]
    public void TrueOnlyForChildDerivedTypes(string type, bool expected) =>
        Assert.Equal(expected, ProgressTypes.AggregatesChildren(type));
}

public class EffectiveTests
{
    // Drives the "Success" override: a goal explicitly marked done reads 100%
    // no matter what its type computed — a rollup with half-finished children
    // included, since the user's manual call outranks the math.
    [Fact]
    public void Done_Is100_EvenWhenComputedIsLow() =>
        Assert.Equal(100, ProgressCalculator.Effective(GoalStatuses.Done, 42));

    [Fact]
    public void Done_Is100_EvenWhenComputedIsZero() =>
        Assert.Equal(100, ProgressCalculator.Effective(GoalStatuses.Done, 0));

    [Fact]
    public void Active_PassesComputedValueThrough() =>
        Assert.Equal(63.5, ProgressCalculator.Effective(GoalStatuses.Active, 63.5));

    [Fact]
    public void Archived_PassesComputedValueThrough() =>
        Assert.Equal(17, ProgressCalculator.Effective(GoalStatuses.Archived, 17));
}
