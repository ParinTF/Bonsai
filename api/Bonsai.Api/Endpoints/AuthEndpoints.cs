using Bonsai.Api.Models;
using Bonsai.Api.Services;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Bonsai.Api.Endpoints;

public record RegisterRequest(string Email, string Password);
public record LoginRequest(string Email, string Password);
public record GoogleLoginRequest(string IdToken);
public record ChangePasswordRequest(string? CurrentPassword, string NewPassword);

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/auth").RequireRateLimiting("auth");

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
            // PasswordHash is null for Google-only accounts — they can't password-login
            if (user?.PasswordHash is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
                return Results.Unauthorized();

            return Results.Ok(new { token = tokens.CreateToken(user), email = user.Email });
        });

        // Change (or set, for Google-only accounts) the password.
        group.MapPost("/change-password", async (ChangePasswordRequest req, System.Security.Claims.ClaimsPrincipal principal,
            MongoContext db) =>
        {
            if (principal.HasClaim("isDemo", "true"))
                return Results.Json(new { error = "The demo account can't be modified" }, statusCode: 403);
            if (req.NewPassword.Length < 8)
                return Results.BadRequest(new { error = "New password must be at least 8 characters" });

            var userId = principal.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value;
            var user = await db.Users.Find(u => u.Id == userId).FirstOrDefaultAsync();
            if (user is null) return Results.Unauthorized();

            // Accounts created via Google have no password yet — let them set one.
            if (user.PasswordHash is not null &&
                (req.CurrentPassword is null || !BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash)))
                return Results.BadRequest(new { error = "Current password is incorrect" });

            await db.Users.UpdateOneAsync(u => u.Id == userId,
                Builders<User>.Update.Set(u => u.PasswordHash, BCrypt.Net.BCrypt.HashPassword(req.NewPassword)));
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();

        // Delete the account and every piece of its data. DELETE verb → the
        // demo-guard middleware already blocks this for demo tokens.
        app.MapDelete("/account", async (System.Security.Claims.ClaimsPrincipal principal, MongoContext db) =>
        {
            var userId = principal.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value;
            await db.Goals.DeleteManyAsync(g => g.UserId == userId);
            await db.Checkins.DeleteManyAsync(c => c.UserId == userId);
            await db.WeeklyAttempts.DeleteManyAsync(w => w.UserId == userId);
            await db.UserSettings.DeleteManyAsync(s => s.UserId == userId);
            await db.Users.DeleteOneAsync(u => u.Id == userId);
            return Results.NoContent();
        }).RequireAuthorization();

        // Instant shared demo account — no signup. Seeds example data on first use.
        group.MapPost("/demo", async (DemoService demo, TokenService tokens) =>
        {
            var user = await demo.GetOrCreateDemoUserAsync();
            return Results.Ok(new { token = tokens.CreateToken(user), email = user.Email });
        });

        // Google Identity Services ID-token flow (no client secret involved).
        group.MapPost("/google", async (GoogleLoginRequest req, MongoContext db, TokenService tokens, IConfiguration config) =>
        {
            var clientId = config["Google:ClientId"];
            if (string.IsNullOrEmpty(clientId))
                return Results.Problem("Google sign-in is not configured (Google:ClientId missing)", statusCode: 501);

            Google.Apis.Auth.GoogleJsonWebSignature.Payload payload;
            try
            {
                payload = await Google.Apis.Auth.GoogleJsonWebSignature.ValidateAsync(req.IdToken,
                    new Google.Apis.Auth.GoogleJsonWebSignature.ValidationSettings
                    {
                        Audience = [clientId], // token must be issued for OUR client id
                    });
            }
            catch (Google.Apis.Auth.InvalidJwtException)
            {
                return Results.Unauthorized();
            }

            var email = payload.Email.Trim().ToLowerInvariant();
            var user = await db.Users.Find(u => u.Email == email).FirstOrDefaultAsync();

            if (user is null)
            {
                user = new User
                {
                    Id = ObjectId.GenerateNewId().ToString(),
                    Email = email,
                    PasswordHash = null,
                    AuthProvider = "google",
                    GoogleId = payload.Subject,
                };
                await db.Users.InsertOneAsync(user);
            }
            else if (user.GoogleId is null)
            {
                // Existing email/password account: link Google to it (matched by email)
                await db.Users.UpdateOneAsync(
                    u => u.Id == user.Id,
                    Builders<User>.Update.Set(u => u.GoogleId, payload.Subject));
            }

            return Results.Ok(new { token = tokens.CreateToken(user), email = user.Email });
        });
    }
}
