using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Hosting;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Bonsai.Api.Tests;

/// <summary>
/// Boots the real app against a MongoDB given by BONSAI_TEST_MONGO (default
/// mongodb://localhost:27017) into a throwaway database. When no Mongo is reachable
/// the tests skip rather than fail, so the suite stays green without infrastructure.
/// </summary>
public class IntegrationFixture : IAsyncLifetime
{
    public bool Available { get; private set; }
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    private string _conn = "";
    private string _dbName = "";

    public async Task InitializeAsync()
    {
        _conn = Environment.GetEnvironmentVariable("BONSAI_TEST_MONGO") ?? "mongodb://localhost:27017";
        _dbName = "bonsai_test_" + Guid.NewGuid().ToString("N");

        try
        {
            var settings = MongoClientSettings.FromConnectionString(_conn);
            settings.ServerSelectionTimeout = TimeSpan.FromSeconds(2);
            await new MongoClient(settings).GetDatabase("admin")
                .RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1));
            Available = true;
        }
        catch
        {
            Available = false;
            return;
        }

        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            // "Testing" (not Development) so the dev machine's user-secrets — including a
            // real Atlas connection string — are NOT loaded over our throwaway DB.
            b.UseEnvironment("Testing");
            b.UseSetting("Mongo:ConnectionString", _conn);
            b.UseSetting("Mongo:Database", _dbName);
            b.UseSetting("Jwt:Key", "integration-test-signing-key-at-least-32-chars");
        });
        _ = Factory.CreateClient(); // force app startup (indexes, etc.)
    }

    public async Task DisposeAsync()
    {
        if (Factory is not null) await Factory.DisposeAsync();
        if (Available)
        {
            try { new MongoClient(_conn).DropDatabase(_dbName); }
            catch { /* best effort cleanup */ }
        }
    }

    /// <summary>Registers a fresh user and returns a client with its bearer token set.</summary>
    public async Task<HttpClient> AuthedClientAsync()
    {
        var client = Factory.CreateClient();
        var email = $"u{Guid.NewGuid():N}@test.local";
        var res = await client.PostAsJsonAsync("/auth/register", new { email, password = "password123" });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<TokenResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body!.Token);
        return client;
    }

    public record TokenResponse(string Token, string Email);
}

public class ApiIntegrationTests(IntegrationFixture fx) : IClassFixture<IntegrationFixture>
{
    private const string SkipReason =
        "No test MongoDB reachable (set BONSAI_TEST_MONGO or run mongo on localhost:27017).";

    private static async Task<string> CreateGoalAsync(HttpClient c, string title, string type, string? parentId = null)
    {
        var res = await c.PostAsJsonAsync("/goals", new { title, parentId, progressType = type });
        res.EnsureSuccessStatusCode();
        var goal = await res.Content.ReadFromJsonAsync<JsonElement>();
        return goal.GetProperty("id").GetString()!;
    }

    [SkippableFact]
    public async Task Goals_AreIsolatedPerUser()
    {
        Skip.IfNot(fx.Available, SkipReason);
        var alice = await fx.AuthedClientAsync();
        var bob = await fx.AuthedClientAsync();

        await CreateGoalAsync(alice, "Alice private goal", "manual");

        var bobGoals = await bob.GetFromJsonAsync<List<JsonElement>>("/goals");
        Assert.DoesNotContain(bobGoals!, g => g.GetProperty("title").GetString() == "Alice private goal");
        Assert.Empty(bobGoals!);
    }

    [SkippableFact]
    public async Task DeletingRoot_CascadesToChildrenCheckinsAndAttempts()
    {
        Skip.IfNot(fx.Available, SkipReason);
        var c = await fx.AuthedClientAsync();

        var root = await CreateGoalAsync(c, "Root", "rollup");
        var daily = await CreateGoalAsync(c, "Daily habit", "daily", root);
        var weekly = await CreateGoalAsync(c, "Weekly commitment", "weekly", root);

        (await c.PatchAsync($"/habits/{daily}/checkin?date=2026-07-06", null)).EnsureSuccessStatusCode();
        (await c.PostAsJsonAsync($"/goals/{weekly}/weekly-attempt", new { result = "pass" })).EnsureSuccessStatusCode();

        (await c.DeleteAsync($"/goals/{root}")).EnsureSuccessStatusCode();

        var goals = await c.GetFromJsonAsync<List<JsonElement>>("/goals");
        Assert.Empty(goals!);

        var export = await c.GetFromJsonAsync<JsonElement>("/account/export");
        Assert.Equal(0, export.GetProperty("goals").GetArrayLength());
        Assert.Equal(0, export.GetProperty("checkins").GetArrayLength());
        Assert.Equal(0, export.GetProperty("weeklyAttempts").GetArrayLength());
    }

    [SkippableFact]
    public async Task WeeklyAttempt_IsOnePerWeekUpsert()
    {
        Skip.IfNot(fx.Available, SkipReason);
        var c = await fx.AuthedClientAsync();
        var weekly = await CreateGoalAsync(c, "Run 3x", "weekly");

        (await c.PostAsJsonAsync($"/goals/{weekly}/weekly-attempt", new { result = "fail", weekOf = "2026-07-06" })).EnsureSuccessStatusCode();
        (await c.PostAsJsonAsync($"/goals/{weekly}/weekly-attempt", new { result = "pass", weekOf = "2026-07-06" })).EnsureSuccessStatusCode();

        var week = await c.GetFromJsonAsync<List<JsonElement>>("/goals/this-week");
        var item = week!.Single(x => x.GetProperty("goal").GetProperty("id").GetString() == weekly);
        var attempts = item.GetProperty("attempts");
        Assert.Equal(1, attempts.GetArrayLength());              // upserted, not appended
        Assert.Equal("pass", attempts[0].GetProperty("result").GetString()); // last write wins
    }

    [SkippableFact]
    public async Task Breakdown_OnGoalWithExistingChildren_Returns409AndInsertsNothing()
    {
        Skip.IfNot(fx.Available, SkipReason);
        var c = await fx.AuthedClientAsync();

        var root = await CreateGoalAsync(c, "Get fit this year", "rollup");
        await CreateGoalAsync(c, "Morning run", "daily", root);

        var before = await c.GetFromJsonAsync<List<JsonElement>>("/goals");

        // The 409 check runs before any LLM call, so this needs no API key configured.
        var res = await c.PostAsJsonAsync("/goals/breakdown", new { title = "Get fit this year", parentId = root });
        Assert.Equal(System.Net.HttpStatusCode.Conflict, res.StatusCode);

        var after = await c.GetFromJsonAsync<List<JsonElement>>("/goals");
        Assert.Equal(before!.Count, after!.Count); // nothing was inserted
    }

    [SkippableFact]
    public async Task SuggestNext_FallsBackToRuleWhenNoLlmKey()
    {
        Skip.IfNot(fx.Available, SkipReason);
        var c = await fx.AuthedClientAsync();
        var weekly = await CreateGoalAsync(c, "Meditate daily", "weekly");
        (await c.PostAsJsonAsync($"/goals/{weekly}/weekly-attempt", new { result = "pass", weekOf = "2026-07-06" })).EnsureSuccessStatusCode();

        var res = await c.PostAsync($"/goals/{weekly}/suggest-next", null);
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal("rule", body.GetProperty("source").GetString());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("title").ValueKind); // no LLM content
        Assert.False(string.IsNullOrEmpty(body.GetProperty("direction").GetString()));
    }
}
