using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Bonsai.Api.Models;

public class WeeklyAttempt
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string UserId { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string GoalId { get; set; } = null!;

    /// <summary>Monday of the week this attempt belongs to, stored as yyyy-MM-dd.</summary>
    public string WeekOf { get; set; } = null!;

    /// <summary>"pass" or "fail".</summary>
    public string Result { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
