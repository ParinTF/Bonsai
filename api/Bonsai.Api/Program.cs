using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Bonsai.Api.Endpoints;
using Bonsai.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Bson;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

var mongoConn = builder.Configuration["Mongo:ConnectionString"];
builder.Services.AddSingleton<IMongoClient>(_ =>
{
    var settings = MongoClientSettings.FromConnectionString(mongoConn);
    // Windows Schannel can fail the TLS 1.3 handshake to Atlas (0x80090304); pin TLS 1.2.
    settings.SslSettings = new SslSettings { EnabledSslProtocols = System.Security.Authentication.SslProtocols.Tls12 };
    return new MongoClient(settings);
});
builder.Services.AddSingleton<MongoContext>();
builder.Services.AddScoped<ProgressService>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddDataProtection().SetApplicationName("bonsai");
// Key ring lives in Mongo so encrypted BYOK keys survive container rebuilds
builder.Services.AddOptions<Microsoft.AspNetCore.DataProtection.KeyManagement.KeyManagementOptions>()
    .Configure<IServiceProvider>((o, sp) =>
        o.XmlRepository = new MongoXmlRepository(sp.GetRequiredService<MongoContext>().Database));
builder.Services.AddHttpClient();
builder.Services.AddSingleton<Bonsai.Api.Services.Llm.ILlmProvider, Bonsai.Api.Services.Llm.AnthropicProvider>();
builder.Services.AddSingleton<Bonsai.Api.Services.Llm.ILlmProvider, Bonsai.Api.Services.Llm.OpenAiProvider>();
builder.Services.AddSingleton<Bonsai.Api.Services.Llm.ILlmProvider, Bonsai.Api.Services.Llm.GeminiProvider>();
builder.Services.AddScoped<BreakdownService>();
builder.Services.AddScoped<DemoService>();
builder.Services.AddHostedService<DemoResetService>();

// Allowed origins come from config (Cors:AllowedOrigins, comma-separated);
// defaults cover local dev (vite) and docker compose (nginx on :3000).
var allowedOrigins = (builder.Configuration["Cors:AllowedOrigins"] ?? "http://localhost:5173,http://localhost:3000")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(o => o.AddPolicy("web", p => p.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "bonsai",
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "bonsai",
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
                builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key not configured (use user-secrets)"))),
        };
    });
builder.Services.AddAuthorization();

// Rate limits: per-IP on auth (brute force), per-user on AI breakdown (LLM cost)
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("auth", ctx => System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
        }));
    o.AddPolicy("ai", ctx => System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
        ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromMinutes(1),
        }));
});

var app = builder.Build();
app.UseCors("web");
app.UseAuthentication();

// Demo accounts are shared and read-mostly: block destructive requests so one
// visitor can't wreck the demo for the next (hourly reset covers the rest).
app.Use(async (ctx, next) =>
{
    if (ctx.User.HasClaim("isDemo", "true") && HttpMethods.IsDelete(ctx.Request.Method))
    {
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        await ctx.Response.WriteAsJsonAsync(new { error = "Deleting is disabled in the demo — sign up to manage your own goals" });
        return;
    }
    await next();
});

app.UseAuthorization();
app.UseRateLimiter();

try
{
    await app.Services.GetRequiredService<MongoContext>().EnsureIndexesAsync();
}
catch (Exception e)
{
    app.Logger.LogWarning(e, "Could not create Mongo indexes at startup (is the DB reachable / IP allowlisted in Atlas?)");
}

app.MapGet("/health", () => new { status = "ok" });
app.MapGet("/health/db", async (IMongoClient c) =>
{
    await c.GetDatabase("admin").RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1));
    return new { db = "ok" };
});

app.MapAuthEndpoints();
app.MapGoalEndpoints();
app.MapHabitEndpoints();
app.MapBreakdownEndpoints();
app.MapSettingsEndpoints();
app.MapWeeklyReviewEndpoints();

app.Run();

// Exposed so the test project's WebApplicationFactory<Program> can boot the real app.
public partial class Program;
