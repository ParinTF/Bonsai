using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Bonsai.Api.Models;

public class UserSettings
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    [BsonRepresentation(BsonType.ObjectId)]
    public string UserId { get; set; } = null!;

    /// <summary>"anthropic" | "openai" | "gemini".</summary>
    public string Provider { get; set; } = null!;

    /// <summary>API key encrypted with ASP.NET Data Protection — never stored in plain text.</summary>
    public string EncryptedApiKey { get; set; } = null!;

    /// <summary>Last 4 characters kept in the clear for display only.</summary>
    public string KeyLast4 { get; set; } = null!;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
