using Bonsai.Api.Models;
using Bonsai.Api.Services.Llm;

namespace Bonsai.Api.Tests;

public class BreakdownTreeBuilderTests
{
    private const string UserId = "507f1f77bcf86cd799439011";

    private static Goal Root() => new()
    {
        Id = "507f1f77bcf86cd799439099",
        UserId = UserId,
        Title = "Root goal",
        ProgressType = ProgressTypes.Rollup,
        Ancestors = [],
    };

    private static BreakdownItem Item(string id, string? parent, string type = "rollup", string? title = null, string? weeklyTarget = null) =>
        new() { TempId = id, ParentTempId = parent, Title = title ?? $"Goal {id}", ProgressType = type, WeeklyTarget = weeklyTarget };

    // ---- happy paths ----

    [Fact]
    public void TwoLevels_BuildsChildrenUnderRoot()
    {
        var root = Root();
        var items = new[]
        {
            Item("n1", null),
            Item("n2", "n1", "weekly"),
            Item("n3", "n1", "daily"),
        };

        var goals = BreakdownTreeBuilder.Build(items, root, UserId);

        Assert.Equal(2, goals.Count); // root item maps onto the existing goal, not duplicated
        Assert.All(goals, g => Assert.Equal(root.Id, g.ParentId));
        Assert.All(goals, g => Assert.Equal([root.Id], g.Ancestors));
        Assert.Equal(0, goals[0].Order);
        Assert.Equal(1, goals[1].Order);
    }

    [Fact]
    public void SixLevelChain_BuildsWithCorrectAncestors()
    {
        var root = Root();
        var items = new[]
        {
            Item("n1", null),
            Item("n2", "n1"),
            Item("n3", "n2"),
            Item("n4", "n3"),
            Item("n5", "n4", "weekly"),
            Item("n6", "n5", "daily"),
        };

        var goals = BreakdownTreeBuilder.Build(items, root, UserId);

        Assert.Equal(5, goals.Count);
        // deepest goal: ancestors chain root -> n2 -> n3 -> n4 -> n5
        var deepest = goals[^1];
        Assert.Equal(5, deepest.Ancestors.Count);
        Assert.Equal(root.Id, deepest.Ancestors[0]);
        // parents always appear in the list before their children
        for (var i = 0; i < goals.Count; i++)
        {
            var parentId = goals[i].ParentId!;
            var parentIndex = goals.FindIndex(g => g.Id == parentId);
            Assert.True(parentIndex < i, "parent must be built before its child");
        }
    }

    [Fact]
    public void WeeklyTarget_IsAppendedToWeeklyTitles()
    {
        var goals = BreakdownTreeBuilder.Build(
            [Item("n1", null), Item("n2", "n1", "weekly", "Run", "3 sessions")],
            Root(), UserId);

        Assert.Equal("Run — 3 sessions", goals[0].Title);
    }

    [Fact]
    public void UnknownProgressType_FallsBackToRollup()
    {
        var goals = BreakdownTreeBuilder.Build(
            [Item("n1", null), Item("n2", "n1", "sprint")],
            Root(), UserId);

        Assert.Equal(ProgressTypes.Rollup, goals[0].ProgressType);
    }

    // ---- rejection paths (must throw the typed exception, never crash) ----

    [Fact]
    public void SevenLevels_IsRejected()
    {
        var items = new List<BreakdownItem> { Item("n1", null) };
        for (var i = 2; i <= 7; i++) items.Add(Item($"n{i}", $"n{i - 1}"));

        var ex = Assert.Throws<BreakdownValidationException>(() =>
            BreakdownTreeBuilder.Build(items, Root(), UserId));
        Assert.Contains("depth", ex.Message);
    }

    [Fact]
    public void UnknownParentRef_IsRejected()
    {
        var items = new[] { Item("n1", null), Item("n2", "does-not-exist") };
        Assert.Throws<BreakdownValidationException>(() =>
            BreakdownTreeBuilder.Build(items, Root(), UserId));
    }

    [Fact]
    public void Cycle_IsRejected()
    {
        // n2 -> n3 -> n2 cycle, disconnected from the root
        var items = new[] { Item("n1", null), Item("n2", "n3"), Item("n3", "n2") };
        var ex = Assert.Throws<BreakdownValidationException>(() =>
            BreakdownTreeBuilder.Build(items, Root(), UserId));
        Assert.Contains("cycle", ex.Message);
    }

    [Fact]
    public void SelfParent_IsRejected()
    {
        var items = new[] { Item("n1", null), Item("n2", "n2") };
        Assert.Throws<BreakdownValidationException>(() =>
            BreakdownTreeBuilder.Build(items, Root(), UserId));
    }

    [Fact]
    public void NoRoot_IsRejected()
    {
        var items = new[] { Item("n1", "n2"), Item("n2", "n1") };
        Assert.Throws<BreakdownValidationException>(() =>
            BreakdownTreeBuilder.Build(items, Root(), UserId));
    }

    [Fact]
    public void TwoRoots_AreRejected()
    {
        var items = new[] { Item("n1", null), Item("n2", null) };
        var ex = Assert.Throws<BreakdownValidationException>(() =>
            BreakdownTreeBuilder.Build(items, Root(), UserId));
        Assert.Contains("root", ex.Message);
    }

    [Fact]
    public void DuplicateTempIds_AreRejected()
    {
        var items = new[] { Item("n1", null), Item("n2", "n1"), Item("n2", "n1") };
        Assert.Throws<BreakdownValidationException>(() =>
            BreakdownTreeBuilder.Build(items, Root(), UserId));
    }

    [Fact]
    public void EmptyList_IsRejected()
    {
        Assert.Throws<BreakdownValidationException>(() =>
            BreakdownTreeBuilder.Build([], Root(), UserId));
    }
}
