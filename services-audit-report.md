# Admin Dashboard — Services Group Audit Report

> **Purpose:** Full structural audit of the "Services" sidebar group in the VeeGo Admin Dashboard. Covers every service and sub-page, documenting purpose, UI components, and available admin controls.

---

## Table of Contents

1. [Car Service](#1-car-service)
2. [Shuttle Service](#2-shuttle-service)
3. [Scooter (Motorcycle) Service](#3-scooter-motorcycle-service)
4. [Delivery Service](#4-delivery-service)
5. [Vehicle Catalog — Integration Recommendation](#5-vehicle-catalog--integration-recommendation)

---

## 1. Car Service

### 1.1 Overview — Car Services
- **Route:** `/services/car`
- **File:** `artifacts/admin-dashboard/src/pages/services.tsx`
- **Purpose:** Centralized control dashboard for the Car ride service.
- **UI Components:**
  - Stat cards: active drivers, total trips
  - Service Control panel: master on/off switch, display mode selector (Live / Maintenance / Coming Soon)
  - Driver Requirements form: minimum rating, accepted license types
  - Zone restriction selector
  - Active ride cap field
- **Admin Controls:**
  - Toggle the Car service globally on/off
  - Set the public display mode (Live, Maintenance, Coming Soon)
  - Restrict service availability to specific geographic zones
  - Define driver eligibility requirements (rating threshold, license types)
  - Cap the number of concurrent active rides

---

### 1.2 Sub-page — Vehicles (Car)
- **Route:** `/vehicles/car`
- **File:** `artifacts/admin-dashboard/src/pages/vehicles.tsx`
- **Purpose:** Fleet registry for all car vehicles registered on the platform.
- **UI Components:**
  - Searchable and filterable vehicle table
  - Columns: plate number, make, model, year, color, driver assignment, status badge, active toggle
  - Add Vehicle dialog (form with vehicle details)
  - Edit Vehicle dialog (same form, pre-filled)
  - Status badge: Pending / Verified / Rejected / Suspended
- **Admin Controls:**
  - View all registered car vehicles
  - Add a new vehicle
  - Edit vehicle details
  - Delete a vehicle
  - Change verification status (Pending → Verified / Rejected / Suspended)
  - Toggle vehicle active/inactive state

---

### 1.3 Sub-page — Pricing (Car)
- **Route:** `/pricing/car`
- **File:** `artifacts/admin-dashboard/src/pages/pricing.tsx`
- **Purpose:** Configure the fare structure for car rides.
- **UI Components:**
  - Base fare configuration form: base fare, per-km rate, per-minute rate, minimum fare
  - Zone-based pricing override table: zone name, base fare override, per-km rate override
  - Add Zone Price dialog
  - Edit Zone Price dialog
- **Admin Controls:**
  - Edit global base fare and rate values
  - Add zone-specific pricing overrides
  - Edit existing zone override entries
  - Delete zone overrides

---

## 2. Shuttle Service

### 2.1 Overview — Shuttle Services
- **Route:** `/services/shuttle`
- **File:** `artifacts/admin-dashboard/src/pages/services.tsx`
- **Purpose:** Central management hub for the fixed-route shuttle service.
- **UI Components:**
  - Stat cards: active drivers, total trips, active routes
  - Service Control panel: master switch, display mode selector
  - Driver requirements form
  - Zone restriction selector
- **Admin Controls:**
  - Toggle the Shuttle service globally on/off
  - Set public display mode
  - Restrict service to specific zones
  - Update driver eligibility criteria

---

### 2.2 Sub-page — Routes
- **Route:** `/routes`
- **File:** `artifacts/admin-dashboard/src/pages/routes.tsx`
- **Purpose:** Define and manage the physical shuttle route paths and their base pricing.
- **UI Components:**
  - Routes table: route name, origin, destination, distance, base price, active status badge
  - Add Route dialog
  - Edit Route dialog
  - Route Detail link (navigates to station management for that route)
- **Admin Controls:**
  - View all routes
  - Add a new route
  - Edit route details and base price
  - Delete a route
  - Toggle route active/inactive (hidden from passengers when inactive)
  - Navigate into a route to manage its stations

---

### 2.3 Sub-page — Buses
- **Route:** `/buses`
- **File:** `artifacts/admin-dashboard/src/pages/buses.tsx`
- **Purpose:** Inventory management for the shuttle bus fleet.
- **UI Components:**
  - Summary cards: total buses, active buses
  - Searchable bus table: bus number/name, plate, capacity, assigned driver, active status
  - Add Bus dialog
  - Edit Bus dialog
- **Admin Controls:**
  - View all buses
  - Add a new bus
  - Edit bus details
  - Delete a bus
  - Toggle bus active/inactive status

---

### 2.4 Sub-page — Schedules
- **Route:** `/schedules`
- **File:** `artifacts/admin-dashboard/src/pages/schedules.tsx`
- **Purpose:** Define recurring trip schedules for shuttle routes.
- **UI Components:**
  - Schedule creation form: route selector, days of week, departure time, assigned bus/driver
  - Schedule cards: shows route name, time, days, trip count stats, seat slot details
- **Admin Controls:**
  - Create a new recurring schedule
  - Re-generate trips for an existing schedule (recalculates future trips)
  - Deactivate a schedule (stops future trip generation)

---

### 2.5 Sub-page — Shuttle Trips
- **Route:** `/shuttle-trips`
- **File:** `artifacts/admin-dashboard/src/pages/shuttle-trips.tsx`
- **Purpose:** Live and historical monitoring of all individual shuttle trip instances.
- **UI Components:**
  - KPI summary cards: total trips, active trips, completed trips
  - Filterable trip table: filter by status and date range
  - Columns: trip ID, route, date/time, driver, bus, booked seats, status badge
  - Seat occupancy progress bars
- **Admin Controls:**
  - View all trips (live and historical)
  - Filter trips by status (Scheduled / Boarding / Active / Completed / Cancelled) and date
  - Click through to driver and vehicle profile links

---

### 2.6 Sub-page — Cash Debts
- **Route:** `/shuttle/cash-debts`
- **File:** `artifacts/admin-dashboard/src/pages/shuttle-cash-debts.tsx`
- **Purpose:** Track and manage outstanding financial penalties owed by passengers for no-shows.
- **UI Components:**
  - Summary cards: total outstanding debt amount
  - Passenger debt table: passenger name, no-show count, total debt amount, last incident date
  - "Mark as Collected" action button per row
- **Admin Controls:**
  - View all passengers with outstanding no-show debt
  - Manually mark a passenger's debt as collected (clears the balance)

---

### 2.7 Sub-page — Offences
- **Route:** `/shuttle/offences`
- **File:** `artifacts/admin-dashboard/src/pages/shuttle-offences.tsx`
- **Purpose:** Compliance monitoring log for rule violations by both drivers and passengers.
- **UI Components:**
  - Filter controls: by actor type (Driver / Passenger) and action taken (Warning / Fined / Suspended)
  - Offences table: actor name, actor type, offence type, total count, last action taken, date
- **Admin Controls:**
  - View all recorded offences
  - Filter by actor type and action severity
  - Reset offence count for a specific user

---

## 3. Scooter (Motorcycle) Service

### 3.1 Overview — Motorcycle Services
- **Route:** `/services/motorcycle`
- **File:** `artifacts/admin-dashboard/src/pages/services.tsx`
- **Purpose:** Management dashboard for the motorcycle ride service.
- **UI Components:**
  - Service control panel: master switch, display mode selector
  - Driver requirements form
  - Zone restriction selector
- **Admin Controls:**
  - Toggle the Motorcycle service globally on/off
  - Set public display mode
  - Restrict to specific zones
  - Update driver eligibility requirements

---

### 3.2 Sub-page — Vehicles (Motorcycle)
- **Route:** `/vehicles/motorcycle`
- **File:** `artifacts/admin-dashboard/src/pages/vehicles.tsx`
- **Purpose:** Fleet registry for all registered motorcycles.
- **UI Components:**
  - Searchable motorcycle table: plate, make, model, year, driver, status badge
  - Add / Edit Vehicle dialogs
  - Status badges: Pending / Verified / Rejected / Suspended
- **Admin Controls:**
  - View, add, edit, or delete motorcycles
  - Update verification status
  - Toggle active/inactive state

---

### 3.3 Sub-page — Pricing (Motorcycle)
- **Route:** `/pricing/bike`
- **File:** `artifacts/admin-dashboard/src/pages/pricing.tsx`
- **Purpose:** Configure fare structure for motorcycle rides.
- **UI Components:**
  - Base fare form: base fare, per-km rate, per-minute rate, minimum fare
  - Zone-based pricing override table
  - Add / Edit Zone Price dialogs
- **Admin Controls:**
  - Edit global motorcycle fare rates
  - Add, edit, or delete zone-specific price overrides

---

## 4. Delivery Service

### 4.1 Overview — Delivery Services
- **Route:** `/services/delivery`
- **File:** `artifacts/admin-dashboard/src/pages/services.tsx`
- **Purpose:** Control hub for the package and logistics delivery service.
- **UI Components:**
  - Service control panel: master switch, display mode selector
  - Zone restriction selector
- **Admin Controls:**
  - Toggle the Delivery service globally on/off
  - Set public display mode (e.g., "Coming Soon" or "Maintenance")
  - Manage zone availability

---

### 4.2 Sub-page — Vehicles (Delivery)
- **Route:** `/vehicles/delivery`
- **File:** `artifacts/admin-dashboard/src/pages/vehicles.tsx`
- **Purpose:** Fleet management for delivery vehicles (Vans and Minibuses).
- **UI Components:**
  - Searchable vehicle table: plate, vehicle type (Van / Minibus), make, model, driver, status
  - Add / Edit Vehicle dialogs with vehicle type selector
- **Admin Controls:**
  - View, add, edit, or delete delivery vehicles
  - Select vehicle type (Van or Minibus)
  - Update verification and active status

---

### 4.3 Sub-page — Pricing (Delivery)
- **Route:** `/pricing/delivery`
- **File:** `artifacts/admin-dashboard/src/pages/pricing.tsx`
- **Purpose:** Fare configuration for the delivery service.
- **UI Components:**
  - Base fare editor: delivery-specific base rate, per-km rate, minimum fare
  - Zone override table
  - Add / Edit Zone Price dialogs
- **Admin Controls:**
  - Edit delivery fare rates
  - Manage zone-specific price overrides

---

## 5. Vehicle Catalog — Integration Recommendation

The backend API for managing eligible vehicle brands and models is fully implemented at:
- `GET/POST/PATCH /api/admin/vehicle-catalog/brands`
- `GET/POST/PATCH /api/admin/vehicle-catalog/models`

**No frontend page exists for this yet.**

### Recommended Placement Options

| Option | Location | Rationale |
|--------|----------|-----------|
| **A (Recommended)** | New sub-page under each service (Car, Motorcycle, Delivery) — e.g., `/vehicle-catalog/car` | Keeps catalog scoped per service type; most logical for drivers registering a specific vehicle type |
| **B** | Single global page under a "Settings" or "Platform" sidebar group | Simpler if brands/models are shared across all services |
| **C** | Embedded tab inside the existing Vehicles sub-page per service | Low navigation overhead; catalog and fleet managed in one place |

**Recommendation:** Use **Option A** — a shared `/vehicle-catalog` page with a service type tab (Car / Motorcycle / Delivery), placed as a new sub-page under each relevant service group in the sidebar. This mirrors the existing pattern used by Vehicles and Pricing pages.
