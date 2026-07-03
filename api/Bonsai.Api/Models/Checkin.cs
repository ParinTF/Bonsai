using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Bonsai.Api.Models;

public class Checkin
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string UserId { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string GoalId { get; set; } = null!;

    /// <summary>Calendar date of the checkin, stored as yyyy-MM-dd.</summary>
    public string Date { get; set; } = null!;

    public bool Done { get; set; }
}
