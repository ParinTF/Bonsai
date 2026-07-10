using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Bonsai.Api.Services.Llm;

/// <summary>Gemini generateContent with responseMimeType/responseSchema (OpenAPI-style schema).</summary>
public class GeminiProvider(IHttpClientFactory httpFactory) : ILlmProvider
{
    public string Name => "gemini";

    private const string BaseUrl = "https://generativelanguage.googleapis.com/v1beta";
    private const string ModelId = "gemini-2.5-flash";
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public async Task<bool> ValidateKeyAsync(string apiKey, CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{BaseUrl}/models");
            req.Headers.Add("x-goog-api-key", apiKey);
            var res = await httpFactory.CreateClient("llm").SendAsync(req, ct);
            return res.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task<BreakdownResult> BreakdownAsync(string goalTitle, string? context, string apiKey, CancellationToken ct = default)
    {
        // Gemini's responseSchema is an OpenAPI-style subset (no additionalProperties).
        var schema = new JsonObject
        {
            ["type"] = "OBJECT",
            ["properties"] = new JsonObject
            {
                ["items"] = new JsonObject
                {
                    ["type"] = "ARRAY",
                    ["items"] = new JsonObject
                    {
                        ["type"] = "OBJECT",
                        ["properties"] = new JsonObject
                        {
                            ["tempId"] = new JsonObject { ["type"] = "STRING" },
                            ["parentTempId"] = new JsonObject { ["type"] = "STRING", ["nullable"] = true },
                            ["title"] = new JsonObject { ["type"] = "STRING" },
                            ["progressType"] = new JsonObject
                            {
                                ["type"] = "STRING",
                                ["enum"] = new JsonArray("rollup", "stages", "numeric", "checklist", "manual", "daily", "weekly"),
                            },
                            ["weeklyTarget"] = new JsonObject { ["type"] = "STRING", ["nullable"] = true },
                        },
                        ["required"] = new JsonArray("tempId", "title", "progressType"),
                    },
                },
            },
            ["required"] = new JsonArray("items"),
        };

        var body = new JsonObject
        {
            ["contents"] = new JsonArray(new JsonObject
            {
                ["parts"] = new JsonArray(new JsonObject { ["text"] = BreakdownPrompt.Build(goalTitle, context) }),
            }),
            ["generationConfig"] = new JsonObject
            {
                ["responseMimeType"] = "application/json",
                ["responseSchema"] = schema,
            },
        };

        HttpResponseMessage res;
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/models/{ModelId}:generateContent")
            {
                Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
            };
            req.Headers.Add("x-goog-api-key", apiKey);
            res = await httpFactory.CreateClient("llm").SendAsync(req, ct);
        }
        catch (Exception)
        {
            throw new LlmProviderException("Could not reach Gemini — try again");
        }

        if (!res.IsSuccessStatusCode)
        {
            // Surface Gemini's own error message (it never contains the key).
            var detail = "";
            try
            {
                var errBody = JsonNode.Parse(await res.Content.ReadAsStringAsync(ct));
                var msg = errBody?["error"]?["message"]?.GetValue<string>();
                if (!string.IsNullOrEmpty(msg))
                    detail = ": " + (msg.Length > 200 ? msg[..200] + "…" : msg);
            }
            catch { /* keep the generic message */ }
            throw new LlmProviderException($"Gemini request failed ({(int)res.StatusCode}){detail}");
        }

        var json = JsonNode.Parse(await res.Content.ReadAsStringAsync(ct));
        var text = json?["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]?.GetValue<string>()
            ?? throw new LlmProviderException("Gemini returned no content");
        return JsonSerializer.Deserialize<BreakdownResult>(text, JsonOpts)
            ?? throw new LlmProviderException("Gemini returned unparseable JSON");
    }
}
