using Bonsai.Api.Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Bonsai.Api.Services;

/// <summary>
/// Manages the shared demo account: creates it on demand, seeds a rich
/// example goal tree, and wipes/reseeds it so the demo always looks good.
/// </summary>
public class DemoService(MongoContext db)
{
    public const string DemoEmail = "demo@bonsai.app";

    public async Task<User> GetOrCreateDemoUserAsync()
    {
        var user = await db.Users.Find(u => u.Email == DemoEmail).FirstOrDefaultAsync();
        if (user is null)
        {
            user = new User
            {
                Id = ObjectId.GenerateNewId().ToString(),
                Email = DemoEmail,
                PasswordHash = null,
                AuthProvider = "demo",
            };
            try
            {
                await db.Users.InsertOneAsync(user);
            }
            catch (MongoWriteException e) when (e.WriteError.Category == ServerErrorCategory.DuplicateKey)
            {
                user = await db.Users.Find(u => u.Email == DemoEmail).FirstAsync();
            }
        }

        var hasGoals = await db.Goals.Find(g => g.UserId == user.Id).AnyAsync();
        if (!hasGoals) await SeedAsync(user.Id);
        return user;
    }

    /// <summary>Wipe all demo data and reseed from scratch.</summary>
    public async Task ResetAsync()
    {
        var user = await db.Users.Find(u => u.Email == DemoEmail).FirstOrDefaultAsync();
        if (user is null) return;
        await db.Goals.DeleteManyAsync(g => g.UserId == user.Id);
        await db.Checkins.DeleteManyAsync(c => c.UserId == user.Id);
        await db.WeeklyAttempts.DeleteManyAsync(w => w.UserId == user.Id);
        await SeedAsync(user.Id);
    }

    private async Task SeedAsync(string userId)
    {
        var goals = new List<Goal>();
        var order = 0;

        Goal Make(string title, string type, Goal? parent, List<Stage>? stages = null,
            NumericProgress? numeric = null, double progress = 0)
        {
            var g = new Goal
            {
                Id = ObjectId.GenerateNewId().ToString(),
                UserId = userId,
                ParentId = parent?.Id,
                Ancestors = parent is null ? [] : [.. parent.Ancestors, parent.Id],
                Title = title,
                ProgressType = type,
                Stages = stages,
                Numeric = numeric,
                Progress = progress,
                Order = order++,
            };
            goals.Add(g);
            return g;
        }

        // ---- Root 1: multi-level tree exercising every progress type ----
        var english = Make("Speak English fluently", ProgressTypes.Rollup, null);

        var foundation = Make("Build the foundation", ProgressTypes.Rollup, english);
        Make("Set up learning routine", ProgressTypes.Stages, foundation, stages:
        [
            new Stage { Title = "Pick a textbook", Done = true },
            new Stage { Title = "Install Anki", Done = true },
            new Stage { Title = "Find a language partner", Done = true },
            new Stage { Title = "Schedule weekly reviews", Done = false },
        ]);
        Make("Learn 2,000 core words", ProgressTypes.Numeric, foundation,
            numeric: new NumericProgress { Target = 2000, Current = 830, Unit = "words" });

        var practice = Make("Daily & weekly practice", ProgressTypes.Rollup, english);
        var shadowing = Make("Shadow a podcast 15 min", ProgressTypes.Daily, practice);
        var conversation = Make("2 conversation sessions", ProgressTypes.Weekly, practice);
        Make("Overall confidence", ProgressTypes.Manual, english, progress: 45);

        // ---- Root 2: a second big goal so the dashboard has depth ----
        var fitness = Make("Run a 10K race", ProgressTypes.Rollup, null);
        var run = Make("Morning run", ProgressTypes.Daily, fitness);
        Make("Weekly distance", ProgressTypes.Numeric, fitness,
            numeric: new NumericProgress { Target = 10, Current = 6.5, Unit = "km" });

        await db.Goals.InsertManyAsync(goals);

        // ---- Check-in history (last 14 days) so streaks + heatmap look alive ----
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var checkins = new List<Checkin>();
        for (var i = 0; i < 14; i++)
        {
            var day = today.AddDays(-i).ToString("yyyy-MM-dd");
            // shadowing: unbroken 9-day streak, plus a few scattered older days
            if (i < 9 || i is 11 or 13)
                checkins.Add(NewCheckin(userId, shadowing.Id, day));
            // run: every other day — partial heatmap shading
            if (i % 2 == 0)
                checkins.Add(NewCheckin(userId, run.Id, day));
        }
        await db.Checkins.InsertManyAsync(checkins);

        // ---- Weekly history: 4 recorded weeks (pass, pass, fail, pass) ----
        var monday = GoalEndpointHelpers.MondayOf(today);
        string[] results = ["pass", "fail", "pass", "pass"]; // index 0 = this week
        var attempts = new List<WeeklyAttempt>();
        for (var w = 0; w < results.Length; w++)
        {
            attempts.Add(new WeeklyAttempt
            {
                Id = ObjectId.GenerateNewId().ToString(),
                UserId = userId,
                GoalId = conversation.Id,
                WeekOf = monday.AddDays(-7 * w).ToString("yyyy-MM-dd"),
                Result = results[w],
            });
        }
        await db.WeeklyAttempts.InsertManyAsync(attempts);
    }

    private static Checkin NewCheckin(string userId, string goalId, string date) => new()
    {
        Id = ObjectId.GenerateNewId().ToString(),
        UserId = userId,
        GoalId = goalId,
        Date = date,
        Done = true,
    };
}

public static class GoalEndpointHelpers
{
    public static DateOnly MondayOf(DateOnly date)
    {
        var diff = ((int)date.DayOfWeek + 6) % 7; // Monday = 0
        return date.AddDays(-diff);
    }
}

/// <summary>Wipes and reseeds the demo account every hour.</summary>
public class DemoResetService(IServiceProvider services, ILogger<DemoResetService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = services.CreateScope();
                await scope.ServiceProvider.GetRequiredService<DemoService>().ResetAsync();
                logger.LogInformation("Demo account reset");
            }
            catch (Exception e)
            {
                logger.LogWarning(e, "Demo reset failed (will retry next hour)");
            }
        }
    }
}
