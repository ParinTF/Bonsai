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

    public MongoContext(IMongoClient client, IConfiguration config)
    {
        var dbName = config["Mongo:Database"] ?? "bonsai";
        Database = client.GetDatabase(dbName);
        Users = Database.GetCollection<User>("users");
        Goals = Database.GetCollection<Goal>("goals");
        Checkins = Database.GetCollection<Checkin>("checkins");
        WeeklyAttempts = Database.GetCollection<WeeklyAttempt>("weeklyAttempts");
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
    }
}
