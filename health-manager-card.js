/* Home Assistant Health Manager Lovelace card */
const CARD_VERSION = "0.1.0-beta.4";
const DEFAULT_ENTITY = "sensor.health_overview";

class HomeAssistantHealthManagerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._tab = "overview";
    this._config = null;
    this._selectedUnknown = new Set();
    this._classificationChoice = "actionable";
    this._classificationReason = "";
    this._classificationReview = false;
    this._classificationStatus = "";
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Card configuration is required.");
    }
    this._config = {
      title: "Home Assistant Health",
      entity: DEFAULT_ENTITY,
      history_entity: "sensor.unavailable_entity_history_events",
      report_verification_entity: "sensor.diagnostic_report_verification",
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 7;
  }

  _captureInteractionState() {
    const scrollPositions = {};
    const scrollables = this.shadowRoot.querySelectorAll(
      "[data-preserve-scroll], nav, .classification-list, .item-list, .entity-list"
    );
    scrollables.forEach((element, index) => {
      const key = element.dataset?.preserveScroll || `${element.className || element.tagName || "list"}:${index}`;
      scrollPositions[key] = {
        top: element.scrollTop || 0,
        left: element.scrollLeft || 0,
      };
    });
    const detailsOpen = [...this.shadowRoot.querySelectorAll("details")].map(
      (element) => Boolean(element.open)
    );
    return {
      scrollPositions,
      detailsOpen,
      windowX: window.scrollX || 0,
      windowY: window.scrollY || 0,
    };
  }

  _restoreInteractionState(snapshot) {
    if (!snapshot) return;
    const scrollables = this.shadowRoot.querySelectorAll(
      "[data-preserve-scroll], nav, .classification-list, .item-list, .entity-list"
    );
    scrollables.forEach((element, index) => {
      const key = element.dataset?.preserveScroll || `${element.className || element.tagName || "list"}:${index}`;
      const position = snapshot.scrollPositions[key];
      if (position) {
        element.scrollTop = position.top;
        element.scrollLeft = position.left;
      }
    });
    this.shadowRoot.querySelectorAll("details").forEach((element, index) => {
      if (index < snapshot.detailsOpen.length) {
        element.open = snapshot.detailsOpen[index];
      }
    });
    if (typeof window.scrollTo === "function") {
      window.scrollTo(snapshot.windowX, snapshot.windowY);
    }
  }

  _state() {
    return this._hass?.states?.[this._config?.entity] || null;
  }

  _attributes() {
    const attributes = { ...(this._state()?.attributes || {}) };
    const detailEntities = this._config?.detail_entities || [
      "sensor.unavailable_details",
      "sensor.unknown_details",
      "sensor.integration_details",
      "sensor.investigation_details",
      "sensor.diagnostic_details",
    ];
    const overflowEntities = [];
    for (const entityId of detailEntities) {
      const detail = this._hass?.states?.[entityId]?.attributes;
      if (detail && typeof detail === "object") {
        if (detail.recorder_attribute_overflow) {
          overflowEntities.push({
            entityId,
            entityKey: detail.overflowed_entity_key || entityId,
            report: detail.full_details_report || null,
            preserved: detail.details_preserved_in_report === true,
            bytes: detail.original_attribute_bytes,
          });
        }
        Object.assign(attributes, detail);
      }
    }
    const reportEntity = this._config?.report_verification_entity || "sensor.diagnostic_report_verification";
    const reportState = this._hass?.states?.[reportEntity];
    if (reportState) {
      attributes.report_verification = {
        ...(reportState.attributes || {}),
        status: reportState.state || reportState.attributes?.status || "unknown",
      };
    }

    const pageEntities = Object.entries(this._hass?.states || {})
      .filter(([entityId, state]) =>
        entityId.includes("detail_page_") &&
        state?.attributes?.collection_key &&
        Array.isArray(state.attributes.records)
      )
      .sort((left, right) =>
        String(left[1].attributes.collection_key).localeCompare(String(right[1].attributes.collection_key)) ||
        Number(left[1].attributes.page || 0) - Number(right[1].attributes.page || 0)
      );

    const pagedCollections = new Set();
    for (const [, state] of pageEntities) {
      const page = state.attributes;
      const key = page.collection_key;
      if (!pagedCollections.has(key)) {
        attributes[key] = page.record_kind === "mapping" ? {} : [];
        pagedCollections.add(key);
      }
      if (page.record_kind === "mapping") {
        const merged = { ...(attributes[key] || {}) };
        for (const record of page.records) {
          if (record && Object.prototype.hasOwnProperty.call(record, "key")) {
            merged[record.key] = record.value;
          }
        }
        attributes[key] = merged;
      } else {
        attributes[key] = [
          ...(Array.isArray(attributes[key]) ? attributes[key] : []),
          ...page.records,
        ];
      }
    }

    attributes.recorder_attribute_overflow_entities = overflowEntities;
    attributes.recorder_detail_page_count = pageEntities.length;
    return attributes;
  }

  _esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  _number(value) {
    if (value === null || value === undefined || value === "") return "—";
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString() : this._esc(value);
  }

  _date(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? this._esc(value) : date.toLocaleString();
  }

  _list(items, renderItem) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<p class="muted">Nothing to report.</p>';
    }
    return '<div class="item-list">' + items.map(renderItem).join("") + "</div>";
  }

  _metric(label, value, detail = "") {
    return `<div class="metric"><div class="metric-value">${this._esc(this._number(value))}</div><div class="metric-label">${this._esc(label)}</div>${detail ? `<div class="metric-detail">${this._esc(detail)}</div>` : ""}</div>`;
  }

  _section(title, content, note = "") {
    return `<section><h3>${this._esc(title)}</h3>${note ? `<p class="muted">${this._esc(note)}</p>` : ""}${content}</section>`;
  }

  _tabs() {
    const tabs = [
      ["overview", "Overview"], ["unavailable", "Unavailable"],
      ["unknown", "Unknown"], ["integrations", "Integrations"],
      ["investigations", "Investigations"], ["history", "History"],
    ];
    return '<nav aria-label="Health views">' + tabs.map(([id, label]) =>
      `<button data-tab="${id}" class="${this._tab === id ? "active" : ""}" aria-pressed="${this._tab === id}">${label}</button>`
    ).join("") + "</nav>";
  }

  _overview(a, state) {
    const updates = a.platform_updates || a.platform_update_states || {};
    const status = String(state.state || "unknown").replaceAll("_", " ");
    const coverage = a.collection_coverage?.coverage_percent;
    const coverageText = coverage == null ? "—" : `${coverage}%`;
    const report = a.report_verification || {};
    const reportStatus = report.status || "not_available";
    const reportExists = report.exists === true ? "Yes" : report.exists === false ? "No" : "Unknown";
    const reportReadable = report.readable === true ? "Yes" : report.readable === false ? "No" : "Unknown";
    return `
      <div class="status-row"><span class="status-dot ${status === "healthy" ? "good" : "attention"}"></span><div><strong>${this._esc(status.toUpperCase())}</strong><div class="muted">Last assessment: ${this._date(a.last_assessment)}</div></div></div>
      <div class="metrics">
        ${this._metric("Active issues", a.active_issues)}
        ${this._metric("Unavailable", a.unavailable_entity_count, `${this._number(a.persistent_unavailable_entity_count)} persistent`)}
        ${this._metric("Unknown", a.unknown_entity_count, `${this._number(a.actionable_unknown_entity_count)} actionable`)}
        ${this._metric("Failed integrations", a.failed_config_entry_count)}
        ${this._metric("Reviews due", a.classification_review_due_count)}
        ${this._metric("Diagnostic coverage", coverageText)}
      </div>
      ${this._section("Platform updates", `<div class="item-list">${Object.entries(updates).map(([key, item]) => `<div class="item"><strong>${this._esc(key.replaceAll("_", " "))}</strong><span>${this._esc(item?.state || (item?.update_available ? "update available" : "not detected"))}</span></div>`).join("") || '<p class="muted">No update information.</p>'}</div>`)}
      ${this._section("Diagnostic summary", `<div class="item-list"><div class="item"><strong>Compatibility</strong><span>${this._esc(a.compatibility_assessment?.overall_status || "not assessed")}</span></div><div class="item"><strong>Diagnostic trend</strong><span>${this._esc(a.diagnostic_trend?.overall_direction || "insufficient data")}</span></div><div class="item"><strong>Generated reports</strong><span>${this._number(a.report_count)}</span></div></div>`)}
      ${this._section("Diagnostic report verification", `<div class="item-list"><div class="item"><strong>Verification</strong><span>${this._esc(reportStatus.replaceAll("_", " "))}</span></div><div class="item"><strong>File exists</strong><span>${reportExists}</span></div><div class="item"><strong>Readable and complete</strong><span>${reportReadable}</span></div><div class="item"><strong>File size</strong><span>${report.size_bytes == null ? "—" : this._number(report.size_bytes) + " bytes"}</span></div><div class="item"><strong>Last modified</strong><span>${this._date(report.modified_at)}</span></div><div class="item"><strong>Report path</strong><span>${this._esc(report.path || "Not recorded")}</span></div></div>`, reportStatus === "verified" ? "The ZIP archive, required files, and diagnostic JSON were verified." : (report.error || "Report preservation is unconfirmed until verification succeeds."))}
    `;
  }

  _unavailable(a) {
    const groups = a.unavailable_investigation_groups || [];
    const missing = a.missing_tracked_entity_ids || [];
    const persistent = a.persistent_unavailable_entity_ids || [];
    const groupHtml = this._list(groups, (group) => `
      <article class="record">
        <div class="record-heading"><strong>${this._esc(group.title || group.group_id || "Unavailable group")}</strong><span class="pill">${this._esc(group.confidence || "unassessed")}</span></div>
        <div class="muted">${this._esc(group.group_type || "group")} · ${this._number(group.entity_ids?.length)} entities · ${this._number(group.duration_minutes)} min</div>
        <div class="entity-list">${(group.entity_ids || []).map(id => `<code>${this._esc(id)}</code>`).join("")}</div>
        ${group.evidence?.length ? `<details><summary>Association evidence</summary><ul>${group.evidence.map(e => `<li>${this._esc(typeof e === "string" ? e : JSON.stringify(e))}</li>`).join("")}</ul></details>` : ""}
        <p class="muted">Association evidence only; root cause is not confirmed.</p>
      </article>`);
    return `
      <div class="metrics">
        ${this._metric("Currently unavailable", a.unavailable_entity_count)}
        ${this._metric("Newly unavailable", a.newly_unavailable_entity_count)}
        ${this._metric("Persistent", a.persistent_unavailable_entity_count)}
        ${this._metric("Missing from registry", a.missing_tracked_entity_count)}
        ${this._metric("Investigation groups", a.unavailable_investigation_group_count)}
      </div>
      ${this._section("Related persistent groups", groupHtml, "Groups are evidence-based leads for review, not confirmed causes.")}
      ${this._section("Persistent entity IDs", this._list(persistent, id => `<div class="item"><code>${this._esc(id)}</code></div>`))}
      ${this._section("Missing tracked entities", this._list(missing, id => `<div class="item"><code>${this._esc(id)}</code></div>`), "Missing means no longer present in the entity registry; it is not automatically treated as recovery.")}
    `;
  }

  _savedClassificationMap(attributes = this._attributes()) {
    return new Map(
      (Array.isArray(attributes.entity_classification_records) ? attributes.entity_classification_records : [])
        .filter(record => record && typeof record.entity_id === "string")
        .map(record => [record.entity_id, record])
    );
  }

  _unclassifiedUnknownIds(attributes = this._attributes()) {
    const saved = this._savedClassificationMap(attributes);
    return Object.entries(this._hass?.states || {})
      .filter(([entityId, state]) =>
        entityId.split(".", 1)[0] !== "button" &&
        state?.state === "unknown" &&
        !saved.has(entityId)
      )
      .map(([entityId]) => entityId)
      .sort();
  }

  _classificationPanel(attributes = {}) {
    const unknown = Object.entries(this._hass?.states || {})
      .filter(([entityId, state]) => entityId.split(".", 1)[0] !== "button" && state?.state === "unknown")
      .sort((left, right) => left[0].localeCompare(right[0]));
    const savedClassifications = this._savedClassificationMap(attributes);
    const unclassifiedIds = new Set(this._unclassifiedUnknownIds(attributes));
    const unclassified = unknown.filter(([entityId]) => unclassifiedIds.has(entityId));
    const available = new Set(unclassified.map(([entityId]) => entityId));
    this._selectedUnknown = new Set([...this._selectedUnknown].filter(id => available.has(id)));
    const selected = [...this._selectedUnknown];
    const choices = [
      ["actionable", "Actionable — investigate"],
      ["expected", "Expected — documented limitation"],
      ["setup_in_progress", "Setup in progress"],
      ["seasonal", "Seasonal — review when active"],
    ];
    const entityRows = unknown.length ? unknown.map(([entityId, state]) => {
      const name = state.attributes?.friendly_name || entityId;
      const saved = savedClassifications.get(entityId);
      const classificationText = saved
        ? `Already classified: ${String(saved.classification || "saved").replaceAll("_", " ")} — ${saved.reason || "No reason recorded"}`
        : "Not yet classified";
      return `<label class="classification-entity"><input type="checkbox" data-classification-entity="${this._esc(entityId)}" ${saved ? "disabled" : ""} ${this._selectedUnknown.has(entityId) ? "checked" : ""}><span><strong>${this._esc(name)}</strong><small>${this._esc(entityId)}</small><small class="classification-existing ${saved ? "saved" : ""}">${this._esc(classificationText)}</small></span></label>`;
    }).join("") : '<p class="muted">No non-button entities are currently in the unknown state.</p>';
    const review = this._classificationReview ? `
      <div class="classification-review">
        <strong>Review before saving</strong>
        <p>${selected.length} entity/entities will be classified as <strong>${this._esc(this._classificationChoice.replaceAll("_", " "))}</strong>.</p>
        <div class="entity-list">${selected.map(id => `<code>${this._esc(id)}</code>`).join("")}</div>
        <p>${this._esc(this._classificationReason)}</p>
        <button data-classification-save ${selected.length && this._classificationReason.trim() ? "" : "disabled"}>Confirm and save</button>
        <button data-classification-edit>Edit selection</button>
      </div>` : `
      <div class="classification-controls">
        <label>Classification<select data-classification-choice>${choices.map(([value,label]) => `<option value="${value}" ${this._classificationChoice === value ? "selected" : ""}>${this._esc(label)}</option>`).join("")}</select></label>
        <label>Reason<textarea data-classification-reason rows="3" placeholder="Explain why these entities have this classification">${this._esc(this._classificationReason)}</textarea></label>
        <button data-classification-review ${selected.length && this._classificationReason.trim() ? "" : "disabled"}>Review ${selected.length} selected</button>
      </div>`;
    return `
      <section class="classification-panel">
        <h3>Classify unknown entities</h3>
        <p class="muted">Select unclassified entities, choose a classification, and provide a reason. Existing classifications and reasons are shown below and are protected from bulk overwrite here. Nothing is saved until you confirm.</p>
        <div class="classification-list">
          <div class="classification-list-heading"><strong>Unknown (${unknown.length}) · Unclassified (${unclassified.length})</strong><button data-classification-select-all>Select all unclassified</button><button data-classification-clear>Clear</button></div>
          ${entityRows}
        </div>
        ${review}
        ${this._classificationStatus ? `<p class="classification-status" role="status">${this._esc(this._classificationStatus)}</p>` : ""}
      </section>`;
  }

  _unknown(a) {
    const counts = a.entity_classification_counts || {};
    const domains = a.unknown_counts_by_domain || {};
    const due = a.classification_review_due_entities || [];
    return `
      <div class="metrics">
        ${this._metric("Raw unknown", a.unknown_entity_count)}
        ${this._metric("Actionable unknown", a.actionable_unknown_entity_count)}
        ${this._metric("Raw actionable unknown", a.raw_actionable_unknown_entity_count)}
        ${this._metric("Classified unknown", a.classified_unknown_entity_count)}
        ${this._metric("Reviews due", a.classification_review_due_count)}
      </div>
      ${this._section("Saved classification counts", `<div class="item-list">${Object.entries(counts).map(([key, value]) => `<div class="item"><strong>${this._esc(key.replaceAll("_", " "))}</strong><span>${this._number(value)}</span></div>`).join("") || '<p class="muted">No saved classification counts.</p>'}</div>`, "Raw unknown totals remain visible regardless of saved classifications.")}
      ${this._section("Unknown entities by domain", `<div class="item-list">${Object.entries(domains).sort((x,y) => Number(y[1])-Number(x[1])).map(([key, value]) => `<div class="item"><strong>${this._esc(key)}</strong><span>${this._number(value)}</span></div>`).join("") || '<p class="muted">No domain counts available.</p>'}</div>`)}
      ${this._section("Classification reviews due", this._list(due, item => `<article class="record"><strong>${this._esc(item.entity_id || item)}</strong><div class="muted">${this._esc(item.classification || "classification review")} · ${this._esc(item.reason || item.review_reason || "Review requested")}</div></article>`))}
      ${this._classificationPanel(a)}
    `;
  }

  _integrations(a) {
    const inventory = a.integration_inventory || {};
    const attention = inventory.attention_domains || a.integration_attention_domains || [];
    const failed = a.failed_config_entry_domains || {};
    const states = a.config_entry_states || {};
    return `
      <div class="metrics">
        ${this._metric("Configured integrations", a.config_entry_count)}
        ${this._metric("Failed integrations", a.failed_config_entry_count)}
        ${this._metric("Attention domains", inventory.attention_domain_count ?? attention.length)}
        ${this._metric("Trend domains", a.integration_trend_summary?.active_attention_domain_count)}
      </div>
      ${this._section("Integration attention", this._list(attention, item => {
        const domain = typeof item === "string" ? item : (item.domain || item.name || JSON.stringify(item));
        return `<article class="record"><strong>${this._esc(domain)}</strong><div class="muted">${this._esc(typeof item === "string" ? "Needs review" : (item.reason || item.status || "Needs review"))}</div></article>`;
      }), "Attention is a triage correlation, not proof of a shared root cause.")}
      ${this._section("Failed integration domains", `<div class="item-list">${Object.entries(failed).map(([key, value]) => `<div class="item"><strong>${this._esc(key)}</strong><span>${this._esc(typeof value === "object" ? JSON.stringify(value) : value)}</span></div>`).join("") || '<p class="muted">No failed integration domains reported.</p>'}</div>`)}
      ${this._section("Integration states", `<div class="item-list">${Object.entries(states).map(([key, value]) => `<div class="item"><strong>${this._esc(key)}</strong><span>${this._esc(typeof value === "object" ? (value.state || JSON.stringify(value)) : value)}</span></div>`).join("") || '<p class="muted">No integration state details available.</p>'}</div>`)}
    `;
  }

  _investigations(a) {
    const records = a.unavailable_investigations || [];
    const counts = a.unavailable_investigation_status_counts || {};
    return `
      <div class="metrics">
        ${this._metric("Total", a.unavailable_investigation_count)}
        ${this._metric("Needs review", a.unavailable_investigations_needing_review)}
        ${this._metric("Investigating", a.unavailable_investigations_in_progress)}
        ${this._metric("Waiting", a.unavailable_investigations_waiting)}
        ${this._metric("Expected", a.unavailable_investigations_expected)}
        ${this._metric("Resolved", a.unavailable_investigations_resolved)}
      </div>
      ${this._section("Saved investigations", this._list(records, item => `
        <article class="record">
          <div class="record-heading"><strong>${this._esc(item.title || item.investigation_id)}</strong><span class="pill">${this._esc(item.status || "needs_review")}</span></div>
          <div class="muted">${this._esc(item.group_type || "manual")} · started ${this._date(item.outage_started_at || item.created_at)}</div>
          ${item.reason ? `<p>${this._esc(item.reason)}</p>` : ""}
          ${item.user_note ? `<p><strong>Note:</strong> ${this._esc(item.user_note)}</p>` : ""}
          ${item.entity_ids?.length ? `<details><summary>${item.entity_ids.length} associated entities</summary><div class="entity-list">${item.entity_ids.map(id => `<code>${this._esc(id)}</code>`).join("")}</div></details>` : ""}
          ${item.evidence?.length ? `<details><summary>Evidence</summary><ul>${item.evidence.map(e => `<li>${this._esc(typeof e === "string" ? e : JSON.stringify(e))}</li>`).join("")}</ul></details>` : ""}
          <p class="muted">Status is a user-managed tracking label, not technical verification or entity suppression.</p>
        </article>`))}
      ${this._section("Status counts", `<div class="item-list">${Object.entries(counts).map(([key, value]) => `<div class="item"><strong>${this._esc(key.replaceAll("_", " "))}</strong><span>${this._number(value)}</span></div>`).join("") || '<p class="muted">No status counts.</p>'}</div>`)}
    `;
  }

  _history(a) {
    const historyState = this._config.history_entity ? this._hass?.states?.[this._config.history_entity] : null;
    const events = historyState?.attributes?.events || a.availability_observation_events || [];
    const eventCount = historyState?.state ?? a.availability_observation_event_count;
    const content = this._list(events.slice().reverse(), event => {
      const ids = event.entity_ids || (event.entity_id ? [event.entity_id] : []);
      return `<article class="record"><div class="record-heading"><strong>${this._esc(String(event.action || event.event_type || "Event").replaceAll("_", " "))}</strong><span class="muted">${this._date(event.occurred_at || event.timestamp)}</span></div><div class="entity-list">${ids.map(id => `<code>${this._esc(id)}</code>`).join("")}</div>${event.note ? `<p>${this._esc(event.note)}</p>` : ""}</article>`;
    });
    return `<div class="muted">Retained events: ${this._number(eventCount)}</div>` +
      this._section("Recent availability history", content, historyState ? "A missing entity is not automatically treated as recovered." : "To show event details, set history_entity to the Unavailable Entity History Events sensor. A missing entity is not automatically treated as recovered.");
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const state = this._state();
    const attrs = this._attributes();
    const overflow = attrs.recorder_attribute_overflow_entities || [];
    const verification = attrs.report_verification || {};
    const overflowGroups = new Map();
    for (const item of overflow) {
      let message;
      let reportPath = "";
      if (item.preserved) {
        message = "full details are preserved in the verified diagnostic report";
        reportPath = item.report || "";
      } else if (verification.exists === true) {
        message = `a report file exists, but verification failed (${verification.status || "unknown"}); preservation is unconfirmed`;
        reportPath = verification.path || item.report || "";
      } else if (verification.status === "invalid_path") {
        message = "the recorded report path is invalid; preservation is unconfirmed";
      } else if (verification.status === "missing" || verification.exists === false) {
        message = "the recorded report file is missing; preservation is unconfirmed";
        reportPath = verification.path || item.report || "";
      } else {
        message = "report verification is unavailable; preservation is unconfirmed";
        reportPath = item.report || "";
      }
      const key = JSON.stringify([message, reportPath]);
      if (!overflowGroups.has(key)) {
        overflowGroups.set(key, { message, reportPath, entities: new Set() });
      }
      overflowGroups.get(key).entities.add(item.entityKey);
    }
    const overflowNotice = overflowGroups.size
      ? '<ha-alert alert-type="warning">' +
        'Some detailed attributes exceeded Home Assistant Recorder’s safe size. ' +
        [...overflowGroups.values()].map((group) =>
          this._esc([...group.entities].join(", ")) + ' — ' +
          this._esc(group.message) +
          (group.reportPath ? ': ' + this._esc(group.reportPath) : "")
        ).join('<br>') +
        '</ha-alert>'
      : '';
    const body = !this._hass
      ? '<p class="muted">Waiting for Home Assistant…</p>'
      : !state
        ? `<ha-alert alert-type="warning">Entity not found: ${this._esc(this._config.entity)}</ha-alert>`
        : ({
          overview: () => this._overview(attrs, state),
          unavailable: () => this._unavailable(attrs),
          unknown: () => this._unknown(attrs),
          integrations: () => this._integrations(attrs),
          investigations: () => this._investigations(attrs),
          history: () => this._history(attrs),
        }[this._tab] || (() => this._overview(attrs, state)))();

    const interactionState = this._captureInteractionState();
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family, sans-serif)}
        ha-card{padding:16px;overflow:hidden}
        header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
        h2{font-size:1.15rem;font-weight:600;margin:0}
        .version{font-size:11px;color:var(--secondary-text-color)}
        nav{display:flex;gap:6px;overflow-x:auto;padding:2px 0 12px;border-bottom:1px solid var(--divider-color)}
        button{border:0;border-radius:18px;padding:8px 12px;background:var(--secondary-background-color);color:var(--primary-text-color);white-space:nowrap;font:inherit;cursor:pointer}
        button.active{background:var(--primary-color);color:var(--text-primary-color,#fff)}
        .content{padding-top:14px}
        .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px;margin:12px 0}
        .metric{background:var(--secondary-background-color);border-radius:10px;padding:12px;min-width:0}
        .metric-value{font-size:1.5rem;font-weight:650;line-height:1.3;overflow-wrap:anywhere}
        .metric-label{font-size:.82rem;color:var(--secondary-text-color)}
        .metric-detail,.muted{font-size:.8rem;color:var(--secondary-text-color)}
        .metric-detail{margin-top:4px}
        section{margin-top:18px}
        h3{font-size:1rem;font-weight:600;margin:0 0 8px}
        .status-row{display:flex;align-items:center;gap:10px;padding:8px 0}
        .status-dot{width:11px;height:11px;border-radius:50%;background:var(--warning-color)}
        .status-dot.good{background:var(--success-color)}
        .item-list{display:grid;gap:6px}
        .item{display:flex;justify-content:space-between;gap:12px;padding:9px 10px;border-radius:8px;background:var(--secondary-background-color);align-items:start}.item span{overflow-wrap:anywhere;text-align:right;min-width:0}
        .record{border:1px solid var(--divider-color);border-radius:10px;padding:12px}
        .record-heading{display:flex;justify-content:space-between;gap:10px;align-items:center}
        .pill{border-radius:20px;background:var(--secondary-background-color);padding:4px 8px;font-size:.75rem;white-space:nowrap}
        .entity-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
        .classification-panel{border:1px solid var(--divider-color);border-radius:12px;padding:12px;margin-top:18px}
        .classification-list{max-height:320px;overflow:auto;border:1px solid var(--divider-color);border-radius:8px;margin:10px 0}
        .classification-list-heading{position:sticky;top:0;background:var(--card-background-color);padding:9px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .classification-entity{display:flex;gap:10px;align-items:flex-start;padding:10px;border-top:1px solid var(--divider-color);cursor:pointer}
        .classification-entity input{width:20px;height:20px;flex:0 0 auto;margin-top:2px}
        .classification-entity span{display:grid;gap:3px;min-width:0;overflow-wrap:anywhere}
        .classification-entity small{color:var(--secondary-text-color);overflow-wrap:anywhere}
        .classification-controls{display:grid;gap:12px}
        .classification-controls label{display:grid;gap:6px;font-size:.9rem}
        .classification-controls select,.classification-controls textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}
        .classification-controls button,.classification-review button,.classification-list-heading button{min-height:40px}
        .classification-review{border:1px solid var(--divider-color);border-radius:8px;padding:10px;margin-top:12px}
        .classification-status{padding:8px;border-radius:8px;background:var(--secondary-background-color);overflow-wrap:anywhere}

        code{font-size:.78rem;overflow-wrap:anywhere;background:var(--secondary-background-color);padding:3px 5px;border-radius:4px}
        details{margin-top:9px} summary{cursor:pointer;color:var(--primary-color)}
        ul{padding-left:20px} li{margin:5px 0}
        @media(max-width:420px){ha-card{padding:12px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{padding:10px}}
      </style>
      <ha-card>
        <header><h2>${this._esc(this._config.title)}</h2><span class="version">${CARD_VERSION}</span></header>
        ${this._tabs()}
        <div class="content">${overflowNotice}${body}</div>
      </ha-card>
    `;
    this._restoreInteractionState(interactionState);
    this.shadowRoot.querySelectorAll("input[data-classification-entity]").forEach(input => {
      input.addEventListener("change", () => {
        if (input.checked) this._selectedUnknown.add(input.dataset.classificationEntity);
        else this._selectedUnknown.delete(input.dataset.classificationEntity);
        this._classificationReview = false;
        this._render();
      });
    });
    this.shadowRoot.querySelector?.("[data-classification-select-all]")?.addEventListener("click", () => {
      for (const entityId of this._unclassifiedUnknownIds()) {
        this._selectedUnknown.add(entityId);
      }
      this._classificationReview = false;
      this._render();
    });
    this.shadowRoot.querySelector?.("[data-classification-clear]")?.addEventListener("click", () => {
      this._selectedUnknown.clear();
      this._classificationReview = false;
      this._render();
    });
    this.shadowRoot.querySelector?.("[data-classification-choice]")?.addEventListener("change", event => {
      this._classificationChoice = event.target.value;
    });
    this.shadowRoot.querySelector?.("[data-classification-reason]")?.addEventListener("input", event => {
      this._classificationReason = event.target.value;
      const reviewButton = this.shadowRoot.querySelector?.("[data-classification-review]");
      if (reviewButton) reviewButton.disabled = !this._selectedUnknown.size || !this._classificationReason.trim();
    });
    this.shadowRoot.querySelector?.("[data-classification-review]")?.addEventListener("click", () => {
      this._classificationReview = true;
      this._classificationStatus = "";
      this._render();
    });
    this.shadowRoot.querySelector?.("[data-classification-edit]")?.addEventListener("click", () => {
      this._classificationReview = false;
      this._render();
    });
    this.shadowRoot.querySelector?.("[data-classification-save]")?.addEventListener("click", async () => {
      const unclassifiedIds = new Set(this._unclassifiedUnknownIds());
      const ids = [...this._selectedUnknown].filter(id => unclassifiedIds.has(id));
      if (!ids.length || !this._classificationReason.trim()) return;
      const saveButton = this.shadowRoot.querySelector?.("[data-classification-save]");
      if (saveButton) saveButton.disabled = true;
      try {
        await this._hass.callService("home_assistant_health_manager", "set_entity_classification", {
          entity_ids: ids,
          classification: this._classificationChoice,
          reason: this._classificationReason.trim(),
        });
        this._classificationStatus = `Successfully saved classification for ${ids.length} entities in one bulk operation. Home Assistant is updating the summary.`;
        this._selectedUnknown.clear();
        this._classificationReview = false;
      } catch (error) {
        this._classificationStatus = `Save failed; no success was reported. ${error?.message || "Check the Home Assistant service error and try again."}`;
        this._classificationReview = true;
      }
      this._render();
    });
    this.shadowRoot.querySelectorAll("button[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        this._tab = button.dataset.tab;
        this._render();
      });
    });
  }
}

customElements.define("home-assistant-health-manager-card", HomeAssistantHealthManagerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "home-assistant-health-manager-card",
  name: "Home Assistant Health Manager Card",
  description: "At-a-glance health overview, unavailable entities, classifications, integrations, investigations, and history.",
  preview: true,
});
