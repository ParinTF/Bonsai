using Bonsai.Api.Services;

namespace Bonsai.Api.Tests;

public class WeeklySuggestionCalculatorTests
{
    // --- The 4 core rules ---

    [Fact]
    public void PassWithHighCheckinRate_IsHarder() =>
        Assert.Equal(Direction.Harder, WeeklySuggestionCalculator.Calculate(["pass"], 0.90));

    [Fact]
    public void PassWithLowCheckinRate_IsSame() =>
        Assert.Equal(Direction.Same, WeeklySuggestionCalculator.Calculate(["pass"], 0.50));

    [Fact]
    public void FirstFail_IsRetry() =>
        Assert.Equal(Direction.Retry, WeeklySuggestionCalculator.Calculate(["fail", "pass"], 0.90));

    [Fact]
    public void TwoFailsInARow_IsEasier() =>
        Assert.Equal(Direction.Easier, WeeklySuggestionCalculator.Calculate(["fail", "fail"], 0.20));

    // --- Boundary of the 85% threshold ---

    [Fact]
    public void PassExactlyAtThreshold_IsSame() => // > 85% is Harder, so 85% itself is Same
        Assert.Equal(Direction.Same, WeeklySuggestionCalculator.Calculate(["pass"], 0.85));

    [Fact]
    public void PassJustAboveThreshold_IsHarder() =>
        Assert.Equal(Direction.Harder, WeeklySuggestionCalculator.Calculate(["pass"], 0.851));

    // --- Edge cases ---

    [Fact]
    public void NoPriorHistory_SingleFail_IsRetry() => // first-ever attempt, a fail
        Assert.Equal(Direction.Retry, WeeklySuggestionCalculator.Calculate(["fail"], null));

    [Fact]
    public void NoPriorHistory_SinglePass_NoDailyChildren_IsHarder() => // null rate = no strain signal
        Assert.Equal(Direction.Harder, WeeklySuggestionCalculator.Calculate(["pass"], null));

    [Fact]
    public void PassWithEmptyCheckins_IsSame() => // daily children exist but none done → rate 0
        Assert.Equal(Direction.Same, WeeklySuggestionCalculator.Calculate(["pass"], 0.0));

    [Fact]
    public void ThreeFailsInARow_IsEasier() =>
        Assert.Equal(Direction.Easier, WeeklySuggestionCalculator.Calculate(["fail", "fail", "fail"], null));

    [Fact]
    public void FailAfterPass_OnlyCountsLatestFail_IsRetry() => // pass breaks the fail streak
        Assert.Equal(Direction.Retry, WeeklySuggestionCalculator.Calculate(["fail", "pass", "fail"], 0.9));

    [Fact]
    public void LatestPass_IgnoresOlderFails_IsHarder() =>
        Assert.Equal(Direction.Harder, WeeklySuggestionCalculator.Calculate(["pass", "fail", "fail"], null));

    [Fact]
    public void EmptyResults_Throws() =>
        Assert.Throws<ArgumentException>(() => WeeklySuggestionCalculator.Calculate([], null));

    // --- Token / ReasonCode mapping ---

    [Theory]
    [InlineData(Direction.Harder, "harder", "strong_pass")]
    [InlineData(Direction.Same, "same", "strained_pass")]
    [InlineData(Direction.Retry, "retry", "first_fail")]
    [InlineData(Direction.Easier, "easier", "repeated_fail")]
    public void TokenAndReasonCode_Map(Direction d, string token, string reason)
    {
        Assert.Equal(token, d.Token());
        Assert.Equal(reason, d.ReasonCode());
    }
}
