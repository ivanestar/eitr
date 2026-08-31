export interface JavaProjectOpts {
  projectName: string;
  baseUrl?: string;
  buildTool: 'maven' | 'gradle';
}

export function renderJavaPom(opts: { projectName: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>${opts.projectName}</artifactId>
    <version>1.0-SNAPSHOT</version>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <junit.version>5.10.2</junit.version>
        <playwright.version>1.42.0</playwright.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>com.microsoft.playwright</groupId>
            <artifactId>playwright</artifactId>
            <version>\${playwright.version}</version>
        </dependency>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter-api</artifactId>
            <version>\${junit.version}</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter-engine</artifactId>
            <version>\${junit.version}</version>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
                <configuration>
                    <source>17</source>
                    <target>17</target>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.2.5</version>
                <configuration>
                    <rerunFailingTestsCount>2</rerunFailingTestsCount>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
`;
}

export function renderJavaBuildGradle(_opts: { projectName: string }): string {
  return `plugins {
    id 'java'
    id 'org.gradle.test-retry' version '1.5.8'
}

group = 'com.example'
version = '1.0-SNAPSHOT'

repositories {
    mavenCentral()
}

dependencies {
    implementation 'com.microsoft.playwright:playwright:1.42.0'
    testImplementation 'org.junit.jupiter:junit-jupiter-api:5.10.2'
    testRuntimeOnly 'org.junit.jupiter:junit-jupiter-engine:5.10.2'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
}

test {
    useJUnitPlatform()
    retry {
        maxRetries = 2
        maxFailures = 20
    }
}
`;
}

export function renderJavaGitignore(): string {
  return `target/
.gradle/
build/
.settings/
.classpath
.project
.idea/
*.iml
.eitr/
.eitr-tmp/
`;
}

export function renderJavaProjectReadme(opts: JavaProjectOpts): string {
  const isMaven = opts.buildTool === 'maven';
  return `# ${opts.projectName}

A Playwright + Java (${isMaven ? 'Maven' : 'Gradle'} + JUnit 5) UI-test framework core. It contains a typed component library (\`src/main/java/components/\`) for building Page Objects, JUnit 5 test fixtures, and worked example tests.

## Run

\`\`\`bash
${isMaven ? 'mvn compile' : 'gradle compileJava'}                    # compile the Java classes
${isMaven ? 'mvn test' : 'gradle test'}                        # run all tests with JUnit 5
\`\`\`

### Useful Commands

- **\`${isMaven ? 'mvn test' : 'gradle test'}\`** — runs all JUnit 5 tests.
- **\`${isMaven ? 'mvn test -Dtest=ExampleTest' : 'gradle test --tests ExampleTest'}\`** — runs a specific test class.
- **\`${isMaven ? 'mvn compile' : 'gradle compileJava'}\`** — compiles the Java project.

## Structure

- **\`${isMaven ? 'pom.xml' : 'build.gradle'}\`** — ${isMaven ? 'Maven' : 'Gradle'} build descriptor.
- **\`src/main/java/components/\`** — component primitives (\`Button\`, \`TextInput\`, \`Checkbox\`, \`NativeSelect\`, \`Link\`, \`FileInput\`, \`Dialog\`, \`Table\`).
- **\`src/test/java/tests/\`** — JUnit 5 tests.
`;
}

export function renderJavaScope(): string {
  return `package components;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;

/**
 * Base Scope class wrapping Playwright Locator or Page.
 */
public abstract class Scope {
    private final Locator locator;

    public Scope(Locator locator) {
        this.locator = locator;
    }

    public Scope(Page page) {
        this.locator = page.locator("html");
    }

    public Locator getLocator() {
        return locator;
    }
}
`;
}

export function renderJavaComponent(): string {
  return `package components;

import com.microsoft.playwright.Locator;

/**
 * Base Component abstraction extending Scope.
 */
public class Component extends Scope {
    public Component(Locator locator) {
        super(locator);
    }

    public boolean isVisibleNow() {
        return getLocator().isVisible();
    }

    public boolean isEnabledNow() {
        return getLocator().isEnabled();
    }

    public void waitForAnimations(int timeoutMs) {
        getLocator().evaluate(
            "(el, timeout) => {" +
            "  const anims = el.getAnimations ? el.getAnimations({ subtree: true }) : [];" +
            "  return Promise.all(anims.map(a => Promise.race([" +
            "    a.finished," +
            "    new Promise(r => setTimeout(r, timeout))" +
            "  ])));" +
            "}", timeoutMs);
    }

    public void waitForAnimations() {
        waitForAnimations(5000);
    }
}
`;
}

export function renderJavaContainer(): string {
  return `package components;

import com.microsoft.playwright.Locator;

/**
 * Container abstraction for grouping components.
 */
public class Container extends Scope {
    public Container(Locator locator) {
        super(locator);
    }
}
`;
}

export function renderJavaCollection(): string {
  return `package components;

import com.microsoft.playwright.Locator;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * Generic Collection wrapper for repeatable elements.
 */
public class Collection<T extends Scope> {
    private final Locator rootLocator;
    private final Function<Locator, T> itemFactory;

    public Collection(Locator rootLocator, Function<Locator, T> itemFactory) {
        this.rootLocator = rootLocator;
        this.itemFactory = itemFactory;
    }

    public int count() {
        return rootLocator.count();
    }

    public T nth(int index) {
        return itemFactory.apply(rootLocator.nth(index));
    }

    public List<T> all() {
        List<T> items = new ArrayList<>();
        int total = count();
        for (int i = 0; i < total; i++) {
            items.add(nth(i));
        }
        return items;
    }
}
`;
}

export function renderJavaBasePage(): string {
  return `package components;

import com.microsoft.playwright.Page;

/**
 * Abstract BasePage representing Page Objects.
 */
public abstract class BasePage extends Scope {
    protected final Page page;

    public BasePage(Page page) {
        super(page);
        this.page = page;
    }

    public Page getPage() {
        return page;
    }

    public abstract void navigate();
}
`;
}

export function renderJavaButton(): string {
  return `package components.primitives;

import components.Component;
import com.microsoft.playwright.Locator;

/**
 * Primitive Button component.
 */
public class Button extends Component {
    public Button(Locator locator) {
        super(locator);
    }

    public void click() {
        getLocator().click();
    }
}
`;
}

export function renderJavaTextInput(): string {
  return `package components.primitives;

import components.Component;
import com.microsoft.playwright.Locator;

/**
 * Primitive TextInput component.
 */
public class TextInput extends Component {
    public TextInput(Locator locator) {
        super(locator);
    }

    public void fill(String value) {
        getLocator().fill(value);
    }

    public String getValueNow() {
        return getLocator().inputValue();
    }

    public void clear() {
        getLocator().clear();
    }
}
`;
}

export function renderJavaCheckbox(): string {
  return `package components.primitives;

import components.Component;
import com.microsoft.playwright.Locator;

/**
 * Primitive Checkbox component.
 */
public class Checkbox extends Component {
    public Checkbox(Locator locator) {
        super(locator);
    }

    public void check() {
        getLocator().check();
    }

    public void uncheck() {
        getLocator().uncheck();
    }

    public boolean isCheckedNow() {
        return getLocator().isChecked();
    }
}
`;
}

export function renderJavaNativeSelect(): string {
  return `package components.primitives;

import components.Component;
import com.microsoft.playwright.Locator;

/**
 * Primitive NativeSelect component.
 */
public class NativeSelect extends Component {
    public NativeSelect(Locator locator) {
        super(locator);
    }

    public void selectOption(String value) {
        getLocator().selectOption(value);
    }
}
`;
}

export function renderJavaLink(): string {
  return `package components.primitives;

import components.Component;
import com.microsoft.playwright.Locator;

/**
 * Primitive Link component.
 */
public class Link extends Component {
    public Link(Locator locator) {
        super(locator);
    }

    public void click() {
        getLocator().click();
    }

    public String getHrefNow() {
        return getLocator().getAttribute("href");
    }
}
`;
}

export function renderJavaFileInput(): string {
  return `package components.primitives;

import components.Component;
import com.microsoft.playwright.Locator;
import java.nio.file.Path;

/**
 * Primitive FileInput component.
 */
public class FileInput extends Component {
    public FileInput(Locator locator) {
        super(locator);
    }

    public void setInputFiles(Path path) {
        getLocator().setInputFiles(path);
    }
}
`;
}

export function renderJavaDialog(): string {
  return `package components.widgets;

import components.Container;
import components.primitives.Button;
import com.microsoft.playwright.Locator;

/**
 * Widget Dialog component.
 */
public class Dialog extends Container {
    public Dialog(Locator locator) {
        super(locator);
    }

    public Button closeButton() {
        return new Button(getLocator().locator("button.close, [aria-label='Close']"));
    }

    public boolean isOpenNow() {
        return getLocator().isVisible();
    }
}
`;
}

export function renderJavaTable(): string {
  return `package components.widgets;

import components.Container;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.options.AriaRole;

/**
 * Widget Table component.
 */
public class Table extends Container {
    public Table(Locator locator) {
        super(locator);
    }

    public Locator rows() {
        return getLocator().getByRole(AriaRole.ROW);
    }

    public Locator rowByColumn(int colIndex, String text) {
        Locator cellLoc = getLocator().locator(String.format("td:nth-child(%d), th:nth-child(%d), [role='cell']:nth-child(%d), [role='gridcell']:nth-child(%d)", colIndex + 1, colIndex + 1, colIndex + 1, colIndex + 1)).filter(new Locator.FilterOptions().setHasText(text));
        return rows().filter(new Locator.FilterOptions().setHas(cellLoc)).first();
    }

    public String cellTextNow(int rowIndex, int colIndex) {
        return rows().nth(rowIndex).locator("td, [role='cell']").nth(colIndex).innerText();
    }
}
`;
}

export function renderJavaRadioButton(): string {
  return `package components.primitives;

import components.Component;
import com.microsoft.playwright.Locator;

public class RadioButton extends Component {
    public RadioButton(Locator locator) {
        super(locator);
    }

    public void check() {
        getLocator().check();
    }
}
`;
}

export function renderJavaRadioGroup(): string {
  return `package components.primitives;

import components.Container;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.options.AriaRole;

public class RadioGroup extends Container {
    public RadioGroup(Locator locator) {
        super(locator);
    }

    public RadioButton radio(String name) {
        return new RadioButton(getLocator().getByRole(AriaRole.RADIO, new Locator.GetByRoleOptions().setName(name)));
    }

    public void select(String name) {
        radio(name).check();
    }
}
`;
}

export function renderJavaApiClient(): string {
  return `package shared.utils;

import com.microsoft.playwright.APIRequest;
import com.microsoft.playwright.APIRequestContext;
import com.microsoft.playwright.APIResponse;
import com.microsoft.playwright.Playwright;

import java.util.HashMap;
import java.util.Map;

/**
 * API Client wrapper for Playwright HTTP requests.
 */
public class ApiClient implements AutoCloseable {
    private final APIRequestContext request;

    public ApiClient(Playwright playwright, String baseUrl) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "application/json");
        this.request = playwright.request().newContext(new APIRequest.NewContextOptions()
                .setBaseURL(baseUrl)
                .setExtraHTTPHeaders(headers));
    }

    public APIResponse get(String endpoint) {
        return request.get(endpoint);
    }

    public APIResponse post(String endpoint, String jsonBody) {
        return request.post(endpoint, com.microsoft.playwright.options.RequestOptions.create().setData(jsonBody));
    }

    public APIResponse put(String endpoint, String jsonBody) {
        return request.put(endpoint, com.microsoft.playwright.options.RequestOptions.create().setData(jsonBody));
    }

    public APIResponse delete(String endpoint) {
        return request.delete(endpoint);
    }

    public APIResponse graphql(String endpoint, String query) {
        String body = String.format("{\\\"query\\\": \\\"%s\\\"}", query.replace("\\\"", "\\\\\\\"").replace("\\n", "\\\\n"));
        return request.post(endpoint, com.microsoft.playwright.options.RequestOptions.create().setData(body));
    }

    // ── Test Data Management (TDM) ─────────────────────────────────────────────

    public static String createUniqueId(String prefix) {
        return prefix + "-" + System.currentTimeMillis() + "-" + java.util.UUID.randomUUID().toString().substring(0, 5);
    }

    public static String createUniqueId() {
        return createUniqueId("id");
    }

    public static String createTestEmail(String prefix) {
        return "test-" + prefix + "-" + System.currentTimeMillis() + "-" + java.util.UUID.randomUUID().toString().substring(0, 4) + "@example.com";
    }

    public static String createTestEmail() {
        return createTestEmail("user");
    }

    public static String createTestPhone() {
        int randomDigits = 100000000 + new java.util.Random().nextInt(900000000);
        return "+1" + randomDigits;
    }

    public static String createTestPassword(int length) {
        String chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
        StringBuilder pwd = new StringBuilder("Aa1!");
        java.util.Random rnd = new java.util.Random();
        for (int i = 4; i < length; i++) {
            pwd.append(chars.charAt(rnd.nextInt(chars.length())));
        }
        return pwd.toString();
    }

    public static String createTestPassword() {
        return createTestPassword(14);
    }

    public static String createTestUuid() {
        return java.util.UUID.randomUUID().toString();
    }

    public static String createTestName(String prefix) {
        String[] names = {"Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Sam", "Chris"};
        String chosen = names[new java.util.Random().nextInt(names.length)];
        return prefix + " " + chosen + " " + java.util.UUID.randomUUID().toString().substring(0, 4).toUpperCase();
    }

    public static String createTestName() {
        return createTestName("User");
    }

    public static double createTestAmount(double min, double max) {
        double val = min + (new java.util.Random().nextDouble() * (max - min));
        return Math.round(val * 100.0) / 100.0;
    }

    public static double createTestAmount() {
        return createTestAmount(10.0, 1000.0);
    }

    public static String createTestDate(int offsetDays) {
        return java.time.Instant.now().plus(offsetDays, java.time.temporal.ChronoUnit.DAYS).toString();
    }

    public static String createTestDate() {
        return createTestDate(0);
    }

    @Override
    public void close() {
        if (request != null) {
            request.dispose();
        }
    }
}
`;
}

export function renderJavaExampleTest(): string {
  return `package tests;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import org.junit.jupiter.api.*;

import static org.junit.jupiter.api.Assertions.*;

public class SmokeTest {
    private static Playwright playwright;
    private static Browser browser;
    private Page page;

    @BeforeAll
    static void launchBrowser() {
        playwright = Playwright.create();
        browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true));
    }

    @AfterAll
    static void closeBrowser() {
        if (browser != null) {
            browser.close();
        }
        if (playwright != null) {
            playwright.close();
        }
    }

    @BeforeEach
    void createContextAndPage() {
        page = browser.newPage();
    }

    @AfterEach
    void closePage() {
        if (page != null) {
            page.close();
        }
    }

    @Test
    void testHomepage() {
        page.navigate("https://example.com");
        assertTrue(page.title().contains("Example Domain"));
    }
}
`;
}

export function renderJavaReactHelpers(): string {
  return `package shared.utils;

import com.microsoft.playwright.Page;

/**
 * Utility functions for React applications.
 */
public class ReactHelpers {
    public static void waitForReactHydration(Page page) {
        page.waitForLoadState(com.microsoft.playwright.options.LoadState.DOMCONTENTLOADED);
        page.waitForLoadState(com.microsoft.playwright.options.LoadState.NETWORKIDLE);
        page.evaluate("() => new Promise(requestAnimationFrame)");
    }
}
`;
}

export function renderJavaVueHelpers(): string {
  return `package shared.utils;

import com.microsoft.playwright.Page;

/**
 * Utility functions for Vue applications.
 */
public class VueHelpers {
    public static void waitForVueHydration(Page page) {
        page.waitForLoadState(com.microsoft.playwright.options.LoadState.DOMCONTENTLOADED);
        page.waitForLoadState(com.microsoft.playwright.options.LoadState.NETWORKIDLE);
        page.evaluate("() => new Promise(requestAnimationFrame)");
    }
}
`;
}

export function renderJavaSvelteHelpers(): string {
  return `package shared.utils;

import com.microsoft.playwright.Page;

/**
 * Utility functions for Svelte applications.
 */
public class SvelteHelpers {
    public static void waitForSvelteHydration(Page page) {
        page.waitForLoadState(com.microsoft.playwright.options.LoadState.DOMCONTENTLOADED);
        page.waitForLoadState(com.microsoft.playwright.options.LoadState.NETWORKIDLE);
        page.evaluate("() => new Promise(requestAnimationFrame)");
    }
}
`;
}

export function renderJavaAngularHelpers(): string {
  return `package shared.utils;

import com.microsoft.playwright.Page;

/**
 * Utility functions for Angular applications.
 */
public class AngularHelpers {
    public static void waitForAngularHydration(Page page) {
        page.waitForLoadState(com.microsoft.playwright.options.LoadState.DOMCONTENTLOADED);
        page.waitForLoadState(com.microsoft.playwright.options.LoadState.NETWORKIDLE);
        page.evaluate("() => new Promise(requestAnimationFrame)");
    }
}
`;
}
