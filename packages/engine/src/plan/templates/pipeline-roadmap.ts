// The stages of the analysis pipeline and the one-line roadmap drawn from them, pasted into every
// script that prints it at generation: scripts/pipeline-status.mjs, which knows where the project
// is, and scripts/skill-briefing.mjs, which opens each stage of the chain with it. One list, so the
// two can never name the stages differently.
export const PIPELINE_ROADMAP_SOURCE = `// Only the real stages. An earlier version interleaved a literal 'Review' step between each pair,
// which rendered as one long line repeating the same context-free word and wrapped into an illegible
// block in any real terminal - the review pause is a property of every stage, stated once in the
// pre-flight notice instead.
const ROADMAP_STEPS = [
  { short: 'Site map', blurb: 'crawl the app, and work out what each page is for' },
  { short: 'Feature map', blurb: 'group those pages into features, and work out what the app is made of' },
  { short: 'Test conditions', blurb: 'decide what should be tested' },
  { short: 'Test cases', blurb: 'turn those into concrete, readable test cases' },
  { short: 'Automated tests', blurb: 'write the real test code and run it' },
  { short: 'Test closure', blurb: 'check what is covered, and decide whether that is enough' },
];

// Which roadmap step each stage skill runs.
const ROADMAP_STEP_OF_SKILL = {
  'map-site': 0,
  'map-features': 1,
  'define-test-conditions': 2,
  'design-test-cases': 3,
  'automate-test': 4,
};

// The current step is marked by brackets alone. An earlier version appended "<- you are here", which
// restated in four words what the brackets already say and pushed the line past the terminal's width.
function roadmapAt(index) {
  return ROADMAP_STEPS.map(function (step, i) {
    const label = 'S' + (i + 1) + ' ' + step.short;
    return i === index ? '[' + label + ']' : label;
  }).join(' -> ');
}`;
