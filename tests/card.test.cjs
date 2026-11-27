const test = require("node:test");
const assert = require("node:assert/strict");

let CardClass;
class FakeElement {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.listeners = {};
    this.checked = false;
    this.disabled = false;
    this.value = "";
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  async fire(name, event = {}) {
    if (this.disabled) return;
    return this.listeners[name]?.({ target: this, ...event });
  }
}

class FakeShadowRoot {
  constructor() {
    this._html = "";
    this.elements = new Map();
    this.entityInputs = [];
    this.tabButtons = [];
    this.listeners = {};
  }
  addEventListener(name, callback) {
    this.listeners[name] = callback;
  }
  dispatch(name) {
    this.listeners[name]?.({ type: name });
  }
  set innerHTML(value) {
    this._html = value;
    this.elements.clear();
    this.scrollables = [...value.matchAll(/<(nav|div)\b([^>]*)>/g)]
      .filter((match) => {
        const className = match[2].match(/class="([^"]*)"/)?.[1] || "";
        return match[1] === "nav" || /(?:^|\s)(?:classification-list|item-list|entity-list)(?:\s|$)/.test(className);
      })
      .map((match) => {
        const attributes = match[2];
        const className = attributes.match(/class="([^"]*)"/)?.[1] || "";
        const preserveScroll = attributes.match(/data-preserve-scroll="([^"]*)"/)?.[1];
        return {
          tagName: match[1].toUpperCase(),
          className,
          dataset: preserveScroll ? { preserveScroll } : {},
          scrollTop: 0,
          scrollLeft: 0,
        };
      });
    this.details = [...value.matchAll(/<details(\s[^>]*)?>/g)]
      .map((match) => ({ open: /\bopen(?:\s|$)/.test(match[1] || "") }));
    this.entityInputs = [...value.matchAll(/<input type="checkbox" data-classification-entity="([^"]+)"([^>]*)>/g)]
      .map(match => {
        const element = new FakeElement({ classificationEntity: match[1] });
        element.checked = / checked/.test(match[2]);
        element.disabled = / disabled/.test(match[2]);
        return element;
      });
    this.tabButtons = [...value.matchAll(/<button data-tab="([^"]+)"/g)]
      .map(match => new FakeElement({ tab: match[1] }));
    for (const [selector, pattern] of [
      ["[data-classification-select-all]", /data-classification-select-all/],
      ["[data-classification-clear]", /data-classification-clear/],
      ["[data-classification-choice]", /<select data-classification-choice/],
      ["[data-classification-reason]", /<textarea data-classification-reason/],
      ["[data-classification-review]", /<button data-classification-review/],
      ["[data-classification-edit]", /<button data-classification-edit/],
      ["[data-classification-save]", /<button data-classification-save/],
    ]) {
      if (pattern.test(value)) {
        const element = new FakeElement();
        if (selector === "[data-classification-review]") {
          element.disabled = /<button data-classification-review[^>]*disabled/.test(value);
        }
        if (selector === "[data-classification-save]") {
          element.disabled = /<button data-classification-save[^>]*disabled/.test(value);
        }
        this.elements.set(selector, element);
      }
    }
  }
  get innerHTML() { return this._html; }
  querySelectorAll(selector) {
    if (selector === "input[data-classification-entity]") return this.entityInputs;
    if (selector === "button[data-tab]") return this.tabButtons;
    if (selector === "details") return this.details || [];
    if (selector.includes("[data-preserve-scroll]")) return this.scrollables || [];
    return [];
  }
  querySelector(selector) { return this.elements.get(selector) || null; }
}

