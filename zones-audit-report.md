# Zones Technical Audit Report

> **Purpose:** Resolve the apparent conflict between the standalone `/zones` page and the Zone Restriction Selector embedded in each service's Overview page. This report covers backend schema, API connectivity, frontend behaviour, and interaction logic.

---

## Table of Contents

1. [Standalone `/zones` Page Audit](#1-standalone-zones-page-audit)
2. [Service Zone Restriction Selector Audit](#2-service-zone-restriction-selector-audit)
3. [The Conflict / Connection](#3-the-conflict--connection)
4. [Active Implementation & Enforcement](#4-active-implementation--enforcement)
5. [Identified Risk: Dangling Zone IDs](#5-identified-risk-dangling-zone-ids)
6. [Summary Table](#6-summary-table)

---

## 1. Standalone `/zones` Page Audit

- **File:** `artifacts/admin-dashboard/src/pages/zones.tsx`
- **Status:** ✅ **Fully built and live-connected to the database**

### Purpose
A full GIS management interface for defining geographic zones. Uses **Leaflet** (OpenStreetMap) to display, draw, and edit circular zones on an interactive map.

### UI Components
- Interactive map with zone circles rendered as overlays
- Zone creation form: name, description, center point (via map click), radius slider (0.5 km – 50 km)
- Service tag selector per zone: Car, Shuttle, Bike
- Zone list panel with edit and delete controls

### API Calls Made
| Method | Endpoint | Action |
|--------|----------|--------|
| `GET` | `/zones` | Load and display all zones |
| `POST` | `/zones` | Create a new zone |
| `PATCH` | `/zones/:id` | Update zone name, radius, center, or services |
| `DELETE` | `/zones/:id` | Remove a zone |

### Database Fields Written (`zones` table)
| Field | Type | Description |
|-------|------|-------------|
| `id` | serial | Primary key |
| `name` | text | Zone display name |
| `description` | text | Optional description |
| `centerLat` / `centerLng` | real | Geographic center coordinates |
| `radiusKm` | real | Zone radius in kilometres |
| `services` | text[] | Metadata tags (Car, Shuttle, Bike) |
| `isActive` | boolean | Whether zone is active |

> **All write operations trigger an audit log entry** via `writeAuditLog`.

---

## 2. Service Zone Restriction Selector Audit

- **File:** `artifacts/admin-dashboard/src/pages/services.tsx` (Lines 406–446)
- **Status:** ✅ **Fully connected to the backend API**

### Purpose
Embedded inside the Service Control card on each service's Overview page (Car, Shuttle, Scooter, Delivery). Allows an admin to restrict a specific service so it is only available within selected zones.

### UI Components
- Checkbox list populated with all zones from the database
- If nothing is selected → service runs in **all zones** (no restriction)
- If one or more zones are selected → service is restricted to those zones only

### API Calls Made
| Method | Endpoint | Action |
|--------|----------|--------|
| `GET` | `/zones?limit=200` | Populate the zone checklist |
| `PATCH` | `/admin/services/:type/control` | Save selected `activeZoneIds` for that service |

### Database Field Written (`service_controls` table)
| Field | Type | Description |
|-------|------|-------------|
| `activeZoneIds` | integer[] | Array of zone IDs the service is restricted to |

---

## 3. The Conflict / Connection

These two components are **not in conflict** — they serve different, complementary roles. They are connected at the data layer.

### How They Relate

```
┌─────────────────────────────────────┐
│        /zones (Standalone Page)     │
│  Defines geographic zones:          │
│  · Name, center, radius             │
│  · Service metadata tags            │
│  Writes to → zones table            │
└─────────────────┬───────────────────┘
                  │  Shares zone list
                  ▼
┌─────────────────────────────────────┐
│   Service Overview Zone Selector    │
│  (Car / Shuttle / Scooter /         │
│   Delivery Overview pages)          │
│  Reads zones table to populate list │
│  Writes selected IDs to →           │
│  service_controls.activeZoneIds     │
└─────────────────────────────────────┘
```

### Clear Division of Responsibility

| Responsibility | Component |
|----------------|-----------|
| **Define** geographic boundaries (shape, size, location) | Standalone `/zones` page |
| **Restrict** a service to operate only within certain zones | Service Overview zone selector |
| **Tagging** a zone as relevant to a service type (metadata only) | `/zones` page — `services[]` field |
| **Enforcing** which zones a service actually runs in (live logic) | Service Overview → `activeZoneIds` |

> **Key insight:** The `services[]` array on the Zone itself is just a label/filter hint. The `activeZoneIds` array on the `service_controls` record is what actually gates service availability.

---

## 4. Active Implementation & Enforcement

### Ride Requests (`artifacts/api-server/src/routes/rides.ts`)
- Checks the master `isEnabled` toggle on the service first.
- Uses **Haversine distance** to match the pickup coordinates against zone boundaries.
- Looks up zone-based pricing from `zonePricingTable` based on which zone the pickup falls into.
- `activeZoneIds` is used to determine if the service is permitted in that zone at all.

### Shuttle Requests (`artifacts/api-server/src/routes/shuttle.ts`)
- Same pattern: master toggle checked first, then zone ID matching against `activeZoneIds`.

### Current State of Enforcement
| Check | Enforced? |
|-------|-----------|
| Master service on/off toggle | ✅ Hard block |
| Zone-based pricing lookup | ✅ Active |
| `activeZoneIds` restriction (block requests outside allowed zones) | ✅ Active |
| Hard coordinate boundary rejection for out-of-zone requests | ⚠️ Soft — handled via pricing availability, not a strict coordinate block |

---

## 5. Identified Risk: Dangling Zone IDs

**Problem:** If a zone is deleted via the `/zones` page, the `activeZoneIds` array in `service_controls` may still contain that deleted zone's ID. There is no foreign key constraint on this array, and the `DELETE /zones/:id` route contains no cleanup logic for this reference.

**Impact:** A service may silently be "restricted" to a zone that no longer exists, potentially blocking all rides if the only zone in `activeZoneIds` is the deleted one.

**Recommended Fix:** On `DELETE /zones/:id`, run a cleanup query:
```sql
UPDATE service_controls
SET active_zone_ids = array_remove(active_zone_ids, $deletedZoneId)
WHERE $deletedZoneId = ANY(active_zone_ids);
```

---

## 6. Summary Table

| Component | Location | Backend Connected? | What It Controls |
|-----------|----------|--------------------|------------------|
| Standalone `/zones` page | Sidebar → Zones | ✅ Yes — full CRUD | Defines zone geography and metadata |
| Zone selector — Car Overview | `/services/car` | ✅ Yes — reads & writes | Restricts Car service to selected zones |
| Zone selector — Shuttle Overview | `/services/shuttle` | ✅ Yes — reads & writes | Restricts Shuttle service to selected zones |
| Zone selector — Scooter Overview | `/services/motorcycle` | ✅ Yes — reads & writes | Restricts Scooter service to selected zones |
| Zone selector — Delivery Overview | `/services/delivery` | ✅ Yes — reads & writes | Restricts Delivery service to selected zones |

**Verdict:** Both components are live, connected, and working as designed. They are complementary, not conflicting. The only actionable issue is the dangling zone ID risk on deletion.
