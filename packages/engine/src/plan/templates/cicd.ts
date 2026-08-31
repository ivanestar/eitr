// CI/CD templates for E2E workflows. create-if-absent.

export function renderGithubActions(language?: string, automationTool?: string): string {
  if (language === 'python') {
    return `name: E2E Tests (pytest + Playwright)
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
permissions:
  contents: read
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shardIndex: [1, 2, 3, 4]
        shardTotal: [4]
    steps:
    - uses: actions/checkout@v7
    - uses: actions/setup-python@v7
      with:
        python-version: '3.11'
    - name: Install dependencies
      run: pip install -e .[api]
    - name: Dependency Vulnerability Audit
      run: pip install pip-audit && pip-audit
    - name: Install Playwright Browsers
      run: playwright install --with-deps
    - name: Audit CPOM Contract & Anti-Fake-Green Rules
      run: python scripts/lint_cpom.py
    - name: Run Pytest (shard \${{ matrix.shardIndex }}/\${{ matrix.shardTotal }})
      run: pytest --splits \${{ matrix.shardTotal }} --group \${{ matrix.shardIndex }} --junitxml=test-results/junit-results.xml
    - uses: actions/upload-artifact@v7
      if: always()
      with:
        name: test-results-\${{ matrix.shardIndex }}
        path: test-results/junit-results.xml
        retention-days: 30
`;
  }

  // No CI sharding for C#: no free, official automatic-balanced-split mechanism exists for
  // NUnit/dotnet test either - only [Category("...")] + `dotnet test --filter TestCategory=...`
  // (manual tagging, no auto-balancing), same shape and same gap as Java above. See TODO.md.
  if (language === 'csharp') {
    return `name: E2E Tests (.NET + Playwright)
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
permissions:
  contents: read
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  cpom-lint:
    timeout-minutes: 10
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v7
    - uses: actions/setup-dotnet@v6
      with:
        dotnet-version: '10.0.x'
    - name: Audit CPOM Contract & Anti-Fake-Green Rules
      run: dotnet run --file scripts/LintCpom.cs
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v7
    - uses: actions/setup-dotnet@v6
      with:
        dotnet-version: '8.0.x'
    - name: Build
      run: dotnet build
    - name: Dependency Vulnerability Audit
      run: dotnet list package --vulnerable --include-transitive
    - name: Install Playwright Browsers
      run: pwsh bin/Debug/net8.0/playwright.ps1 install --with-deps
    - name: Run tests
      run: dotnet test --logger "junit;LogFilePath=test-results/junit-results.xml"
    - uses: actions/upload-artifact@v7
      if: always()
      with:
        name: test-results
        path: test-results/
        retention-days: 30
`;
  }

  // No CI sharding for Java: unlike TS/JS (native --shard) and Python (pytest-split), neither
  // Maven Surefire nor Gradle ships a free, official automatic-balanced-split mechanism -
  // JUnit 5 only supports tag/group *filtering* (maven-surefire-plugin's <groups>/<excludedGroups>
  // or Gradle's useJUnitPlatform { includeTags(...) }), which requires hand-tagging every test and
  // never auto-balances. The one automatic option, Gradle Develocity Test Distribution, is a paid
  // product - inappropriate to wire into a free/OSS scaffolder. Deliberately not implemented; see
  // TODO.md for the researched rationale.
  if (language === 'java') {
    if (automationTool?.includes('gradle')) {
      return `name: E2E Tests (Java + Playwright + Gradle)
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
permissions:
  contents: read
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v7
    - uses: actions/setup-java@v6
      with:
        distribution: 'temurin'
        java-version: '17'
    - name: Install Playwright Browsers
      run: gradle playwrightInstall
    - name: Audit CPOM Contract & Anti-Fake-Green Rules
      run: java scripts/LintCpom.java
    - name: Run tests
      run: gradle test
    - uses: actions/upload-artifact@v7
      if: always()
      with:
        name: test-results
        path: build/reports/tests/
        retention-days: 30
`;
    }
    return `name: E2E Tests (Java + Playwright + Maven)
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
permissions:
  contents: read
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v7
    - uses: actions/setup-java@v6
      with:
        distribution: 'temurin'
        java-version: '17'
    - name: Install Playwright Browsers
      run: mvn exec:java -e -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps"
    - name: Audit CPOM Contract & Anti-Fake-Green Rules
      run: java scripts/LintCpom.java
    - name: Run tests
      run: mvn test
    - uses: actions/upload-artifact@v7
      if: always()
      with:
        name: test-results
        path: target/surefire-reports/
        retention-days: 30
`;
  }

  if (automationTool === 'cypress') {
    return `name: E2E Tests (Cypress)
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
permissions:
  contents: read
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v7
    - uses: actions/setup-node@v7
      with:
        node-version: 18
        cache: 'npm'
    - name: Install dependencies
      run: npm ci
    - name: Dependency Vulnerability Audit
      run: npm audit --audit-level=high
    - name: Run Cypress tests
      run: npx cypress run
    - uses: actions/upload-artifact@v7
      if: always()
      with:
        name: cypress-results
        path: |
          cypress/screenshots/
          cypress/videos/
        retention-days: 30
`;
  }

  return `name: Playwright Tests
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
permissions:
  contents: read
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shardIndex: [1, 2, 3, 4]
        shardTotal: [4]
    steps:
    - uses: actions/checkout@v7
    - uses: actions/setup-node@v7
      with:
        node-version: 18
        cache: 'npm'
    - name: Install dependencies
      run: npm ci
    - name: Dependency Vulnerability Audit
      run: npm audit --audit-level=high
    - name: Install Playwright Browsers
      run: npx playwright install --with-deps
    - name: Audit CPOM Contract & Anti-Fake-Green Rules
      run: npm run lint:cpom
    - name: Run Playwright tests (shard \${{ matrix.shardIndex }}/\${{ matrix.shardTotal }})
      run: npx playwright test --project=chromium --shard=\${{ matrix.shardIndex }}/\${{ matrix.shardTotal }} --reporter=blob
    - uses: actions/upload-artifact@v7
      if: always()
      with:
        name: blob-report-\${{ matrix.shardIndex }}
        path: blob-report
        retention-days: 1

  merge-reports:
    if: always()
    needs: [test]
    timeout-minutes: 10
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v7
    - uses: actions/setup-node@v7
      with:
        node-version: 18
        cache: 'npm'
    - name: Install dependencies
      run: npm ci
    - name: Download blob reports from every shard
      uses: actions/download-artifact@v8
      with:
        path: all-blob-reports
        pattern: blob-report-*
        merge-multiple: true
    - name: Merge shards into a single HTML report
      run: npx playwright merge-reports --reporter html ./all-blob-reports
    - uses: actions/upload-artifact@v7
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 30
`;
}