global.HTMLElement = class {
  attachShadow() {
    this.shadowRoot = new FakeShadowRoot();
    return this.shadowRoot;
  }
};
global.customElements = {
  define(_name, value) { CardClass = value; },
};
global.window = {
  listeners: {},
  addEventListener(name, callback) { this.listeners[name] = callback; },
  removeEventListener(name, callback) { if (this.listeners[name] === callback) delete this.listeners[name]; },
  dispatch(name) { this.listeners[name]?.({ type: name }); },
};
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
  card.connectedCallback();
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
  card._hass.states["sensor.diagnostic_details"].attributes = {
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


test("reconstructs full detail collections from multiple size-aware page sensors", () => {
  const card = createCard();
  card._hass.states["sensor.detail_page_persistent_unavailable_entity_ids_1"] = {
    state: "2",
    attributes: {
      collection_key: "persistent_unavailable_entity_ids",
      record_kind: "list",
      page: 1,
      page_count: 2,
      records: ["sensor.page_one", "sensor.page_two"],
    },
  };
  card._hass.states["sensor.detail_page_persistent_unavailable_entity_ids_2"] = {
    state: "1",
    attributes: {
      collection_key: "persistent_unavailable_entity_ids",
      record_kind: "list",
      page: 2,
      page_count: 2,
      records: ["sensor.page_three"],
    },
  };
  card._hass.states["sensor.detail_page_unknown_counts_by_domain_1"] = {
    state: "2",
    attributes: {
      collection_key: "unknown_counts_by_domain",
      record_kind: "mapping",
      page: 1,
      page_count: 1,
      records: [{ key: "sensor", value: 8 }, { key: "switch", value: 4 }],
    },
  };
  const attrs = card._attributes();
  assert.deepEqual(attrs.persistent_unavailable_entity_ids, [
    "sensor.page_one", "sensor.page_two", "sensor.page_three",
  ]);
  assert.deepEqual(attrs.unknown_counts_by_domain, { sensor: 8, switch: 4 });
  assert.equal(attrs.recorder_detail_page_count, 3);
});


test("renders a selectable list of unknown non-button entities for bulk classification", () => {
  const card = createCard();
  card._hass.states["sensor.unknown_one"] = {
    state: "unknown",
    attributes: { friendly_name: "Unknown one" },
  };
  card._hass.states["switch.unknown_two"] = {
    state: "unknown",
    attributes: { friendly_name: "Unknown two" },
  };
  card._hass.states["button.stateless_action"] = {
    state: "unknown",
    attributes: { friendly_name: "Stateless action" },
  };
  card._tab = "unknown";
  card._render();
  assert.match(card.shadowRoot.innerHTML, /Classify unknown entities/);
  assert.match(card.shadowRoot.innerHTML, /data-classification-entity="sensor\.unknown_one"/);
  assert.match(card.shadowRoot.innerHTML, /data-classification-entity="switch\.unknown_two"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /data-classification-entity="button\.stateless_action"/);
  assert.match(card.shadowRoot.innerHTML, /data-classification-review/);
  assert.match(card.shadowRoot.innerHTML, /data-classification-choice/);
  assert.match(card.shadowRoot.innerHTML, /data-classification-reason/);
});


test("protects existing classifications and reasons from the bulk selector", () => {
  const card = createCard();
  card._hass.states["sensor.already_expected"] = {
    state: "unknown",
    attributes: { friendly_name: "Already expected" },
  };
  card._hass.states["sensor.new_unknown"] = {
    state: "unknown",
    attributes: { friendly_name: "New unknown" },
  };
  card._hass.states["sensor.unknown_details"].attributes.entity_classification_records = [{
    entity_id: "sensor.already_expected",
    classification: "expected",
    reason: "Only reports data while the appliance is running.",
  }];
  const attributes = card._attributes();
  assert.deepEqual(card._unclassifiedUnknownIds(attributes), ["sensor.new_unknown"]);
  card._tab = "unknown";
  card._render();
  assert.match(card.shadowRoot.innerHTML, /Already classified: expected/);
  assert.match(card.shadowRoot.innerHTML, /Only reports data while the appliance is running\./);
  assert.match(card.shadowRoot.innerHTML, /data-classification-entity="sensor.already_expected" disabled/);
  assert.match(card.shadowRoot.innerHTML, /data-classification-entity="sensor.new_unknown"/);
});

test("selectable unknown helper excludes saved, non-unknown, and button entities", () => {
  const card = createCard();
  card._hass.states["sensor.saved"] = { state: "unknown", attributes: {} };
  card._hass.states["sensor.available"] = { state: "on", attributes: {} };
  card._hass.states["button.stateless"] = { state: "unknown", attributes: {} };
  card._hass.states["sensor.new"] = { state: "unknown", attributes: {} };
  card._hass.states["sensor.unknown_details"].attributes.entity_classification_records = [{
    entity_id: "sensor.saved",
    classification: "seasonal",
    reason: "Seasonal irrigation.",
  }];
  assert.deepEqual(card._unclassifiedUnknownIds(), ["sensor.new"]);
});


test("bulk classification supports select, reason, review, and one service call", async () => {
  const card = createCard();
  card._hass.states["sensor.bulk_one"] = { state: "unknown", attributes: {} };
  card._hass.states["sensor.bulk_two"] = { state: "unknown", attributes: {} };
  card._hass.states["button.ignored"] = { state: "unknown", attributes: {} };
  card._tab = "unknown";
  const calls = [];
  card._hass.callService = async (...args) => { calls.push(args); };
  card._render();

  await card.shadowRoot.querySelector("[data-classification-select-all]").fire("click");
  assert.deepEqual([...card._selectedUnknown].sort(), ["sensor.bulk_one", "sensor.bulk_two"]);

  const choice = card.shadowRoot.querySelector("[data-classification-choice]");
  choice.value = "seasonal";
  await choice.fire("change");

  const reason = card.shadowRoot.querySelector("[data-classification-reason]");
  reason.value = "Seasonal shutdown.";
  await reason.fire("input");
  await card.shadowRoot.querySelector("[data-classification-review]").fire("click");
  assert.equal(card._classificationReview, true);
  assert.match(card.shadowRoot.innerHTML, /sensor\.bulk_one/);
  assert.match(card.shadowRoot.innerHTML, /Seasonal shutdown\./);

  await card.shadowRoot.querySelector("[data-classification-save]").fire("click");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "home_assistant_health_manager");
  assert.equal(calls[0][1], "set_entity_classification");
  assert.deepEqual(calls[0][2], {
    entity_ids: ["sensor.bulk_one", "sensor.bulk_two"],
    classification: "seasonal",
    reason: "Seasonal shutdown.",
  });
  assert.equal(card._selectedUnknown.size, 0);
  assert.match(card.shadowRoot.innerHTML, /Successfully saved classification for 2 entities/);
});

