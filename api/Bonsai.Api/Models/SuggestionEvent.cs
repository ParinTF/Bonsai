using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Bonsai.Api.Models;

public static class SuggestionActions
{
    public const string Used = "used";       // accepted the AI suggestion as-is
    public const string Custom = "custom";    // opened a form to set their own
    public const string Skipped = "skipped";  // dismissed the suggestion

    public static readonly string[] All = [Used, Custom, Skipped];
}

/// <summary>
/// Records what the user did with a "next weekly goal" suggestion. Kept so the
/// direction rules can later learn (e.g. suggested Easier but still failing), and
/// so a dismissed suggestion isn't re-shown on reload.
/// </summary>
public class SuggestionEvent
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string UserId { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string WeeklyGoalId { get; set; } = null!;

    /// <summary>"harder" | "same" | "retry" | "easier" — the rule-based direction shown.</summary>
    public string Direction { get; set; } = null!;

    /// <summary>One of <see cref="SuggestionActions"/>.</summary>
    public string Action { get; set; } = null!;

    /// <summary>The goal created from the suggestion, when Action is "used" or "custom".</summary>
    [BsonRepresentation(BsonType.ObjectId)]
    public string? NewGoalId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
