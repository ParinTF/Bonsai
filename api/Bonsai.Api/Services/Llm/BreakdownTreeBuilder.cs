using Bonsai.Api.Models;
using MongoDB.Bson;

namespace Bonsai.Api.Services.Llm;

/// <summary>Thrown when the LLM's flat item list doesn't form a valid tree.</summary>
public class BreakdownValidationException(string message) : Exception(message);

/// <summary>
/// Converts the LLM's flat tempId/parentTempId item list into real Goal
/// documents. Pure logic (no I/O) so it is unit-testable: real ObjectIds are
/// generated up front, parents are processed before children (BFS), and each
/// child's ancestors array is derived from its already-built parent.
/// </summary>
public static class BreakdownTreeBuilder
{
    public const int MaxDepth = 6; // root = level 1

    /// <summary>
    /// Builds Goal documents for every non-root item, attached under
    /// <paramref name="root"/> (the LLM's single parentTempId=null item is
    /// mapped onto the existing root goal, not duplicated). The returned list
    /// is ordered parents-first, ready for insertion.
    /// </summary>
    public static List<Goal> Build(IReadOnlyList<BreakdownItem> items, Goal root, string userId)
    {
        if (items.Count == 0)
            throw new BreakdownValidationException("The model returned no items");

        // --- shape validation ---
        var byTempId = new Dictionary<string, BreakdownItem>();
        foreach (var item in items)
        {
            if (string.IsNullOrWhiteSpace(item.TempId))
                throw new BreakdownValidationException("An item is missing its tempId");
            if (string.IsNullOrWhiteSpace(item.Title))
                throw new BreakdownValidationException($"Item '{item.TempId}' is missing a title");
            if (!byTempId.TryAdd(item.TempId, item))
                throw new BreakdownValidationException($"Duplicate tempId '{item.TempId}'");
        }

        var roots = items.Where(i => i.ParentTempId is null).ToList();
        if (roots.Count != 1)
            throw new BreakdownValidationException($"Expected exactly one root item, got {roots.Count}");
        var rootItem = roots[0];

        foreach (var item in items)
        {
            if (item.ParentTempId is not null && !byTempId.ContainsKey(item.ParentTempId))
                throw new BreakdownValidationException($"Item '{item.TempId}' points at unknown parent '{item.ParentTempId}'");
            if (item.ParentTempId == item.TempId)
                throw new BreakdownValidationException($"Item '{item.TempId}' is its own parent");
        }

        // --- BFS from the root: assigns depth, orders parents-first, and
        //     leaves any cycle disconnected (detected afterwards) ---
        var childrenOf = items
            .Where(i => i.ParentTempId is not null)
            .GroupBy(i => i.ParentTempId!)
            .ToDictionary(g => g.Key, g => g.ToList());

        // tempId -> the real goal (root maps to the existing root goal)
        var real = new Dictionary<string, Goal> { [rootItem.TempId] = root };
        var result = new List<Goal>();
        var queue = new Queue<(BreakdownItem Item, int Depth)>();
        queue.Enqueue((rootItem, 1));
        var visited = 0;

        while (queue.Count > 0)
        {
            var (item, depth) = queue.Dequeue();
            visited++;
            if (depth > MaxDepth)
                throw new BreakdownValidationException($"Tree exceeds the maximum depth of {MaxDepth} levels");

            if (!childrenOf.TryGetValue(item.TempId, out var children)) continue;
            var parent = real[item.TempId];
            var order = 0;
            foreach (var child in children)
            {
                var progressType = ProgressTypes.All.Contains(child.ProgressType) ? child.ProgressType : ProgressTypes.Rollup;
                var goal = new Goal
                {
                    Id = ObjectId.GenerateNewId().ToString(),
                    UserId = userId,
                    ParentId = parent.Id,
                    Ancestors = [.. parent.Ancestors, parent.Id],
                    Title = child.WeeklyTarget is { Length: > 0 } target && child.ProgressType == ProgressTypes.Weekly
                        ? $"{child.Title} — {target}"
                        : child.Title,
                    Description = string.IsNullOrWhiteSpace(child.Description) ? null : child.Description.Trim(),
                    ProgressType = progressType,
                    // Same shape the manual-create endpoint produces: stages/numeric data
                    // only on their own type, so the model's suggested steps and targets
                    // are actually trackable instead of leaving the goal stuck at 0%.
                    Stages = progressType == ProgressTypes.Stages
                        ? (child.Stages ?? []).Where(s => !string.IsNullOrWhiteSpace(s))
                            .Select(s => new Stage { Title = s.Trim() }).ToList()
                        : null,
                    Numeric = progressType == ProgressTypes.Numeric
                        ? new NumericProgress { Target = child.NumericTarget ?? 0, Unit = child.NumericUnit ?? "" }
                        : null,
                    Order = order++,
                };
                real[child.TempId] = goal;
                result.Add(goal);
                queue.Enqueue((child, depth + 1));
            }
        }

        // Anything BFS never reached is part of a cycle (or orphaned subgraph)
        if (visited != items.Count)
            throw new BreakdownValidationException("Items contain a cycle or an unreachable subtree");

        return result;
    }
}