test("bulk save excludes entities classified after selection", async () => {
  const card = createCard();
  card._hass.states["sensor.raced"] = { state: "unknown", attributes: {} };
  card._selectedUnknown.add("sensor.raced");
  card._classificationReason = "New reason";
  card._classificationReview = true;
  card._tab = "unknown";
  card._hass.states["sensor.unknown_details"].attributes.entity_classification_records = [{
    entity_id: "sensor.raced", classification: "expected", reason: "Existing reason",
  }];
  const calls = [];
  card._hass.callService = async (...args) => calls.push(args);
  card._render();
  await card.shadowRoot.querySelector("[data-classification-save]").fire("click");
  assert.equal(calls.length, 0);
  assert.equal(card._selectedUnknown.has("sensor.raced"), false);
});

test("bulk save reports service failures without claiming success", async () => {
  const card = createCard();
  card._hass.states["sensor.failure"] = { state: "unknown", attributes: {} };
  card._selectedUnknown.add("sensor.failure");
  card._classificationReason = "Test failure path";
  card._classificationReview = true;
  card._tab = "unknown";
  card._hass.callService = async () => { throw new Error("service unavailable"); };
  card._render();
  await card.shadowRoot.querySelector("[data-classification-save]").fire("click");
  assert.match(card.shadowRoot.innerHTML, /Save failed; no success was reported/);
  assert.match(card.shadowRoot.innerHTML, /service unavailable/);
  assert.equal(card._classificationReview, true);
});


test("bulk selection supports deselecting entities and never saves an empty selection", async () => {
  const card = createCard();
  card._hass.states["sensor.saved"] = { state: "unknown", attributes: {} };
  card._hass.states["sensor.first"] = { state: "unknown", attributes: {} };
  card._hass.states["sensor.second"] = { state: "unknown", attributes: {} };
  card._hass.states["sensor.unknown_details"].attributes.entity_classification_records = [{
    entity_id: "sensor.saved", classification: "seasonal", reason: "Already documented.",
  }];
  card._tab = "unknown";
  const calls = [];
  card._hass.callService = async (...args) => calls.push(args);
  card._render();

  await card.shadowRoot.querySelector("[data-classification-select-all]").fire("click");
  assert.deepEqual([...card._selectedUnknown].sort(), ["sensor.first", "sensor.second"]);

  const first = card.shadowRoot.entityInputs.find(
    input => input.dataset.classificationEntity === "sensor.first"
  );
  first.checked = false;
  await first.fire("change");
  assert.deepEqual([...card._selectedUnknown], ["sensor.second"]);

  const second = card.shadowRoot.entityInputs.find(
    input => input.dataset.classificationEntity === "sensor.second"
  );
  second.checked = false;
  await second.fire("change");
  assert.equal(card._selectedUnknown.size, 0);
  assert.equal(card.shadowRoot.querySelector("[data-classification-review]").disabled, true);

  card._classificationReason = "Reason supplied";
  card._render();
  await card.shadowRoot.querySelector("[data-classification-clear]").fire("click");
  assert.equal(card._selectedUnknown.size, 0);
  assert.equal(calls.length, 0);
});


