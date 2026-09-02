export interface CsharpProjectOpts {
  projectName: string;
  baseUrl: string;
}

export function renderCsharpCsproj(_opts: CsharpProjectOpts): string {
  return `<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
    <IsTestProject>true</IsTestProject>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.9.0" />
    <PackageReference Include="Microsoft.Playwright.NUnit" Version="1.62.0" />
    <PackageReference Include="NUnit" Version="4.1.0" />
    <PackageReference Include="NUnit3TestAdapter" Version="4.5.0" />
    <PackageReference Include="NUnit.Analyzers" Version="4.0.1" />
    <PackageReference Include="JunitXml.TestLogger" Version="8.0.0" />
  </ItemGroup>

  <!-- Optional, explicit-invoke-only CPOM contract check: \`dotnet build -t:LintCpom\`. Deliberately
       NOT wired into BeforeBuild/Build - scripts/LintCpom.cs runs via .NET's file-based apps
       feature, which requires the .NET 10 SDK installed alongside this project's own net8.0
       target (see scripts/LintCpom.cs's own header comment). Hooking that into the default build
       chain would break \`dotnet build\` for any developer who only has the .NET 8 SDK this project
       actually targets - CI already enforces this contract in a separate job that provisions .NET
       10 for exactly this reason, so this target exists for developers who want the same check
       locally before pushing, opted in, not on by default. -->
  <Target Name="LintCpom">
    <Exec Command="dotnet run --file scripts/LintCpom.cs" WorkingDirectory="$(MSBuildProjectDirectory)" />
  </Target>

</Project>
`;
}

export function renderCsharpGitignore(): string {
  return `bin/
obj/
.vs/
.scaffold/
.scaffold-tmp/
.tms-cache/
*.user
*.suo
*.userosscache
*.sln.docstates
`;
}

export function renderCsharpProjectReadme(opts: CsharpProjectOpts): string {
  return `# ${opts.projectName}

A Playwright + C# (.NET 8 + NUnit) UI-test framework core. It contains a typed component
library (\`components/\`) for building Page Objects, NUnit test fixtures, and worked example tests.

## Run

\`\`\`bash
dotnet build                         # build the C# test assembly
pwsh bin/Debug/net8.0/playwright.ps1 install chromium  # install browser binaries
dotnet test                          # run all tests with NUnit
\`\`\`

### Useful Commands

- **\`dotnet test\`** — runs all NUnit tests in headless mode.
- **\`dotnet test --filter "FullyQualifiedName~ExampleTest"\`** — runs a specific test class.
- **\`dotnet build\`** — compiles the C# solution.
- **\`dotnet build -t:LintCpom\`** — runs the CPOM contract linter locally (requires the .NET 10 SDK
  installed alongside .NET 8; CI runs this automatically in a separate job either way).

## Structure

- **\`${opts.projectName}.csproj\`** — .NET project file with dependencies (Playwright.NUnit, NUnit, SDK).
- **\`components/\`** — component primitives (\`Button\`, \`TextInput\`, \`Checkbox\`, \`NativeSelect\`, \`Link\`, \`FileInput\`, \`Dialog\`, \`Table\`).
- **\`tests/\`** — NUnit tests inheriting from \`PageTest\`.
`;
}

export function renderCsharpScope(): string {
  return `using Microsoft.Playwright;

namespace Components;

public abstract class Scope
{
    public ILocator Locator { get; }

    protected Scope(ILocator locator)
    {
        Locator = locator;
    }

    protected Scope(IPage page)
    {
        Locator = page.Locator("html");
    }
}
`;
}

export function renderCsharpComponent(): string {
  return `using Microsoft.Playwright;

namespace Components;

public class Component : Scope
{
    public Component(ILocator locator) : base(locator) { }

    public async Task<bool> IsVisibleNowAsync() => await Locator.IsVisibleAsync();
    public async Task<bool> IsEnabledNowAsync() => await Locator.IsEnabledAsync();

    public async Task WaitForAnimationsAsync(int timeoutMs = 5000)
    {
        await Locator.EvaluateAsync(@"(el, timeout) => {
            const anims = el.getAnimations ? el.getAnimations({ subtree: true }) : [];
            return Promise.all(anims.map(a => Promise.race([
                a.finished,
                new Promise(r => setTimeout(r, timeout))
            ])));
        }", timeoutMs);
    }
}
`;
}

export function renderCsharpCollection(): string {
  return `using System;
using System.Threading.Tasks;
using Microsoft.Playwright;

namespace Components;

public class Collection<T> where T : Scope
{
    public ILocator Locator { get; }

    public Collection(ILocator locator)
    {
        Locator = locator;
    }

    public T Nth(int index)
    {
        var itemLocator = Locator.Nth(index);
        return (T)Activator.CreateInstance(typeof(T), itemLocator)!;
    }

    public T First => Nth(0);

    public async Task<int> CountAsync()
    {
        return await Locator.CountAsync();
    }
}
`;
}

