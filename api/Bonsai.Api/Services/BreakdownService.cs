using System.Text.Json;
using System.Text.Json.Serialization;
using Anthropic;
using Anthropic.Models.Messages;

namespace Bonsai.Api.Services;

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

/// <summary>Calls the Anthropic API to break a big goal into a tree (max 3 levels, leaves = weekly/daily actions).</summary>
public class BreakdownService(IConfiguration config)
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public async Task<BreakdownResult> BreakDownAsync(string goalTitle, string? context)
    {
        var apiKey = config["Anthropic:ApiKey"]
            ?? throw new InvalidOperationException("Anthropic:ApiKey not configured (use user-secrets)");

        AnthropicClient client = new() { ApiKey = apiKey };

        // Structured outputs don't support recursive schemas, so the 3-level tree is unrolled.
        var leaf = new
        {
            type = "object",
            additionalProperties = false,
            properties = new Dictionary<string, object>
            {
                ["title"] = new { type = "string" },
                ["progressType"] = new { type = "string", @enum = new[] { "weekly", "daily" } },
            },
            required = new[] { "title", "progressType" },
        };
        var level2 = new
        {
            type = "object",
            additionalProperties = false,
            properties = new Dictionary<string, object>
            {
                ["title"] = new { type = "string" },
                ["progressType"] = new { type = "string", @enum = new[] { "rollup", "weekly", "daily" } },
                ["children"] = new { type = "array", items = leaf },
            },
            required = new[] { "title", "progressType", "children" },
        };
        var level1 = new
        {
            type = "object",
            additionalProperties = false,
            properties = new Dictionary<string, object>
            {
                ["title"] = new { type = "string" },
                ["progressType"] = new { type = "string", @enum = new[] { "rollup", "weekly", "daily" } },
                ["children"] = new { type = "array", items = level2 },
            },
            required = new[] { "title", "progressType", "children" },
        };
        var schema = new Dictionary<string, object>
        {
            ["type"] = "object",
            ["additionalProperties"] = false,
            ["properties"] = new Dictionary<string, object>
            {
                ["children"] = new { type = "array", items = level1 },
            },
            ["required"] = new[] { "children" },
        };

        var prompt = $"""
            Break down this big goal into a hierarchical sub-goal tree (maximum 3 levels deep).
            Every leaf node must be a concrete recurring action with progressType "weekly"
            (a weekly commitment with pass/fail) or "daily" (a daily habit).
            Intermediate nodes use progressType "rollup".
            Keep it focused: 2-4 children per node. Titles in the same language as the goal.

            Goal: {goalTitle}
            {(string.IsNullOrWhiteSpace(context) ? "" : $"Context: {context}")}
            """;

        var response = await client.Messages.Create(new MessageCreateParams
        {
            Model = Model.ClaudeOpus4_8,
            MaxTokens = 8000,
            Thinking = new ThinkingConfigAdaptive(),
            OutputConfig = new OutputConfig
            {
                Format = new JsonOutputFormat
                {
                    Schema = schema.ToDictionary(
                        kv => kv.Key,
                        kv => JsonSerializer.SerializeToElement(kv.Value)),
                },
            },
            Messages = [new() { Role = Role.User, Content = prompt }],
        });

        var text = response.Content.Select(b => b.Value).OfType<TextBlock>().First().Text;
        return JsonSerializer.Deserialize<BreakdownResult>(text, JsonOpts)
            ?? throw new InvalidOperationException("Empty breakdown response");
    }
}