export function renderGitlabCi(language?: string, automationTool?: string): string {
  if (language === 'python') {
    return `stages:
  - test

workflow:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "push" && $CI_OPEN_MERGE_REQUESTS'
      when: never
    - if: '$CI_PIPELINE_SOURCE == "push"'
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'

pytest-playwright-tests:
  stage: test
  image: mcr.microsoft.com/playwright/python:v1.51.0-jammy
  parallel: 4
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - pip install -e .[api]
    - pip install pip-audit && pip-audit
    - python scripts/lint_cpom.py
    - pytest --splits $CI_NODE_TOTAL --group $CI_NODE_INDEX --junitxml=test-results/junit-results.xml
  artifacts:
    when: always
    reports:
      junit: test-results/junit-results.xml
    expire_in: 30 days
`;
  }

  if (language === 'csharp') {
    return `stages:
  - test

workflow:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "push" && $CI_OPEN_MERGE_REQUESTS'
      when: never
    - if: '$CI_PIPELINE_SOURCE == "push"'
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'

dotnet-playwright-tests:
  stage: test
  image: mcr.microsoft.com/dotnet/sdk:8.0
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - dotnet build
    - dotnet list package --vulnerable --include-transitive
    - pwsh bin/Debug/net8.0/playwright.ps1 install --with-deps
    - dotnet test --logger "junit;LogFilePath=test-results/junit-results.xml"
  artifacts:
    when: always
    reports:
      junit: test-results/junit-results.xml
    expire_in: 30 days

# Separate job/image: file-based apps (dotnet run --file) require the .NET 10 SDK, one major
# ahead of the .NET 8 image used above to build/test this net8.0 project. Isolating the lint in
# its own job keeps the existing net8.0 build/test path completely untouched.
csharp-cpom-lint:
  stage: test
  image: mcr.microsoft.com/dotnet/sdk:10.0
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - dotnet run --file scripts/LintCpom.cs
`;
  }

  if (language === 'java') {
    const isGradle = automationTool?.includes('gradle');
    const installCmd = isGradle
      ? 'gradle playwrightInstall'
      : 'mvn exec:java -e -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps"';
    const cmd = isGradle ? 'gradle test' : 'mvn test';
    const reportPath = isGradle ? 'build/reports/tests/' : 'target/surefire-reports/';
    return `stages:
  - test

workflow:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "push" && $CI_OPEN_MERGE_REQUESTS'
      when: never
    - if: '$CI_PIPELINE_SOURCE == "push"'
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'

java-playwright-tests:
  stage: test
  image: eclipse-temurin:17-jdk-jammy
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - ${installCmd}
    - java scripts/LintCpom.java
    - ${cmd}
  artifacts:
    when: always
    paths:
      - ${reportPath}
    expire_in: 30 days
`;
  }

  if (automationTool === 'cypress') {
    return `stages:
  - test

workflow:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "push" && $CI_OPEN_MERGE_REQUESTS'
      when: never
    - if: '$CI_PIPELINE_SOURCE == "push"'
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'

cypress-tests:
  stage: test
  image: cypress/included:13.6.0
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - npm ci
    - npm audit --audit-level=high
    - npx cypress run
  artifacts:
    when: always
    paths:
      - cypress/screenshots/
      - cypress/videos/
    expire_in: 30 days
`;
  }

  return `stages:
  - test
  - report

workflow:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "push" && $CI_OPEN_MERGE_REQUESTS'
      when: never
    - if: '$CI_PIPELINE_SOURCE == "push"'
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'

playwright-tests:
  stage: test
  image: mcr.microsoft.com/playwright:v1.51.1-jammy
  parallel: 4
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - npm ci
    - npm audit --audit-level=high
    - npm run lint:cpom
    - npx playwright test --project=chromium --shard=$CI_NODE_INDEX/$CI_NODE_TOTAL --reporter=blob
    - mv blob-report "blob-report-$CI_NODE_INDEX"
  artifacts:
    when: always
    paths:
      - blob-report-*/
    expire_in: 1 day

merge-playwright-reports:
  stage: report
  image: mcr.microsoft.com/playwright:v1.51.1-jammy
  needs:
    - job: playwright-tests
      artifacts: true
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  variables:
    PLAYWRIGHT_JUNIT_OUTPUT_NAME: playwright-report/junit-results.xml
  script:
    - npm ci
    - mkdir -p all-blob-reports
    - cp blob-report-*/*.zip all-blob-reports/
    - npx playwright merge-reports --reporter=html,junit ./all-blob-reports
  artifacts:
    when: always
    paths:
      - playwright-report/
    reports:
      junit: playwright-report/junit-results.xml
    expire_in: 30 days
`;
}

