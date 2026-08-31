// Template for generating scripts/LintCpom.cs in scaffolded C# projects. create-if-absent.
// Executed via .NET's file-based apps feature (.NET 10 SDK and later):
//   dotnet run --file scripts/LintCpom.cs
// No .csproj needed, no NuGet packages - only the .NET base class library.
//
// IMPORTANT (confirmed via live web search, Microsoft Learn "File-based apps" doc, dated
// 2026-04-22/2026-06-29): file-based apps require the .NET 10 SDK. This project's own .csproj
// targets net8.0, and the generated CI templates currently install/pin the .NET 8 SDK
// (actions/setup-dotnet dotnet-version: '8.0.x'; mcr.microsoft.com/dotnet/sdk:8.0 images). Running
// this script therefore needs the .NET 10 SDK installed *alongside* (not instead of) the .NET 8
// toolchain already used to build/test the rest of the project - see cicd.ts for how each CI
// provider's template was adjusted to add it without touching the existing net8.0 build/test path.
//
// Always invoke with the explicit "--file" flag. A bare "dotnet run LintCpom.cs" in a directory
// that already contains a .csproj (which this project's root always does) runs that project
// instead and silently passes the filename as a program argument - it will not run this linter
// and will not fail, which is exactly the "fake green" failure mode this linter exists to prevent.

