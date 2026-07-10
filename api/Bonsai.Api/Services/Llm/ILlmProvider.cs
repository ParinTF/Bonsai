using System.Text.Json.Serialization;

namespace Bonsai.Api.Services.Llm;

/// <summary>
/// One node of the AI-generated goal tree, in flat-list form. The tree
/// structure is expressed through tempId/parentTempId references instead of
/// nesting, so the model can pick its own depth (up to the prompt's cap).
/// </summary>
public class BreakdownItem
{
    [JsonPropertyName("tempId")]
    public string TempId { get; set; } = null!;

    /// <summary>null for the single root item.</summary>
    [JsonPropertyName("parentTempId")]
    public string? ParentTempId { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; } = null!;

    [JsonPropertyName("progressType")]
    public string ProgressType { get; set; } = "rollup";

    /// <summary>Optional, for weekly nodes: what "pass" means for the week.</summary>
    [JsonPropertyName("weeklyTarget")]
    public string? WeeklyTarget { get; set; }
}

public class BreakdownResult
{
    [JsonPropertyName("items")]
    public List<BreakdownItem> Items { get; set; } = [];
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
        Break this goal down into a tree of sub-goals, returned as a FLAT list of
        items linked by tempId/parentTempId (parentTempId refers to another item's
        tempId; use short ids like "n1", "n2", ...).

        Rules:
        - Exactly ONE item has parentTempId = null: the root, restating the goal
          itself, with progressType "rollup".
        - Choose the tree depth that fits the goal's real complexity. A simple goal
          may only need 2 levels; a genuinely complex one may go 5-6 levels deep.
          NEVER exceed 6 levels (root = level 1).
        - Every branch must bottom out in a "weekly" node — a commitment concrete
          enough to judge pass/fail at the end of a week (put what "pass" means in
          weeklyTarget). Under each of those weekly nodes, attach at least one
          "daily" habit that supports it.
        - Intermediate grouping nodes use "rollup". Use "stages", "numeric",
          "checklist" or "manual" only where they genuinely fit better.
        - Keep it focused: 2-4 children per node. Titles in the same language as
          the goal. Respond with JSON only.

        Goal: {goalTitle}
        {(string.IsNullOrWhiteSpace(context) ? "" : $"Context: {context}")}
        """;
}