export function renderCsharpRunsettings(opts: CsharpProjectOpts): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<RunSettings>
  <TestRunParameters>
    <Parameter name="BaseUrl" value="${opts.baseUrl}" />
  </TestRunParameters>
  <Playwright>
    <LaunchOptions Headless="true" />
    <Tracing>true</Tracing>
  </Playwright>
</RunSettings>
`;
}

export function renderCsharpContainer(): string {
  return `using Microsoft.Playwright;

namespace Components;

public class Container : Component
{
    public Container(ILocator locator) : base(locator) { }
}
`;
}

export function renderCsharpBasePage(): string {
  return `using Microsoft.Playwright;

namespace Components;

public abstract class BasePage : Scope
{
    public IPage Page { get; }
    public abstract string Path { get; }

    protected BasePage(IPage page) : base(page)
    {
        Page = page;
    }

    public async Task GotoAsync()
    {
        await Page.GotoAsync(Path);
    }
}
`;
}

export function renderCsharpButton(): string {
  return `using Microsoft.Playwright;

namespace Components.Primitives;

public class Button : Component
{
    public Button(ILocator locator) : base(locator) { }

    public async Task ClickAsync()
    {
        await Locator.ClickAsync();
    }
}
`;
}

export function renderCsharpTextInput(): string {
  return `using Microsoft.Playwright;

namespace Components.Primitives;

public class TextInput : Component
{
    public TextInput(ILocator locator) : base(locator) { }

    public async Task FillAsync(string text)
    {
        await Locator.FillAsync(text);
    }

    public async Task<string> GetValueNowAsync()
    {
        return await Locator.InputValueAsync();
    }

    public async Task ClearAsync()
    {
        await Locator.ClearAsync();
    }
}
`;
}

export function renderCsharpCheckbox(): string {
  return `using Microsoft.Playwright;

namespace Components.Primitives;

public class Checkbox : Component
{
    public Checkbox(ILocator locator) : base(locator) { }

    public async Task CheckAsync() => await Locator.CheckAsync();
    public async Task UncheckAsync() => await Locator.UncheckAsync();
    public async Task<bool> IsCheckedNowAsync() => await Locator.IsCheckedAsync();
}
`;
}

export function renderCsharpNativeSelect(): string {
  return `using Microsoft.Playwright;

namespace Components.Primitives;

public class NativeSelect : Component
{
    public NativeSelect(ILocator locator) : base(locator) { }

    public async Task SelectOptionAsync(string value)
    {
        await Locator.SelectOptionAsync(value);
    }
}
`;
}

export function renderCsharpSelect(): string {
  return `using Microsoft.Playwright;

namespace Components.Primitives;

/// <summary>
/// A custom select / combobox whose options render in an overlay (portal) at the
/// page root rather than inside the trigger's DOM subtree — so the listbox is
/// resolved from the page, not from the trigger.
///
/// For a native &lt;select&gt; element, use NativeSelect instead.
/// </summary>
public class Select : Component
{
    private readonly string _listboxSelector;
    private readonly string _optionSelector;
    private readonly string _reveal;

    public Select(ILocator trigger, string listboxSelector, string optionSelector, string reveal = "click")
        : base(trigger)
    {
        _listboxSelector = listboxSelector;
        _optionSelector = optionSelector;
        _reveal = reveal;
    }

    public async Task OpenAsync()
    {
        if (_reveal == "none")
        {
            return;
        }
        if (_reveal == "hover")
        {
            await Locator.HoverAsync();
        }
        else
        {
            await Locator.ClickAsync();
        }
    }

    public ILocator Listbox() => Locator.Page.Locator(_listboxSelector).Last;

    public ILocator Options() => Listbox().Locator(_optionSelector);

    public async Task ChooseAsync(string name)
    {
        await OpenAsync();
        await Options().Filter(new() { HasText = name }).First.ClickAsync();
    }
}
`;
}

export function renderCsharpElement(): string {
  return `using Microsoft.Playwright;

namespace Components.Primitives;

/// <summary>
/// A generic UI element (e.g. heading, block, container, image, or paragraph).
/// </summary>
public class Element : Component
{
    public Element(ILocator locator) : base(locator) { }
}
`;
}

export function renderCsharpHeading(): string {
  return `using Microsoft.Playwright;

namespace Components.Primitives;