export function renderJenkinsfile(language?: string, automationTool?: string): string {
  if (language === 'python') {
    return `pipeline {
    agent none
    stages {
        stage('Sharded Tests') {
            matrix {
                axes {
                    axis {
                        name 'SHARD'
                        values '1', '2', '3', '4'
                    }
                }
                agent {
                    docker { image 'mcr.microsoft.com/playwright/python:v1.51.0-jammy' }
                }
                stages {
                    stage('Install') {
                        steps {
                            sh 'pip install -e .[api]'
                        }
                    }
                    stage('Dependency Vulnerability Audit') {
                        steps {
                            sh 'pip install pip-audit && pip-audit'
                        }
                    }
                    stage('Audit CPOM Contract & Anti-Fake-Green Rules') {
                        steps {
                            sh 'python scripts/lint_cpom.py'
                        }
                    }
                    stage('Test') {
                        steps {
                            sh 'pytest --splits 4 --group $SHARD --junitxml=test-results/junit-results-$SHARD.xml'
                        }
                    }
                }
                post {
                    always {
                        junit "test-results/junit-results-\${SHARD}.xml"
                    }
                }
            }
        }
    }
}
`;
  }

  // No CI sharding for C# — see the same-worded comment in renderGithubActions above.
  if (language === 'csharp') {
    return `pipeline {
    agent {
        docker { image 'mcr.microsoft.com/dotnet/sdk:8.0' }
    }
    stages {
        stage('Build') {
            steps {
                sh 'dotnet build'
            }
        }
        stage('Dependency Vulnerability Audit') {
            steps {
                sh 'dotnet list package --vulnerable --include-transitive'
            }
        }
        stage('Install Browsers') {
            steps {
                sh 'pwsh bin/Debug/net8.0/playwright.ps1 install --with-deps'
            }
        }
        // Own agent/image: file-based apps (dotnet run --file) require the .NET 10 SDK, one
        // major ahead of the .NET 8 image used by the rest of this pipeline to build/test this
        // net8.0 project. Isolating the lint in its own stage-level agent keeps the existing
        // net8.0 build/test path completely untouched.
        stage('Audit CPOM Contract & Anti-Fake-Green Rules') {
            agent {
                docker { image 'mcr.microsoft.com/dotnet/sdk:10.0' }
            }
            steps {
                sh 'dotnet run --file scripts/LintCpom.cs'
            }
        }
        stage('Test') {
            steps {
                sh 'dotnet test --logger "junit;LogFilePath=test-results/junit-results.xml"'
            }
        }
    }
    post {
        always {
            junit 'test-results/junit-results.xml'
        }
    }
}
`;
  }

  // No CI sharding for Java — see the same-worded comment in renderGithubActions above.
  if (language === 'java') {
    const isGradle = automationTool?.includes('gradle');
    const installCmd = isGradle
      ? 'gradle playwrightInstall'
      : 'mvn exec:java -e -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps"';
    const cmd = isGradle ? 'gradle test' : 'mvn test';
    const reportPattern = isGradle
      ? 'build/test-results/**/*.xml'
      : 'target/surefire-reports/*.xml';
    return `pipeline {
    agent {
        docker { image 'eclipse-temurin:17-jdk-jammy' }
    }
    stages {
        stage('Install Playwright Browsers') {
            steps {
                sh '${installCmd}'
            }
        }
        stage('Audit CPOM Contract & Anti-Fake-Green Rules') {
            steps {
                sh 'java scripts/LintCpom.java'
            }
        }
        stage('Test') {
            steps {
                sh '${cmd}'
            }
        }
    }
    post {
        always {
            junit '${reportPattern}'
        }
    }
}
`;
  }

  if (automationTool === 'cypress') {
    return `pipeline {
    agent {
        docker { image 'cypress/included:13.6.0' }
    }
    stages {
        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }
        stage('Dependency Vulnerability Audit') {
            steps {
                sh 'npm audit --audit-level=high'
            }
        }
        stage('Test') {
            steps {
                sh 'npx cypress run'
            }
        }
    }
    post {
        always {
            archiveArtifacts artifacts: 'cypress/screenshots/**/*,cypress/videos/**/*', allowEmptyArchive: true
        }
    }
}
`;
  }

  return `pipeline {
    agent none
    stages {
        stage('Sharded Tests') {
            matrix {
                axes {
                    axis {
                        name 'SHARD'
                        values '1', '2', '3', '4'
                    }
                }
                agent {
                    docker { image 'mcr.microsoft.com/playwright:v1.51.1-jammy' }
                }
                stages {
                    stage('Install') {
                        steps {
                            sh 'npm ci'
                        }
                    }
                    stage('Dependency Vulnerability Audit') {
                        steps {
                            sh 'npm audit --audit-level=high'
                        }
                    }
                    stage('Install Playwright Browsers') {
                        steps {
                            sh 'npx playwright install --with-deps'
                        }
                    }
                    stage('Audit CPOM Contract & Anti-Fake-Green Rules') {
                        steps {
                            sh 'npm run lint:cpom'
                        }
                    }
                    stage('Test') {
                        steps {
                            sh 'npx playwright test --project=chromium --shard=$SHARD/4 --reporter=blob'
                            sh 'mv blob-report "blob-report-$SHARD"'
                        }
                    }
                }
                post {
                    always {
                        stash(name: "blob-report-\${SHARD}", includes: "blob-report-\${SHARD}/**")
                    }
                }
            }
        }
        stage('Merge Reports') {
            agent {
                docker { image 'mcr.microsoft.com/playwright:v1.51.1-jammy' }
            }
            steps {
                sh 'npm ci'
                unstash 'blob-report-1'
                unstash 'blob-report-2'
                unstash 'blob-report-3'
                unstash 'blob-report-4'
                sh 'mkdir -p all-blob-reports'
                sh 'cp blob-report-*/*.zip all-blob-reports/'
                sh 'npx playwright merge-reports --reporter=html,junit ./all-blob-reports'
            }
            post {
                always {
                    junit 'playwright-report/junit-results.xml'
                    archiveArtifacts artifacts: 'playwright-report/**/*', fingerprint: true
                }
            }
        }
    }
}
`;
}

