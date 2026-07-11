using Bonsai.Api.Models;
using MongoDB.Driver;

namespace Bonsai.Api.Services;

public class MongoContext
{
    public IMongoDatabase Database { get; }
    public IMongoCollection<User> Users { get; }
    public IMongoCollection<Goal> Goals { get; }
    public IMongoCollection<Checkin> Checkins { get; }
    public IMongoCollection<WeeklyAttempt> WeeklyAttempts { get; }
    public IMongoCollection<UserSettings> UserSettings { get; }
    public IMongoCollection<ProgressSnapshot> ProgressSnapshots { get; }
    public IMongoCollection<SuggestionEvent> SuggestionEvents { get; }

    public MongoContext(IMongoClient client, IConfiguration config)
    {
        var dbName = config["Mongo:Database"] ?? "bonsai";
        Database = client.GetDatabase(dbName);
        Users = Database.GetCollection<User>("users");
        Goals = Database.GetCollection<Goal>("goals");
        Checkins = Database.GetCollection<Checkin>("checkins");
        WeeklyAttempts = Database.GetCollection<WeeklyAttempt>("weeklyAttempts");
        UserSettings = Database.GetCollection<UserSettings>("userSettings");
        ProgressSnapshots = Database.GetCollection<ProgressSnapshot>("progressSnapshots");
        SuggestionEvents = Database.GetCollection<SuggestionEvent>("suggestionEvents");
    }

    public async Task EnsureIndexesAsync()
    {
        await Users.Indexes.CreateOneAsync(new CreateIndexModel<User>(
            Builders<User>.IndexKeys.Ascending(u => u.Email),
            new CreateIndexOptions { Unique = true }));

        await Goals.Indexes.CreateOneAsync(new CreateIndexModel<Goal>(
            Builders<Goal>.IndexKeys.Ascending(g => g.UserId).Ascending(g => g.ParentId)));
        await Goals.Indexes.CreateOneAsync(new CreateIndexModel<Goal>(
            Builders<Goal>.IndexKeys.Ascending(g => g.UserId).Ascending(g => g.Ancestors)));

        await Checkins.Indexes.CreateOneAsync(new CreateIndexModel<Checkin>(
            Builders<Checkin>.IndexKeys.Ascending(c => c.UserId).Ascending(c => c.GoalId).Ascending(c => c.Date),
            new CreateIndexOptions { Unique = true }));

        await WeeklyAttempts.Indexes.CreateOneAsync(new CreateIndexModel<WeeklyAttempt>(
            Builders<WeeklyAttempt>.IndexKeys.Ascending(w => w.UserId).Ascending(w => w.GoalId).Ascending(w => w.WeekOf),
            new CreateIndexOptions { Unique = true }));

        await UserSettings.Indexes.CreateOneAsync(new CreateIndexModel<UserSettings>(
            Builders<UserSettings>.IndexKeys.Ascending(s => s.UserId),
            new CreateIndexOptions { Unique = true }));

        // One snapshot per goal per day (idempotent upsert key).
        await ProgressSnapshots.Indexes.CreateOneAsync(new CreateIndexModel<ProgressSnapshot>(
            Builders<ProgressSnapshot>.IndexKeys.Ascending(s => s.UserId).Ascending(s => s.GoalId).Ascending(s => s.Date),
            new CreateIndexOptions { Unique = true }));

        await SuggestionEvents.Indexes.CreateOneAsync(new CreateIndexModel<SuggestionEvent>(
            Builders<SuggestionEvent>.IndexKeys.Ascending(e => e.UserId).Descending(e => e.CreatedAt)));
    }
}
