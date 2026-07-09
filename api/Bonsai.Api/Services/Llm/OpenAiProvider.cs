using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Bonsai.Api.Services.Llm;

/// <summary>OpenAI Chat Completions with response_format json_schema (strict mode).</summary>
public class OpenAiProvider(IHttpClientFactory httpFactory) : ILlmProvider
{
    public string Name => "openai";

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private HttpClient Client(string apiKey)
    {
        var http = httpFactory.CreateClient("llm");
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        return http;
    }

    public async Task<bool> ValidateKeyAsync(string apiKey, CancellationToken ct = default)
    {
        try
        {
            var res = await Client(apiKey).GetAsync("https://api.openai.com/v1/models", ct);
            return res.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task<BreakdownResult> BreakdownAsync(string goalTitle, string? context, string apiKey, CancellationToken ct = default)
    {
        var body = new JsonObject
        {
            ["model"] = "gpt-4o-mini",
            ["messages"] = new JsonArray(new JsonObject
            {
                ["role"] = "user",
                ["content"] = BreakdownPrompt.Build(goalTitle, context),
            }),
            ["response_format"] = new JsonObject
            {
                ["type"] = "json_schema",
                ["json_schema"] = new JsonObject
                {
                    ["name"] = "goal_tree",
                    ["strict"] = true,
                    ["schema"] = JsonNode.Parse(BreakdownSchemas.JsonSchema),
                },
            },
        };

        HttpResponseMessage res;
        try
        {
            res = await Client(apiKey).PostAsync("https://api.openai.com/v1/chat/completions",
                new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"), ct);
        }
        catch (Exception)
        {
            throw new LlmProviderException("Could not reach OpenAI — try again");
        }

        if (!res.IsSuccessStatusCode)
            throw new LlmProviderException($"OpenAI request failed ({(int)res.StatusCode}) — check your API key and quota in Settings");

        var json = JsonNode.Parse(await res.Content.ReadAsStringAsync(ct));
        var text = json?["choices"]?[0]?["message"]?["content"]?.GetValue<string>()
            ?? throw new LlmProviderException("OpenAI returned no content");
        return JsonSerializer.Deserialize<BreakdownResult>(text, JsonOpts)
            ?? throw new LlmProviderException("OpenAI returned unparseable JSON");
    }
}
