using System.Text;
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

    /// <summary>
    /// Optional "how to do this" note. May be absent if the model omits it —
    /// the tree builder never requires it.
    /// </summary>
    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("progressType")]
    public string ProgressType { get; set; } = "rollup";

    /// <summary>Optional, for weekly nodes: what "pass" means for the week.</summary>
    [JsonPropertyName("weeklyTarget")]
    public string? WeeklyTarget { get; set; }

    /// <summary>For "stages" nodes: ordered step titles. Null/empty for other types.</summary>
    [JsonPropertyName("stages")]
    public List<string>? Stages { get; set; }

    /// <summary>For "numeric" nodes: the target amount (e.g. 50). Null for other types.</summary>
    [JsonPropertyName("numericTarget")]
    public double? NumericTarget { get; set; }

    /// <summary>For "numeric" nodes: the unit label (e.g. "applications"). Null for other types.</summary>
    [JsonPropertyName("numericUnit")]
    public string? NumericUnit { get; set; }
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

    /// <summary>
    /// Layer 2 of "suggest next weekly goal": the caller already picked a Direction (rule-based);
    /// this asks the model for the concrete next commitment. <paramref name="prompt"/> is fully
    /// composed by <see cref="WeeklySuggestionPrompt"/>. Throws <see cref="LlmProviderException"/>
    /// on any provider/parse failure so the caller can fall back to the rule-only response.
    /// </summary>
    Task<WeeklySuggestion> SuggestNextWeeklyAsync(string prompt, string apiKey, CancellationToken ct = default);
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
        - Pick each node's progressType by the NATURE of that piece of work —
          think about how a person would actually track it, and mix types freely:
            - "rollup": a grouping node; its progress is the average of its children.
            - "daily": a habit practised (almost) every day, tracked by check-ins.
            - "weekly": a recurring commitment judged pass/fail once a week — put
              what "pass" means in weeklyTarget.
            - "stages": a ONE-OFF piece of work with a clear sequence of steps
              (research, prepare, polish, submit...) — provide 2-6 short step
              titles in "stages", in order.
            - "numeric": an accumulating measurable total — provide numericTarget
              and numericUnit (e.g. 50 "applications", 12 "books").
            - "checklist": a parent whose children are one-off subtasks; progress
              = fraction of children marked done.
            - "manual": only when truly nothing else fits.
        - Where the goal is about building lasting behaviour, that branch should
          still bottom out in a "weekly" commitment supported by at least one
          "daily" habit. But one-off project work (set up a profile, write a CV,
          buy equipment...) must be "stages"/"checklist"/"numeric" — do NOT dress
          it up as a fake recurring habit.
        - Give EVERY node a "description". It must add information the title does
          not — never just restate the title. For "daily" and "weekly" leaf nodes
          the description is required and must explain concretely HOW to do it:
          the method, a rough duration or amount, and any tip that makes it stick.
          Example — title "Speak English 10 min/day", description "Narrate your day
          out loud in English alone; record yourself if you can, then replay it to
          catch where you stumbled." NOT "Practice speaking English 10 minutes
          daily" (that only echoes the title).
        - Keep it focused: 2-4 children per node. Titles, descriptions and stage
          titles in the same language as the goal. Respond with JSON only.

        Goal: {goalTitle}
        {(string.IsNullOrWhiteSpace(context) ? "" : $"Context: {context}")}
        """;
}

/// <summary>
/// Builds the "context" string for a sub-breakdown — attaching new children
/// under an EXISTING node, not recreating the tree above it. Feeds straight
/// into <see cref="BreakdownPrompt.Build"/>'s free-text context parameter, so
/// no changes to ILlmProvider or its schema are needed to support this.
/// </summary>
public static class SubBreakdownPrompt
{
    public static string BuildContext(IReadOnlyList<string> ancestorTitles, string? nodeDescription,
        IReadOnlyList<string> existingChildren, string? instruction)
    {
        var sb = new StringBuilder();
        sb.AppendLine("You are adding children UNDER an existing node in a bigger goal tree — do not recreate anything ABOVE this node.");
        sb.AppendLine("The output format still requires exactly ONE item with parentTempId = null, per the schema rules above. " +
            "That item represents this EXISTING node, not a new goal — set its title to this node's own title, give it no " +
            "children-defining content, and attach every item you're actually proposing under its tempId (directly, or " +
            "nested further). Its title/description/progressType are discarded; only its tempId is used to wire your real " +
            "proposals onto the existing node, so still emit it even though it's a placeholder.");

        if (ancestorTitles.Count > 0)
            sb.AppendLine("Path from the top-level goal down to this node: " + string.Join(" > ", ancestorTitles));

        if (!string.IsNullOrWhiteSpace(nodeDescription))
            sb.AppendLine("This node's own description: " + nodeDescription);

        if (existingChildren.Count > 0)
        {
            sb.AppendLine("This node already has these children — do NOT recreate them, only add what's missing:");
            foreach (var c in existingChildren) sb.AppendLine("- " + c);
        }

        if (!string.IsNullOrWhiteSpace(instruction))
            sb.AppendLine("Additional instruction from the user: " + instruction);

        return sb.ToString();
    }
}
