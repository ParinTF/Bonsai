using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Bonsai.Api.Models;

public static class ProgressTypes
{
    public const string Stages = "stages";
    public const string Numeric = "numeric";
    public const string Checklist = "checklist";
    public const string Manual = "manual";
    public const string Rollup = "rollup";
    public const string Daily = "daily";
    public const string Weekly = "weekly";

    public static readonly string[] All = [Stages, Numeric, Checklist, Manual, Rollup, Daily, Weekly];
}

public static class GoalStatuses
{
    public const string Active = "active";
    public const string Done = "done";
    public const string Archived = "archived";

    public static readonly string[] All = [Active, Done, Archived];
}

public class Stage
{
    public string Title { get; set; } = null!;
    public bool Done { get; set; }
}

public class NumericProgress
{
    public double Target { get; set; }
    public double Current { get; set; }
    public string Unit { get; set; } = "";
}

public class Goal
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string UserId { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string? ParentId { get; set; }

    /// <summary>All parent ids from root down to the direct parent.</summary>
    [BsonRepresentation(BsonType.ObjectId)]
    public List<string> Ancestors { get; set; } = [];

    public string Title { get; set; } = null!;
    public string Status { get; set; } = GoalStatuses.Active;
    public string ProgressType { get; set; } = ProgressTypes.Manual;

    public List<Stage>? Stages { get; set; }
    public NumericProgress? Numeric { get; set; }

    /// <summary>0-100, computed by ProgressService according to ProgressType.</summary>
    public double Progress { get; set; }

    public int Order { get; set; }

    /// <summary>Node position on the graph canvas; null until the user first drags it.</summary>
    public double? PositionX { get; set; }
    public double? PositionY { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