test("bulk save rechecks entity state and submits only entities still unknown", async () => {
  const card = createCard();
  card._hass.states["sensor.still_unknown"] = { state: "unknown", attributes: {} };
  card._hass.states["sensor.became_available"] = { state: "unknown", attributes: {} };
  card._selectedUnknown.add("sensor.still_unknown");
  card._selectedUnknown.add("sensor.became_available");
  card._classificationReason = "Reviewed unknown entities.";
  card._classificationReview = true;
  card._tab = "unknown";

  // Simulate Home Assistant updating one entity after selection/review.
  card._hass.states["sensor.became_available"].state = "on";
  const calls = [];
  card._hass.callService = async (...args) => calls.push(args);
  card._render();

  await card.shadowRoot.querySelector("[data-classification-save]").fire("click");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2].entity_ids, ["sensor.still_unknown"]);
  assert.equal(card._selectedUnknown.size, 0);
  assert.match(card.shadowRoot.innerHTML, /Successfully saved classification for 1 entities/);
});


test("preserves navigation and list scroll through an actual classification redraw", async () => {
  const card = createCard();
  card._hass.states["sensor.scroll_test"] = { state: "unknown", attributes: {} };
  card._tab = "unknown";
  card._render();

  const originalScrollTo = global.window.scrollTo;
  const originalScrollX = global.window.scrollX;
  const originalScrollY = global.window.scrollY;
  const oldNav = card.shadowRoot.scrollables.find((element) => element.tagName === "NAV");
  const oldClassificationList = card.shadowRoot.scrollables.find((element) => element.className === "classification-list");
  const oldItemList = card.shadowRoot.scrollables.find((element) => element.className === "item-list");
  assert.ok(oldNav);
  assert.ok(oldClassificationList);
  assert.ok(oldItemList);

  oldNav.scrollLeft = 84;
  oldClassificationList.scrollTop = 218;
  oldItemList.scrollTop = 42;
  global.window.scrollX = 12;
  global.window.scrollY = 640;
  let restoredWindowPosition = null;
  global.window.scrollTo = (x, y) => { restoredWindowPosition = [x, y]; };

  const checkbox = card.shadowRoot.entityInputs.find(
    (input) => input.dataset.classificationEntity === "sensor.scroll_test"
  );
  checkbox.checked = true;
  await checkbox.fire("change");

  const newNav = card.shadowRoot.scrollables.find((element) => element.tagName === "NAV");
  const newClassificationList = card.shadowRoot.scrollables.find((element) => element.className === "classification-list");
  const newItemList = card.shadowRoot.scrollables.find((element) => element.className === "item-list");
  assert.notEqual(newNav, oldNav, "the redraw must replace the navigation node");
  assert.notEqual(newClassificationList, oldClassificationList, "the redraw must replace the classification list node");
  assert.notEqual(newItemList, oldItemList, "the redraw must replace the summary list node");
  assert.equal(newNav.scrollLeft, 84);
  assert.equal(newClassificationList.scrollTop, 218);
  assert.equal(newItemList.scrollTop, 42);
  assert.equal(restoredWindowPosition, null, "unchanged page coordinates must not trigger scrollTo");
  assert.equal(card._selectedUnknown.has("sensor.scroll_test"), true);
  global.window.scrollTo = originalScrollTo;
  global.window.scrollX = originalScrollX;
  global.window.scrollY = originalScrollY;
});

test("preserves entity-list scroll and expanded details through an actual tab redraw", async () => {
  const card = createCard();
  card._tab = "unavailable";
  card._render();

  const oldNav = card.shadowRoot.scrollables.find((element) => element.tagName === "NAV");
  const oldItemList = card.shadowRoot.scrollables.find((element) => element.className === "item-list");
  const oldEntityList = card.shadowRoot.scrollables.find((element) => element.className === "entity-list");
  const oldDetails = card.shadowRoot.details[0];
  assert.ok(oldNav);
  assert.ok(oldItemList);
  assert.ok(oldEntityList);
  assert.ok(oldDetails);

  oldNav.scrollLeft = 51;
  oldItemList.scrollTop = 63;
  oldEntityList.scrollTop = 27;
  oldDetails.open = true;

  await card.shadowRoot.tabButtons.find((button) => button.dataset.tab === "unavailable").fire("click");

  const newNav = card.shadowRoot.scrollables.find((element) => element.tagName === "NAV");
  const newItemList = card.shadowRoot.scrollables.find((element) => element.className === "item-list");
  const newEntityList = card.shadowRoot.scrollables.find((element) => element.className === "entity-list");
  const newDetails = card.shadowRoot.details[0];
  assert.notEqual(newNav, oldNav, "the redraw must replace the navigation node");
  assert.notEqual(newItemList, oldItemList, "the redraw must replace the summary list node");
  assert.notEqual(newEntityList, oldEntityList, "the redraw must replace the entity list node");
  assert.notEqual(newDetails, oldDetails, "the redraw must replace the details node");
  assert.equal(newNav.scrollLeft, 51);
  assert.equal(newItemList.scrollTop, 63);
  assert.equal(newEntityList.scrollTop, 27);
  assert.equal(newDetails.open, true);
});


