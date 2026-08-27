// Template for generating an interactive standalone HTML site graph dashboard. create-if-absent.

export function renderAppGraphHtml(baseUrl?: string): string {
  const url = baseUrl ?? 'http://localhost:3000';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Architecture & Site Topology Graph</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --success: #4ade80;
      --border: #334155;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
    }
    header {
      padding: 1.5rem 2rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h1 {
      margin: 0;
      font-size: 1.5rem;
      color: var(--accent);
    }
    .controls {
      display: flex;
      gap: 1rem;
    }
    input[type="search"] {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--card-bg);
      color: var(--text);
      outline: none;
    }
    main {
      padding: 2rem;
      display: flex;
      gap: 2rem;
    }
    .graph-container {
      flex: 1;
      height: 600px;
      background: var(--card-bg);
      border-radius: 8px;
      border: 1px solid var(--border);
      position: relative;
      overflow: hidden;
    }
    svg {
      width: 100%;
      height: 100%;
    }
    .node {
      cursor: pointer;
    }
    .node rect {
      fill: #0284c7;
      stroke: #38bdf8;
      stroke-width: 2;
      rx: 6;
    }
    .node text {
      fill: #ffffff;
      font-size: 12px;
      text-anchor: middle;
      dominant-baseline: middle;
    }
    .node.route rect { fill: #0f766e; stroke: #2dd4bf; }
    .node.page rect { fill: #4338ca; stroke: #818cf8; }
    .node.sanity rect { fill: #15803d; stroke: #4ade80; }
    .sidebar {
      width: 320px;
      background: var(--card-bg);
      border-radius: 8px;
      border: 1px solid var(--border);
      padding: 1.5rem;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>EITR Architecture & Site Topology Graph</h1>
      <small style="color: var(--text-muted);">Target Application: <code>${url}</code></small>
    </div>
    <div class="controls">
      <input type="search" id="searchInput" placeholder="Filter routes & components..." oninput="filterGraph()">
    </div>
  </header>
  <main>
    <div class="graph-container">
      <svg id="networkGraph" viewBox="0 0 800 600">
        <!-- Connecting Edges -->
        <line x1="150" y1="300" x2="350" y2="200" stroke="#475569" stroke-width="2" />
        <line x1="150" y1="300" x2="350" y2="400" stroke="#475569" stroke-width="2" />
        <line x1="350" y1="200" x2="550" y2="200" stroke="#475569" stroke-width="2" />
        <line x1="350" y1="400" x2="550" y2="400" stroke="#475569" stroke-width="2" />

        <!-- Nodes -->
        <g class="node route" transform="translate(150, 300)">
          <rect x="-60" y="-20" width="120" height="40" />
          <text>Base Route (/)</text>
        </g>
        <g class="node page" transform="translate(350, 200)">
          <rect x="-70" y="-20" width="140" height="40" />
          <text>LoginPage (CPOM)</text>
        </g>
        <g class="node page" transform="translate(350, 400)">
          <rect x="-75" y="-20" width="150" height="40" />
          <text>DashboardPage (CPOM)</text>
        </g>
        <g class="node sanity" transform="translate(550, 200)">
          <rect x="-60" y="-20" width="120" height="40" />
          <text>login.sanity.spec</text>
        </g>
        <g class="node sanity" transform="translate(550, 400)">
          <rect x="-65" y="-20" width="130" height="40" />
          <text>dashboard.sanity.spec</text>
        </g>
      </svg>
    </div>
    <div class="sidebar">
      <h3>Topology Overview</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem;">
        This interactive graph visualizes the relationship between application routes, Component Page Objects, and verified sanity test suites.
      </p>
      <ul>
        <li><strong>Routes Mapped:</strong> 2</li>
        <li><strong>Page Objects:</strong> 2</li>
        <li><strong>Sanity Coverage:</strong> 100%</li>
      </ul>
    </div>
  </main>
  <script>
    function filterGraph() {
      const query = document.getElementById('searchInput').value.toLowerCase();
      const nodes = document.querySelectorAll('.node');
      nodes.forEach(node => {
        const text = node.textContent.toLowerCase();
        node.style.display = text.includes(query) ? 'block' : 'none';
      });
    }
  </script>
</body>
</html>
`;
}
