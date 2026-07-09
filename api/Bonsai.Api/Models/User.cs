using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Bonsai.Api.Models;

public class User
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    public string Email { get; set; } = null!;

    /// <summary>Null for accounts created via Google sign-in.</summary>
    public string? PasswordHash { get; set; }

    /// <summary>"local" | "google" — how the account was originally created.</summary>
    public string AuthProvider { get; set; } = "local";

    /// <summary>Google subject id once the account is linked to Google.</summary>
    public string? GoogleId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