test("coalesces repeated Home Assistant updates until nested scrolling settles", async () => {
  const card = createCard();
  const originalNav = card.shadowRoot.scrollables.find(element => element.tagName === "NAV");
  const originalHtml = card.shadowRoot.innerHTML;

  card.shadowRoot.dispatch("scroll");
  card.hass = {
    ...card._hass,
    states: {
      ...card._hass.states,
      "sensor.health_overview": {
        state: "healthy",
        attributes: { ...attributes, active_issues: 3 },
      },
    },
  };
  card.hass = {
    ...card._hass,
    states: {
      ...card._hass.states,
      "sensor.health_overview": {
        state: "healthy",
        attributes: { ...attributes, active_issues: 2 },
      },
    },
  };

  assert.equal(card.shadowRoot.innerHTML, originalHtml, "the visible DOM must remain unchanged during scrolling");
  assert.equal(card.shadowRoot.scrollables.find(element => element.tagName === "NAV"), originalNav);

  await new Promise(resolve => setTimeout(resolve, 230));

  assert.notEqual(card.shadowRoot.scrollables.find(element => element.tagName === "NAV"), originalNav);
  assert.match(card.shadowRoot.innerHTML, /HEALTHY/);
  assert.match(card.shadowRoot.innerHTML, />2</);
});

test("coalesces Home Assistant updates during page scrolling too", async () => {
  const card = createCard();
  const originalHtml = card.shadowRoot.innerHTML;
  global.window.dispatch("scroll");

  card.hass = {
    ...card._hass,
    states: {
      ...card._hass.states,
      "sensor.health_overview": {
        state: "healthy",
        attributes: { ...attributes, active_issues: 1 },
      },
    },
  };

  assert.equal(card.shadowRoot.innerHTML, originalHtml);
  await new Promise(resolve => setTimeout(resolve, 230));
  assert.notEqual(card.shadowRoot.innerHTML, originalHtml);
  assert.match(card.shadowRoot.innerHTML, />1</);
});


test("removes the page scroll listener and pending timer when disconnected", () => {
  const card = createCard();
  assert.equal(typeof global.window.listeners.scroll, "function");
  card._handleScroll();
  assert.notEqual(card._scrollEndTimer, null);

  card.disconnectedCallback();

  assert.equal(global.window.listeners.scroll, undefined);
  assert.equal(card._scrollEndTimer, null);
  assert.equal(card._isScrolling, false);
  assert.equal(card._pendingHassRender, false);

  card.connectedCallback();
  assert.equal(typeof global.window.listeners.scroll, "function");
  card.disconnectedCallback();
});


test("avoids redundant page scroll restoration while a nested list is scrolling", () => {
  const card = createCard();
  const originalScrollTo = global.window.scrollTo;
  const originalScrollX = global.window.scrollX;
  const originalScrollY = global.window.scrollY;
  let calls = 0;
  global.window.scrollX = 12;
  global.window.scrollY = 640;
  global.window.scrollTo = () => { calls += 1; };

  card._restoreInteractionState({
    scrollPositions: {},
    detailsOpen: [],
    windowX: 12,
    windowY: 640,
  });

  assert.equal(calls, 0, "unchanged page coordinates must not trigger scrollTo");
  global.window.scrollTo = originalScrollTo;
  global.window.scrollX = originalScrollX;
  global.window.scrollY = originalScrollY;
});

test("uses isolated momentum scrolling and skips offscreen classification row rendering", () => {
  const card = createCard();
  card._tab = "unknown";
  card._render();
  assert.match(card.shadowRoot.innerHTML, /-webkit-overflow-scrolling:touch/);
  assert.match(card.shadowRoot.innerHTML, /overscroll-behavior:contain/);
  assert.match(card.shadowRoot.innerHTML, /content-visibility:auto/);
});
