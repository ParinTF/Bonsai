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

        // Structured outputs don't allow recursive schemas → the 3-level tree is unrolled.
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
}

/// <summary>Shared JSON-Schema text (draft style) for the 3-level goal tree.</summary>
public static class BreakdownSchemas
{
    public const string JsonSchema = """
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "children": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "title": { "type": "string" },
              "progressType": { "type": "string", "enum": ["rollup", "weekly", "daily"] },
              "children": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "title": { "type": "string" },
                    "progressType": { "type": "string", "enum": ["rollup", "weekly", "daily"] },
                    "children": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "properties": {
                          "title": { "type": "string" },
                          "progressType": { "type": "string", "enum": ["weekly", "daily"] }
                        },
                        "required": ["title", "progressType"]
                      }
                    }
                  },
                  "required": ["title", "progressType", "children"]
                }
              }
            },
            "required": ["title", "progressType", "children"]
          }
        }
      },
      "required": ["children"]
    }
    """;
}
