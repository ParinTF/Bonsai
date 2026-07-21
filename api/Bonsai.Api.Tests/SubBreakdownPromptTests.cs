using Bonsai.Api.Services.Llm;

namespace Bonsai.Api.Tests;

public class SubBreakdownPromptTests
{
    [Fact]
    public void RestatesTheRootItemRequirement_SoTheModelDoesNotDropIt()
    {
        // Regression: an earlier wording told the model "do not recreate the node
        // itself," which contradicted BreakdownPrompt's "exactly ONE root item"
        // rule. Under a focused user instruction the model would drop the root
        // wrapper entirely, and BreakdownTreeBuilder rejected the response with
        // "Expected exactly one root item, got 0". The context must keep restating
        // the requirement even while telling the model not to recreate the tree
        // ABOVE the node.
        var context = SubBreakdownPrompt.BuildContext([], null, [], null);
        Assert.Contains("exactly ONE item with parentTempId = null", context);
    }

    [Fact]
    public void IncludesAncestorPath_WhenPresent()
    {
        var context = SubBreakdownPrompt.BuildContext(["Get fit this year", "Cardio"], null, [], null);
        Assert.Contains("Get fit this year > Cardio", context);
    }

    [Fact]
    public void OmitsAncestorLine_WhenNoAncestors()
    {
        var context = SubBreakdownPrompt.BuildContext([], null, [], null);
        Assert.DoesNotContain("Path from the top-level goal", context);
    }

    [Fact]
    public void IncludesNodeDescription_WhenPresent()
    {
        var context = SubBreakdownPrompt.BuildContext([], "Run outdoors, easy pace", [], null);
        Assert.Contains("Run outdoors, easy pace", context);
    }

    [Fact]
    public void ListsExistingChildren_AndWarnsNotToDuplicate()
    {
        var context = SubBreakdownPrompt.BuildContext([], null, ["Morning run (daily)", "Gym 3x a week (weekly)"], null);
        Assert.Contains("do NOT recreate them", context);
        Assert.Contains("Morning run (daily)", context);
        Assert.Contains("Gym 3x a week (weekly)", context);
    }

    [Fact]
    public void OmitsExistingChildrenBlock_WhenNodeHasNoChildrenYet()
    {
        var context = SubBreakdownPrompt.BuildContext([], null, [], null);
        Assert.DoesNotContain("already has these children", context);
    }

    [Fact]
    public void IncludesUserInstruction_WhenGiven()
    {
        var context = SubBreakdownPrompt.BuildContext([], null, [], "Focus on speaking practice, 4 steps");
        Assert.Contains("Focus on speaking practice, 4 steps", context);
    }

    [Fact]
    public void OmitsInstructionLine_WhenNotGiven()
    {
        var context = SubBreakdownPrompt.BuildContext([], null, [], null);
        Assert.DoesNotContain("Additional instruction", context);
    }
}
