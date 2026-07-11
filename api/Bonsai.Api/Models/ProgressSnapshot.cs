using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Bonsai.Api.Models;

/// <summary>
/// A daily point in a goal's progress history. Written idempotently (one per
/// userId+goalId+date) by ProgressService so trend charts have a time series —
/// Goal.Progress itself is overwritten on every recompute and keeps no history.
/// </summary>
public class ProgressSnapshot
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string UserId { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string GoalId { get; set; } = null!;

    /// <summary>UTC calendar date, stored as yyyy-MM-dd.</summary>
    public string Date { get; set; } = null!;

    /// <summary>0-100, the computed progress on that date.</summary>
    public double Progress { get; set; }
}
