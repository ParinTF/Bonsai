using Bonsai.Api.Models;
using Bonsai.Api.Services;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Bonsai.Api.Endpoints;

public record RegisterRequest(string Email, string Password);
public record LoginRequest(string Email, string Password);

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/auth");

        group.MapPost("/register", async (RegisterRequest req, MongoContext db, TokenService tokens) =>
        {
            var email = req.Email.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(email) || req.Password.Length < 8)
                return Results.BadRequest(new { error = "Valid email and a password of at least 8 characters are required" });

            var user = new User
            {
                Id = ObjectId.GenerateNewId().ToString(),
                Email = email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            };

            try
            {
                await db.Users.InsertOneAsync(user);
            }
            catch (MongoWriteException e) when (e.WriteError.Category == ServerErrorCategory.DuplicateKey)
            {
                return Results.Conflict(new { error = "Email already registered" });
            }

            return Results.Ok(new { token = tokens.CreateToken(user), email = user.Email });
        });

        group.MapPost("/login", async (LoginRequest req, MongoContext db, TokenService tokens) =>
        {
            var email = req.Email.Trim().ToLowerInvariant();
            var user = await db.Users.Find(u => u.Email == email).FirstOrDefaultAsync();
            if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
                return Results.Unauthorized();

            return Results.Ok(new { token = tokens.CreateToken(user), email = user.Email });
        });
    }
}
