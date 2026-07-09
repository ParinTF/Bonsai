using System.Security.Claims;
using Bonsai.Api.Models;
using Bonsai.Api.Services;
using Bonsai.Api.Services.Llm;
using Microsoft.AspNetCore.DataProtection;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Bonsai.Api.Endpoints;

public record LlmSettingsRequest(string Provider, string ApiKey);

public static class SettingsEndpoints
{
    public static void MapSettingsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/settings").RequireAuthorization();

        group.MapGet("/llm", async (ClaimsPrincipal user, MongoContext db) =>
        {
            var s = await db.UserSettings.Find(x => x.UserId == user.UserId()).FirstOrDefaultAsync();
            // Only provider + last 4 — the key itself never leaves the server.
            return Results.Ok(new { provider = s?.Provider, keyLast4 = s?.KeyLast4 });
        });

        group.MapPut("/llm", async (LlmSettingsRequest req, ClaimsPrincipal user, MongoContext db,
            IEnumerable<ILlmProvider> providers, IDataProtectionProvider dataProtection) =>
        {
            var provider = providers.FirstOrDefault(p => p.Name == req.Provider);
            if (provider is null)
                return Results.BadRequest(new { error = "provider must be one of: anthropic, openai, gemini" });
            if (string.IsNullOrWhiteSpace(req.ApiKey) || req.ApiKey.Length < 8)
                return Results.BadRequest(new { error = "API key looks too short" });

            var apiKey = req.ApiKey.Trim();
            if (!await provider.ValidateKeyAsync(apiKey))
                return Results.BadRequest(new { error = $"Key validation against {req.Provider} failed — double-check the key" });

            var userId = user.UserId();
            var encrypted = dataProtection.CreateProtector(BreakdownService.ProtectorPurpose).Protect(apiKey);
            var last4 = apiKey[^4..];

            await db.UserSettings.ReplaceOneAsync(
                s => s.UserId == userId,
                new UserSettings
                {
                    Id = ObjectId.GenerateNewId().ToString(),
                    UserId = userId,
                    Provider = req.Provider,
                    EncryptedApiKey = encrypted,
                    KeyLast4 = last4,
                    UpdatedAt = DateTime.UtcNow,
                },
                new ReplaceOptions { IsUpsert = true });

            return Results.Ok(new { provider = req.Provider, keyLast4 = last4 });
        });

        group.MapDelete("/llm", async (ClaimsPrincipal user, MongoContext db) =>
        {
            await db.UserSettings.DeleteOneAsync(s => s.UserId == user.UserId());
            return Results.NoContent();
        });
    }
}
