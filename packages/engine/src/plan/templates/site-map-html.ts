// Template for docs/site-map/site-map.html - a zero-maintenance human viewer for
// docs/site-map/site-map.json. create-if-absent. Unlike the file this replaced
// (app-graph-html.ts's static, hardcoded demo SVG), this fetches and renders the real,
// current site-map.json at view-time - there is nothing here for /map-site or any agent to keep
// in sync, so it can never drift from the actual crawl the way a separately-authored Mermaid/HTML
// summary would.

// Generation-time escape for baseUrl, which comes from the user's own CLI input, not crawled page
// content (the real untrusted-data path - route titles/regions/components - is escaped at
// view-time in the page's own script via the textContent round-trip below). Defense in depth only.
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderSiteMapHtml(baseUrl?: string): string {
  const url = escapeHtmlAttr(baseUrl ?? 'http://localhost:3000');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Site Map</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --success: #4ade80;
      --warn: #fbbf24;
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
      flex-wrap: wrap;
      gap: 1rem;
    }
    h1 {
      margin: 0;
      font-size: 1.5rem;
      color: var(--accent);
    }
    input[type="search"] {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--card-bg);
      color: var(--text);
      outline: none;
      min-width: 260px;
    }
    main {
      padding: 2rem;
    }
    .status {
      color: var(--text-muted);
      margin-bottom: 1rem;
    }
    .status.error {
      color: #f87171;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card-bg);
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      text-align: left;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th {
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.85rem;
      text-transform: uppercase;
    }
    tr.removed {
      opacity: 0.5;
    }
    .badge {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      font-size: 0.75rem;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
      margin: 0.1rem 0.2rem 0.1rem 0;
    }
    .badge.removed {
      background: rgba(248, 113, 113, 0.15);
      color: #f87171;
    }
    .widgets {
      margin-top: 2rem;
    }
    .widgets h2 {
      color: var(--accent);
      font-size: 1.1rem;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Site Map</h1>
      <small style="color: var(--text-muted);">Target Application: <code>${url}</code></small>
    </div>
    <input type="search" id="searchInput" placeholder="Filter routes..." oninput="filterRows()">
  </header>
  <main>
    <p class="status" id="status">Loading site-map.json...</p>
    <table id="routesTable" hidden>
      <thead>
        <tr>
          <th>Route</th>
          <th>Title</th>
          <th>Regions</th>
          <th>Components</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody id="routesBody"></tbody>
    </table>
    <div class="widgets" id="widgetsSection" hidden>
      <h2>Shared Widgets</h2>
      <div id="widgetsList"></div>
    </div>
  </main>
  <script>
    async function loadSiteMap() {
      const statusEl = document.getElementById('status');
      try {
        const response = await fetch('./site-map.json');
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        const data = await response.json();
        renderSiteMap(data);
      } catch (err) {
        statusEl.textContent = 'Could not load site-map.json (' + err.message + '). Run /map-site create to generate it.';
        statusEl.classList.add('error');
      }
    }

    function renderSiteMap(data) {
      const statusEl = document.getElementById('status');
      const routes = data.routes || {};
      const paths = Object.keys(routes).sort();

      if (paths.length === 0) {
        statusEl.textContent = 'site-map.json has no routes yet. Run /map-site create.';
        return;
      }

      statusEl.textContent =
        paths.length + ' route(s) - generated ' + (data.generatedAt || 'unknown') +
        (data.lastUpdatedAt ? ', last updated ' + data.lastUpdatedAt : '');

      const tbody = document.getElementById('routesBody');
      for (const path of paths) {
        const route = routes[path];
        const tr = document.createElement('tr');
        if (route.status === 'removed') tr.classList.add('removed');

        const regions = (route.regions || []).map(r => '<span class="badge">' + escapeHtml(r) + '</span>').join('');
        const components = (route.components || []).map(c => '<span class="badge">' + escapeHtml(c) + '</span>').join('');
        const status = route.status === 'removed'
          ? '<span class="badge removed">removed</span>'
          : '<span class="badge">active</span>';

        tr.innerHTML =
          '<td><code>' + escapeHtml(path) + '</code></td>' +
          '<td>' + escapeHtml(route.title || '') + '</td>' +
          '<td>' + regions + '</td>' +
          '<td>' + components + '</td>' +
          '<td>' + status + '</td>';
        tbody.appendChild(tr);
      }
      document.getElementById('routesTable').hidden = false;

      const widgets = data.sharedWidgets || [];
      if (widgets.length > 0) {
        document.getElementById('widgetsList').innerHTML =
          widgets.map(w => '<span class="badge">' + escapeHtml(w) + '</span>').join('');
        document.getElementById('widgetsSection').hidden = false;
      }
    }

    function filterRows() {
      const query = document.getElementById('searchInput').value.toLowerCase();
      const rows = document.querySelectorAll('#routesBody tr');
      rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
      });
    }

    function escapeHtml(value) {
      const div = document.createElement('div');
      div.textContent = String(value);
      return div.innerHTML;
    }

    loadSiteMap();
  </script>
</body>
</html>
`;
}
