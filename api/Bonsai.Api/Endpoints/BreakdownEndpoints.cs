using System.Security.Claims;
using Bonsai.Api.Models;
using Bonsai.Api.Services.Llm;
using Bonsai.Api.Services;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Bonsai.Api.Endpoints;

public record BreakdownRequest(string Title, string? Context, string? ParentId);
public record SubBreakdownRequest(string? Instruction);
public record SubBreakdownConfirmRequest(List<BreakdownItem> Items);

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

            // Resolve the parent up front (but don't create anything yet).
            Goal? existingRoot = null;
            if (req.ParentId is not null)
            {
                existingRoot = await db.Goals.Find(g => g.Id == req.ParentId && g.UserId == userId).FirstOrDefaultAsync();
                if (existingRoot is null) return Results.NotFound(new { error = "Parent goal not found" });

                // Full-tree breakdown is for a goal that's still a blank slate — it has no
                // idea what's already underneath and would just pile on more siblings next
                // to whatever's there (see sub-breakdown for the "this node already has
                // children" case, which builds its prompt around the existing subtree).
                var hasChildren = await db.Goals.Find(g => g.UserId == userId && g.ParentId == existingRoot.Id).AnyAsync();
                if (hasChildren)
                {
                    return Results.Json(
                        new { error = "This goal already has sub-goals. Use sub-breakdown on a specific node, or add goals manually.", code = "already_has_children" },
                        statusCode: StatusCodes.Status409Conflict);
                }
            }

            // Call the LLM BEFORE creating the root goal, so a missing key or
            // provider failure doesn't leave an empty goal behind.
            BreakdownResult result;
            try
            {
                result = await breakdown.BreakDownAsync(userId, req.Title, req.Context);
            }
            catch (LlmKeyMissingException)
            {
                return Results.BadRequest(new
                {
                    error = "No LLM API key configured. Add one in Settings to use AI breakdown.",
                    code = "llm_key_missing",
                });
            }
            catch (LlmProviderException e)
            {
                return Results.Json(new { error = e.Message, code = "llm_provider_error" }, statusCode: 502);
            }

            Goal root;
            if (existingRoot is not null)
            {
                root = existingRoot;
                // The breakdown makes this goal the parent of the new subtree. If its
                // current type ignores children (stages/manual/numeric/daily/weekly),
                // its progress would stay frozen no matter how the subtree advances —
                // promote it to rollup so the children's progress actually propagates.
                if (!ProgressTypes.AggregatesChildren(root.ProgressType))
                {
                    root.ProgressType = ProgressTypes.Rollup;
                    await db.Goals.UpdateOneAsync(g => g.Id == root.Id,
                        Builders<Goal>.Update
                            .Set(g => g.ProgressType, ProgressTypes.Rollup)
                            .Set(g => g.UpdatedAt, DateTime.UtcNow));
                }
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

            // Flat list -> real goals, parents-first, ancestors derived per level.
            List<Goal> docs;
            try
            {
                docs = BreakdownTreeBuilder.Build(result.Items, root, userId);
            }
            catch (BreakdownValidationException e)
            {
                // Don't leave behind the root we just created for this breakdown
                if (existingRoot is null) await db.Goals.DeleteOneAsync(g => g.Id == root.Id);
                return Results.Json(new { error = $"The model returned an invalid tree: {e.Message}", code = "llm_provider_error" }, statusCode: 502);
            }

            if (docs.Count > 0) await db.Goals.InsertManyAsync(docs);

            var all = await progress.ComputeTreeAsync(userId);
            var subtreeIds = docs.Select(d => d.Id).Append(root.Id).ToHashSet();
            return Results.Ok(all.Where(g => subtreeIds.Contains(g.Id)));
        }).RequireAuthorization().RequireRateLimiting("ai");

        // Sub-breakdown, step 1: ask the LLM for children of an EXISTING node without
        // touching anything else in the tree, and return a preview — nothing is
        // persisted yet. The client resubmits the same "items" list to /confirm.
        app.MapPost("/goals/{nodeId}/sub-breakdown", async (string nodeId, SubBreakdownRequest req,
            ClaimsPrincipal user, MongoContext db, BreakdownService breakdown) =>
        {
            var userId = user.UserId();
            var allGoals = await db.Goals.Find(g => g.UserId == userId).ToListAsync();
            var node = allGoals.FirstOrDefault(g => g.Id == nodeId);
            if (node is null) return Results.NotFound();

            var byId = allGoals.ToDictionary(g => g.Id);
            var ancestorTitles = node.Ancestors
                .Select(id => byId.TryGetValue(id, out var a) ? a.Title : null)
                .Where(t => t is not null).Select(t => t!).ToList();
            var existingChildren = allGoals
                .Where(g => g.ParentId == nodeId && g.Status != GoalStatuses.Archived)
                .Select(g => $"{g.Title} ({g.ProgressType})")
                .ToList();

            var context = SubBreakdownPrompt.BuildContext(ancestorTitles, node.Description, existingChildren, req.Instruction);

            BreakdownResult result;
            try
            {
                result = await breakdown.BreakDownAsync(userId, node.Title, context);
            }
            catch (LlmKeyMissingException)
            {
                return Results.BadRequest(new
                {
                    error = "No LLM API key configured. Add one in Settings, or use \"Add subgoal\" to build this branch by hand.",
                    code = "llm_key_missing",
                });
            }
            catch (LlmProviderException e)
            {
                return Results.Json(new { error = e.Message, code = "llm_provider_error" }, statusCode: 502);
            }

            List<Goal> preview;
            try
            {
                // Build against the real node so ancestors/depth are validated exactly as
                // they will be at confirm time — but nothing here touches the database.
                preview = BreakdownTreeBuilder.Build(result.Items, node, userId);
            }
            catch (BreakdownValidationException e)
            {
                return Results.Json(new { error = $"The model returned an invalid tree: {e.Message}", code = "llm_provider_error" }, statusCode: 502);
            }

            return Results.Ok(new
            {
                nodeId,
                items = result.Items, // raw flat list — resend verbatim to /confirm
                preview,              // materialised shape for rendering; these ids are throwaway
                rootTypeChange = ProgressTypes.AggregatesChildren(node.ProgressType)
                    ? null
                    : new { from = node.ProgressType, to = ProgressTypes.Rollup },
            });
        }).RequireAuthorization().RequireRateLimiting("ai");

        // Sub-breakdown, step 2: the user reviewed the preview and confirmed — persist
        // the same items list for real under the same node.
        app.MapPost("/goals/{nodeId}/sub-breakdown/confirm", async (string nodeId, SubBreakdownConfirmRequest req,
            ClaimsPrincipal user, MongoContext db, ProgressService progress) =>
        {
            var userId = user.UserId();
            var node = await db.Goals.Find(g => g.Id == nodeId && g.UserId == userId).FirstOrDefaultAsync();
            if (node is null) return Results.NotFound();

            if (!ProgressTypes.AggregatesChildren(node.ProgressType))
            {
                node.ProgressType = ProgressTypes.Rollup;
                await db.Goals.UpdateOneAsync(g => g.Id == node.Id,
                    Builders<Goal>.Update
                        .Set(g => g.ProgressType, ProgressTypes.Rollup)
                        .Set(g => g.UpdatedAt, DateTime.UtcNow));
            }

            List<Goal> docs;
            try
            {
                docs = BreakdownTreeBuilder.Build(req.Items, node, userId);
            }
            catch (BreakdownValidationException e)
            {
                return Results.Json(new { error = $"The model returned an invalid tree: {e.Message}", code = "llm_provider_error" }, statusCode: 502);
            }

            if (docs.Count > 0) await db.Goals.InsertManyAsync(docs);

            var all = await progress.ComputeTreeAsync(userId);
            var subtreeIds = docs.Select(d => d.Id).Append(node.Id).ToHashSet();
            return Results.Ok(all.Where(g => subtreeIds.Contains(g.Id)));
        }).RequireAuthorization().RequireRateLimiting("ai");
    }
}
