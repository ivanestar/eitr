// CI/CD templates for E2E workflows. create-if-absent.

export function renderGithubActions(language?: string, automationTool?: string): string {
  if (language === 'python') {
    return `name: E2E Tests (pytest + Playwright)
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
      with:
        python-version: '3.11'
    - name: Install dependencies
      run: pip install -e .[api]
    - name: Dependency Vulnerability Audit
      run: pip install pip-audit && pip-audit
    - name: Install Playwright Browsers
      run: playwright install --with-deps
    - name: Run Pytest
      run: pytest --junitxml=test-results/junit-results.xml
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: test-results
        path: test-results/junit-results.xml
        retention-days: 30
`;
  }

  if (language === 'csharp') {
    return `name: E2E Tests (.NET + Playwright)
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-dotnet@v4
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
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: test-results
        path: test-results/
        retention-days: 30
`;
  }

  if (language === 'java') {
    if (automationTool?.includes('gradle')) {
      return `name: E2E Tests (Java + Playwright + Gradle)
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-java@v4
      with:
        distribution: 'temurin'
        java-version: '17'
    - name: Run tests
      run: gradle test
    - uses: actions/upload-artifact@v4
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
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-java@v4
      with:
        distribution: 'temurin'
        java-version: '17'
    - name: Run tests
      run: mvn test
    - uses: actions/upload-artifact@v4
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
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v6
      with:
        node-version: 18
        cache: 'npm'
    - name: Install dependencies
      run: npm ci
    - name: Dependency Vulnerability Audit
      run: npm audit --audit-level=high
    - name: Run Cypress tests
      run: npx cypress run
    - uses: actions/upload-artifact@v4
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
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v6
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
    - name: Run Playwright tests
      run: npm test
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 30
`;
}

// Dependabot version + security-update config, generated alongside the GitHub Actions workflow.
// The 'github-actions' entry is unconditional (keeps the generated workflow's own action pins
// current); the second entry tracks whichever language-specific package ecosystem the project
// actually uses.
export function renderDependabotConfig(language?: string, automationTool?: string): string {
  const ecosystem =
    language === 'python'
      ? 'pip'
      : language === 'csharp'
        ? 'nuget'
        : language === 'java'
          ? automationTool?.includes('gradle')
            ? 'gradle'
            : 'maven'
          : 'npm';

  return `version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
  - package-ecosystem: "${ecosystem}"
    directory: "/"
    schedule:
      interval: "weekly"
`;
}

export function renderGitlabCi(language?: string, automationTool?: string): string {
  if (language === 'python') {
    return `stages:
  - test

pytest-playwright-tests:
  stage: test
  image: mcr.microsoft.com/playwright/python:v1.45.0-jammy
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - pip install -e .[api]
    - pip install pip-audit && pip-audit
    - pytest --junitxml=test-results/junit-results.xml
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
`;
  }

  if (language === 'java') {
    const cmd = automationTool?.includes('gradle') ? 'gradle test' : 'mvn test';
    const reportPath = automationTool?.includes('gradle')
      ? 'build/reports/tests/'
      : 'target/surefire-reports/';
    return `stages:
  - test

java-playwright-tests:
  stage: test
  image: eclipse-temurin:17-jdk-jammy
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
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

playwright-tests:
  stage: test
  image: mcr.microsoft.com/playwright:v1.51.1-jammy
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - npm ci
    - npm audit --audit-level=high
    - npm run lint:cpom
    - npm test
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
    agent {
        docker { image 'mcr.microsoft.com/playwright/python:v1.45.0-jammy' }
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
        stage('Test') {
            steps {
                sh 'pytest --junitxml=test-results/junit-results.xml'
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

  if (language === 'java') {
    const cmd = automationTool?.includes('gradle') ? 'gradle test' : 'mvn test';
    const reportPattern = automationTool?.includes('gradle')
      ? 'build/test-results/**/*.xml'
      : 'target/surefire-reports/*.xml';
    return `pipeline {
    agent {
        docker { image 'eclipse-temurin:17-jdk-jammy' }
    }
    stages {
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
        stage('Test') {
            steps {
                sh 'npm test'
            }
        }
    }
    post {
        always {
            junit 'playwright-report/junit-results.xml'
            archiveArtifacts artifacts: 'playwright-report/**/*', fingerprint: true
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
  pytest --junitxml=test-results/junit-results.xml
  \`\`\`

## 2. Import XML Test Reports (JUnit)

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
    const cmd = isGradle ? 'gradle test' : 'mvn test';
    const reportPath = isGradle ? 'build/test-results/**/*.xml' : 'target/surefire-reports/*.xml';
    return `# TeamCity Setup Guide for Java + Playwright Tests

To run your Java + Playwright tests in TeamCity, follow these steps to create a Build Configuration:

## 1. Build Steps

Add the following Build Steps to your configuration:

### Step 1: Run Tests (${isGradle ? 'Gradle' : 'Maven'})
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
  npm test
  \`\`\`

## 2. Artifacts Configuration

To publish the Playwright HTML report so it can be viewed in TeamCity:
- Go to **General Settings** of your Build Configuration.
- Set **Artifact paths** to:
  \`\`\`
  playwright-report => report.zip
  \`\`\`

## 3. Import XML Test Reports (JUnit)

To show detailed test results and build trends directly on the TeamCity dashboard:
- Go to **Build Features** of your Build Configuration.
- Click **Add build feature** and select **XML report processing**.
- Set **Report type** to: \`Ant JUnit\`
- Set **Monitoring paths** to: \`playwright-report/junit-results.xml\`
`;
}
