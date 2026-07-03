using System.Text;
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
builder.Services.AddSingleton<BreakdownService>();

builder.Services.AddCors(o => o.AddPolicy("web", p => p.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));

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

var app = builder.Build();
app.UseCors("web");
app.UseAuthentication();
app.UseAuthorization();

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

app.Run();
