using System.Text.Json.Serialization;

namespace Bonsai.Api.Services.Llm;

public class BreakdownNode
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = null!;

    /// <summary>One of the Bonsai progressTypes; leaves should be "weekly" or "daily".</summary>
    [JsonPropertyName("progressType")]
    public string ProgressType { get; set; } = "rollup";

    [JsonPropertyName("children")]
    public List<BreakdownNode> Children { get; set; } = [];
}

public class BreakdownResult
{
    [JsonPropertyName("children")]
    public List<BreakdownNode> Children { get; set; } = [];
}

/// <summary>Thrown when the user has no LLM key configured (and no server fallback exists).</summary>
public class LlmKeyMissingException : Exception;

/// <summary>Thrown when a provider call fails (bad key, rate limit, network).</summary>
public class LlmProviderException(string message) : Exception(message);

public interface ILlmProvider
{
    /// <summary>Stable identifier stored in UserSettings ("anthropic" | "openai" | "gemini").</summary>
    string Name { get; }

    /// <summary>Cheap request to confirm the API key works. Never throws for a bad key — returns false.</summary>
    Task<bool> ValidateKeyAsync(string apiKey, CancellationToken ct = default);

    Task<BreakdownResult> BreakdownAsync(string goalTitle, string? context, string apiKey, CancellationToken ct = default);
}

/// <summary>Prompt shared by every provider.</summary>
public static class BreakdownPrompt
{
    public static string Build(string goalTitle, string? context) => $"""
        Break down this big goal into a hierarchical sub-goal tree (maximum 3 levels deep).
        Every leaf node must be a concrete recurring action with progressType "weekly"
        (a weekly commitment with pass/fail) or "daily" (a daily habit).
        Intermediate nodes use progressType "rollup".
        Keep it focused: 2-4 children per node. Titles in the same language as the goal.
        Respond with JSON only.

        Goal: {goalTitle}
        {(string.IsNullOrWhiteSpace(context) ? "" : $"Context: {context}")}
        """;
}
