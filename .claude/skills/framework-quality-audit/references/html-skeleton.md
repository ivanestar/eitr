# Deterministic report template (HTML skeleton — fill placeholders, keep everything else identical)

Use this exact structure, CSS tokens, and section order for every audit. Placeholders are written
as `{{PLACEHOLDER}}`; repeated blocks (category cards, bar rows, gap items, killer cards) are
marked with a `<!-- REPEAT ... -->` comment showing what to loop.

```html
<title>Аудит EITR {{STACK_LABEL}}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Source+Sans+3:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

  :root {
    --bg: #f6f5f1;
    --surface: #ffffff;
    --surface-2: #efeee8;
    --ink: #1c1f1d;
    --muted: #5c6460;
    --border: #dedcd3;
    --accent: #0e6e63;
    --accent-ink: #ffffff;
    --accent-soft: #dcefe9;
    --warn: #a3590a;
    --warn-soft: #f6e6d2;
    --crit: #a3271f;
    --crit-soft: #f5dfdc;
    --good: #2f7d4f;
    --good-soft: #dcefe1;
    --bar-track: #e6e4dc;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) {
      --bg: #15181a;
      --surface: #1c2023;
      --surface-2: #22262a;
      --ink: #eceeec;
      --muted: #9aa39e;
      --border: #31373a;
      --accent: #5fc9b8;
      --accent-ink: #0c1211;
      --accent-soft: #1e3430;
      --warn: #e0a256;
      --warn-soft: #3a2c19;
      --crit: #e2837b;
      --crit-soft: #3a2320;
      --good: #7fcb9a;
      --good-soft: #1c3226;
      --bar-track: #2a2f32;
    }
  }
  :root[data-theme='dark'] {
    --bg: #15181a;
    --surface: #1c2023;
    --surface-2: #22262a;
    --ink: #eceeec;
    --muted: #9aa39e;
    --border: #31373a;
    --accent: #5fc9b8;
    --accent-ink: #0c1211;
    --accent-soft: #1e3430;
    --warn: #e0a256;
    --warn-soft: #3a2c19;
    --crit: #e2837b;
    --crit-soft: #3a2320;
    --good: #7fcb9a;
    --good-soft: #1c3226;
    --bar-track: #2a2f32;
  }
  * {
    box-sizing: border-box;
  }
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: 'Source Sans 3', system-ui, sans-serif;
    line-height: 1.55;
  }
  .wrap {
    max-width: 920px;
    margin: 0 auto;
    padding: 56px 24px 120px;
  }
  h1,
  h2,
  h3 {
    font-family: 'Fraunces', Georgia, serif;
    text-wrap: balance;
    color: var(--ink);
  }
  h1 {
    font-size: 2.6rem;
    font-weight: 700;
    margin: 0 0 6px;
    letter-spacing: -0.01em;
  }
  h2 {
    font-size: 1.55rem;
    font-weight: 600;
    margin: 0 0 4px;
  }
  h3 {
    font-size: 1.15rem;
    font-weight: 600;
    margin: 0 0 2px;
  }
  .kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    font-weight: 700;
    margin-bottom: 14px;
  }
  .lede {
    color: var(--muted);
    font-size: 1.05rem;
    max-width: 65ch;
    margin: 14px 0 0;
  }
  header.hero {
    border-bottom: 1px solid var(--border);
    padding-bottom: 36px;
    margin-bottom: 40px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .headline-score {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-top: 6px;
  }
  .headline-score .num {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 3.4rem;
    color: var(--accent);
    line-height: 1;
  }
  .headline-score .of {
    font-family: 'JetBrains Mono', monospace;
    color: var(--muted);
    font-size: 1.2rem;
  }
  .headline-score .label {
    color: var(--muted);
    font-size: 0.95rem;
    max-width: 38ch;
  }
  .verdict {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 20px;
    font-size: 0.98rem;
    color: var(--ink);
  }
  .verdict strong {
    color: var(--accent);
  }
  nav.toc {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px 22px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 22px;
    margin-bottom: 48px;
    font-size: 0.9rem;
  }
  nav.toc a {
    color: var(--ink);
    text-decoration: none;
    border-bottom: 1px dotted var(--border);
  }
  nav.toc a:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
  nav.toc .toc-title {
    grid-column: 1/-1;
    font-family: 'JetBrains Mono', monospace;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.7rem;
    color: var(--muted);
    margin-bottom: 6px;
  }
  section {
    margin-bottom: 56px;
  }
  section.group-open {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin: 64px 0 24px;
    border-top: 1px solid var(--border);
    padding-top: 28px;
  }
  section.group-open .idx {
    font-family: 'JetBrains Mono', monospace;
    color: var(--accent);
    font-weight: 700;
    font-size: 0.95rem;
  }
  .overview {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 56px;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 230px 1fr 56px;
    align-items: center;
    gap: 12px;
  }
  .bar-row .name {
    font-size: 0.88rem;
    color: var(--ink);
  }
  .bar-track {
    height: 10px;
    border-radius: 6px;
    background: var(--bar-track);
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 6px;
    background: var(--accent);
  }
  .bar-fill.warn {
    background: var(--warn);
  }
  .bar-fill.crit {
    background: var(--crit);
  }
  .bar-score {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    color: var(--muted);
    text-align: right;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px 26px;
    margin-bottom: 18px;
  }
  .card-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 14px;
  }
  .score-pill {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 0.95rem;
    padding: 4px 12px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .score-pill.good {
    background: var(--good-soft);
    color: var(--good);
  }
  .score-pill.mid {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .score-pill.low {
    background: var(--crit-soft);
    color: var(--crit);
  }
  ul.ev {
    margin: 0;
    padding-left: 20px;
  }
  ul.ev li {
    margin-bottom: 8px;
    font-size: 0.95rem;
  }
  ul.ev li::marker {
    color: var(--accent);
  }
  code,
  .fp {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.82em;
    background: var(--surface-2);
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--ink);
  }
  .gaplist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .gaplist li {
    display: flex;
    gap: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid var(--crit);
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 0.92rem;
  }
  .gaplist li.mid {
    border-left-color: var(--warn);
  }
  .gaplist .n {
    font-family: 'JetBrains Mono', monospace;
    color: var(--muted);
    font-size: 0.82rem;
    min-width: 26px;
  }
  .killerlist {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .killer {
    background: var(--accent-soft);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 20px;
  }
  .killer h4 {
    margin: 0 0 6px;
    font-family: 'Source Sans 3';
    font-weight: 700;
    font-size: 0.98rem;
    color: var(--ink);
  }
  .killer p {
    margin: 0;
    font-size: 0.92rem;
    color: var(--ink);
  }
  .killer .tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 2px 8px;
    border-radius: 999px;
    margin-left: 8px;
  }
  .priority {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  @media (max-width: 700px) {
    .priority {
      grid-template-columns: 1fr;
    }
    nav.toc {
      grid-template-columns: 1fr;
    }
    .bar-row {
      grid-template-columns: 150px 1fr 40px;
    }
  }
  .prio-col {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 20px;
  }
  .prio-col h4 {
    margin: 0 0 10px;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-family: 'JetBrains Mono', monospace;
  }
  .prio-col ol {
    margin: 0;
    padding-left: 18px;
    font-size: 0.9rem;
  }
  .prio-col li {
    margin-bottom: 8px;
  }
  footer {
    border-top: 1px solid var(--border);
    margin-top: 60px;
    padding-top: 20px;
    font-size: 0.82rem;
    color: var(--muted);
    font-family: 'JetBrains Mono', monospace;
  }
  a {
    color: var(--accent);
  }
  ::selection {
    background: var(--accent-soft);
  }
</style>

<div class="wrap">
  <header class="hero">
    <div class="kicker">Аудит генератора · {{STACK_LABEL}} · {{DATE}}</div>
    <h1>{{HEADLINE}}</h1>
    <p class="lede">{{SCOPE_NOTE — sample path used, engineVersion/staleness check result}}</p>
    <div class="headline-score">
      <span class="num">{{OVERALL_SCORE}}</span><span class="of">/ 10</span>
      <span class="label">{{ONE_LINE_HEADLINE_TAKEAWAY}}</span>
    </div>
    <div class="verdict"><strong>Главный вывод:</strong> {{2-4 SENTENCE RUTHLESS VERDICT}}</div>
  </header>

  <nav class="toc">
    <div class="toc-title">Разделы отчёта</div>
    <a href="#overview">Обзор всех оценок</a>
    <a href="#code">A. Код фреймворка (10 категорий)</a>
    <a href="#ai">B. AI-экосистема (8 категорий + гэп)</a>
    <a href="#gaps">Полный список гэпов</a>
    <a href="#killer">Killer-фичи</a>
    <a href="#priority">Приоритеты: что чинить в первую очередь</a>
  </nav>

  <section id="overview">
    <h2>Обзор</h2>
    <div class="overview">
      <!-- REPEAT for all 19 categories, in the fixed order from this skill:
      <div class="bar-row"><div class="name">{{CATEGORY NAME}}</div>
        <div class="bar-track"><div class="bar-fill {{warn|crit if <7|<5}}" style="width:{{SCORE*10}}%"></div></div>
        <div class="bar-score">{{SCORE}}/10</div></div>
      -->
    </div>
  </section>

  <section class="group-open" id="code">
    <span class="idx">A</span>
    <h2>Код фреймворка</h2>
  </section>
  <!-- REPEAT one .card per category 1-10:
  <div class="card">
    <div class="card-head"><h3>{{CATEGORY NAME}}</h3><span class="score-pill {{good|mid|low}}">{{SCORE}}/10</span></div>
    <ul class="ev"><li>{{evidence bullet with file:line}}</li> ... </ul>
  </div>
  -->

  <section class="group-open" id="ai">
    <span class="idx">B</span>
    <h2>AI-экосистема</h2>
  </section>
  <!-- REPEAT one .card per category 11-19 (category 19 gets card style="border-color:var(--crit);" if score is 0) -->

  <section id="gaps">
    <h2>Полный список гэпов</h2>
    <ul class="gaplist">
      <!-- REPEAT: <li class="{{mid if minor}}"><span class="n">{{NN}}</span><span>{{gap text}}</span></li> -->
    </ul>
  </section>

  <section id="killer">
    <h2>Killer-фичи</h2>
    <div class="killerlist">
      <!-- REPEAT: <div class="killer"><h4>{{idea title}}<span class="tag">{{area tag}}</span></h4><p>{{1-3 sentence description}}</p></div> -->
    </div>
  </section>

  <section id="priority">
    <h2>Приоритеты</h2>
    <div class="priority">
      <div class="prio-col">
        <h4>Быстрые правки (часы)</h4>
        <ol>
          <!-- REPEAT -->
        </ol>
      </div>
      <div class="prio-col">
        <h4>Стратегические инвестиции (дни–недели)</h4>
        <ol>
          <!-- REPEAT -->
        </ol>
      </div>
    </div>
  </section>

  <footer>
    Источники: {{sample path + engineVersion}} · {{template source path(s)}} · два независимых
    read-only аудита
  </footer>
</div>
```
