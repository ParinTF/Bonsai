namespace Bonsai.Api.Services;

/// <summary>Which way to nudge the next weekly commitment after an attempt.</summary>
public enum Direction { Harder, Same, Retry, Easier }

/// <summary>
/// Pure rule-based "which direction" decision for the next weekly goal — no I/O,
/// fully unit-testable, same shape as ProgressCalculator. This is layer 1; the LLM
/// content layer (layer 2) only runs after this picks a direction.
///
/// Rules, evaluated against the most recent attempts (newest first):
///   1. latest fail, preceded by another fail  → Easier  (two in a row: too hard)
///   2. latest fail (first one)                 → Retry   (one miss isn't a trend)
///   3. latest pass, checkin rate &gt; 85%        → Harder  (cruising: level up)
///   4. latest pass, checkin rate ≤ 85%         → Same    (passed, but it was a strain)
/// A null checkin rate (goal has no daily children to measure) counts as "not a
/// strain", so a clean pass with no habits still suggests Harder.
/// </summary>
public static class WeeklySuggestionCalculator
{
    /// <summary>Checkin rate above this on a passing week is treated as comfortable.</summary>
    public const double ComfortableCheckinRate = 0.85;

    /// <param name="recentResults">"pass"/"fail" results, newest week first. Must be non-empty.</param>
    /// <param name="checkinRate">Done-checkin completion rate (0-1) of the goal's daily-habit
    /// children during the latest week, or null when the goal has no daily children.</param>
    public static Direction Calculate(IReadOnlyList<string> recentResults, double? checkinRate)
    {
        if (recentResults.Count == 0)
            throw new ArgumentException("At least one weekly result is required", nameof(recentResults));

        var consecutiveFails = recentResults.TakeWhile(r => r == "fail").Count();

        if (consecutiveFails >= 2) return Direction.Easier;
        if (consecutiveFails == 1) return Direction.Retry;

        // Latest attempt is a pass.
        return checkinRate is { } rate && rate <= ComfortableCheckinRate ? Direction.Same : Direction.Harder;
    }

    /// <summary>Stable lowercase token used in the API response and as an i18n key suffix.</summary>
    public static string Token(this Direction d) => d switch
    {
        Direction.Harder => "harder",
        Direction.Same => "same",
        Direction.Retry => "retry",
        Direction.Easier => "easier",
        _ => "same",
    };

    /// <summary>Reason code matching the rule that fired — localised on the client.</summary>
    public static string ReasonCode(this Direction d) => d switch
    {
        Direction.Harder => "strong_pass",
        Direction.Same => "strained_pass",
        Direction.Retry => "first_fail",
        Direction.Easier => "repeated_fail",
        _ => "strained_pass",
    };
}