export function renderTeamcityInstructions(language?: string, automationTool?: string): string {
  if (language === 'python') {
    return `# TeamCity Setup Guide for Pytest + Playwright Tests

To run your Pytest + Playwright tests in TeamCity, follow these steps to create a Build Configuration:

## 1. Build Steps

Add the following Build Steps to your configuration:

### Step 1: Install Dependencies (Command Line)
- **Step Name**: Install dependencies
- **Run**: Custom script
- **Custom script**:
  \`\`\`bash
  pip install -e .[api]
  \`\`\`

### Step 2: Run Tests (Command Line)
- **Step Name**: Run Pytest
- **Run**: Custom script
- **Custom script**:
  \`\`\`bash
  pytest --splits 4 --group %SHARD% --junitxml=test-results/junit-results.xml
  \`\`\`
  (\`%SHARD%\` only resolves if you add the Matrix Build feature below — for a single-agent run
  without sharding, drop \`--splits 4 --group %SHARD%\` entirely.)

## 2. Shard across parallel agents (optional, recommended for larger suites)

The generated \`.teamcity/settings.kts\` (Kotlin DSL, generated alongside this guide) already wires
up a 4-way \`Matrix Build\` feature for you. To do it manually here instead: go to **Build Features**,
add **Matrix Build**, and add a parameter named \`SHARD\` with values \`1\`, \`2\`, \`3\`, \`4\` — TeamCity
then runs 4 parallel build cells, each with its own \`%SHARD%\` value substituted into the script
above.

## 3. Import XML Test Reports (JUnit)

To show detailed test results and build trends directly on the TeamCity dashboard:
- Go to **Build Features** of your Build Configuration.
- Click **Add build feature** and select **XML report processing**.
- Set **Report type** to: \`Ant JUnit\`
- Set **Monitoring paths** to: \`test-results/junit-results.xml\`
`;
  }

  if (language === 'csharp') {
    return `# TeamCity Setup Guide for .NET + Playwright Tests

To run your .NET + Playwright tests in TeamCity, follow these steps to create a Build Configuration:

## 1. Build Steps

Add the following Build Steps to your configuration:

### Step 1: Build & Install Browsers (Command Line)
- **Step Name**: Build and Install Browsers
- **Run**: Custom script
- **Custom script**:
  \`\`\`bash
  dotnet build
  pwsh bin/Debug/net8.0/playwright.ps1 install --with-deps
  \`\`\`

### Step 2: Run Tests (Command Line)
- **Step Name**: Run .NET Tests
- **Run**: Custom script
- **Custom script**:
  \`\`\`bash
  dotnet test --logger "junit;LogFilePath=test-results/junit-results.xml"
  \`\`\`

## 2. Import XML Test Reports (JUnit)

- Go to **Build Features** of your Build Configuration.
- Click **Add build feature** and select **XML report processing**.
- Set **Report type** to: \`Ant JUnit\`
- Set **Monitoring paths** to: \`test-results/junit-results.xml\`
`;
  }

  if (language === 'java') {
    const isGradle = automationTool?.includes('gradle');
    const installCmd = isGradle
      ? 'gradle playwrightInstall'
      : 'mvn exec:java -e -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps"';
    const cmd = isGradle ? 'gradle test' : 'mvn test';
    const reportPath = isGradle ? 'build/test-results/**/*.xml' : 'target/surefire-reports/*.xml';
    return `# TeamCity Setup Guide for Java + Playwright Tests

To run your Java + Playwright tests in TeamCity, follow these steps to create a Build Configuration:

## 1. Build Steps

Add the following Build Steps to your configuration:

### Step 1: Install Playwright Browsers (Command Line)
- **Step Name**: Install Playwright Browsers
- **Run**: Custom script
- **Custom script**:
  \`\`\`bash
  ${installCmd}
  \`\`\`

### Step 2: Run Tests (${isGradle ? 'Gradle' : 'Maven'})
- **Step Name**: Run Tests
- **Run**: Custom script
- **Custom script**:
  \`\`\`bash
  ${cmd}
  \`\`\`

## 2. Import XML Test Reports (JUnit)

- Go to **Build Features** of your Build Configuration.
- Click **Add build feature** and select **XML report processing**.
- Set **Report type** to: \`Ant JUnit\`
- Set **Monitoring paths** to: \`${reportPath}\`
`;
  }

  if (automationTool === 'cypress') {
    return `# TeamCity Setup Guide for Cypress Tests

To run your Cypress tests in TeamCity, follow these steps to create a Build Configuration:

## 1. Build Steps

Add the following Build Steps to your configuration:

### Step 1: Install Dependencies (Command Line)
- **Step Name**: Install dependencies
- **Run**: Custom script
- **Custom script**:
  \`\`\`bash
  npm ci
  \`\`\`

### Step 2: Run Cypress Tests (Command Line)
- **Step Name**: Run Cypress Tests
- **Run**: Custom script
- **Custom script**:
  \`\`\`bash
  npx cypress run
  \`\`\`

## 2. Artifacts Configuration

To publish Cypress screenshots and videos:
- Go to **General Settings** of your Build Configuration.
- Set **Artifact paths** to:
  \`\`\`
  cypress/screenshots => screenshots.zip
  cypress/videos => videos.zip
  \`\`\`
`;
  }

  return `# TeamCity Setup Guide for Playwright Tests

To run your Playwright tests in TeamCity, follow these steps to create a Build Configuration:

## 1. Build Steps

Add the following Build Steps to your configuration:

### Step 1: Install Dependencies (Command Line)
- **Step Name**: Install dependencies
- **Run**: Custom script
- **Custom script**:
  \`\`\`bash
  npm ci
  \`\`\`

### Step 2: Run Tests (Command Line)
- **Step Name**: Run Playwright tests
- **Run**: Custom script
- **Custom script**:
  \`\`\`bash
  npx playwright test --project=chromium --shard=%SHARD%/4 --reporter=blob
  \`\`\`
  (\`%SHARD%\` only resolves if you add the Matrix Build feature below — for a single-agent run
  without sharding, use \`npm test\` instead.)

## 2. Shard across parallel agents (optional, recommended for larger suites)

The generated \`.teamcity/settings.kts\` (Kotlin DSL, generated alongside this guide) already wires
up a 4-way \`Matrix Build\` feature plus a downstream \`Merge Playwright Reports\` configuration that
combines all 4 shards via \`playwright merge-reports\` into one HTML + JUnit report. To do the split
manually here instead: go to **Build Features**, add **Matrix Build**, and add a parameter named
\`SHARD\` with values \`1\`, \`2\`, \`3\`, \`4\`. You will still need to build the merge step yourself
(JetBrains' own Matrix Build docs don't publish a ready-made merge-configuration recipe) — the
Kotlin DSL file is the easier path for this reason.

## 3. Artifacts Configuration

To publish the Playwright HTML report so it can be viewed in TeamCity:
- Go to **General Settings** of your Build Configuration.
- Set **Artifact paths** to:
  \`\`\`
  playwright-report => report.zip
  \`\`\`

## 4. Import XML Test Reports (JUnit)

To show detailed test results and build trends directly on the TeamCity dashboard:
- Go to **Build Features** of your Build Configuration.
- Click **Add build feature** and select **XML report processing**.
- Set **Report type** to: \`Ant JUnit\`
- Set **Monitoring paths** to: \`playwright-report/junit-results.xml\`
`;
}

