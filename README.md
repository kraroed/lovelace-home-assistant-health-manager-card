# Home Assistant Health Manager Card

A standalone Lovelace card for the [Home Assistant Health Manager](https://github.com/kraroed/home-assistant-health-manager) integration.

The card reads the integration's consolidated **Health Overview** sensor and presents its data in six responsive views:

- **Overview** — overall status, issue counts, platform updates, compatibility, diagnostic coverage, and report metadata.
- **Unavailable** — current and persistent outages, evidence-based groups, missing entities, and affected entity IDs.
- **Unknown** — raw and actionable unknown counts, saved classification totals, domain counts, and reviews due.
- **Integrations** — failed integrations, attention domains, and integration state information.
- **Investigations** — unavailable investigation records, status counts, evidence, notes, and affected entities.
- **History** — recent availability events when the optional history sensor is configured.

This is a display card. It does not automatically classify entities, suppress alerts, dismiss investigations, or change investigation statuses.

## Requirements

- Home Assistant with Lovelace.
- The Home Assistant Health Manager integration installed and configured.
- The integration's Health Overview sensor available.

## Install with HACS

1. Open **HACS → ⋮ → Custom repositories**.
2. Add `kraroed/lovelace-home-assistant-health-manager-card`.
3. Choose **Dashboard** as the category.
4. Install **Home Assistant Health Manager Card**.
5. Refresh the browser after installation.

## Add the card

Add a Manual card to your dashboard:

```yaml
type: custom:home-assistant-health-manager-card
entity: sensor.health_overview
title: Home Assistant Health
```

If your Health Overview entity has a different entity ID, use the exact ID shown under **Settings → Devices & services → Entities**.

### Optional history sensor

The Health Overview sensor provides the event count, while the individual Unavailable Entity History Events sensor provides the retained event records. To populate the History view with those records, add its exact entity ID:

```yaml
type: custom:home-assistant-health-manager-card
entity: sensor.health_overview
history_entity: sensor.unavailable_entity_history_events
```

Entity IDs can vary if they were renamed or customized. Use the entity ID shown in your installation.

## Notes

- All six views use the Health Overview sensor attributes, so the card does not need a separate entity configured for every metric.
- The History view can show the retained event count without the optional history sensor; the event list requires that sensor.
- Grouping is an association lead based on available evidence, not confirmation of a shared root cause.
- Investigation statuses such as **Expected** and **Resolved** are user-managed tracking labels. They do not change availability counts or entity classifications.
- The card is read-only in this initial beta release.

## Development

The card is a dependency-free custom element in `health-manager-card.js`. No build step is required.