/// <summary>
/// A semantic heading element (&lt;h1&gt;-&lt;h6&gt; or role="heading").
/// </summary>
public class Heading : Component
{
    public Heading(ILocator locator) : base(locator) { }
}
`;
}

export function renderCsharpFrameContainer(): string {
  return `using System;
using Microsoft.Playwright;

namespace Components;

/// <summary>
/// A container representing an embedded iframe.
/// Encapsulates the IFrameLocator and provides child/list scoping within that frame.
/// </summary>
public class FrameContainer : Component
{
    public IFrameLocator Frame { get; }

    public FrameContainer(ILocator scope, string selector) : base(scope.Locator(selector))
    {
        Frame = scope.FrameLocator(selector);
    }

    public T ChildInFrame<T>(string selector) where T : Scope
    {
        return (T)Activator.CreateInstance(typeof(T), Frame.Locator(selector))!;
    }

    public Collection<T> ListInFrame<T>(string selector) where T : Scope
    {
        return new Collection<T>(Frame.Locator(selector));
    }
}
`;
}

export function renderCsharpLink(): string {
  return `using Microsoft.Playwright;

namespace Components.Primitives;

public class Link : Component
{
    public Link(ILocator locator) : base(locator) { }

    public async Task ClickAsync() => await Locator.ClickAsync();

    public async Task<string?> GetHrefNowAsync() => await Locator.GetAttributeAsync("href");
}
`;
}

export function renderCsharpFileInput(): string {
  return `using Microsoft.Playwright;

namespace Components.Primitives;

public class FileInput : Component
{
    public FileInput(ILocator locator) : base(locator) { }

    public async Task SetInputFilesAsync(string filePath)
    {
        await Locator.SetInputFilesAsync(filePath);
    }
}
`;
}

export function renderCsharpDialog(): string {
  return `using Microsoft.Playwright;

namespace Components.Widgets;

public class Dialog : Container
{
    public Dialog(ILocator locator) : base(locator) { }

    public async Task CloseAsync()
    {
        await Locator.GetByRole(AriaRole.Button, new() { Name = "Close" }).ClickAsync();
    }
}
`;
}

export function renderCsharpTable(): string {
  return `using Microsoft.Playwright;

namespace Components.Widgets;

public class Table : Container
{
    public Table(ILocator locator) : base(locator) { }

    public ILocator Rows => Locator.GetByRole(AriaRole.Row);

    public ILocator RowByColumn(int colIndex, string text)
    {
        var cellLoc = Locator.Locator($"td:nth-child({colIndex + 1}), th:nth-child({colIndex + 1}), [role='cell']:nth-child({colIndex + 1}), [role='gridcell']:nth-child({colIndex + 1})").Filter(new() { HasText = text });
        return Rows.Filter(new() { Has = cellLoc }).First;
    }

    public async Task<string> CellTextNowAsync(int rowIndex, int colIndex)
    {
        return await Rows.Nth(rowIndex).Locator("td, [role='cell']").Nth(colIndex).InnerTextAsync();
    }
}
`;
}

export function renderCsharpRadio(): string {
  return `using Microsoft.Playwright;

namespace Components.Primitives;

public class RadioButton : Component
{
    public RadioButton(ILocator locator) : base(locator) { }

    public async Task CheckAsync()
    {
        await Locator.CheckAsync();
    }
}

public class RadioGroup : Container
{
    public RadioGroup(ILocator locator) : base(locator) { }

    public RadioButton Radio(string name)
    {
        return new RadioButton(Locator.GetByRole(AriaRole.Radio, new() { Name = name }));
    }

    public async Task SelectAsync(string name)
    {
        await Radio(name).CheckAsync();
    }
}
`;
}

export function renderCsharpApiClient(): string {
  return `using System.Net.Http;

namespace Shared.Utils;

public class ApiClient
{
    private readonly HttpClient _client;

    public ApiClient(string baseUrl)
    {
        _client = new HttpClient { BaseAddress = new Uri(baseUrl) };
    }

    public async Task<HttpResponseMessage> GetAsync(string endpoint)
    {
        return await _client.GetAsync(endpoint);
    }

    public async Task<HttpResponseMessage> PostAsync(string endpoint, string jsonBody)
    {
        var content = new StringContent(jsonBody, System.Text.Encoding.UTF8, "application/json");
        return await _client.PostAsync(endpoint, content);
    }

    public async Task<HttpResponseMessage> PutAsync(string endpoint, string jsonBody)
    {
        var content = new StringContent(jsonBody, System.Text.Encoding.UTF8, "application/json");
        return await _client.PutAsync(endpoint, content);
    }

    public async Task<HttpResponseMessage> DeleteAsync(string endpoint)
    {
        return await _client.DeleteAsync(endpoint);
    }

