# Admin Dashboard Audit Report
**Project:** VeeGo — Ride-Hailing & Shuttle Service Management Platform  
**Date:** June 12, 2026  
**Scope:** Full read-only audit of all 42 pages in `artifacts/admin-dashboard/src/pages/`  
**Classifications:**  
- **[UI]** — Static label or phrase that belongs in i18n translation files  
- **[DB]** — Dynamic content stored in the database, may need `ar`/`en` field support  

---

## Table of Contents
1. [Login](#1-login)
2. [Dashboard](#2-dashboard)
3. [Drivers](#3-drivers)
4. [Driver Detail](#4-driver-detail)
5. [Driver Verification](#5-driver-verification)
6. [Users (Customers)](#6-users-customers)
7. [User Detail](#7-user-detail)
8. [Trips](#8-trips)
9. [Trip Detail](#9-trip-detail)
10. [Routes](#10-routes)
11. [Route Detail](#11-route-detail)
12. [Schedules](#12-schedules)
13. [Shuttle Trips](#13-shuttle-trips)
14. [Shuttle Trip Detail](#14-shuttle-trip-detail)
15. [Shuttle Offences](#15-shuttle-offences)
16. [Shuttle Cash Debts](#16-shuttle-cash-debts)
17. [Bookings](#17-bookings)
18. [Buses](#18-buses)
19. [Vehicles](#19-vehicles)
20. [Live Tracking](#20-live-tracking)
21. [Finance Payouts](#21-finance-payouts)
22. [Finance Commission](#22-finance-commission)
23. [Payments (Legacy)](#23-payments-legacy)
24. [Pricing](#24-pricing)
25. [Services](#25-services)
26. [Service Zones](#26-service-zones)
27. [Zones](#27-zones)
28. [Ratings](#28-ratings)
29. [Promo Codes](#29-promo-codes)
30. [Notifications](#30-notifications)
31. [Support](#31-support)
32. [Suggestions](#32-suggestions)
33. [Chat Inbox](#33-chat-inbox)
34. [Reports](#34-reports)
35. [Wallet](#35-wallet)
36. [Staff & Roles](#36-staff--roles)
37. [Settings](#37-settings)
38. [Fraud Alerts](#38-fraud-alerts)
39. [Audit Logs](#39-audit-logs)
40. [Bonus Targets](#40-bonus-targets)
41. [Commission Exemptions](#41-commission-exemptions)
42. [Not Found (404)](#42-not-found-404)
43. [Summary](#summary)

---

## 1. Login

**Route:** `/login`  
**Purpose:** Authenticates admin and staff users via `POST /auth/admin/login`.

### UI Components
- Centered card layout on white background
- App logo image at the top
- Two-field form
- Submit button with loading spinner

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Sign In | Submits credentials to `/auth/admin/login`; stores JWT token | [UI] |
| Signing in… (loading state) | Spinner + disabled state while awaiting API | [UI] |

### Forms & Inputs
| Field | Type | Placeholder | Validation |
|-------|------|-------------|------------|
| Email / Phone (label) | Text | `admin@shuttleops.com` | Required, min 1 char |
| Password (label) | Password | `••••••••` | Required, min 1 char |

### Status Labels / Toasts
- **Welcome back!** — success toast on login → [UI]
- **You have been logged in.** — success toast description → [UI]
- **Login Failed** — error toast title → [UI]
- **Please check your credentials.** — error toast description → [UI]

### Classification
- **UI Translation keys needed:** `auth.welcomeBack`, `auth.loggedIn`, `auth.loginFailed`, `auth.checkCredentials`, field labels "Email / Phone", "Password", "Sign In", "Signing in..."
- **Database Fields:** None (auth tokens are not stored in DB by admin dashboard)

---

## 2. Dashboard

**Route:** `/`  
**Purpose:** Real-time operational overview — KPI cards, live network status, activity feed, sparkline charts.

### UI Components
- Page header with current date
- "Live" green pill indicator (auto-refreshes every 10–15 s)
- Refresh button
- 4 KPI stat cards with sparkline area charts and trend arrows
- Live Network Map shortcut card
- 4 activity feed cards in a 4-column grid

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Refresh | Manually re-fetches `/dashboard/summary` | [UI] |
| View All (Active Trips) | Navigates to `/trips` | [UI] |
| View All (Bookings) | Navigates to `/bookings` | [UI] |
| View All (Upcoming Departures) | Navigates to `/trips` | [UI] |
| View All (Support Tickets) | Navigates to `/support` | [UI] |
| Open Live Map | Navigates to `/live-tracking` | [UI] |

### KPI Stat Cards
| Card Title | Data Source | Trend |
|------------|------------|-------|
| Total Trips Today | trips per day from `/dashboard/analytics` | vs yesterday % | [UI]+[DB]
| Revenue Today | revenue per day from `/admin/analytics` | vs yesterday % | [UI]+[DB]
| Drivers Online | live count from `/admin/drivers/live` | vs yesterday | [UI]+[DB]
| Passengers Online | user count from `/admin/analytics` | vs yesterday | [UI]+[DB]

### Activity Feed Sections

#### Active Trips Card
- Columns: Route Name, Origin → Destination, Driver Name, Departure Time, Seats (sold/total)
- Empty state: "No active trips right now" → [UI]
- Data: [DB] — routeName, fromLocation, toLocation, driverName, departureTime, availableSeats, totalSeats

#### Recent Bookings Card
- Columns: User Name/Email, Relative time, Amount ($), Status badge
- Status badges: `confirmed` (blue), `completed` (green), `cancelled` (red), `pending` (amber) → [UI]
- Empty state: "No recent bookings" → [UI]

#### Upcoming Departures Card
- Columns: Route Name, Origin → Destination, Departure Time, Status badge
- Empty state: "No upcoming departures" → [UI]

#### Support Tickets Card
- Columns: Subject, Relative time, Status badge, Priority label
- Priority colors: high=red, medium=amber, low=muted → [UI]
- Empty state: "No recent tickets" → [UI]

### Live Network Map Card
| Label | Value | Classification |
|-------|-------|----------------|
| Drivers Online | Integer from live API | [UI] label + [DB] value |
| Active Trips | Integer from activity API | [UI] label + [DB] value |
| "Open Live Map" button | Links to `/live-tracking` | [UI] |

### Data Fields (All DB-driven)
`trip.routeName`, `trip.fromLocation`, `trip.toLocation`, `trip.driverName`, `trip.departureTime`, `booking.userName`, `booking.totalPrice`, `booking.status`, `ticket.subject`, `ticket.status`, `ticket.priority`

### Classification
- **UI Translation keys needed:** `nav.dashboard`, `dashboard.subtitle`, `nav.live`, `common.refresh`, `dashboard.totalTripsToday`, `dashboard.revenueToday`, `dashboard.driversOnline`, `dashboard.passengersOnline`, `dashboard.vsYesterday`, `dashboard.activeTrips`, `dashboard.upcomingDepartures`, `dashboard.supportTickets`, `dashboard.liveNetworkMap`, `dashboard.noActiveTripsNow`, `dashboard.noRecentBookings`, `dashboard.noUpcomingDepartures`, `dashboard.noRecentTickets`, `bookings.seats`, `common.viewAll`, `common.total`, `common.verified`
- **Database Fields:** `trips.status`, `trips.route_name`, `bookings.status`, `support_tickets.subject`, `support_tickets.status`, `support_tickets.priority`; recommend `name_ar`/`name_en` for route names if multilingual

---

## 3. Drivers

**Route:** `/drivers`  
**Purpose:** Lists all registered drivers. Allows adding new drivers and filtering the list.

### UI Components
- Page header with Bus icon
- Subtitle text
- 3 KPI stat cards (Total Drivers, On Duty, Off Duty)
- Search + status filter bar
- Paginated driver table
- "Pending Verification" button
- "Add Driver" button → dialog

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Pending Verification | Navigates to `/drivers/pending` | [UI] |
| Add Driver | Opens Register Driver dialog | [UI] |
| Register Driver (submit) | POST to create driver | [UI] |
| View Profile | Navigates to `/drivers/:id` | [UI] |
| Clear filters | Clears search + status filter | [UI] |
| Previous / Next (pagination) | Pages through list | [UI] |

### Forms & Inputs
**Register Driver Dialog**
| Field | Type | Validation | Classification |
|-------|------|------------|----------------|
| Linked User ID | Number input | Required ≥1 | [UI] label, [DB] value |
| Full Name | Text | Required | [UI] label, [DB] value |
| Phone | Text | Required | [UI] label, [DB] value |
| Assign Default Bus | Select (bus list) | Optional | [UI] label, [DB] list |

**Filter Bar**
| Field | Type | Options |
|-------|------|---------|
| Search by name/phone | Text | Free text | [UI] |
| Status filter | Select | All Statuses / On Duty / Off Duty | [UI] |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| Driver | Avatar icon, Name, ID # | [DB] |
| Phone | Phone number | [DB] |
| Rating | Star icon + numeric average | [DB] |
| Assignment | Bus # if assigned, or "Unassigned" | [DB] |
| Status | On Duty / Off Duty badge | [UI] badge label, [DB] isOnline |
| Actions | "View Profile" link | [UI] |

### Status Labels
- **On Duty** (green badge) → [UI]
- **Off Duty** (slate badge) → [UI]

### Classification
- **UI Translation keys needed:** `drivers.title`, `drivers.subtitle`, `drivers.totalDrivers`, `drivers.onDuty`, `drivers.offDuty`, `drivers.addDriver`, `drivers.registerDriver`, `drivers.linkedUserId`, `drivers.internalUserId`, `drivers.fullName`, `drivers.assignBus`, `drivers.selectBus`, `drivers.searchDrivers`, `drivers.allStatuses`, `drivers.unassigned`, `drivers.viewProfile`, `drivers.noDrivers`, `drivers.rating`, `drivers.assignment`, `drivers.driverAdded`, `common.phone`, `common.status`, `common.none`, `common.clear`
- **Database Fields:** `drivers.name`, `drivers.phone`, `drivers.rating`, `drivers.assigned_bus_id`, `drivers.is_online`, `buses.plate_number`

---

## 4. Driver Detail

**Route:** `/drivers/:id`  
**Purpose:** Full profile page for a single driver. Read + write operations across 7 tabs.

### UI Components
- Back navigation link
- Driver header card (name, phone, status badge, rating, account email, wallet balance)
- 7 tabs: Overview, Documents, Trips, Earnings, Bonuses, Wallet, Notifications
- Action buttons section (Suspend/Activate, Block/Unblock, Send Notification)

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Back to Drivers | Navigate to `/drivers` | [UI] |
| Suspend Driver | PATCH driver status → suspended | [UI] |
| Activate Driver | PATCH driver status → online | [UI] |
| Block User | PATCH user → isBlocked=true | [UI] |
| Unblock User | PATCH user → isBlocked=false | [UI] |
| Send Notification | Opens notification dialog | [UI] |
| Edit (profile info) | Opens edit fields for name/phone/license/nationalId | [UI] |
| Save Changes | PUT driver profile | [UI] |
| Assign Bus | Select + save assignedBusId | [UI] |
| Issue Refund / Wallet Adjust | POST /admin/wallet/refund | [UI] |
| Approve / Reject Document | PATCH document verification status | [UI] |
| Cancel Trip (in trips tab) | PATCH trip → cancelled | [UI] |
| Delete Rating | DELETE rating | [UI] |
| Previous/Next (all tabs) | Pagination | [UI] |

### Tabs & Data
**Overview Tab**
- Fields: Name, Phone, Email, License Number, National ID, Assigned Bus, Account Status, Wallet Balance, Join Date, Last Updated
- Status badges: Online / Offline / Busy / Suspended → [UI]

**Documents Tab**
- Lists uploaded documents: type, upload date, status badge (Pending/Approved/Rejected)
- Admin notes textarea per document
- Approve / Reject buttons with notes

**Trips Tab**
- Table: Trip ID, Route, Departure, Status, Seats, Price
- Sortable, paginated

**Earnings Tab**
- KPI: Total Earnings, Paid, Pending, Commission Rate
- Table: Trip ID, Date, Gross, Commission %, Driver Share, Status

**Bonuses Tab**
- List of bonus campaigns enrolled in
- Progress bar (current value / target value)
- Status: Active / Completed / Expired

**Wallet Tab**
- Transaction history: Type (deposit/payment/refund), Amount, Description, Date
- Issue Refund dialog: User ID (pre-filled), Amount, Reason

**Notifications Tab**
- Sent notification history: Title, Body, Read/Unread status, Date
- Send notification dialog: Title + Body fields

### Status Labels
- Driver status: **Online** (green), **Offline** (slate), **Busy** (amber), **Suspended** (red) → [UI]
- Document status: **Pending** (amber), **Approved** (green), **Rejected** (red) → [UI]
- User account: **Active** / **Blocked** → [UI]
- Earnings: **Paid** (green), **Pending** (amber) → [UI]
- Bonus: **Active** (green), **Completed** (blue), **Expired** (muted) → [UI]

### Classification
- **UI Translation keys needed:** All tab labels, action button labels, status badge labels, field names, empty states
- **Database Fields:** `drivers.name`, `drivers.phone`, `drivers.license_number`, `drivers.national_id`, `drivers.status`, `driver_documents.type`, `driver_documents.verification_status`, `driver_documents.admin_notes`, `trips.*`, `driver_earnings.*`, `wallet_transactions.*`, `notifications.title`, `notifications.body`; `driver_documents.type` should support `name_ar`/`name_en`

---

## 5. Driver Verification

**Route:** `/drivers/pending`  
**Purpose:** Review queue for driver KYC document submissions. Approve or reject with notes.

### UI Components
- Page header with ShieldCheck icon
- Tab bar: All, Pending, Verified, Issues
- Driver list (left panel) with status badge
- Document viewer panel (right panel)
- Image lightbox (zoom view)
- Approve All / Reject All bulk actions

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Approve (per document) | PATCH doc → `approved` | [UI] |
| Reject (per document) | PATCH doc → `rejected` + notes | [UI] |
| Approve All | Bulk-approve all pending docs for driver | [UI] |
| Reject All | Bulk-reject all pending docs for driver | [UI] |
| Zoom (image) | Opens lightbox dialog | [UI] |
| Previous / Next driver | Pagination | [UI] |
| Tab: All / Pending / Verified / Issues | Filters list by status | [UI] |

### Forms & Inputs
| Field | Type | Purpose | Classification |
|-------|------|---------|----------------|
| Admin Notes | Textarea | Rejection reason or review notes | [UI] label, [DB] stored |
| Status filter Select | Select | All/Pending/Approved/Rejected | [UI] |

### Table / List
Left panel driver list columns:
- Driver name, Phone number, Document status badge, Document count

Right panel document viewer:
- Document type name, Upload date, Current status badge
- Image/PDF viewer
- Admin notes field

### Status Labels
- **Verified** (green) — all docs approved → [UI]
- **Pending** (amber) — awaiting review → [UI]
- **Issues** (red) — one or more rejected → [UI]
- **No docs** (muted) — no documents uploaded → [UI]

### Classification
- **UI Translation keys needed:** Page title, tab labels ("All", "Pending", "Verified", "Issues"), button labels, status labels, empty states
- **Database Fields:** `driver_documents.type` (should have `name_ar`/`name_en`), `driver_documents.verification_status`, `driver_documents.admin_notes`, `driver_documents.file_url`, `drivers.name`, `drivers.phone`

---

## 6. Users (Customers)

**Route:** `/users`  
**Purpose:** Paginated list of all passenger accounts. Supports blocking, wallet adjustment, and profile navigation.

### UI Components
- Search bar with submit button
- Role filter (hardcoded to "user")
- Paginated user table
- Per-row dropdown action menu
- Wallet Adjust dialog

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Search (submit) | Filters by name/email/phone | [UI] |
| Block User | PATCH → isBlocked=true | [UI] |
| Unblock User | PATCH → isBlocked=false | [UI] |
| View Profile | Navigate to `/users/:id` | [UI] |
| Adjust Wallet | Opens wallet dialog | [UI] |
| Confirm Wallet Adjust | POST `/admin/wallet/refund` | [UI] |
| Previous / Next | Pagination | [UI] |

### Forms & Inputs
**Wallet Adjustment Dialog**
| Field | Type | Validation |
|-------|------|------------|
| Amount (EGP) | Number | Required > 0 |
| Type | Select: Credit / Debit | Required |
| Reason | Text | Required |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| User | Name + email | [DB] |
| Phone | Phone number | [DB] |
| Role | Badge (user/driver/admin) | [UI] badge, [DB] role value |
| Status | Active / Blocked badge | [UI] badge, [DB] isBlocked |
| Wallet | Balance in EGP | [DB] |
| Joined | Date | [DB] |
| Actions | Dropdown: View Profile, Block/Unblock, Adjust Wallet | [UI] |

### Status Labels
- **Active** (green) → [UI]
- **Blocked** (red) → [UI]
- **user**, **driver**, **admin** role badges → [UI]

### Classification
- **UI Translation keys needed:** `users.title`, `users.statusUpdated`, `users.searchPlaceholder`, "Block User", "Unblock User", "View Profile", "Adjust Wallet", column headers, "Wallet adjusted successfully", "Failed to adjust wallet"
- **Database Fields:** `users.name`, `users.email`, `users.phone`, `users.role`, `users.is_blocked`, `users.wallet_balance`, `users.created_at`

---

## 7. User Detail

**Route:** `/users/:id`  
**Purpose:** Full profile page for a single passenger. 6 tabs covering profile editing, booking history, wallet, promo codes, notifications, and saved locations.

### UI Components
- Back button
- User header card (avatar, name, email, phone, status badge, wallet balance)
- 6 tabs: Profile, Bookings, Wallet, Promo Codes, Notifications, Saved Locations

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Back to Users | Navigate to `/users` | [UI] |
| Edit Profile | Toggle edit mode for name/phone | [UI] |
| Save Changes | PATCH user profile | [UI] |
| Block / Unblock | PATCH isBlocked toggle | [UI] |
| Send Notification | Opens send notification dialog | [UI] |
| Adjust Wallet | Opens wallet adjustment dialog | [UI] |
| Cancel Booking | PATCH booking → cancelled | [UI] |
| Refund Booking | POST refund | [UI] |
| Add Promo Code | Assign promo code to user | [UI] |
| Remove Promo | DELETE user-promo association | [UI] |
| Delete Saved Location | DELETE saved address | [UI] |

### Tabs & Data

**Profile Tab:** Name, Email, Phone, Role, Account Status, Wallet Balance, Join Date

**Bookings Tab (table):**
| Column | Classification |
|--------|----------------|
| Booking ID | [DB] |
| Trip / Route | [DB] — should have `name_ar`/`name_en` |
| Date | [DB] |
| Seats | [DB] |
| Total Price | [DB] |
| Payment Status | [UI] badge |
| Booking Status | [UI] badge |
| Actions | [UI] |

**Wallet Tab:**
- Transaction list: Type, Amount, Description, Date
- Issue Refund form: User ID (pre-filled), Amount (EGP), Reason

**Promo Codes Tab:**
- Assigned codes: Code string, Discount, Expiry, Used/Max count
- Add Code button

**Notifications Tab:**
- Sent notifications: Title, Body, Read status, Date

**Saved Locations Tab:**
- Addresses: Type (Home/Work/Other), Label, Full Address, Coordinates, Default badge

### Status Labels
- **Active** / **Blocked** → [UI]
- Booking status: `confirmed`, `completed`, `cancelled`, `pending` → [UI]
- Payment status: `paid`, `pending`, `refunded` → [UI]
- Location type: `home`, `work`, `other` → [UI]

### Classification
- **UI Translation keys needed:** Tab labels, all button labels, column headers, status badge labels, empty state messages
- **Database Fields:** `users.*`, `bookings.*`, `wallet_transactions.*`, `promo_codes.code`, `user_notifications.title`, `user_notifications.body`, `saved_locations.label` (needs `label_ar`/`label_en`), `saved_locations.address`

---

## 8. Trips

**Route:** `/trips`  
**Purpose:** Full shuttle trip scheduling. Create, edit, duplicate, cancel, and delete trips.

### UI Components
- Page header
- Status filter bar with button-group tabs
- Date range filter
- Paginated trips table
- "Schedule Trip" button → dialog

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Schedule Trip | Opens create trip dialog | [UI] |
| Cancel Trip (Ban icon) | PATCH trip → cancelled | [UI] |
| Duplicate Trip (Copy icon) | Pre-fills form with existing trip data | [UI] |
| Edit Trip (Edit icon) | Opens edit dialog | [UI] |
| Delete Trip (Trash icon) | DELETE trip (with confirmation) | [UI] |
| Status filter tabs | All / Open / Active / Completed / Cancelled | [UI] |

### Forms & Inputs
**Schedule Trip Dialog**
| Field | Type | Validation |
|-------|------|------------|
| Route | Select (route list) | Required |
| Bus | Select (bus list) | Required |
| Driver | Select (driver list) | Required |
| Departure Time | Datetime-local | Required |
| Arrival Time | Datetime-local | Auto-calculated (+route duration) |
| Price (EGP) | Number | ≥0 |
| Recurring Type | Select: One-time / Daily / Weekdays / Weekends / Custom | Default: one_time |
| Custom Days | Checkbox group (Mon–Sun) | Shown only when "Custom" selected |
| Is Active | Checkbox | Default: true |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| ID | Trip ID | [DB] |
| Route | Route name link | [DB] — needs `name_ar`/`name_en` |
| Departure | Formatted date/time | [DB] |
| Bus / Driver | Plate number + driver name | [DB] |
| Bookings | X / Y seats sold | [DB] |
| Schedule | One-time / Daily / Weekdays / etc. | [UI] label, [DB] value |
| Status | Status badge | [UI] badge, [DB] value |
| Actions | Cancel / Duplicate / Edit / Delete | [UI] |

### Status Labels
- **Open** (blue, maps from `scheduled`) → [UI]
- **Active** (green) → [UI]
- **Boarding** (purple) → [UI]
- **Completed** (slate) → [UI]
- **Cancelled** (red) → [UI]

### Classification
- **UI Translation keys needed:** Page title, "Schedule Trip", all filter button labels, table column headers, recurring type options, status labels, form field labels, dialog title, validation messages
- **Database Fields:** `trips.status`, `trips.departure_time`, `trips.arrival_time`, `trips.price`, `trips.recurring_type`, `routes.name` (needs `name_ar`/`name_en`), `buses.plate_number`, `drivers.name`

---

## 9. Trip Detail

**Route:** `/trips/:id`  
**Purpose:** Deep-dive view of a single shuttle trip — info cards, passenger bookings, messaging, and admin actions.

### UI Components
- Back button to trips list
- Trip header card (Route, Bus, Driver, Status, Price, Seats)
- Timeline: Scheduled → Accepted → Started → Completed
- 3 detail cards: Route Info, Driver Info, Trip Stats
- Bookings table
- Cancel Reason dialog

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Back | Navigate to `/trips` | [UI] |
| Cancel Trip | Opens cancel reason dialog | [UI] |
| Confirm Cancel | PATCH trip → cancelled with reason | [UI] |
| Refund Booking | POST refund for individual booking | [UI] |
| Cancel Booking | PATCH booking → cancelled | [UI] |
| View User | Navigate to `/users/:id` | [UI] |
| Delete Booking | DELETE booking | [UI] |
| Refresh | Re-fetches trip data | [UI] |

### Data Sections

**Trip Header:** ID, Route Name, Status badge, Price (EGP), Seats (booked/total), Departure + Arrival time

**Driver Info Card:** Driver name, Phone, Rating stars, Assigned bus plate

**Bookings Table:**
| Column | Classification |
|--------|----------------|
| User Name / Email | [DB] |
| Phone | [DB] |
| Seats | [DB] |
| Total Price | [DB] |
| Payment Status | [UI] badge |
| Booking Status | [UI] badge |
| Actions | [UI] |

### Status Labels
- Trip status: **Scheduled**, **Active**, **Boarding**, **Completed**, **Cancelled** → [UI]
- Payment: **paid** (green), **pending** (amber), **refunded** (purple) → [UI]
- Booking: **confirmed**, **cancelled**, **completed** → [UI]

### Classification
- **UI Translation keys needed:** "Back", "Cancel Trip", "Confirm Cancel", column headers, status labels, "Cancel Reason", field labels
- **Database Fields:** `trips.*`, `routes.name` (needs `name_ar`/`name_en`), `bookings.*`, `drivers.name`, `buses.plate_number`

---

## 10. Routes

**Route:** `/routes`  
**Purpose:** Manage shuttle routes — create, edit, activate/deactivate, and delete routes.

### UI Components
- Page header with Route icon
- Search bar + active filter
- Paginated route table
- Per-row dropdown menu
- "Add Route" button → dialog

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Add Route | Opens create route dialog | [UI] |
| Edit Route | Opens edit dialog | [UI] |
| Delete Route | DELETE route (with confirmation) | [UI] |
| Toggle Active | PATCH route isActive | [UI] |
| View Route | Navigate to `/routes/:id` | [UI] |
| Clear search | Clears search input | [UI] |

### Forms & Inputs
**Create/Edit Route Dialog**
| Field | Type | Validation |
|-------|------|------------|
| Route Name | Text | Required |
| Origin (From) | Text | Required |
| Destination (To) | Text | Required |
| Estimated Duration | Number (minutes) | ≥1 |
| Base Price (EGP) | Number | ≥0 |
| Active | Switch toggle | Default: true |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| Route | Name, Origin → Destination arrow | [DB] — needs `name_ar`/`name_en`, `from_ar`/`from_en`, `to_ar`/`to_en` |
| Duration | Estimated minutes | [DB] |
| Base Price | EGP amount | [DB] |
| Trip Activity | Badge counts (Active / Scheduled / Total) | [DB] |
| Status | Active / Inactive toggle badge | [UI] + [DB] |
| Actions | View / Edit / Delete dropdown | [UI] |

### Status Labels
- **Active** (green) → [UI]
- **Inactive** (slate) → [UI]
- Trip activity badges: `{n} active`, `{n} scheduled`, `{n} total` → [UI] labels + [DB] counts

### Classification
- **UI Translation keys needed:** `routes.title`, `routes.addRoute`, `routes.active`, column headers, form field labels, filter options, confirmation messages
- **Database Fields:** `routes.name`, `routes.from_location`, `routes.to_location`, `routes.estimated_duration`, `routes.base_price`, `routes.is_active` — **recommend:** `name_ar`/`name_en`, `from_location_ar`/`from_location_en`, `to_location_ar`/`to_location_en`

---

## 11. Route Detail

**Route:** `/routes/:id`  
**Purpose:** Most complex page in the system. Full route management with embedded map, stations, trips scheduling, and analytics.

### UI Components
- Back button + breadcrumb
- Route header card (name, origin, destination, duration, price, active toggle)
- 4 tabs: Overview, Stations, Trips, Analytics
- Leaflet interactive map (stations as markers, route as polyline)
- Edit route form (inline)

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Back | Navigate to `/routes` | [UI] |
| Edit Route Info | Toggle edit mode on header fields | [UI] |
| Save Route | PUT route | [UI] |
| Toggle Active | PATCH isActive | [UI] |
| Add Station | Opens add station form | [UI] |
| Edit Station | Opens edit station dialog | [UI] |
| Delete Station | DELETE station | [UI] |
| Move Up / Move Down | Reorders station in the list | [UI] |
| Schedule Trip | Opens schedule trip dialog | [UI] |
| Cancel Trip (in table) | PATCH trip → cancelled | [UI] |
| Duplicate Trip | Pre-fills form with existing trip | [UI] |
| Edit Trip | PATCH trip fields | [UI] |
| Delete Trip | DELETE trip | [UI] |
| Download CSV | Export bookings as CSV | [UI] |

### Tabs & Data

**Overview Tab:**
- Route name, Origin, Destination, Duration, Base price, Active status
- Stats: Total trips, Total bookings, Revenue

**Stations Tab:**
- Ordered station list: Station Name, Order Index, Direction badge, Segment Price
- Map renders each station as a marker; polyline connects them in order
- Reorder arrows, Edit, Delete per station

**Trips Tab (table):**
| Column | Classification |
|--------|----------------|
| Trip ID | [DB] |
| Departure / Arrival | [DB] |
| Bus (plate) | [DB] |
| Driver (name) | [DB] |
| Bookings (X/Y) | [DB] |
| Recurring | [UI] label + [DB] value |
| Status | [UI] badge + [DB] value |
| Actions | [UI] |

**Analytics Tab:**
- KPIs: Total Bookings, Total Revenue, Avg Occupancy, Cancellation Rate
- Bar chart: Bookings per day
- Top drivers table for this route

### Status Labels
- Route: **Active** / **Inactive** → [UI]
- Trip status badges (same as Trips page) → [UI]
- Station direction: **Forward** / **Return** → [UI]

### Classification
- **UI Translation keys needed:** Tab labels, all button labels, form field labels, chart axis labels, "Add Station", "Move Up/Down", analytics KPI labels
- **Database Fields:** `routes.*`, `stations.name` (needs `name_ar`/`name_en`), `stations.order`, `stations.segment_price`, `trips.*` — route and station names should be bilingual

---

## 12. Schedules

**Route:** `/schedules`  
**Purpose:** Define recurring schedule templates with day-of-week, time slots, vehicle type, and route association. Templates are used to auto-generate trips.

### UI Components
- Page header with CalendarClock icon
- "Create Schedule" button → inline form card
- Expandable schedule card list

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Create Schedule | Shows/hides creation form | [UI] |
| Save Schedule | POST schedule | [UI] |
| Toggle Active (per schedule) | PATCH schedule isActive | [UI] |
| Delete Schedule | DELETE schedule | [UI] |
| Expand / Collapse (arrow) | Shows schedule slot details | [UI] |
| Add Slot | Adds another time slot to a schedule | [UI] |
| Remove Slot | Removes a time slot | [UI] |

### Forms & Inputs
**Create Schedule Form**
| Field | Type | Options / Validation |
|-------|------|---------------------|
| Route | Select | From active routes list |
| Vehicle Type | Select | HiAce Minibus (14 seats) / Mini Bus (28 seats) |
| Time Slots | Dynamic list: Departure Time (time input) | At least 1 |
| Active Days | Checkbox group | Sun / Mon / Tue / Wed / Thu / Fri / Sat |
| Active | Switch | Default: true |

### Card Display (per schedule)
| Field | Classification |
|-------|----------------|
| Route Name | [DB] — needs bilingual |
| Vehicle Type label | [UI] — "HiAce Minibus" / "Mini Bus" |
| Days active (abbreviated) | [UI] + [DB] stored as bitmask/array |
| Seat info | [UI] — "14 seats · min 7 passengers to run" |
| Time slots list | [DB] |
| Status badge: Active/Inactive | [UI] |

### Classification
- **UI Translation keys needed:** Page title, "Create Schedule", "Add Slot", "Remove Slot", "Save Schedule", day names (Sun–Sat), vehicle type labels, seat threshold descriptions, status labels
- **Database Fields:** `schedules.route_id`, `schedules.vehicle_type`, `schedules.active_days`, `schedule_slots.departure_time`, `schedules.is_active`; `vehicle_type` descriptions should be localizable

---

## 13. Shuttle Trips

**Route:** `/shuttle/trips`  
**Purpose:** View-only paginated list of all real-time shuttle trips generated from schedules or manually. Filter by status, route, date.

### UI Components
- Page header with Bus icon + Navigation icon
- 5 KPI stat cards (Total, Open, Active, Completed, Cancelled)
- Search bar + status filter + date filters
- Paginated trips table
- Per-row "View Details" external link

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Search | Filters by route name | [UI] |
| Status filter Select | Open / Active / Boarding / Completed / Cancelled / All | [UI] |
| Date From / To | Date range filters | [UI] |
| Clear filters (×) | Resets all filters | [UI] |
| View Details (ExternalLink icon) | Navigate to `/shuttle/trips/:id` | [UI] |
| Previous / Next | Pagination | [UI] |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| ID | Trip ID + Schedule badge if from schedule | [DB] |
| Route | Route name + Origin → Destination | [DB] |
| Driver | Name + phone + rating | [DB] |
| Bus | Plate + model + capacity | [DB] |
| Departure | Date + time | [DB] |
| Seats | Booked/Total + Available count | [DB] |
| Price | EGP | [DB] |
| Status | Status badge | [UI] + [DB] |
| Actions | View Details | [UI] |

### Status Labels
| DB Value | Display Label | Color |
|----------|--------------|-------|
| `scheduled` | Open | Blue |
| `waiting_driver` | Active | Green |
| `driver_assigned` | Driver Assigned | Indigo |
| `boarding` | Boarding | Purple |
| `active` | Active | Green |
| `completed` | Completed | Slate |
| `cancelled` | Cancelled | Red |

All labels → [UI]; values stored as → [DB]

### Classification
- **UI Translation keys needed:** Page title, column headers, all status labels, filter labels, KPI card titles, empty state message
- **Database Fields:** `trips.id`, `trips.status`, `trips.departure_time`, `trips.price`, `trips.total_seats`, `trips.booked_seats`, `routes.name`, `routes.from_location`, `routes.to_location`, `drivers.name`, `buses.plate_number`

---

## 14. Shuttle Trip Detail

**Route:** `/shuttle/trips/:id`  
**Purpose:** Full detail view for a single shuttle trip with station progress, passenger manifest, and cancel action.

### UI Components
- Back button + breadcrumb
- Trip info card (route, driver, bus, status, price, timing)
- Station progress list with status indicators
- Passenger bookings table
- Cancel trip button with confirmation

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Back | Navigate to `/shuttle/trips` | [UI] |
| Cancel Trip | PATCH trip → cancelled | [UI] |
| View Driver | Link to `/drivers/:id` | [UI] |
| View Passenger | Link to `/users/:id` | [UI] |

### Station Progress List
| Field | Classification |
|-------|----------------|
| Station name | [DB] — needs bilingual |
| Station order | [DB] |
| Direction (Forward/Return) | [UI] label, [DB] value |
| Arrived At | [DB] |
| Completed At | [DB] |
| Progress status | [UI] badge |

### Passenger Bookings Table
| Column | Classification |
|--------|----------------|
| Passenger Name | [DB] |
| Phone | [DB] |
| Email | [DB] |
| Seats | [DB] |
| Total Paid (EGP) | [DB] |
| Booking Status | [UI] badge |
| Payment Status | [UI] badge |

### Status Labels
- Station progress: **Pending** / **Arrived** / **Completed** → [UI]
- Booking: **confirmed**, **cancelled**, **completed** → [UI]
- Payment: **paid**, **pending**, **refunded** → [UI]

### Classification
- **UI Translation keys needed:** "Back", "Cancel Trip", table column headers, section titles, status badge labels
- **Database Fields:** `trips.*`, `stations.name` (bilingual), `bookings.*`, `users.name`, `users.phone`, `users.email`

---

## 15. Shuttle Offences

**Route:** `/shuttle/offences`  
**Purpose:** Tracks disciplinary offences for shuttle passengers and drivers. Supports filtering and resetting a user's offence counter.

### UI Components
- Page header with ShieldAlert icon
- KPI card: Total offence records
- Filter bar: Actor Type + Last Action + Date range
- Table with offence records
- Reset Offences button per row

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Actor Type filter | All / Passenger / Driver | [UI] |
| Last Action filter | All / Warning / Fined / Suspended | [UI] |
| Date From / To | Date filters | [UI] |
| Reset Offences | PATCH → resets offence count to 0 | [UI] |
| Refresh | Refetches data | [UI] |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| Name | User or driver name | [DB] |
| Phone | Phone number | [DB] |
| Actor Type | Passenger / Driver badge | [UI] badge, [DB] value |
| Offence Count | Integer | [DB] |
| Last Action | Warning / Fined / Suspended badge | [UI] badge, [DB] value |
| Last Offence Date | Formatted date | [DB] |
| Actions | Reset Offences button | [UI] |

### Status Labels
| Value | Label | Color |
|-------|-------|-------|
| `warning` | Warning | Amber |
| `fined` | Fined | Red |
| `suspended` | Suspended | Purple |
| `passenger` | Passenger | Blue |
| `driver` | Driver | Slate |

All → [UI] labels; stored as → [DB] enum values

### Classification
- **UI Translation keys needed:** Page title, column headers, filter option labels, action badge labels, actor type labels, "Reset Offences", "Offences reset"
- **Database Fields:** `offences.actor_type`, `offences.last_action`, `offences.offence_count`, `offences.last_offence_at`, `users.name`, `users.phone`

---

## 16. Shuttle Cash Debts

**Route:** `/shuttle/cash-debts`  
**Purpose:** Tracks passengers who paid with cash on the shuttle but have an outstanding negative wallet balance. Admin can mark debts as collected.

### UI Components
- Page header with Wallet icon
- KPI cards: Total Debtors, Total Debt Amount
- Error state card (if fetch fails)
- Table of debt records
- "Collect Debt" button per row

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Collect Debt | PATCH `/admin/shuttle/cash-debts/:userId/collect` → resets balance to 0 | [UI] |
| Refresh | Refetches data | [UI] |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| Name | Passenger name | [DB] |
| Phone | Phone number | [DB] |
| Debt Amount (EGP) | Negative wallet balance | [DB] |
| # Offences | Count of cash rides with no payment | [DB] |
| Last Offence Date | Date | [DB] |
| Actions | Collect Debt button | [UI] |

### Status Labels
- No status badges; debt amount is displayed numerically
- "Debt collected" success toast → [UI]

### Classification
- **UI Translation keys needed:** Page title, column headers, "Collect Debt", "Debt collected", "Balance reset to 0 for user #X", KPI card titles
- **Database Fields:** `users.name`, `users.phone`, `users.wallet_balance`, `offences.count`, `offences.last_offence_at`

---

## 17. Bookings

**Route:** `/bookings`  
**Purpose:** Full list of all bookings across all trip types. Supports filtering, viewing, cancelling, refunding, and CSV export.

### UI Components
- Page header with Ticket icon
- KPI stat cards (Total, Confirmed, Completed, Cancelled, Revenue)
- Search bar + status filter + payment filter + date range
- Paginated bookings table
- Per-row dropdown action menu
- Booking Detail dialog
- Export CSV button

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Export CSV | `exportCSV()` — downloads bookings as CSV | [UI] |
| Cancel Booking | PATCH booking → cancelled | [UI] |
| Refund Booking | POST refund, PATCH paymentStatus → refunded | [UI] |
| View Details | Opens booking detail dialog | [UI] |
| Clear filters (×) | Resets all filters | [UI] |
| Previous / Next | Pagination | [UI] |

### Forms / Filters
| Filter | Type | Options |
|--------|------|---------|
| Search | Text | By user name/email/phone |
| Status | Select | All / Confirmed / Completed / Cancelled / Pending |
| Payment Status | Select | All / Paid / Pending / Refunded |
| Date From | Date | |
| Date To | Date | |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| ID | Booking ID | [DB] |
| User | Name + email + phone | [DB] |
| Trip | Route name, Origin → Destination, Departure date | [DB] |
| Seats | Count | [DB] |
| Total | EGP price | [DB] |
| Promo | Code if used | [DB] |
| Payment | Payment status badge | [UI] badge, [DB] value |
| Status | Booking status badge | [UI] badge, [DB] value |
| Created | Date | [DB] |
| Actions | View / Cancel / Refund dropdown | [UI] |

### Status Labels
| Status | Color |
|--------|-------|
| confirmed | Blue |
| completed | Green |
| cancelled | Red |
| pending | Amber |
| paid | Green |
| refunded | Purple |

All labels → [UI]; values → [DB]

### Classification
- **UI Translation keys needed:** `bookings.title`, `bookings.seats`, column headers, filter labels, status labels, action labels, "Export CSV", KPI card titles, dialog field labels
- **Database Fields:** `bookings.*`, `routes.name` (bilingual), `users.name`, `users.email`, `users.phone`, `promo_codes.code`, `trips.departure_time`

---

## 18. Buses

**Route:** `/buses`  
**Purpose:** Fleet management for shuttle buses. Two tabs: Bus List and Vehicle Catalog (for shuttle brand/model whitelist).

### UI Components
- Page header with Bus icon
- 2 tabs: "Bus Fleet" and "Vehicle Catalog"
- Bus Fleet: KPI cards + table + Add Bus button
- Vehicle Catalog: `VehicleCatalogTab` component (serviceType="shuttle")

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Add Bus | Opens create bus dialog | [UI] |
| Edit Bus | Opens edit dialog | [UI] |
| Delete Bus | AlertDialog confirmation → DELETE | [UI] |
| Toggle Active (Switch) | PATCH bus isActive | [UI] |
| Previous / Next | Pagination | [UI] |

### Forms & Inputs
**Create/Edit Bus Dialog**
| Field | Type | Validation |
|-------|------|------------|
| Plate Number | Text | Required |
| Model | Text | Required |
| Capacity | Number (integer) | ≥1 |
| Active | Switch | Optional, default true |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| Plate Number | Vehicle plate | [DB] |
| Model | Bus model name | [DB] |
| Capacity | Total seats | [DB] |
| Status | Active switch | [UI] label, [DB] isActive |
| Created | Date | [DB] |
| Actions | Edit / Delete | [UI] |

### Vehicle Catalog Tab (shuttle)
See [Vehicles page](#19-vehicles) for catalog structure. Filters to shuttle service type only.

### Status Labels
- **Active** (green switch on) → [UI] + [DB]
- **Inactive** (switch off) → [UI] + [DB]

### Classification
- **UI Translation keys needed:** `buses.title`, "Bus Fleet", "Vehicle Catalog", "Add Bus", form field labels, column headers, delete confirmation text
- **Database Fields:** `buses.plate_number`, `buses.model`, `buses.capacity`, `buses.is_active`

---

## 19. Vehicles

**Route:** `/vehicles`  
**Purpose:** Vehicle registry for ride-hailing service types. 3 service type tabs (Car, Motorcycle, Delivery). Each tab has a "Fleet List" subtab and a "Vehicle Catalog" subtab.

### UI Components
- 3 outer tabs: Cars, Motorcycles, Delivery Vehicles
- Each outer tab has 2 inner tabs: List + Catalog
- List view: KPI counts + vehicle table + Add Vehicle button
- Catalog view: `VehicleCatalogTab` component (scoped to service type)

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Add Vehicle | Opens create vehicle dialog | [UI] |
| Edit Vehicle | Opens edit dialog | [UI] |
| Delete Vehicle | AlertDialog → DELETE | [UI] |
| Bulk Import (in Catalog) | Opens bulk import dialog | [UI] |
| Add Brand (in Catalog) | Opens brand dialog | [UI] |
| Add Model (in Catalog) | Opens model dialog | [UI] |
| Add Color (in Catalog) | Opens color dialog | [UI] |
| Edit / Delete Brand/Model/Color | PATCH / DELETE | [UI] |

### Forms & Inputs
**Create/Edit Vehicle Dialog**
| Field | Type | Validation |
|-------|------|------------|
| Driver ID | Number | Required |
| License Plate | Text | Required |
| Brand | Select (from catalog) | Required |
| Model | Select (filtered by brand) | Required |
| Year | Number | 1990–current year |
| Color | Select (from catalog) | Required |
| Service Type | Auto-set from active tab | |
| Active | Switch | |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| Driver | Driver name | [DB] |
| Plate | License plate | [DB] |
| Brand / Model | Brand + model from catalog | [DB] |
| Year | Vehicle year | [DB] |
| Color | Color name | [DB] — needs `name_ar`/`name_en` |
| Status | Verified / Pending / Rejected / Suspended | [UI] badge, [DB] value |
| Actions | Edit / Delete | [UI] |

### Vehicle Catalog Sub-tab (per service type)
Structured as 3 sections:
1. **Approved Brands** — card grid; CRUD; Bulk Import button
2. **Models** (per brand) — table; CRUD
3. **Approved Colors** — card grid; CRUD

### Status Labels
- **Verified** (green), **Pending** (yellow), **Rejected** (red), **Suspended** (gray) → [UI]

### Classification
- **UI Translation keys needed:** Tab labels ("Cars", "Motorcycles", "Delivery"), "Add Vehicle", "Fleet List", "Vehicle Catalog", column headers, status labels, form field labels, catalog section titles ("Approved Brands", "Models", "Approved Colors")
- **Database Fields:** `vehicles.*`, `vehicle_brands.name` (needs `name_ar`/`name_en`), `vehicle_models.name` (needs `name_ar`/`name_en`), `vehicle_colors.name` (needs `name_ar`/`name_en`)

---

## 20. Live Tracking

**Route:** `/live-tracking`  
**Purpose:** Real-time map of all active drivers using MapLibre GL JS. WebSocket updates driver positions every few seconds.

### UI Components
- Page header with Radio icon
- KPI cards: Online Drivers, Active Trips, All Services count
- Search input for driver name filter
- Service type filter Select
- MapLibre map (full width) with driver marker pins
- Right-side driver panel (scrollable card list)
- Per-driver card with expanded detail on click

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Refresh | Manually refetches driver data | [UI] |
| Service filter | All Services / Shuttle / Car / Motorcycle / Delivery | [UI] |
| Search by driver name | Client-side filter | [UI] |
| Driver card click | Pans map to driver location; expands detail | [UI] |
| View Driver Profile | Navigate to `/drivers/:id` | [UI] |

### Driver Cards
| Field | Classification |
|-------|----------------|
| Driver name | [DB] |
| Status badge (Online/Offline/Busy) | [UI] badge, [DB] value |
| Vehicle type badge | [UI] badge, [DB] value |
| Current speed (km/h) | [DB] — real-time |
| Active trip ID + status | [DB] — real-time |
| Last updated (relative time) | [DB] — real-time |
| Assigned bus plate | [DB] |
| Rating | [DB] |

### Map Markers
- Green dot = Online driver with no active trip
- Amber dot = Online driver with active trip (busy)
- Gray dot = Offline driver

### Status Labels
- **Online** (green), **Offline** (slate), **Busy** (amber) → [UI]
- Service type pills: **Shuttle**, **Car**, **Motorcycle**, **Delivery** → [UI]

### Classification
- **UI Translation keys needed:** Page title, KPI card titles, "Refresh", service filter options, status badge labels, "View Driver Profile", "Last seen", "km/h", "No active drivers"
- **Database Fields:** `drivers.name`, `drivers.status`, `drivers.is_online`, `drivers.current_latitude`, `drivers.current_longitude`, `drivers.current_speed`, `drivers.vehicle_type`, `trips.status`

---

## 21. Finance Payouts

**Route:** `/finance/payouts`  
**Purpose:** View and manage driver payout records — filter by service type and payout status, sort columns, and confirm pending payouts.

### UI Components
- Page header with DollarSign icon
- KPI stat cards (Total Paid, Pending Payouts, Total Commission Collected, Total Drivers with Earnings)
- Status filter button group (All / Pending / Paid / No Earnings)
- Service type filter Select
- Sortable driver payout table
- "Confirm Payment" button per row

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Status filter tabs | All / Pending / Paid / No Earnings | [UI] |
| Service type filter | All Services / Car / Scooter / Delivery / Shuttle | [UI] |
| Sort column headers | Sorts by Trips / Gross / Commission / Driver Share | [UI] |
| Confirm Payment | PATCH payout → paid | [UI] |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| Driver | Name, phone, rating, last earning date | [DB] |
| Service Type | Car / Shuttle / etc. badge | [UI] badge, [DB] value |
| Trips | Total trip count | [DB] |
| Gross (EGP) | Total earnings before split | [DB] |
| Commission | Platform cut | [DB] |
| Driver Share | Net driver amount | [DB] |
| Status | Paid / Pending / No Earnings badge | [UI] badge, [DB] value |
| Actions | Confirm button | [UI] |

### Status Labels
- **Paid** (green with check icon) → [UI]
- **Pending** (amber with clock icon) → [UI]
- **No Earnings** (muted with ban icon) → [UI]

### Classification
- **UI Translation keys needed:** Page title, column headers, filter labels, status labels, "Confirm Payment", "All Services", KPI card titles
- **Database Fields:** `driver_earnings.driver_id`, `driver_earnings.gross_amount`, `driver_earnings.commission_amount`, `driver_earnings.driver_share`, `driver_earnings.payout_status`, `driver_earnings.service_type`, `drivers.name`, `drivers.rating`

---

## 22. Finance Commission

**Route:** `/finance/commission`  
**Purpose:** Configure platform-wide commission rates and payout schedule. View recent earnings history.

### UI Components
- Page header with Percent icon
- 4 KPI cards (App Commission %, Driver Share %, Payout Schedule, Min Payout)
- Settings card with Edit/Save/Cancel
- Recent Earnings history card with table

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Edit Settings | Enables form fields | [UI] |
| Save Changes | PATCH `/admin/settings/commission` | [UI] |
| Cancel | Reverts form to saved values | [UI] |
| Refresh | Refetches data | [UI] |

### Forms & Inputs
| Field | Type | Validation |
|-------|------|------------|
| App Commission (%) | Number | 0–100 |
| Driver Share (%) | Number | Auto = 100 - commission |
| Payout Schedule | Select | Daily / Weekly / Monthly |
| Minimum Payout (EGP) | Number | ≥0 |

### Recent Earnings Table
| Column | Content | Classification |
|--------|---------|----------------|
| ID | Earning record ID | [DB] |
| Driver ID | Linked driver | [DB] |
| Trip ID | Linked trip | [DB] |
| Amount | EGP | [DB] |
| Status | Paid / Pending badge | [UI] badge, [DB] value |
| Date | Formatted date | [DB] |

### Classification
- **UI Translation keys needed:** Page title, card titles "Commission Settings", "Payout Schedule", field labels, "Edit Settings", "Save Changes", "Cancel", payout schedule options ("Daily", "Weekly", "Monthly"), recent earnings table headers
- **Database Fields:** `commission_settings.app_commission`, `commission_settings.driver_share`, `commission_settings.payout_schedule`, `commission_settings.minimum_payout`, `driver_earnings.*`

---

## 23. Payments (Legacy)

**Route:** `/payments`  
**Purpose:** Combined view of driver earnings/payouts and commission settings (older consolidated version; partially superseded by `/finance/*` pages).

### UI Components
- Status filter button group
- Driver earnings table
- Commission settings panel (inline edit)

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Confirm Payment | Marks earnings as paid | [UI] |
| Edit (commission) | Enables commission edit mode | [UI] |
| Save Settings | PATCH commission settings | [UI] |
| Filter: All / Pending / Paid / No Earnings | Client-side filter | [UI] |

### Data Fields
Same as Finance Payouts + Finance Commission combined.

### Classification
- Same as sections 21 and 22 above.

---

## 24. Pricing

**Route:** `/pricing`  
**Purpose:** Configure fare rates per vehicle category, per zone, and surge pricing settings.

### UI Components
- 3 pricing sections with separate Edit/Save flows:
  1. **Base Fare Config** (Car, Scooter, Delivery) — 4 numeric fields each
  2. **Category-Based Pricing** (Economy, Economy Plus, Comfort) — tab per category
  3. **Zone-Based Pricing** — table with overrides per zone+vehicle type
- Surge Settings section with Switch toggle
- "Add Zone Price" button → dialog

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Edit (base fare) | Enables inline editing per vehicle type | [UI] |
| Save (base fare) | PATCH pricing config | [UI] |
| Add Zone Price | Opens add-zone-price dialog | [UI] |
| Edit Zone Price | Opens edit dialog | [UI] |
| Delete Zone Price | DELETE zone override | [UI] |
| Toggle Active (zone price) | PATCH isActive | [UI] |
| Enable Surge / Disable Surge | PATCH surge settings | [UI] |

### Forms & Inputs
**Per-Vehicle Base Fare Form**
| Field | Classification |
|-------|----------------|
| Base Fare (EGP) | [UI] label, [DB] value |
| Per Km Rate (EGP) | [UI] label, [DB] value |
| Per Minute Rate (EGP) | [UI] label, [DB] value |
| Minimum Fare (EGP) | [UI] label, [DB] value |

**Add Zone Price Dialog**
| Field | Type | Classification |
|-------|------|----------------|
| Zone | Select (zone list) | [UI] label, [DB] zone name |
| Vehicle Type | Select (Car/Scooter/Delivery) | [UI] |
| Base Fare | Number | [UI] label, [DB] value |
| Per Km Rate | Number | [UI] label, [DB] value |
| Minimum Fare | Number | [UI] label, [DB] value |

**Surge Settings**
| Field | Type | Classification |
|-------|------|----------------|
| Enable Surge Pricing | Switch | [UI] label, [DB] value |
| Multiplier | Number | [UI] label, [DB] value |
| Max Multiplier | Number | [UI] label, [DB] value |
| Active Hours Start/End | Time | [UI] label, [DB] value |
| Active Zones | Multi-select | [UI] label, [DB] zone IDs |
| Trigger Threshold | Number | [UI] label, [DB] value |

### Zone Pricing Table Columns
| Column | Classification |
|--------|----------------|
| Zone Name | [DB] — needs `name_ar`/`name_en` |
| Vehicle Type | [UI] |
| Base Fare | [DB] |
| Per Km Rate | [DB] |
| Min Fare | [DB] |
| Status | Active/Inactive toggle | [UI] + [DB] |
| Actions | Edit / Delete | [UI] |

### Classification
- **UI Translation keys needed:** Page title, section titles ("Base Fare Configuration", "Category Pricing", "Zone-Based Pricing", "Surge Settings"), vehicle type labels, field labels, "Add Zone Price", "Save Changes", "Edit", status toggle labels
- **Database Fields:** `pricing_configs.*`, `zone_pricing.*`, `surge_settings.*`, `zones.name` (needs `name_ar`/`name_en`)

---

## 25. Services

**Route:** `/services`  
**Purpose:** Control the operational state of each ride-hailing service type (Car, Motorcycle, Delivery, Shuttle). Supports display mode, zone restrictions, and live usage stats.

### UI Components
- 4 service cards (Car, Motorcycle/Scooter, Delivery, Shuttle)
- Per-service expanded panel: Status, Display Mode, Message, Active Zones, Settings, Changelog
- Live ride feed card (recent rides for selected service)
- Recent control log table

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Enable Service / Disable Service | PATCH service → isEnabled toggle | [UI] |
| Save Display Settings | PATCH displayMode + message | [UI] |
| Save Service Settings | PATCH minDriverRating + maxActiveRides | [UI] |
| Zone Toggle (per zone) | PATCH activeZoneIds | [UI] |
| Revert Changes | Resets unsaved form edits | [UI] |

### Forms & Inputs (Per Service)

**Display Settings**
| Field | Type | Options |
|-------|------|---------|
| Display Mode | Select | Live / Coming Soon / Unavailable / Maintenance |
| Unavailable Message | Textarea | Shown to passengers when not live |
| Unavailable Action | Select | None / Show Message / Hide Service |
| Maintenance ETA | Datetime | Optional |

**Operational Settings**
| Field | Type |
|-------|------|
| Min Driver Rating | Number (0–5) |
| Max Active Rides Per Driver | Number |
| Max Active Rides (total) | Number |

### Service Card Display
| Field | Classification |
|-------|----------------|
| Service Name (Car / Motorcycle / Delivery / Shuttle) | [UI] |
| Enabled / Disabled badge | [UI] badge, [DB] value |
| Display Mode badge | [UI] badge, [DB] value |
| Unavailable Message | [DB] — **needs `message_ar`/`message_en`** |
| Active Zone names | [DB] — zone names need bilingual |
| Total rides today | [DB] |
| Active rides now | [DB] |

### Status Labels
- **Enabled** (green), **Disabled** (red) → [UI]
- Display mode: **Live** (green), **Coming Soon** (blue), **Unavailable** (amber), **Maintenance** (red) → [UI]
- Unavailable action: **None**, **Show Message**, **Hide Service** → [UI]

### Classification
- **UI Translation keys needed:** Service names, section titles ("Display Settings", "Operational Settings", "Active Zones", "Control Log"), mode option labels, button labels, status badges
- **Database Fields:** `service_controls.is_enabled`, `service_controls.display_mode`, `service_controls.unavailable_message` (**add `unavailable_message_ar`**), `service_controls.maintenance_eta`, `service_controls.active_zone_ids`, `service_control_logs.*`

---

## 26. Service Zones

**Route:** `/service-zones`  
**Purpose:** Shows which service types (Car, Shuttle, Delivery) are enabled per geographic zone. Toggles per zone-service pair.

### UI Components
- Page header
- Service type filter tabs (All / Car / Shuttle / Delivery)
- Zone card list with service toggle switches

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Service type tab filter | Filters zone cards by service | [UI] |
| Service Toggle (Switch) | PATCH zone → enable/disable service | [UI] |

### Zone Card Fields
| Field | Classification |
|-------|----------------|
| Zone Name | [DB] — needs `name_ar`/`name_en` |
| Zone Description | [DB] — needs `description_ar`/`description_en` |
| Coordinates (lat/lng) | [DB] |
| Radius (km) | [DB] |
| Operational Status badge | [UI] label, [DB] isActive |
| Service toggle label | [UI] |

### Status Labels
- **Active** (green check), **Inactive** (alert icon) → [UI]
- **GIS Inactive** badge → [UI]

### Classification
- **UI Translation keys needed:** Page title, tab labels ("All", "Car", "Shuttle", "Delivery"), "Enable Service", "Disable Service", "Operational Status", status labels
- **Database Fields:** `zones.name` (bilingual), `zones.description` (bilingual), `zones.services[]`, `zones.is_active`, `zones.center_lat`, `zones.center_lng`, `zones.radius_km`

---

## 27. Zones

**Route:** `/zones`  
**Purpose:** Create and manage geographic service zones on an interactive Leaflet map. Zones are circular regions defined by center + radius.

### UI Components
- Leaflet map (full width) with circle overlays and center markers
- Right panel: zone list + create/edit form
- Radius slider
- Service checkboxes
- Active switch

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Add Zone | Shows create form, map enters placement mode | [UI] |
| Save Zone | POST zone | [UI] |
| Edit Zone | Opens edit form, highlights zone on map | [UI] |
| Delete Zone | AlertDialog → DELETE | [UI] |
| Cancel | Discards form changes | [UI] |
| Map click | Sets zone center coordinates | [UI] |

### Forms & Inputs
**Create/Edit Zone Form**
| Field | Type | Validation |
|-------|------|------------|
| Name | Text | Required |
| Description | Textarea | Optional |
| Center Latitude | Number (set by map click) | Required |
| Center Longitude | Number (set by map click) | Required |
| Radius (km) | Slider (0.5–50 km) | Required |
| Services | Checkboxes: Car / Shuttle / Delivery | Multi-select |
| Active | Switch | Default: true |

### Zone List (right panel)
| Field | Classification |
|-------|----------------|
| Zone name | [DB] — needs `name_ar`/`name_en` |
| Radius display | [DB] |
| Services icons (Car/Bus/Bike icons) | [UI] icons, [DB] services list |
| Active / Inactive badge | [UI] + [DB] |

### Classification
- **UI Translation keys needed:** Page title, "Add Zone", "Save Zone", "Edit Zone", "Delete Zone", form field labels, "Radius", service type labels, "Active", delete confirmation messages, "No zones configured"
- **Database Fields:** `zones.name` (needs `name_ar`/`name_en`), `zones.description` (needs bilingual), `zones.center_lat`, `zones.center_lng`, `zones.radius_km`, `zones.services`, `zones.is_active`

---

## 28. Ratings

**Route:** `/ratings`  
**Purpose:** View and manage passenger ratings submitted for drivers after rides/trips. Includes aggregate stats and per-rating delete.

### UI Components
- KPI stat cards (Average Score, Total Ratings, Ride count, Trip count)
- Score distribution bar chart (1–5 stars)
- Context filter (All / Ride / Trip) and score filter
- Paginated ratings table
- Delete confirmation dialog
- View detail dialog

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Filter by Context | All / Ride / Trip | [UI] |
| Filter by Score | All / 5 / 4 / 3 / 2 / 1 | [UI] |
| View Detail (Eye icon) | Opens rating detail dialog | [UI] |
| Delete Rating (Trash icon) | DELETE rating | [UI] |
| Previous / Next | Pagination | [UI] |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| Passenger | Name + email | [DB] |
| Driver | Name + phone + current rating | [DB] |
| Score | Star display (1–5) | [DB] |
| Context | Ride / Trip badge | [UI] badge, [DB] value |
| Comment | Truncated text | [DB] — needs bilingual if user-submitted in Arabic |
| Date | Formatted timestamp | [DB] |
| Actions | View / Delete | [UI] |

### Rating Stats
- Average score (displayed as numeric + stars)
- Distribution: count per score 1–5 as progress bars

### Classification
- **UI Translation keys needed:** Page title, KPI card titles ("Average Score", "Total Ratings", "Ride Ratings", "Trip Ratings"), filter option labels, column headers, "Delete Rating", "Are you sure?", context badge labels ("Ride", "Trip")
- **Database Fields:** `ratings.score`, `ratings.comment` (needs `comment_ar`/`comment_en` if input supports Arabic), `ratings.context`, `ratings.created_at`, `users.name`, `drivers.name`

---

## 29. Promo Codes

**Route:** `/promo`  
**Purpose:** Manage discount promo codes — create, edit, toggle active, and delete.

### UI Components
- Page header with Tags icon
- "Create Promo" button → dialog
- Paginated promo codes table
- Edit dialog (reuses create form)
- Delete confirmation

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Create Promo | Opens create dialog | [UI] |
| Edit (Pencil icon) | Opens edit dialog pre-filled | [UI] |
| Delete (Trash icon) | DELETE promo code | [UI] |
| Previous / Next | Pagination | [UI] |

### Forms & Inputs
**Create/Edit Promo Dialog**
| Field | Type | Validation |
|-------|------|------------|
| Code | Text (auto-uppercase) | Min 3 chars |
| Discount Type | Select: Percentage / Fixed | Required |
| Discount Value | Number | >0 |
| Expiry Date | Datetime-local | Optional |
| Max Usage | Number | Optional, ≥1 |
| Active | Select: Active / Disabled | Default: true |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| Code | Uppercase code with tag icon | [DB] |
| Discount | "X%" or "X EGP Fixed" | [DB] |
| Usage | Used / Max with progress bar | [DB] |
| Expiry | Date or "Never expires" | [DB] / [UI] "Never expires" |
| Status | Active / Expired / Depleted / Disabled | [UI] badge, derived from [DB] |
| Actions | Edit / Delete | [UI] |

### Status Labels
- **Active** (green) → [UI]
- **Expired** (red) → [UI]
- **Depleted** (orange) → [UI]
- **Disabled** (muted) → [UI]

### Classification
- **UI Translation keys needed:** Page title, "Create Promo", "Edit Promo", form field labels, discount type options ("Percentage", "Fixed"), "Never expires", status badge labels, column headers, "Code created", "Code updated", "Code deleted"
- **Database Fields:** `promo_codes.code`, `promo_codes.discount_type`, `promo_codes.discount_value`, `promo_codes.expiry_date`, `promo_codes.max_usage`, `promo_codes.used_count`, `promo_codes.is_active`

---

## 30. Notifications

**Route:** `/notifications`  
**Purpose:** Broadcast push notifications to user segments or specific users. View notification send history.

### UI Components
- 2-panel layout: Compose panel (left) + History panel (right)
- Compose: audience selector, conditional targeting fields, message form, preview card
- History: paginated notification list

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Send Notification | POST `/admin/notifications/broadcast` | [UI] |
| Target Select | All / Customers / Drivers / Specific User | [UI] |
| History item expand | Reveals full message body | [UI] |
| Previous / Next | Pagination | [UI] |

### Forms & Inputs (Compose Panel)
| Field | Type | Shown When | Classification |
|-------|------|-----------|----------------|
| Target Audience | Select | Always | [UI] |
| User Search | Autocomplete text | Target = "Specific User" | [UI] |
| Min Driver Rating | Number (0–5) | Target = "Drivers" | [UI] |
| Min Trip Count | Number | Target = "Customers" | [UI] |
| Include Blocked Users | Checkbox | Always | [UI] |
| Notification Title | Text | Always | [UI] |
| Message Body | Textarea | Always | [UI] |
| **Preview Card** | Renders title + body live | Always | [UI] |

### History List Columns
| Field | Classification |
|-------|----------------|
| Status dot (Read/Unread) | [UI] color, [DB] isRead |
| Notification Title | [DB] |
| Recipient Role badge | [UI] badge, [DB] user.role |
| Recipient Name / Email | [DB] |
| Date / Time | [DB] |
| Message body (expanded) | [DB] — **needs `title_ar`/`title_en`, `body_ar`/`body_en`** |

### Classification
- **UI Translation keys needed:** Page title, "Send Notification", "Compose Notification", "Notification History", target option labels ("All", "Customers", "Drivers", "Specific User"), field labels, "Include Blocked", "Preview", "Read", "Unread", "Sending..."
- **Database Fields:** `notifications.title` (**needs `title_ar`/`title_en`**), `notifications.body` (**needs `body_ar`/`body_en`**), `notifications.is_read`, `users.name`, `users.role`

---

## 31. Support

**Route:** `/support`  
**Purpose:** Customer support ticket management. View, filter, reply, and update ticket statuses.

### UI Components
- KPI cards (Total, Open, Pending, Resolved/Closed)
- Search bar + status/priority/type filters
- Paginated ticket list
- Ticket detail dialog (thread view + reply form + status updater)

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Open ticket row | Opens detail dialog | [UI] |
| Send Reply | POST reply message to ticket | [UI] |
| Update Status | PATCH ticket status | [UI] |
| Refresh | Refetches ticket list | [UI] |
| Previous / Next | Pagination | [UI] |

### Forms & Filters
| Filter | Options | Classification |
|--------|---------|----------------|
| Search | By subject | [UI] |
| Status | All / Open / Pending / Resolved / Closed | [UI] |
| Priority | All / Low / Medium / High | [UI] |
| Type | All / Passenger / Driver | [UI] |

**Reply Form (in dialog)**
| Field | Type | Classification |
|-------|------|----------------|
| Reply Text | Textarea | [UI] label |
| New Status | Select: Open / Pending / Resolved / Closed | [UI] |
| Send (button) | POST reply + PATCH status | [UI] |

### Ticket List Columns
| Column | Content | Classification |
|--------|---------|----------------|
| Subject | Ticket title | [DB] — needs bilingual if users write in Arabic |
| User / Driver | Name + email | [DB] |
| Status | Status badge | [UI] badge, [DB] value |
| Priority | Priority label (colored) | [UI] + [DB] |
| Type | Passenger / Driver badge | [UI] badge, [DB] value |
| Created | Date | [DB] |

### Detail Dialog
- Thread messages (admin / user / driver / system sender types)
- Sender type badge: **Admin** (blue), **Passenger** (green), **Driver** (slate), **System** (muted) → [UI]

### Status Labels
- Ticket status: **Open** (red), **Pending** (amber), **Resolved** (green outline), **Closed** (destructive) → [UI]
- Priority: **High** (red text), **Medium** (amber text), **Low** (muted) → [UI]
- Type: **Passenger** (blue), **Driver** (slate) → [UI]

### Classification
- **UI Translation keys needed:** `support.title`, `support.open`, `support.pending`, `support.resolved`, `support.closed`, priority labels, type labels, "Send Reply", "Update Status", column headers, sender type badges
- **Database Fields:** `tickets.subject`, `tickets.message`, `ticket_messages.message`, `tickets.status`, `tickets.priority`, `tickets.type` — subject and messages need bilingual support

---

## 32. Suggestions

**Route:** `/suggestions`  
**Purpose:** Community-submitted route/station suggestions from passengers and drivers. Admin reviews and approves or rejects.

### UI Components
- Page header with Lightbulb icon
- Search bar + status filter + type filter
- Paginated suggestion card/list
- Detail dialog with approve/reject actions and admin notes

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Approve | PATCH suggestion → approved | [UI] |
| Reject | PATCH suggestion → rejected + notes | [UI] |
| Clear search | Resets search + filters | [UI] |
| Previous / Next | Pagination | [UI] |

### Forms & Filters
| Filter | Options | Classification |
|--------|---------|----------------|
| Search | By title | [UI] |
| Status | All / Pending / Approved / Rejected | [UI] |
| Type | All / New Route / New Station / Route Edit | [UI] |

**Detail Dialog Fields**
| Field | Classification |
|-------|----------------|
| Admin Notes | Textarea | [UI] label, [DB] stored |
| Approve button | [UI] |
| Reject button | [UI] |

### Suggestion Card Fields
| Field | Classification |
|-------|----------------|
| Type badge (New Route / New Station / Route Edit) | [UI] badge, [DB] value |
| Title | [DB] — needs `title_ar`/`title_en` |
| Description | [DB] — needs bilingual |
| Start/End Location | [DB] — needs bilingual |
| Submitted by (user/driver name) | [DB] |
| Submitted date | [DB] |
| Status badge | [UI] badge, [DB] value |
| Admin Notes | [DB] |

### Status Labels
- **Pending** (amber), **Approved** (green), **Rejected** (red) → [UI]
- Type badges: **New Route** (blue), **New Station** (green), **Route Edit** (purple) → [UI]

### Classification
- **UI Translation keys needed:** Page title, filter option labels, type badge labels, status labels, "Approve", "Reject", "Admin Notes", "Submitted by", column/card field labels
- **Database Fields:** `suggestions.title` (bilingual), `suggestions.description` (bilingual), `suggestions.start_location` (bilingual), `suggestions.end_location` (bilingual), `suggestions.status`, `suggestions.admin_notes`, `suggestions.type`

---

## 33. Chat Inbox

**Route:** `/chat`  
**Purpose:** Real-time in-trip message inbox. Admin can monitor all trip conversations and send messages as admin.

### UI Components
- KPI header: Total Messages, Unread Messages, Active Conversations
- Left panel: conversation list (sorted by unread + recency)
- Right panel: message thread + admin reply input
- WebSocket integration for real-time message push

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Conversation click | Opens message thread | [UI] |
| Send (admin reply) | POST message with senderType="admin" | [UI] |
| Refresh | Refetches conversation list | [UI] |

### Conversation List Fields
| Field | Classification |
|-------|----------------|
| Trip Origin → Destination | [DB] |
| Passenger name | [DB] |
| Driver name | [DB] |
| Last message preview | [DB] |
| Last sender type badge (Passenger/Driver/Admin/System) | [UI] |
| Unread count badge | [DB] |
| Last message time | [DB] |

### Message Thread Fields
| Field | Classification |
|-------|----------------|
| Message text | [DB] — multilingual (users may write Arabic) |
| Sender type alignment (admin=right, others=left) | [UI] |
| Sender type badge | [UI] |
| Timestamp | [DB] |

### Admin Reply Input
| Field | Type | Classification |
|-------|------|----------------|
| Message text | Textarea | [UI] placeholder, [DB] stored |
| Send button | Button | [UI] |

### Classification
- **UI Translation keys needed:** Page title, KPI labels ("Total Messages", "Unread", "Conversations"), "Send", "No conversations", sender type labels, "Admin", "System"
- **Database Fields:** `trip_messages.message`, `trip_messages.sender_type`, `trip_messages.is_read`, `trips.from_location`, `trips.to_location`, `users.name`, `drivers.name`

---

## 34. Reports

**Route:** `/reports`  
**Purpose:** Comprehensive analytics dashboard with multiple sub-reports. Revenue, trips, drivers, users, promo, zones, ratings, and support analytics.

### UI Components
- Tab bar: Revenue / Trips / Drivers / Users / Promo / Zones / Ratings / Support
- Date range / period selectors per tab
- Recharts area/bar/line charts
- KPI cards per section
- Data tables with sortable columns
- Print / Export buttons

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Period selector | 7d / 30d / 90d / Custom | [UI] |
| Download / Print | Browser print / CSV export | [UI] |
| Tab navigation | Switches report section | [UI] |

### Report Tabs & Their Data

**Revenue Tab**
- KPIs: Total Revenue, Total Bookings, Driver Paid, Estimated Commission
- Chart: Revenue + Bookings per day (area + bar combo)
- Fields: `totalRevenue`, `totalBookings`, `totalDriverPaid`, `estimatedCommission`, `commissionRate`, `driverShareRate`

**Trips Tab**
- KPIs: Total Trips, Completed, Cancelled, Active, Scheduled
- Chart: Daily bookings stacked bar
- Chart: Peak hours bar chart (0–23h buckets)

**Drivers Tab**
- KPIs: Total Drivers, Online, Avg Rating, Total Earnings Paid
- Tables: Top by Revenue / Top by Trips / Top by Rating / Most Cancellations
- Columns: Driver Name, Rating, Status, Total Earnings, Trip Count

**Users Tab**
- KPIs: Total Users, Passengers, Drivers, Admins
- Chart: New user growth over time

**Promo Tab**
- Table: Code, Discount, Used/Max, Revenue Impact

**Zones Tab**
- Table: Zone Name, Active Services, Bookings count

**Ratings Tab**
- KPIs: Avg Score, Distribution
- Chart: Score distribution bar chart

**Support Tab**
- KPIs: Total Tickets, Open, Resolved, Avg Resolution Time
- Chart: Tickets by status over time

### Classification
- **UI Translation keys needed:** All tab names, all KPI card titles, chart axis labels, chart legend labels, "Download", "Print", "Period", all time period options, table column headers, all section titles
- **Database Fields:** All analytics are aggregated from `bookings`, `trips`, `drivers`, `users`, `promo_codes`, `zones`, `ratings`, `tickets`; no bilingual needed for numeric data; driver/zone names should be bilingual

---

## 35. Wallet

**Route:** `/wallet`  
**Purpose:** View all wallet transactions across the platform. Issue manual refunds or credits to users.

### UI Components
- Page header with Wallet icon
- "Issue Refund / Credit" button → dialog
- Filter bar: user ID, type, date range, search
- Paginated transaction table
- Summary stat cards (Total Deposited, Total Payments, Total Refunds)

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Issue Refund / Credit | Opens refund dialog | [UI] |
| Clear Filters | Resets all filters | [UI] |
| Previous / Next | Pagination | [UI] |

### Forms & Inputs
**Issue Refund Dialog**
| Field | Type | Validation |
|-------|------|------------|
| User ID | Number | Required, ≥1 |
| Amount (EGP) | Number | Required, >0 |
| Reason / Description | Text | Required |

**Filter Bar**
| Filter | Type | Classification |
|--------|------|----------------|
| User ID | Number input | [UI] |
| Transaction Type | Select: All / Deposit / Payment / Refund | [UI] |
| Date From | Date | [UI] |
| Date To | Date | [UI] |
| Search | Text (name/email) | [UI] |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| ID | Transaction ID | [DB] |
| User | Name + email | [DB] |
| Type | deposit / payment / refund badge | [UI] badge, [DB] value |
| Amount | EGP (green=deposit, red=payment/refund) | [DB] |
| Description | Reason text | [DB] — needs bilingual if admin-entered in Arabic |
| Date | Formatted timestamp | [DB] |

### Status Labels / Type Badges
- **Deposit** (blue), **Payment** (red), **Refund** (purple) → [UI]

### Classification
- **UI Translation keys needed:** Page title, "Issue Refund / Credit", form field labels, type filter options, column headers, type badge labels, "Wallet adjusted successfully", "Failed to adjust"
- **Database Fields:** `wallet_transactions.type`, `wallet_transactions.amount`, `wallet_transactions.description` (consider bilingual), `wallet_transactions.created_at`, `users.name`, `users.email`

---

## 36. Staff & Roles

**Route:** `/settings` (Staff tab) or embedded in Settings  
**Purpose:** Manage admin/staff user accounts and define role-based permission sets.

### UI Components
- 2 tabs: "Staff Members" and "Roles"
- Staff Members: paginated table + invite/create dialog
- Roles: role list + create/edit role dialog with granular permission checkboxes

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Invite Staff | Opens create staff dialog | [UI] |
| Edit Staff | Opens edit dialog | [UI] |
| Delete Staff | DELETE staff account | [UI] |
| Reset Password | PATCH sends reset | [UI] |
| Create Role | Opens role dialog | [UI] |
| Edit Role | Opens role edit dialog | [UI] |
| Delete Role | DELETE role | [UI] |
| Toggle permission (Switch) | Enables/disables individual permission | [UI] |

### Forms & Inputs

**Create/Edit Staff Dialog**
| Field | Type | Classification |
|-------|------|----------------|
| Name | Text | [UI] label, [DB] value |
| Email | Email | [UI] label, [DB] value |
| Password | Password (create only) | [UI] label |
| Role | Select (from roles list) | [UI] label, [DB] value |
| Active | Switch | [UI] label, [DB] value |

**Create/Edit Role Dialog**
| Field | Type | Classification |
|-------|------|----------------|
| Role Name | Text | [UI] label, [DB] value |
| Permissions | Checkbox groups by category | [UI] labels |

### Permission Groups & Keys (all [UI] labels)
| Group | Permissions |
|-------|-------------|
| Dashboard | view_dashboard |
| Operations | view_routes, edit_routes, view_trips, edit_trips, view_drivers, edit_drivers, view_buses, edit_buses, view_live_tracking, view_driver_analytics |
| Customers | view_passengers, edit_passengers, view_bookings, edit_bookings, view_wallet, edit_wallet, view_promo, edit_promo |
| Support | view_support, edit_support, view_suggestions, view_verification, edit_verification |
| System | view_analytics, view_staff, edit_staff, view_notifications, view_settings, edit_settings, view_fraud_alerts, view_audit_logs, view_finance |

### Staff Table Columns
| Column | Classification |
|--------|----------------|
| Name | [DB] |
| Email | [DB] |
| Role | [DB] — role name needs `name_ar`/`name_en` |
| Status | Active / Inactive badge | [UI] + [DB] |
| Last Login | [DB] |
| Actions | Edit / Delete / Reset Password | [UI] |

### Classification
- **UI Translation keys needed:** Tab labels, "Staff Members", "Roles", "Invite Staff", "Create Role", all permission labels (all `staff.perm*` keys), column headers, "Active", "Inactive", dialog field labels, permission group names
- **Database Fields:** `staff_users.name`, `staff_users.email`, `staff_users.is_active`, `staff_roles.name` (needs `name_ar`/`name_en`), `staff_roles.permissions[]`

---

## 37. Settings

**Route:** `/settings`  
**Purpose:** System-wide configuration. 4 tabs: General (language/theme/notifications), App Info (public contacts/links), Staff, System Engine.

### UI Components
- 4 tabs: General / App Info / Staff / System Engine
- Language selector (cards for English / Arabic)
- Theme selector (Light / Dark / System)
- Notification preference switches
- App Info form (text inputs)
- System Engine numeric settings

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Select Language (EN/AR) | `i18n.changeLanguage()` + RTL toggle | [UI] |
| Theme cards (Light/Dark/System) | `setTheme()` | [UI] |
| Save App Info | PUT `/admin/settings/app` | [UI] |
| Save System Engine | PATCH system settings | [UI] |
| Sign Out | Clears auth token, redirects to login | [UI] |

### Forms & Inputs

**General Tab**
| Field | Type | Classification |
|-------|------|----------------|
| Language | Card select: English / Arabic | [UI] |
| Theme | Card select: Light / Dark / System | [UI] |
| New Bookings notifications | Switch | [UI] label |
| Trip Status notifications | Switch | [UI] label |
| Driver Activity notifications | Switch | [UI] label |
| Support Tickets notifications | Switch | [UI] label |
| Driver Verification notifications | Switch | [UI] label |

**App Info Tab**
| Field | Classification |
|-------|----------------|
| App Name | [UI] label, [DB] value |
| Support Email | [UI] label, [DB] value |
| Support Phone | [UI] label, [DB] value |
| Facebook URL | [UI] label, [DB] value |
| Twitter URL | [UI] label, [DB] value |
| Instagram URL | [UI] label, [DB] value |
| Privacy Policy URL | [UI] label, [DB] value |
| Terms & Conditions URL | [UI] label, [DB] value |

**System Engine Tab**
| Field | Description | Classification |
|-------|-------------|----------------|
| Dispatch Radius (km) | Max distance for driver-ride matching | [UI] label, [DB] value |
| Max Radius (km) | Hard cap on dispatch radius | [UI] label, [DB] value |
| Offer Timeout (s) | Seconds before offer expires to driver | [UI] label, [DB] value |
| No-Show Fee (EGP) | Fee charged for passenger no-show | [UI] label, [DB] value |
| Cancellation Window (min) | Free cancel window after booking | [UI] label, [DB] value |
| Max Wallet Top-Up (EGP) | Per-transaction top-up limit | [UI] label, [DB] value |
| Daily Top-Up Limit (EGP) | Daily wallet recharge cap | [UI] label, [DB] value |

### Status Labels
- Theme: **Light** / **Dark** / **System** → [UI]
- Language: **English** / **Arabic** → [UI]
- Notification switches: On/Off → [UI]

### Classification
- **UI Translation keys needed:** `settings.tabGeneral`, `settings.tabAppInfo`, `settings.tabStaff`, all section titles, language option labels, theme option labels, all notification switch labels, all form field labels, "Save Changes", "Sign Out", "System Engine"
- **Database Fields:** `app_settings.app_name`, `app_settings.support_email`, `app_settings.support_phone`, `app_settings.*_url`, `system_settings.*` (all engine parameters)

---

## 38. Fraud Alerts

**Route:** `/fraud-alerts`  
**Purpose:** Detects and resolves potential duplicate driver registrations (e.g., same National ID, phone, or document submitted under two accounts).

### UI Components
- Page header with ShieldAlert icon
- KPI: Unresolved alerts count (badge)
- Status filter (Unresolved / Resolved / All)
- Real-time count from WebSocket
- Paginated alerts table
- Resolve dialog with notes field

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Resolve Alert | Opens resolve dialog | [UI] |
| Confirm Resolve | PATCH alert → resolved + notes | [UI] |
| Status filter | Unresolved / Resolved / All | [UI] |
| Refresh | Refetches alerts | [UI] |
| View Driver (ExternalLink) | Navigate to `/drivers/:id` | [UI] |
| Previous / Next | Pagination | [UI] |

### Forms & Inputs
**Resolve Dialog**
| Field | Type | Classification |
|-------|------|----------------|
| Resolution Notes | Textarea | [UI] label, [DB] stored |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| New Driver | Name + link to profile | [DB] |
| Existing Driver | Name + link to profile | [DB] |
| Match Type | "phone" / "national_id" / "document" | [DB] — should be [UI] mapped |
| Status | Resolved / Unresolved badge | [UI] + [DB] |
| Resolved By | Admin name | [DB] |
| Notes | Resolution notes | [DB] |
| Date Detected | Formatted date | [DB] |
| Actions | Resolve button (if unresolved) | [UI] |

### Status Labels
- **Unresolved** (red/amber) → [UI]
- **Resolved** (green) → [UI]
- Match type display values: **Duplicate Phone**, **Duplicate National ID**, **Duplicate Document** → [UI]

### Classification
- **UI Translation keys needed:** Page title, "Unresolved Alerts", "Resolve Alert", "Confirm Resolve", "Resolution Notes", filter labels, column headers, match type display labels, status labels
- **Database Fields:** `duplicate_alerts.match_type`, `duplicate_alerts.notes`, `duplicate_alerts.resolved_at`, `duplicate_alerts.resolved_by`, `drivers.name`

---

## 39. Audit Logs

**Route:** `/audit-logs`  
**Purpose:** Immutable log of all admin actions on the system. Filter by action type, entity type, and paginate.

### UI Components
- Page header with Shield icon
- Filter bar: Action type + Entity type
- Paginated audit log table
- Log detail dialog (shows old data → new data diff)
- Refresh button

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Action filter | CREATE / UPDATE / DELETE / (All) | [UI] |
| Entity type filter | user / driver / trip / route / etc. | [UI] |
| Refresh | Refetches page 1 | [UI] |
| View Detail (Eye icon) | Opens diff dialog | [UI] |
| Previous / Next | Pagination | [UI] |

### Filter Inputs
| Filter | Type | Classification |
|--------|------|----------------|
| Action | Select: All / CREATE / UPDATE / DELETE | [UI] |
| Entity Type | Select: All / user / driver / trip / route / booking / etc. | [UI] |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| Action | CREATE / UPDATE / DELETE badge | [UI] badge, [DB] value |
| Entity Type | Entity name | [DB] — could be [UI] mapped |
| Entity ID | Integer | [DB] |
| Admin | Name + email | [DB] |
| IP Address | Client IP | [DB] |
| Date / Time | Formatted timestamp | [DB] |
| Actions | View Detail | [UI] |

### Detail Dialog
- Shows old data (JSON) → new data (JSON) in a scrollable code block
- User Agent string

### Action Badge Colors
- **CREATE** (green) → [UI]
- **UPDATE** (blue) → [UI]
- **DELETE** (red) → [UI]

### Classification
- **UI Translation keys needed:** Page title, "Audit Logs", filter labels, column headers, action badge labels, "View Detail", "Old Data", "New Data", "IP Address", "User Agent"
- **Database Fields:** `audit_logs.action`, `audit_logs.entity_type`, `audit_logs.entity_id`, `audit_logs.old_data`, `audit_logs.new_data`, `audit_logs.ip_address`, `audit_logs.user_agent`, `audit_logs.created_at`, linked `admin.name`, `admin.email`

---

## 40. Bonus Targets

**Route:** `/bonus-targets`  
**Purpose:** Create incentive campaigns for drivers. Drivers earn a bonus if they complete a certain number of rides or reach an earnings threshold within a time window.

### UI Components
- Page header with Trophy icon
- KPI cards (Total Campaigns, Active, Upcoming, Completed)
- "New Campaign" button → dialog
- Campaign card list with progress indicators
- Driver progress panel (expandable per campaign)
- Delete/Edit per campaign

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| New Campaign | Opens create dialog | [UI] |
| Edit Campaign | Opens edit dialog | [UI] |
| Delete Campaign | AlertDialog → DELETE | [UI] |
| Toggle Active | PATCH isActive | [UI] |
| View Progress (ChevronRight) | Expands driver progress list | [UI] |

### Forms & Inputs
**Create/Edit Campaign Dialog**
| Field | Type | Validation |
|-------|------|------------|
| Campaign Name | Text | Required |
| Description | Textarea | Optional |
| Service Type | Select: All / Car / Shuttle / Delivery / Motorcycle | Required |
| Target Type | Select: Ride Count / Earnings Amount | Required |
| Target Value | Number | Required, >0 |
| Bonus Amount (EGP) | Number | Required, >0 |
| Start Date | Datetime | Required |
| End Date | Datetime | Required |
| Active | Switch | Default: true |

### Campaign Card Fields
| Field | Classification |
|-------|----------------|
| Campaign Name | [DB] — needs `name_ar`/`name_en` |
| Description | [DB] — needs bilingual |
| Service Type badge | [UI] badge, [DB] value |
| Target Type badge | [UI] label (Ride Count / Earnings Amount), [DB] value |
| Target Value | [DB] |
| Bonus Amount | [DB] |
| Date range | [DB] |
| Enrolled drivers count | [DB] |
| Completed drivers count | [DB] |
| Status badge (Active/Upcoming/Completed/Disabled) | [UI] |

### Driver Progress (per campaign)
| Field | Classification |
|-------|----------------|
| Driver Name | [DB] |
| Current Value / Target Value | [DB] |
| Progress bar % | Calculated [DB] |
| Completed badge | [UI] |

### Status Labels
- **Active** (green), **Upcoming** (blue), **Completed** (slate), **Disabled** (muted) → [UI]
- Target type: **Ride Count** (ride icon), **Earnings Amount** (money icon) → [UI]

### Classification
- **UI Translation keys needed:** Page title, "New Campaign", form field labels, service type options, target type options, KPI card titles, status labels, "Enrolled", "Completed", "Progress", driver progress table headers
- **Database Fields:** `bonus_targets.name` (needs `name_ar`/`name_en`), `bonus_targets.description` (bilingual), `bonus_targets.service_type`, `bonus_targets.target_type`, `bonus_targets.target_value`, `bonus_targets.bonus_amount`, `bonus_targets.starts_at`, `bonus_targets.ends_at`, `bonus_targets.is_active`, `driver_bonus_progress.*`

---

## 41. Commission Exemptions

**Route:** `/commission-exemptions`  
**Purpose:** Grant individual drivers temporary exemptions from platform commission (e.g., new driver onboarding promotions or dispute resolutions).

### UI Components
- Page header with Percent icon
- "Add Exemption" button → dialog
- Paginated exemption table
- Edit / Delete per row
- Driver search autocomplete

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Add Exemption | Opens create dialog | [UI] |
| Edit Exemption | Opens edit dialog | [UI] |
| Delete Exemption | AlertDialog → DELETE | [UI] |
| Driver profile link | Navigate to `/drivers/:id` | [UI] |
| Previous / Next | Pagination | [UI] |

### Forms & Inputs
**Create/Edit Exemption Dialog**
| Field | Type | Validation |
|-------|------|------------|
| Driver | Search + Select (autocomplete) | Required |
| Start Date | Datetime | Required |
| End Date | Datetime | Required, after start |
| Reason | Textarea | Optional |
| Active | Switch | Default: true |

### Table Columns
| Column | Content | Classification |
|--------|---------|----------------|
| Driver | Name + phone + profile link | [DB] |
| Start Date | Formatted date | [DB] |
| End Date | Formatted date | [DB] |
| Reason | Short text | [DB] |
| Status | Active / Future / Expired / Disabled badge | [UI] badge, derived from [DB] |
| Created | Date | [DB] |
| Actions | Edit / Delete | [UI] |

### Status Labels
| Derived Status | Condition | Color |
|----------------|-----------|-------|
| **Active** | now between start and end, isActive=true | Green |
| **Future** | now before start, isActive=true | Blue |
| **Expired** | now after end, isActive=true | Slate |
| **Disabled** | isActive=false | Muted |

All → [UI] labels

### Classification
- **UI Translation keys needed:** Page title, "Add Exemption", form field labels, status labels, column headers, "Driver Exemption", dialog titles, delete confirmation text
- **Database Fields:** `commission_exemptions.driver_id`, `commission_exemptions.starts_at`, `commission_exemptions.ends_at`, `commission_exemptions.reason`, `commission_exemptions.is_active`, `drivers.name`, `drivers.phone`

---

## 42. Not Found (404)

**Route:** `*` (wildcard catch-all)  
**Purpose:** Displayed when a user navigates to a route that doesn't exist.

### UI Components
- Centered message
- "Go back home" / "Return to Dashboard" link

### Buttons & Actions
| Button | Action | Classification |
|--------|--------|----------------|
| Return to Dashboard | Navigate to `/` | [UI] |

### Classification
- **UI Translation keys needed:** "404", "Page Not Found", "The page you're looking for doesn't exist.", "Return to Dashboard"
- **Database Fields:** None

---

---

# Summary

## All UI Translation Keys Needed

The following i18n namespace structure is recommended:

### `auth.*`
```
auth.welcomeBack, auth.loggedIn, auth.loginFailed, auth.checkCredentials
```

### `nav.*`
```
nav.dashboard, nav.drivers, nav.users, nav.trips, nav.routes, nav.schedules,
nav.shuttle, nav.bookings, nav.buses, nav.vehicles, nav.liveTracking,
nav.finance, nav.payouts, nav.commission, nav.pricing, nav.services,
nav.serviceZones, nav.zones, nav.ratings, nav.promo, nav.notifications,
nav.support, nav.suggestions, nav.chat, nav.reports, nav.wallet,
nav.staff, nav.settings, nav.fraudAlerts, nav.auditLogs,
nav.bonusTargets, nav.commissionExemptions, nav.live
```

### `common.*`
```
common.refresh, common.viewAll, common.total, common.verified, common.status,
common.phone, common.none, common.clear, common.save, common.cancel,
common.edit, common.delete, common.create, common.search, common.filter,
common.loading, common.noData, common.confirm, common.back, common.actions,
common.date, common.name, common.email, common.id, common.active,
common.inactive, common.enabled, common.disabled, common.all, common.export
```

### `dashboard.*`
```
dashboard.subtitle, dashboard.totalTripsToday, dashboard.revenueToday,
dashboard.driversOnline, dashboard.passengersOnline, dashboard.vsYesterday,
dashboard.activeTrips, dashboard.upcomingDepartures, dashboard.supportTickets,
dashboard.liveNetworkMap, dashboard.noActiveTripsNow, dashboard.noRecentBookings,
dashboard.noUpcomingDepartures, dashboard.noRecentTickets, dashboard.scheduled
```

### `drivers.*`
```
drivers.title, drivers.subtitle, drivers.totalDrivers, drivers.onDuty,
drivers.offDuty, drivers.addDriver, drivers.registerDriver, drivers.linkedUserId,
drivers.internalUserId, drivers.fullName, drivers.assignBus, drivers.selectBus,
drivers.searchDrivers, drivers.allStatuses, drivers.unassigned, drivers.viewProfile,
drivers.noDrivers, drivers.rating, drivers.assignment, drivers.driverAdded
```

### `users.*`
```
users.title, users.statusUpdated, users.searchPlaceholder, users.blockUser,
users.unblockUser, users.viewProfile, users.adjustWallet, users.noUsers
```

### `trips.*`
```
trips.title, trips.scheduleTrip, trips.cancelTrip, trips.duplicateTrip,
trips.deleteTrip, trips.editTrip, trips.status.open, trips.status.active,
trips.status.boarding, trips.status.completed, trips.status.cancelled,
trips.recurring.oneTime, trips.recurring.daily, trips.recurring.weekdays,
trips.recurring.weekends, trips.recurring.custom
```

### `routes.*`
```
routes.title, routes.addRoute, routes.active, routes.inactive,
routes.origin, routes.destination, routes.duration, routes.basePrice
```

### `bookings.*`
```
bookings.title, bookings.seats, bookings.status.confirmed, bookings.status.completed,
bookings.status.cancelled, bookings.status.pending, bookings.payment.paid,
bookings.payment.pending, bookings.payment.refunded
```

### `support.*`
```
support.title, support.open, support.pending, support.resolved, support.closed,
support.priority.low, support.priority.medium, support.priority.high,
support.type.passenger, support.type.driver
```

### `settings.*`
```
settings.tabGeneral, settings.tabAppInfo, settings.tabStaff,
settings.tabSystemEngine, settings.language, settings.theme,
settings.notifications, settings.signOut
```

### `staff.*`
All 30+ `staff.perm*` permission label keys (see page 36 above).

### `suggestions.*`
```
suggestions.newRoute, suggestions.newStation, suggestions.routeEdit,
suggestions.pending, suggestions.approved, suggestions.rejected
```

---

## All Database Tables / Entities Requiring Bilingual Support

The following fields **must have Arabic (`_ar`) and English (`_en`) variants** for proper localization:

| Table | Fields needing bilingual |
|-------|--------------------------|
| `routes` | `name`, `from_location`, `to_location` |
| `stations` | `name` |
| `zones` | `name`, `description` |
| `vehicle_brands` | `name` |
| `vehicle_models` | `name` |
| `vehicle_colors` | `name` |
| `service_controls` | `unavailable_message` |
| `notifications` | `title`, `body` |
| `bonus_targets` | `name`, `description` |
| `suggestions` | `title`, `description`, `start_location`, `end_location` |
| `staff_roles` | `name` |
| `saved_locations` | `label` |
| `support_tickets` | `subject`, `message` *(if passengers write in Arabic)* |
| `ratings` | `comment` *(if passengers write in Arabic)* |

---

## Suggestions for Improving the Localization Structure

### 1. Adopt a Consistent Bilingual Pattern
All user-facing content stored in the database should follow the pattern:
```sql
name_en TEXT NOT NULL,
name_ar TEXT,
```
The API should return the correct field based on the `Accept-Language` header or an explicit `lang` query parameter.

### 2. Create a Centralized Translation File
Currently some strings use `t()` keys while others are still hardcoded in English (e.g., login form labels "Email / Phone", "Password", "Sign In"; shuttle offence action labels; cash debt page titles). A full i18n audit sweep is needed to move all hardcoded strings into translation files.

### 3. RTL Layout Support
The Settings page already implements Arabic language switching with `applyDirection()`. Ensure all page layouts use logical CSS properties (`start/end` instead of `left/right`) for full RTL support. Check Tailwind classes like `pl-`, `pr-`, `ml-`, `mr-` throughout the codebase and replace with `ps-`, `pe-`, `ms-`, `me-`.

### 4. Status Enum Translation
Status values such as `"scheduled"`, `"active"`, `"completed"`, `"cancelled"` are stored as English strings in the DB and rendered directly in some places. Create a translation mapping for each status so they display in the correct language in the UI:
```ts
// Example
t(`trips.status.${trip.status}`)  // instead of rendering trip.status directly
```

### 5. Currency and Number Formatting
The app currently formats currency as `X EGP` or `$X`. In Arabic locale, the currency symbol position and number formatting (Eastern Arabic numerals vs. Western) should be handled by `Intl.NumberFormat` with the locale set dynamically.

### 6. Date/Time Localization
`date-fns` format strings like `"EEEE, MMMM d yyyy"` will render in English only. Import `date-fns/locale/ar` and pass `{ locale: arLocale }` to all `format()` calls when the dashboard is in Arabic mode.

### 7. Notification Content Pipeline
Push notification titles and bodies are composed and sent by the admin. Both `title` and `body` should be authored in both languages at send time (or a translation service used), storing `title_ar`/`title_en` and `body_ar`/`body_en` in the `notifications` table.

### 8. Admin-Written Content
Several free-text admin fields are user-visible (e.g., `service_controls.unavailable_message`, `suggestions.admin_notes`, `commission_exemptions.reason`). The UI should offer bilingual input for fields that passengers will see, while internal notes can remain English-only.
