using Bonsai.Api.Services.Llm;
using Microsoft.AspNetCore.DataProtection;
using MongoDB.Driver;

namespace Bonsai.Api.Services;

/// <summary>
/// Orchestrates AI goal breakdown: resolves the caller's BYOK provider/key
/// from UserSettings (falling back to the server's Anthropic key for dev)
/// and dispatches to the matching ILlmProvider.
/// </summary>
public class BreakdownService(
    IEnumerable<ILlmProvider> providers,
    MongoContext db,
    IDataProtectionProvider dataProtection,
    IConfiguration config)
{
    public const string ProtectorPurpose = "llm-api-key";

    public async Task<BreakdownResult> BreakDownAsync(string userId, string goalTitle, string? context)
    {
        var (providerName, apiKey) = await ResolveKeyAsync(userId);
        var provider = providers.FirstOrDefault(p => p.Name == providerName)
            ?? throw new LlmProviderException($"Unknown provider '{providerName}'");
        return await provider.BreakdownAsync(goalTitle, context, apiKey);
    }

    private async Task<(string Provider, string ApiKey)> ResolveKeyAsync(string userId)
    {
        var settings = await db.UserSettings.Find(s => s.UserId == userId).FirstOrDefaultAsync();
        if (settings is not null)
        {
            try
            {
                var key = dataProtection.CreateProtector(ProtectorPurpose).Unprotect(settings.EncryptedApiKey);
                return (settings.Provider, key);
            }
            catch
            {
                // Data-protection keys rotated/lost (e.g. container rebuilt) — the
                // stored ciphertext is unrecoverable; user must re-enter the key.
                throw new LlmKeyMissingException();
            }
        }

        // Dev fallback: server-wide Anthropic key from user-secrets/env.
        var serverKey = config["Anthropic:ApiKey"];
        if (!string.IsNullOrEmpty(serverKey)) return ("anthropic", serverKey);

        throw new LlmKeyMissingException();
    }
}