    public async Task<HttpResponseMessage> GraphqlAsync(string endpoint, string query)
    {
        var safeQuery = query.Replace("\\\"", "\\\\\\\"").Replace("\\n", "\\\\n");
        var jsonBody = $"{{\\\"query\\\": \\\"{safeQuery}\\\"}}";
        return await PostAsync(endpoint, jsonBody);
    }

    // ── Test Data Management (TDM) ─────────────────────────────────────────────

    public static string CreateUniqueId(string prefix = "id") =>
        $"{prefix}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Guid.NewGuid().ToString("N")[..5]}";

    public static string CreateTestEmail(string prefix = "user") =>
        $"test-{prefix}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Guid.NewGuid().ToString("N")[..4]}@example.com";

    public static string CreateTestPhone() =>
        $"+1{new Random().Next(100000000, 999999999)}";

    public static string CreateTestPassword(int length = 14)
    {
        const string chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
        var random = new Random();
        var pwd = "Aa1!";
        for (int i = 4; i < length; i++)
        {
            pwd += chars[random.Next(chars.Length)];
        }
        return pwd;
    }

    public static string CreateTestUuid() => Guid.NewGuid().ToString();

    public static string CreateTestName(string prefix = "User")
    {
        string[] names = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Sam", "Chris"];
        return $"{prefix} {names[new Random().Next(names.Length)]} {Guid.NewGuid().ToString("N")[..4].ToUpper()}";
    }

    public static double CreateTestAmount(double min = 10.0, double max = 1000.0) =>
        Math.Round(new Random().NextDouble() * (max - min) + min, 2);

    public static string CreateTestDate(int offsetDays = 0) =>
        DateTime.UtcNow.AddDays(offsetDays).ToString("o");
}
`;
}

export function renderCsharpExampleTest(): string {
  return `using Microsoft.Playwright.NUnit;
using NUnit.Framework;

namespace Tests;

[Parallelizable(ParallelScope.Self)]
[TestFixture]
public class SmokeTest : PageTest
{
    [Test]
    public async Task LocalPageTest()
    {
        await Page.SetContentAsync("<h1>C# Playwright Core</h1><button>Submit</button>");
        await Expect(Page.GetByRole(Microsoft.Playwright.AriaRole.Heading)).ToHaveTextAsync("C# Playwright Core");
        await Expect(Page.GetByRole(Microsoft.Playwright.AriaRole.Button)).ToBeVisibleAsync();
    }
}
`;
}

export function renderCsharpReactHelpers(): string {
  return `using System.Threading.Tasks;
using Microsoft.Playwright;

namespace Shared.Utils
{
    public static class ReactHelpers
    {
        public static async Task WaitForReactHydrationAsync(IPage page)
        {
            await page.WaitForLoadStateAsync(LoadState.DOMContentLoaded);
            await page.WaitForLoadStateAsync(LoadState.NetworkIdle);
            await page.EvaluateAsync("() => new Promise(requestAnimationFrame)");
        }
    }
}
`;
}

export function renderCsharpVueHelpers(): string {
  return `using System.Threading.Tasks;
using Microsoft.Playwright;

namespace Shared.Utils
{
    public static class VueHelpers
    {
        public static async Task WaitForVueHydrationAsync(IPage page)
        {
            await page.WaitForLoadStateAsync(LoadState.DOMContentLoaded);
            await page.WaitForLoadStateAsync(LoadState.NetworkIdle);
            await page.EvaluateAsync("() => new Promise(requestAnimationFrame)");
        }
    }
}
`;
}

export function renderCsharpSvelteHelpers(): string {
  return `using System.Threading.Tasks;
using Microsoft.Playwright;

namespace Shared.Utils
{
    public static class SvelteHelpers
    {
        public static async Task WaitForSvelteHydrationAsync(IPage page)
        {
            await page.WaitForLoadStateAsync(LoadState.DOMContentLoaded);
            await page.WaitForLoadStateAsync(LoadState.NetworkIdle);
            await page.EvaluateAsync("() => new Promise(requestAnimationFrame)");
        }
    }
}
`;
}

export function renderCsharpAngularHelpers(): string {
  return `using System.Threading.Tasks;
using Microsoft.Playwright;

namespace Shared.Utils
{
    public static class AngularHelpers
    {
        public static async Task WaitForAngularHydrationAsync(IPage page)
        {
            await page.WaitForLoadStateAsync(LoadState.DOMContentLoaded);
            await page.WaitForLoadStateAsync(LoadState.NetworkIdle);
            await page.EvaluateAsync("() => new Promise(requestAnimationFrame)");
        }
    }
}
`;
}