export function renderCpomLinterCsharp(): string {
  return `// CPOM Contract & Anti-Fake-Green Linter (C#)
// Zero-dependency static rule auditor for Page Objects, Components, and Test Specs.
// Runs via .NET's file-based apps feature (.NET 10 SDK and later):
//   dotnet run --file scripts/LintCpom.cs
// No .csproj needed, no NuGet packages - only the .NET base class library.
//
// IMPORTANT: this project's own .csproj (in the same directory tree) targets net8.0; file-based
// apps require the .NET 10 SDK to be installed on the machine/CI runner in addition to (not
// instead of) the .NET 8 runtime already used to build/test the rest of this project. Always
// invoke with the explicit "--file" flag - a bare "dotnet run LintCpom.cs" in a directory that
// already contains a .csproj runs that project instead and silently passes the filename as a
// program argument, which would neither run this linter nor fail the build.
//
// Rules enforced (parity with scripts/lint-cpom.js for TypeScript/JavaScript/Cypress):
//   1. Zero Arbitrary Delays - no Thread.Sleep() / Task.Delay() / WaitForTimeoutAsync().
//   2. Mandatory NowAsync() suffix for non-retrying state getters in components (Is*/Has*/Get*).
//   3. Zero assertions inside Component & Page Object classes (Assert.*, Expect(...)).
//   4. Non-Retrying State Assertion Guard - flags Assert.That/IsTrue/IsFalse wrapping a raw
//      IsVisibleAsync()/IsEnabledAsync()/... call in test specs; recommends Playwright's
//      auto-retrying Expect(locator).ToBeVisibleAsync() instead. Best-effort, single-line
//      heuristic - same confidence tier as the existing TypeScript Rule 4.
//   5. Fixture Dependency Injection - rejects raw "new SomePage(...)" / "new SomeComponent(...)"
//      in test specs outside setup/fixture files.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

var cwd = Directory.GetCurrentDirectory();
var targetDirs = new[] { "components", "tests", "shared" };
var ignoredDirNames = new HashSet<string> { "bin", "obj", ".vs", ".git", "test-results", "node_modules" };
var assertionMethods = new[] {
    "Assert.That(", "Assert.IsTrue(", "Assert.IsFalse(", "Assert.AreEqual(",
    "Assert.AreNotEqual(", "Assert.IsNull(", "Assert.IsNotNull(", "Expect("
};
var stateReadCalls = new[] {
    ".IsVisibleAsync()", ".IsEnabledAsync()", ".IsCheckedAsync()",
    ".IsHiddenAsync()", ".IsDisabledAsync()", ".IsEditableAsync()"
};
// Methods/properties returning one of these framework/structural types are never a point-in-time
// state read (they hand back a live handle, not a snapshot value) - exempt by return type rather
// than by a fixed name list, so a future GetLocator()-shaped accessor is still exempt and a future
// GetValueNowAsync()-shaped state reader is still correctly caught.
var structuralReturnTypes = new HashSet<string> { "ILocator", "IPage", "IBrowserContext", "IFrame", "IElementHandle" };

var violations = new List<(string File, int Line, string Rule, string Message, string Snippet)>();
var files = new List<string>();

foreach (var target in targetDirs)
{
    var dir = Path.Combine(cwd, target);
    if (Directory.Exists(dir))
    {
        Walk(dir, files);
    }
}

if (files.Count == 0)
{
    Console.WriteLine("[INFO] No components or tests directory found to lint.");
    return;
}

foreach (var file in files)
{
    AuditFile(file);
}

if (violations.Count == 0)
{
    Console.WriteLine($"[PASS] CPOM Contract & Anti-Fake-Green Audit Passed ({files.Count} files checked).");
    return;
}

Console.Error.WriteLine();
Console.Error.WriteLine($"[FAIL] CPOM Contract Violations Found ({violations.Count} issues):");
Console.Error.WriteLine();
foreach (var v in violations)
{
    Console.Error.WriteLine($"  {v.File}:{v.Line} [{v.Rule}]");
    Console.Error.WriteLine($"    Error: {v.Message}");
    Console.Error.WriteLine($"    Code:  {v.Snippet}");
    Console.Error.WriteLine();
}
Environment.Exit(1);

void Walk(string dir, List<string> outFiles)
{
    foreach (var entry in Directory.GetFileSystemEntries(dir))
    {
        var name = Path.GetFileName(entry);
        if (ignoredDirNames.Contains(name))
        {
            continue;
        }
        if (Directory.Exists(entry))
        {
            Walk(entry, outFiles);
        }
        else if (entry.EndsWith(".cs"))
        {
            outFiles.Add(entry);
        }
    }
}

void AuditFile(string file)
{
    var relPath = Path.GetRelativePath(cwd, file).Replace(Path.DirectorySeparatorChar, '/');
    var isComponent = relPath.StartsWith("components/");
    var isTest = relPath.StartsWith("tests/");
    var isFixtureOrSetup = relPath.Contains("Setup") || relPath.Contains("Fixture");

    var lines = File.ReadAllLines(file);
    for (var i = 0; i < lines.Length; i++)
    {
        var line = lines[i];
        var trimmed = line.Trim();
        var lineNum = i + 1;

        if (trimmed.StartsWith("//") || trimmed.StartsWith("/*") || trimmed.StartsWith("*"))
        {
            continue;
        }

        if (line.Contains("Thread.Sleep(") || line.Contains("Task.Delay(") || line.Contains(".WaitForTimeoutAsync("))
        {
            violations.Add((relPath, lineNum, "Rule 1: Zero Arbitrary Delays",
                "Arbitrary delay detected. Use web-first auto-retrying assertions or state waiters instead.",
                trimmed));
        }

        if (isComponent)
        {
            var sig = ExtractMethodSignature(trimmed);
            if (sig != null && !structuralReturnTypes.Contains(sig.Value.ReturnType))
            {
                var methodName = sig.Value.Name;
                var isStateGetter = StartsWithPrefix(methodName, "Is") || StartsWithPrefix(methodName, "Has") || StartsWithPrefix(methodName, "Get");
                if (isStateGetter && !methodName.EndsWith("NowAsync") && !methodName.EndsWith("Now"))
                {
                    violations.Add((relPath, lineNum, "Rule 2: Mandatory NowAsync() Suffix",
                        $"State reader \\"{methodName}\\" in component must have a \\"NowAsync()\\" suffix " +
                        $"(e.g. {methodName}NowAsync()) to signify point-in-time read.",
                        trimmed));
                }
            }
        }

        if (isComponent)
        {
            foreach (var needle in assertionMethods)
            {
                if (line.Contains(needle))
                {
                    violations.Add((relPath, lineNum, "Rule 3: Zero Assertions in Components",
                        $"Assertion \\"{needle}\\" found in component. Components must only provide locators " +
                        "and actions; assertions belong in test specs.",
                        trimmed));
                    break;
                }
            }
        }

        if (isTest)
        {
            var hasRawAssert = line.Contains("Assert.That(") || line.Contains("Assert.IsTrue(") || line.Contains("Assert.IsFalse(");
            if (hasRawAssert)
            {
                foreach (var call in stateReadCalls)
                {
                    if (line.Contains(call))
                    {
                        violations.Add((relPath, lineNum, "Rule 4: Non-Retrying State Assertion Guard",
                            $"Raw \\"{call}\\" wrapped in a plain Assert does not auto-retry and can race the " +
                            "browser. Use Expect(locator).ToBeVisibleAsync() (or the matching web-first " +
                            "assertion) instead.",
                            trimmed));
                        break;
                    }
                }
            }
        }

        if (isTest && !isFixtureOrSetup)
        {
            var newTarget = ExtractNewPageOrComponent(line);
            if (newTarget != null)
            {
                violations.Add((relPath, lineNum, "Rule 5: Fixture Dependency Injection",
                    $"Direct instantiation \\"new {newTarget}(...)\\" detected in test spec. Inject Page " +
                    "Objects/components via PageTest's built-in Page fixture or a shared setup helper instead.",
                    trimmed));
            }
        }
    }
}

bool StartsWithPrefix(string name, string prefix)
{
    return name.Length > prefix.Length && name.StartsWith(prefix) && char.IsUpper(name[prefix.Length]);
}

(string ReturnType, string Name)? ExtractMethodSignature(string trimmedLine)
{
    if (!trimmedLine.Contains("public") || !trimmedLine.Contains("("))
    {
        return null;
    }
    var parenIdx = trimmedLine.IndexOf('(');
    var beforeParen = trimmedLine.Substring(0, parenIdx).Trim();
    var tokens = beforeParen.Split(' ').Where(t => t.Length > 0).ToList();
    if (tokens.Count < 2)
    {
        return null;
    }
    var name = tokens[tokens.Count - 1];
    if (name == "=>")
    {
        return null;
    }
    var returnType = tokens[tokens.Count - 2];
    return (returnType, name);
}

string ExtractNewPageOrComponent(string line)
{
    var idx = line.IndexOf("new ");
    if (idx < 0)
    {
        return null;
    }
    var rest = line.Substring(idx + 4).Trim();
    var parenIdx = rest.IndexOf('(');
    if (parenIdx < 0)
    {
        return null;
    }
    var className = rest.Substring(0, parenIdx).Trim();
    if (className.Length == 0 || !char.IsUpper(className[0]))
    {
        return null;
    }
    if (className.EndsWith("Page") || className.EndsWith("Component"))
    {
        return className;
    }
    return null;
}
`;
}
