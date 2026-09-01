// Template for generating scripts/LintCpom.java in scaffolded Java projects. create-if-absent.
// Executed via the JDK's single-file source-launch feature (JEP 330, JDK 11+):
//   java scripts/LintCpom.java
// No separate javac step, no external dependencies - only the JDK standard library. Every
// generated Java combination already ships a JDK (17+), so this adds zero new CI dependency.

export function renderCpomLinterJava(): string {
  return `import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * CPOM Contract & Anti-Fake-Green Linter (Java)
 * Zero-dependency static rule auditor for Page Objects, Components, and Test Specs.
 * Runs via the JDK's single-file source-launch feature (JEP 330, JDK 11+):
 *   java scripts/LintCpom.java
 * No separate compile step, no external dependencies - only the JDK standard library.
 *
 * Rules enforced (parity with scripts/lint-cpom.js for TypeScript/JavaScript/Cypress):
 *   1. Zero Arbitrary Delays - no Thread.sleep() / page.waitForTimeout().
 *   2. Mandatory Now() suffix for non-retrying state getters in components (is-, has-, get-prefixed).
 *   3. Zero assertions inside Component & Page Object classes (org.junit.jupiter.api.Assertions.*).
 *   4. Non-Retrying State Assertion Guard - flags assertTrue/assertFalse wrapping a raw
 *      isVisible()/isEnabled()/... call in test specs; recommends Playwright's auto-retrying
 *      PlaywrightAssertions.assertThat(locator) instead. Java Playwright's API is fully
 *      synchronous (no Promise/await), so there is no literal "unawaited promise" bug to guard
 *      against - this is the closest real analog: a state check that looks green once but races
 *      the browser instead of auto-retrying.
 *   5. Fixture Dependency Injection - rejects raw "new SomePage(...)" / "new SomeComponent(...)"
 *      in test specs outside setup/fixture files.
 */
public class LintCpom {

    private static final List<String> IGNORED_DIR_NAMES = Arrays.asList(
        "target", "build", ".git", ".idea", ".gradle", ".settings", "test-results", "node_modules"
    );

    private static final List<String> TARGET_DIRS = Arrays.asList(
        "src/main/java", "src/test/java"
    );

    private static final List<String> ASSERTION_METHODS = Arrays.asList(
        "assertTrue(", "assertFalse(", "assertEquals(", "assertNotEquals(",
        "assertNull(", "assertNotNull(", "assertSame(", "assertNotSame(",
        "assertThrows(", "assertAll(", "assertArrayEquals("
    );

    private static final List<String> STATE_READ_CALLS = Arrays.asList(
        ".isVisible()", ".isEnabled()", ".isChecked()", ".isHidden()", ".isDisabled()", ".isEditable()"
    );

    // Methods returning one of these framework/structural types are never a point-in-time state
    // read (they hand back a live handle, not a snapshot value) - exempt by return type rather
    // than by a fixed method-name list, so a future getLocator()-shaped method is still exempt and
    // a future getValueNow()-shaped method is still correctly caught.
    private static final List<String> STRUCTURAL_RETURN_TYPES = Arrays.asList(
        "Locator", "Page", "BrowserContext", "Frame", "FrameLocator", "ElementHandle"
    );

    private static final class Violation {
        final String file;
        final int line;
        final String rule;
        final String message;
        final String snippet;

        Violation(String file, int line, String rule, String message, String snippet) {
            this.file = file;
            this.line = line;
            this.rule = rule;
            this.message = message;
            this.snippet = snippet;
        }
    }

    private static final List<Violation> VIOLATIONS = new ArrayList<>();

    public static void main(String[] args) throws IOException {
        Path cwd = Paths.get("").toAbsolutePath();
        List<Path> files = new ArrayList<>();

        for (String target : TARGET_DIRS) {
            Path dir = cwd.resolve(target);
            if (Files.isDirectory(dir)) {
                walk(dir, files);
            }
        }

        if (files.isEmpty()) {
            System.out.println("[INFO] No components or tests directory found to lint.");
            return;
        }

        for (Path file : files) {
            auditFile(cwd, file);
        }

        if (VIOLATIONS.isEmpty()) {
            System.out.println("[PASS] CPOM Contract & Anti-Fake-Green Audit Passed (" + files.size() + " files checked).");
            return;
        }

        System.err.println();
        System.err.println("[FAIL] CPOM Contract Violations Found (" + VIOLATIONS.size() + " issues):");
        System.err.println();
        for (Violation v : VIOLATIONS) {
            System.err.println("  " + v.file + ":" + v.line + " [" + v.rule + "]");
            System.err.println("    Error: " + v.message);
            System.err.println("    Code:  " + v.snippet);
            System.err.println();
        }
        System.exit(1);
    }

    private static void walk(Path dir, List<Path> out) {
        File[] entries = dir.toFile().listFiles();
        if (entries == null) {
            return;
        }
        for (File entry : entries) {
            if (IGNORED_DIR_NAMES.contains(entry.getName())) {
                continue;
            }
            if (entry.isDirectory()) {
                walk(entry.toPath(), out);
            } else if (entry.getName().endsWith(".java")) {
                out.add(entry.toPath());
            }
        }
    }

    private static void auditFile(Path cwd, Path file) throws IOException {
        String relPath = cwd.relativize(file).toString().replace(File.separatorChar, '/');
        boolean isComponent = relPath.startsWith("src/main/java/components/");
        boolean isTest = relPath.startsWith("src/test/java/tests/");
        boolean isFixtureOrSetup = relPath.contains("Setup") || relPath.contains("Fixture");

        List<String> lines = Files.readAllLines(file);
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            String trimmed = line.trim();
            int lineNum = i + 1;

            if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
                continue;
            }

            if (line.contains("Thread.sleep(") || line.contains(".waitForTimeout(") || trimmed.startsWith("sleep(")) {
                VIOLATIONS.add(new Violation(relPath, lineNum, "Rule 1: Zero Arbitrary Delays",
                    "Arbitrary delay detected. Use web-first auto-retrying assertions or state waiters instead.",
                    trimmed));
            }

            if (isComponent) {
                MethodSignature sig = extractMethodSignature(trimmed);
                if (sig != null && !STRUCTURAL_RETURN_TYPES.contains(sig.returnType)) {
                    boolean isStateGetter = startsWithPrefix(sig.name, "is")
                        || startsWithPrefix(sig.name, "has")
                        || startsWithPrefix(sig.name, "get");
                    if (isStateGetter && !sig.name.endsWith("Now")) {
                        VIOLATIONS.add(new Violation(relPath, lineNum, "Rule 2: Mandatory Now() Suffix",
                            "State reader \\"" + sig.name + "\\" in component must have \\"Now()\\" suffix "
                                + "(e.g. " + sig.name + "Now()) to signify point-in-time read.",
                            trimmed));
                    }
                }
            }

            if (isComponent) {
                for (String needle : ASSERTION_METHODS) {
                    if (line.contains(needle)) {
                        VIOLATIONS.add(new Violation(relPath, lineNum, "Rule 3: Zero Assertions in Components",
                            "Assertion \\"" + needle + "\\" found in component. Components must only provide "
                                + "locators and actions; assertions belong in test specs.",
                            trimmed));
                        break;
                    }
                }
            }

            if (isTest) {
                boolean hasAssertTrueOrFalse = line.contains("assertTrue(") || line.contains("assertFalse(");
                if (hasAssertTrueOrFalse) {
                    for (String call : STATE_READ_CALLS) {
                        if (line.contains(call)) {
                            VIOLATIONS.add(new Violation(relPath, lineNum, "Rule 4: Non-Retrying State Assertion Guard",
                                "Raw \\"" + call + "\\" wrapped in assertTrue/assertFalse does not auto-retry and "
                                    + "can race the browser. Use PlaywrightAssertions.assertThat(locator) instead.",
                                trimmed));
                            break;
                        }
                    }
                }
            }

            if (isTest && !isFixtureOrSetup) {
                String newTarget = extractNewPageOrComponent(line);
                if (newTarget != null) {
                    VIOLATIONS.add(new Violation(relPath, lineNum, "Rule 5: Fixture Dependency Injection",
                        "Direct instantiation \\"new " + newTarget + "(...)\\" detected in test spec. Inject "
                            + "Page Objects/components via a shared setup/fixture helper instead.",
                        trimmed));
                }
            }
        }
    }

    private static boolean startsWithPrefix(String name, String prefix) {
        return name.length() > prefix.length()
            && name.startsWith(prefix)
            && Character.isUpperCase(name.charAt(prefix.length()));
    }

    private static final class MethodSignature {
        final String returnType;
        final String name;

        MethodSignature(String returnType, String name) {
            this.returnType = returnType;
            this.name = name;
        }
    }

    private static MethodSignature extractMethodSignature(String trimmedLine) {
        if (!trimmedLine.contains("public") || !trimmedLine.contains("(")) {
            return null;
        }
        int parenIdx = trimmedLine.indexOf('(');
        String beforeParen = trimmedLine.substring(0, parenIdx).trim();
        List<String> tokens = new ArrayList<>();
        for (String token : beforeParen.split(" ")) {
            if (!token.isEmpty()) {
                tokens.add(token);
            }
        }
        if (tokens.size() < 2) {
            return null;
        }
        String name = tokens.get(tokens.size() - 1);
        String returnType = tokens.get(tokens.size() - 2);
        return new MethodSignature(returnType, name);
    }

    private static String extractNewPageOrComponent(String line) {
        int idx = line.indexOf("new ");
        if (idx < 0) {
            return null;
        }
        String rest = line.substring(idx + 4).trim();
        int parenIdx = rest.indexOf('(');
        if (parenIdx < 0) {
            return null;
        }
        String className = rest.substring(0, parenIdx).trim();
        if (className.isEmpty() || !Character.isUpperCase(className.charAt(0))) {
            return null;
        }
        if (className.endsWith("Page") || className.endsWith("Component")) {
            return className;
        }
        return null;
    }
}
`;
}
