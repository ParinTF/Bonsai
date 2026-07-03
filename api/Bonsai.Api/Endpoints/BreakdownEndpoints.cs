using System.Security.Claims;
using Bonsai.Api.Models;
using Bonsai.Api.Services;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Bonsai.Api.Endpoints;

public record BreakdownRequest(string Title, string? Context, string? ParentId);

public static class BreakdownEndpoints
{
    public static void MapBreakdownEndpoints(this WebApplication app)
    {
        // Breaks a big goal into a tree via the Anthropic API, then persists it as real Goal documents.
        app.MapPost("/goals/breakdown", async (BreakdownRequest req, ClaimsPrincipal user,
            MongoContext db, BreakdownService breakdown, ProgressService progress) =>
        {
            if (string.IsNullOrWhiteSpace(req.Title))
                return Results.BadRequest(new { error = "Title is required" });

            var userId = user.UserId();

            // Root goal: existing (ParentId given) or a new rollup goal
            Goal root;
            if (req.ParentId is not null)
            {
                root = await db.Goals.Find(g => g.Id == req.ParentId && g.UserId == userId).FirstOrDefaultAsync();
                if (root is null) return Results.NotFound(new { error = "Parent goal not found" });
            }
            else
            {
                var rootCount = await db.Goals.CountDocumentsAsync(g => g.UserId == userId && g.ParentId == null);
                root = new Goal
                {
                    Id = ObjectId.GenerateNewId().ToString(),
                    UserId = userId,
                    Title = req.Title.Trim(),
                    ProgressType = ProgressTypes.Rollup,
                    Order = (int)rootCount,
                };
                await db.Goals.InsertOneAsync(root);
            }

            var result = await breakdown.BreakDownAsync(req.Title, req.Context);

            var docs = new List<Goal>();
            void Persist(List<BreakdownNode> nodes, Goal parent)
            {
                var order = 0;
                foreach (var node in nodes)
                {
                    var goal = new Goal
                    {
                        Id = ObjectId.GenerateNewId().ToString(),
                        UserId = userId,
                        ParentId = parent.Id,
                        Ancestors = [.. parent.Ancestors, parent.Id],
                        Title = node.Title,
                        ProgressType = ProgressTypes.All.Contains(node.ProgressType) ? node.ProgressType : ProgressTypes.Rollup,
                        Order = order++,
                    };
                    docs.Add(goal);
                    if (node.Children.Count > 0) Persist(node.Children, goal);
                }
            }
            Persist(result.Children, root);

            if (docs.Count > 0) await db.Goals.InsertManyAsync(docs);

            var all = await progress.ComputeTreeAsync(userId);
            var subtreeIds = docs.Select(d => d.Id).Append(root.Id).ToHashSet();
            return Results.Ok(all.Where(g => subtreeIds.Contains(g.Id)));
        }).RequireAuthorization();
    }
}
