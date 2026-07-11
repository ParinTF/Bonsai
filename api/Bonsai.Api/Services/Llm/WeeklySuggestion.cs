using System.Text.Json.Serialization;
using Bonsai.Api.Services;

namespace Bonsai.Api.Services.Llm;

/// <summary>The LLM's concrete proposal for the next weekly commitment (layer 2 output).</summary>
public class WeeklySuggestion
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = null!;

    /// <summary>Concrete "how to do this" for the proposed commitment — not a restatement of the title.</summary>
    [JsonPropertyName("description")]
    public string? Description { get; set; }

    /// <summary>Always "weekly" for now — the suggestion replaces a weekly goal.</summary>
    [JsonPropertyName("progressType")]
    public string ProgressType { get; set; } = "weekly";

    /// <summary>One or two sentences, in the same language as the goal titles.</summary>
    [JsonPropertyName("reason")]
    public string Reason { get; set; } = null!;
}

/// <summary>Standard JSON-Schema (Anthropic/OpenAI) for a single WeeklySuggestion object.</summary>
public static class WeeklySuggestionSchema
{
    public const string Json = """
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "title": { "type": "string" },
        "description": { "type": "string" },
        "progressType": { "type": "string", "enum": ["weekly"] },
        "reason": { "type": "string" }
      },
      "required": ["title", "description", "progressType", "reason"]
    }
    """;
}

/// <summary>Builds the layer-2 prompt from the direction and the user's goal context.</summary>
public static class WeeklySuggestionPrompt
{
    private static string Guidance(Direction d) => d switch
    {
        Direction.Harder => "The user comfortably passed this week. Propose a MORE challenging weekly commitment that builds on it.",
        Direction.Same => "The user passed but their daily follow-through was shaky. Propose a weekly commitment at roughly the SAME difficulty to consolidate the habit.",
        Direction.Retry => "The user just missed this week for the first time. Propose essentially the SAME commitment again, reworded to feel fresh and achievable.",
        Direction.Easier => "The user has failed this commitment two weeks running. Propose a clearly EASIER, smaller weekly commitment to rebuild momentum.",
        _ => "Propose a sensible next weekly commitment.",
    };

    /// <param name="bigPicture">The whole goal tree as indented text, for context.</param>
    /// <param name="finishedGoalTitle">The weekly goal that just ended.</param>
    /// <param name="recentWeeklyTitles">Recent weekly-goal titles to avoid re-proposing verbatim.</param>
    public static string Build(Direction direction, string bigPicture, string finishedGoalTitle,
        IReadOnlyList<string> recentWeeklyTitles)
    {
        var avoid = recentWeeklyTitles.Count == 0
            ? "(none yet)"
            : string.Join("\n", recentWeeklyTitles.Select(t => $"- {t}"));

        return $"""
            You help someone tune their weekly commitments inside a hierarchical goal tracker.

            Their goal tree (indentation = parent → child):
            {bigPicture}

            The weekly commitment that just ended: "{finishedGoalTitle}"

            Direction decided by the app's rules: {direction.Token().ToUpperInvariant()}.
            {Guidance(direction)}

            Do NOT simply repeat any of these recent weekly commitments verbatim:
            {avoid}

            Return JSON only: an object with
              - "title": the next weekly commitment, concrete enough to judge pass/fail at week's end,
                phrased in the SAME language as the goal titles above,
              - "description": concrete guidance on HOW to do it (method, rough amount/duration, a tip that
                makes it stick) — add information the title does not, never just restate the title,
              - "progressType": always "weekly",
              - "reason": one or two short sentences telling the user why you suggest this, in that same language.
            """;
    }
}
