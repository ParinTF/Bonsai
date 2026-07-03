using MongoDB.Driver;
using MongoDB.Bson;

var builder = WebApplication.CreateBuilder(args);

var mongoConn = builder.Configuration["Mongo:ConnectionString"];
builder.Services.AddSingleton<IMongoClient>(_ => new MongoClient(mongoConn));
builder.Services.AddCors(o => o.AddPolicy("web", p => p.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors("web");

app.MapGet("/health",() => new { status = "ok" });
app.MapGet("/health/db", async (IMongoClient c) => {
    await c.GetDatabase("admin").RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1));
    return new { db = "ok" };
});

app.Run();