// Companion Maven module for the Kotlin DSL below — required for settings.kts to compile on
// either the TeamCity server or in an IDE. It resolves the configs-dsl-kotlin-{version} JARs from
// JetBrains' own Maven repository; a bare .kts file with no pom.xml does not compile.
export function renderTeamcityDslPom(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>teamcity-configs</groupId>
    <artifactId>teamcity-configs</artifactId>
    <version>1.0-SNAPSHOT</version>

    <properties>
        <kotlin.version>1.9.24</kotlin.version>
        <teamcity-configs.version>2024.03</teamcity-configs.version>
    </properties>

    <repositories>
        <repository>
            <id>jetbrains-all</id>
            <url>https://download.jetbrains.com/teamcity-repository</url>
        </repository>
    </repositories>

    <dependencies>
        <dependency>
            <groupId>org.jetbrains.teamcity</groupId>
            <artifactId>configs-dsl-kotlin-latest</artifactId>
            <version>\${teamcity-configs.version}</version>
        </dependency>
        <dependency>
            <groupId>org.jetbrains.teamcity</groupId>
            <artifactId>configs-dsl-kotlin-plugins-latest</artifactId>
            <version>\${teamcity-configs.version}</version>
            <type>pom</type>
        </dependency>
    </dependencies>

    <build>
        <sourceDirectory>.</sourceDirectory>
        <plugins>
            <plugin>
                <groupId>org.jetbrains.kotlin</groupId>
                <artifactId>kotlin-maven-plugin</artifactId>
                <version>\${kotlin.version}</version>
                <executions>
                    <execution>
                        <id>compile</id>
                        <goals>
                            <goal>compile</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
`;
}

// Kotlin DSL Configuration-as-Code, generated alongside the markdown guide above (not replacing
// it — teams doing manual UI setup still need the guide). Matches JetBrains' own default
// onboarding path for TeamCity projects with Versioned Settings enabled since 2019, formalized
// further in 2026.1 (auto-conversion of UI-configured projects into this same DSL).
export function renderTeamcityKotlinDsl(language?: string, automationTool?: string): string {
  const header = `import jetbrains.buildServer.configs.kotlin.*
import jetbrains.buildServer.configs.kotlin.buildFeatures.XmlReport
import jetbrains.buildServer.configs.kotlin.buildFeatures.xmlReport
import jetbrains.buildServer.configs.kotlin.buildSteps.script
import jetbrains.buildServer.configs.kotlin.triggers.vcs

version = "2024.03"

project {
    buildType(E2ETests)
}
`;

  function buildType(name: string, steps: string[], reportRules: string): string {
    const stepsBlock = steps
      .map(
        (s) => `        script {
            name = "${s.split('\n')[0]}"
            scriptContent = """
${s}
            """.trimIndent()
        }`,
      )
      .join('\n');
    return `${header}
object E2ETests : BuildType({
    name = "${name}"

    vcs {
        root(DslContext.settingsRoot)
    }

    steps {
${stepsBlock}
    }

    triggers {
        vcs {
        }
    }

    features {
        xmlReport {
            reportType = XmlReport.XmlReportType.JUNIT
            rules = "${reportRules}"
        }
    }
})
`;
  }

  // Sharded matrix build (jetbrains.com/help/teamcity/matrix-build.html) - each of 4 generated
  // cells runs one shard and reports its own JUnit results independently; no merge configuration
  // needed since pytest-split doesn't produce a mergeable report the way Playwright's blob
  // reporter does. `matrix` import verified live against a real TeamCity 2025.03 server on
  // 2026-08-31 - see the fuller note on the TS/JS branch below.
  if (language === 'python') {
    return `import jetbrains.buildServer.configs.kotlin.*
import jetbrains.buildServer.configs.kotlin.buildFeatures.XmlReport
import jetbrains.buildServer.configs.kotlin.buildFeatures.xmlReport
import jetbrains.buildServer.configs.kotlin.matrix
import jetbrains.buildServer.configs.kotlin.buildSteps.script
import jetbrains.buildServer.configs.kotlin.triggers.vcs

version = "2024.03"

project {
    buildType(E2ETests)
}

object E2ETests : BuildType({
    name = "E2E Tests (pytest + Playwright, sharded)"

    vcs {
        root(DslContext.settingsRoot)
    }

    steps {
        script {
            name = "Install dependencies"
            scriptContent = """
pip install -e .[api]
            """.trimIndent()
        }
        script {
            name = "Run Pytest (shard %SHARD%/4)"
            scriptContent = """
pytest --splits 4 --group %SHARD% --junitxml=test-results/junit-results.xml
            """.trimIndent()
        }
    }

    triggers {
        vcs {
        }
    }

    features {
        matrix {
            param("SHARD", listOf(value("1"), value("2"), value("3"), value("4")))
        }
        xmlReport {
            reportType = XmlReport.XmlReportType.JUNIT
            rules = "test-results/junit-results.xml"
        }
    }
})
`;
  }

  if (language === 'csharp') {
    return buildType(
      'E2E Tests (.NET + Playwright)',
      [
        'Build and Install Browsers\ndotnet build\npwsh bin/Debug/net8.0/playwright.ps1 install --with-deps',
        'Run .NET Tests\ndotnet test --logger "junit;LogFilePath=test-results/junit-results.xml"',
      ],
      'test-results/junit-results.xml',
    );
  }

  if (language === 'java') {
    const isGradle = automationTool?.includes('gradle');
    const installCmd = isGradle
      ? 'gradle playwrightInstall'
      : 'mvn exec:java -e -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps"';
    const cmd = isGradle ? 'gradle test' : 'mvn test';
    const reportPath = isGradle ? 'build/test-results/**/*.xml' : 'target/surefire-reports/*.xml';
    return buildType(
      `E2E Tests (Java + Playwright + ${isGradle ? 'Gradle' : 'Maven'})`,
      [`Install Playwright Browsers\n${installCmd}`, `Run Tests\n${cmd}`],
      reportPath,
    );
  }

  if (automationTool === 'cypress') {
    return buildType(
      'E2E Tests (Cypress)',
      ['Install dependencies\nnpm ci', 'Run Cypress Tests\nnpx cypress run'],
      'cypress/results/*.xml',
    );
  }

  // Sharded matrix build, same mechanism as Python above. Unlike Python, Playwright's blob
  // reporter DOES produce a mergeable report, so a downstream MergeReports build type combines all
  // 4 shards via `playwright merge-reports` - the snapshot + artifact dependency pattern below is
  // TeamCity's documented general "run after, consume artifacts" mechanism. Verified live against a
  // real TeamCity 2025.03 server (Docker) on 2026-08-31: the `matrix` build feature and the
  // MergeReports snapshot+artifact dependency both materialize exactly as coded here. That same
  // verification pass caught and fixed a real bug - `jetbrains.buildServer.configs.kotlin.matrix` is
  // the correct import (the extension function lives in the versioned DSL root package, not under
  // `.buildFeatures.`); the previous `buildFeatures.matrix` import failed to compile on a live
  // server with "Unresolved reference: matrix". See CHANGELOG.md for the fix.
  return `import jetbrains.buildServer.configs.kotlin.*
import jetbrains.buildServer.configs.kotlin.buildFeatures.XmlReport
import jetbrains.buildServer.configs.kotlin.buildFeatures.xmlReport
import jetbrains.buildServer.configs.kotlin.matrix
import jetbrains.buildServer.configs.kotlin.buildSteps.script
import jetbrains.buildServer.configs.kotlin.triggers.vcs

version = "2024.03"

project {
    buildType(E2ETests)
    buildType(MergeReports)
}

object E2ETests : BuildType({
    name = "E2E Tests (Playwright, sharded)"

    vcs {
        root(DslContext.settingsRoot)
    }

    steps {
        script {
            name = "Install dependencies"
            scriptContent = """
npm ci
            """.trimIndent()
        }
        script {
            name = "Install Playwright Browsers"
            scriptContent = """
npx playwright install --with-deps
            """.trimIndent()
        }
        script {
            name = "Audit CPOM Contract & Anti-Fake-Green Rules"
            scriptContent = """
npm run lint:cpom
            """.trimIndent()
        }
        script {
            name = "Run Playwright tests (shard %SHARD%/4)"
            scriptContent = """
npx playwright test --project=chromium --shard=%SHARD%/4 --reporter=blob
            """.trimIndent()
        }
    }

    triggers {
        vcs {
        }
    }

    features {
        matrix {
            param("SHARD", listOf(value("1"), value("2"), value("3"), value("4")))
        }
    }

    artifactRules = "blob-report => blob-report-%SHARD%.zip"
})

object MergeReports : BuildType({
    name = "Merge Playwright Reports"

    vcs {
        root(DslContext.settingsRoot)
    }

    dependencies {
        snapshot(E2ETests) {
        }
        artifacts(E2ETests) {
            artifactRules = "blob-report-*.zip => all-blob-reports"
        }
    }

    steps {
        script {
            name = "Merge shards into a single HTML report"
            scriptContent = """
npm ci
npx playwright merge-reports --reporter=html,junit ./all-blob-reports
            """.trimIndent()
        }
    }

    features {
        xmlReport {
            reportType = XmlReport.XmlReportType.JUNIT
            rules = "playwright-report/junit-results.xml"
        }
    }
})
`;
}
