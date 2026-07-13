using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;

namespace Bonsai.Api.Services.Llm;

/// <summary>Anthropic Messages API with structured outputs (output_config.format json_schema).</summary>
public class AnthropicProvider : ILlmProvider
{
    public string Name => "anthropic";

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public async Task<bool> ValidateKeyAsync(string apiKey, CancellationToken ct = default)
    {
        try
        {
            AnthropicClient client = new() { ApiKey = apiKey };
            await client.Messages.Create(new MessageCreateParams
            {
                Model = Model.ClaudeHaiku4_5,
                MaxTokens = 1,
                Messages = [new() { Role = Role.User, Content = "hi" }],
            });
            return true;
        }
        catch
        {
            return false; // never surface details that could echo the key
        }
    }

    public async Task<BreakdownResult> BreakdownAsync(string goalTitle, string? context, string apiKey, CancellationToken ct = default)
    {
        AnthropicClient client = new() { ApiKey = apiKey };

        // Flat-list schema: the tree is expressed via tempId/parentTempId references.
        var schema = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(BreakdownSchemas.JsonSchema)!;

        Message response;
        try
        {
            response = await client.Messages.Create(new MessageCreateParams
            {
                Model = Model.ClaudeOpus4_8,
                MaxTokens = 8000,
                Thinking = new ThinkingConfigAdaptive(),
                OutputConfig = new OutputConfig { Format = new JsonOutputFormat { Schema = schema } },
                Messages = [new() { Role = Role.User, Content = BreakdownPrompt.Build(goalTitle, context) }],
            });
        }
        catch (Exception)
        {
            throw new LlmProviderException("Anthropic request failed — check your API key and credits in Settings");
        }

        var text = response.Content.Select(b => b.Value).OfType<TextBlock>().FirstOrDefault()?.Text
            ?? throw new LlmProviderException("Anthropic returned no content");
        return JsonSerializer.Deserialize<BreakdownResult>(text, JsonOpts)
            ?? throw new LlmProviderException("Anthropic returned unparseable JSON");
    }

    public async Task<WeeklySuggestion> SuggestNextWeeklyAsync(string prompt, string apiKey, CancellationToken ct = default)
    {
        AnthropicClient client = new() { ApiKey = apiKey };
        var schema = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(WeeklySuggestionSchema.Json)!;

        Message response;
        try
        {
            response = await client.Messages.Create(new MessageCreateParams
            {
                Model = Model.ClaudeHaiku4_5,
                MaxTokens = 1000,
                OutputConfig = new OutputConfig { Format = new JsonOutputFormat { Schema = schema } },
                Messages = [new() { Role = Role.User, Content = prompt }],
            });
        }
        catch (Exception)
        {
            throw new LlmProviderException("Anthropic request failed");
        }

        var text = response.Content.Select(b => b.Value).OfType<TextBlock>().FirstOrDefault()?.Text
            ?? throw new LlmProviderException("Anthropic returned no content");
        return JsonSerializer.Deserialize<WeeklySuggestion>(text, JsonOpts)
            ?? throw new LlmProviderException("Anthropic returned unparseable JSON");
    }
}

/// <summary>Shared JSON-Schema text (draft style) for the flat goal-item list.</summary>
public static class BreakdownSchemas
{
    public const string JsonSchema = """
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "tempId": { "type": "string" },
              "parentTempId": { "type": ["string", "null"] },
              "title": { "type": "string" },
              "description": { "type": ["string", "null"] },
              "progressType": {
                "type": "string",
                "enum": ["rollup", "stages", "numeric", "checklist", "manual", "daily", "weekly"]
              },
              "weeklyTarget": { "type": ["string", "null"] },
              "stages": { "type": ["array", "null"], "items": { "type": "string" } },
              "numericTarget": { "type": ["number", "null"] },
              "numericUnit": { "type": ["string", "null"] }
            },
            "required": ["tempId", "parentTempId", "title", "description", "progressType", "weeklyTarget", "stages", "numericTarget", "numericUnit"]
          }
        }
      },
      "required": ["items"]
    }
    """;
}
