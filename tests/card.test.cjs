const test = require("node:test");
const assert = require("node:assert/strict");

let CardClass;
global.HTMLElement = class {
  attachShadow() {
    this.shadowRoot = {
      innerHTML: "",
      querySelectorAll: () => [],
    };
    return this.shadowRoot;
  }
};
global.customElements = {
  define(_name, value) { CardClass = value; },
};
global.window = {};
require("../health-manager-card.js");

const attributes = {
  last_assessment: "2026-11-23T10:00:00Z",
  active_issues: 4,
  unavailable_entity_count: 8,
  newly_unavailable_entity_count: 2,
  persistent_unavailable_entity_count: 6,
  missing_tracked_entity_count: 1,
  unavailable_investigation_group_count: 1,
  persistent_unavailable_entity_ids: ["sensor.one"],
  missing_tracked_entity_ids: ["sensor.gone"],
  unavailable_investigation_groups: [{
    title: "Living room device",
    group_type: "device",
    confidence: "strong",
    duration_minutes: 75,
    entity_ids: ["sensor.one"],
    evidence: ["Same registered device"],
  }],
  unknown_entity_count: 12,
  actionable_unknown_entity_count: 9,
  raw_actionable_unknown_entity_count: 10,
  classified_unknown_entity_count: 3,
  classification_review_due_count: 1,
  entity_classification_counts: { expected: 2, setup_in_progress: 1 },
  unknown_counts_by_domain: { sensor: 8, switch: 4 },
  classification_review_due_entities: [{
    entity_id: "sensor.review",
    classification: "expected",
    reason: "<script>alert(1)</script>",
  }],
  config_entry_count: 30,
  failed_config_entry_count: 1,
  integration_attention_domains: ["mqtt"],
  failed_config_entry_domains: { mqtt: 1 },
  config_entry_states: { mqtt: "setup_error" },
  integration_inventory: { attention_domain_count: 1, attention_domains: ["mqtt"] },
  integration_trend_summary: { active_attention_domain_count: 1 },
  unavailable_investigations: [{
    investigation_id: "inv-1",
    title: "Investigate sensor.one",
    status: "investigating",
    entity_ids: ["sensor.one"],
    evidence: ["same device"],
  }],
  unavailable_investigation_count: 1,
  unavailable_investigations_needing_review: 0,
  unavailable_investigations_in_progress: 1,
  unavailable_investigations_waiting: 0,
  unavailable_investigations_expected: 0,
  unavailable_investigations_resolved: 0,
  unavailable_investigation_status_counts: { investigating: 1 },
  availability_observation_event_count: 2,
  collection_coverage: { coverage_percent: 96 },
  compatibility_assessment: { overall_status: "compatible" },
  diagnostic_trend: { overall_direction: "improving" },
  report_count: 7,
  platform_updates: { core: { state: "off" } },
};

function createCard() {
  const card = new CardClass();
  card.setConfig({});
  card.hass = {
    states: {
      "sensor.health_overview": { state: "attention", attributes },
      "sensor.unavailable_details": {
        state: "available",
        attributes: { persistent_unavailable_entity_ids: ["sensor.split-source"] },
      },
      "sensor.unknown_details": {
        state: "available",
        attributes: { classification_review_due_entities: [{ entity_id: "sensor.split-review", reason: "Review from detail sensor" }, { entity_id: "sensor.review", classification: "expected", reason: "<script>alert(1)</script>" }] },
      },
      "sensor.integration_details": {
        state: "available",
        attributes: { integration_inventory: { attention_domain_count: 1, attention_domains: ["split_domain"] } },
      },
      "sensor.investigation_details": {
        state: "available",
        attributes: { unavailable_investigations: [{ title: "Split investigation", status: "waiting" }] },
      },
      "sensor.diagnostic_details": {
        state: "available",
        attributes: { platform_updates: { core: { state: "off" } } },
      },
      "sensor.unavailable_entity_history_events": {
        state: "2",
        attributes: {
          events: [{
            action: "entity_unavailable",
            occurred_at: "2026-11-23T09:00:00Z",
            entity_ids: ["sensor.one"],
          }],
        },
      },
    },
  };
  return card;
}

test("registers the custom card", () => {
  assert.equal(typeof CardClass, "function");
});

test("defaults to the Health Overview and history entities", () => {
  const card = createCard();
  assert.equal(card._config.entity, "sensor.health_overview");
  assert.equal(card._config.history_entity, "sensor.unavailable_entity_history_events");
  assert.match(card.shadowRoot.innerHTML, /ATTENTION/);
});

test("renders all six views from the integration attributes", () => {
  const card = createCard();
  const views = [
    ["overview", "Active issues", "96%"],
    ["unavailable", "Related persistent groups", "sensor.gone"],
    ["unknown", "Saved classification counts", "setup in progress"],
    ["integrations", "Integration attention", "mqtt"],
    ["investigations", "Saved investigations", "investigating"],
    ["history", "Recent availability history", "entity unavailable"],
  ];
  for (const [tab, heading, expected] of views) {
    card._tab = tab;
    card._render();
    assert.ok(card.shadowRoot.innerHTML.includes(heading), tab);
    assert.ok(card.shadowRoot.innerHTML.toLowerCase().includes(expected.toLowerCase()), tab);
    assert.ok(!card.shadowRoot.innerHTML.includes("NaN"), tab);
  }
});

test("escapes untrusted entity classification reasons", () => {
  const card = createCard();
  card._tab = "unknown";
  card._render();
  assert.ok(card.shadowRoot.innerHTML.includes("&lt;script&gt;"));
  assert.ok(!card.shadowRoot.innerHTML.includes("<script>alert(1)</script>"));
});

test("shows missing metric values as a dash rather than zero", () => {
  const card = createCard();
  assert.equal(card._number(undefined), "—");
  assert.equal(card._number(null), "—");
  assert.equal(card._number(""), "—");
  assert.equal(card._number("96%"), "96%");
});


test("merges focused detail sensors into the six card views", () => {
  const card = createCard();
  const attrs = card._attributes();
  assert.deepEqual(attrs.persistent_unavailable_entity_ids, ["sensor.split-source"]);
  assert.equal(attrs.classification_review_due_entities[0].entity_id, "sensor.split-review");
  assert.equal(attrs.integration_inventory.attention_domains[0], "split_domain");
  assert.equal(attrs.unavailable_investigations[0].title, "Split investigation");
  assert.equal(attrs.platform_updates.core.state, "off");
});


test("shows a visible warning and report reference for Recorder-overflow details", () => {
  const card = createCard();
  card.hass.states["sensor.diagnostic_details"].attributes = {
    recorder_attribute_overflow: true,
    overflowed_entity_key: "diagnostic_details",
    original_attribute_bytes: 24000,
    details_preserved_in_report: true,
    full_details_report: "/config/www/health_report.zip",
  };
  card._render();
  assert.ok(card.shadowRoot.innerHTML.includes("exceeded Home Assistant Recorder"));
  assert.ok(card.shadowRoot.innerHTML.includes("/config/www/health_report.zip"));
  assert.ok(card.shadowRoot.innerHTML.includes("diagnostic_details"));
});
