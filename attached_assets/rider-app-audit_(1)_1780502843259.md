# Rider App — Backend Contract Audit

**Source of truth:** `attached_assets/backend-contract_1780473845041.md`  
**Audit scope:** All API calls, WebSocket event handling, and data shape assumptions in the rider mobile app.  
**Date:** 2025-01-31

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| 🔴 **Critical** | Will cause a runtime failure or silent data corruption in production. Feature completely broken. |
| 🟠 **High** | Wrong field names / missing required fields / wrong status values. Feature partially or intermittently broken. |
| 🟡 **Medium** | Minor field mismatches, extra fields sent that backend ignores, or cosmetic handling of wrong values. |
| 🔵 **Low / Info** | Hardcoded mock data never reaching the API, unused fields, or items to be aware of. |

---

## Summary Table

| # | File(s) | Mismatch | Severity |
|---|---------|----------|----------|
| 1 | `src/hooks/useWallet.ts` | `GET /wallet` → contract is `GET /wallet/balance` | 🔴 |
| 2 | `src/hooks/useRoutes.ts`, `src/hooks/useTrips.ts` | `GET /shuttle/lines` → does not exist in contract | 🔴 |
| 3 | `src/hooks/useRideChat.ts` | `GET/POST /trips/:id/chat` endpoints not in contract | 🔴 |
| 4 | `src/hooks/usePushToken.ts` | `POST /users/me/push-token` not in contract | 🔴 |
| 5 | `app/auth.tsx` (login) | Sends `{ credential, password }` → contract requires `{ email, password }` | 🔴 |
| 6 | `app/auth.tsx` (forgot-password) | `POST /auth/forgot-password` not in contract | 🔴 |
| 7 | `src/api/client.ts` (token refresh) | `POST /auth/refresh` not in contract | 🔴 |
| 8 | `app/(tabs)/car.tsx` (rating) | `POST /rides/:id/rate-driver` → contract is `POST /rides/:id/rate` | 🔴 |
| 9 | `src/api/socket.ts` | `ride:arrived` event → contract emits `ride:driver_arrived` | 🟠 |
| 10 | `app/trip-tracking.tsx` | Listens to `ride:arrived` → contract emits `ride:driver_arrived` | 🟠 |
| 11 | `src/api/socket.ts` | `ride:driver_assigned` payload expects `driver.vehicle` (string) and `eta`; contract payload only has `driver: { id, name, phone, location }` | 🟠 |
| 12 | `src/hooks/usePromos.ts` | `GET /promo` (singular) → contract is `GET /promos` (plural) | 🟠 |
| 13 | `src/hooks/usePromos.ts` | `validateCode` sends `{ code }` only → contract requires `{ code, amount }` | 🟠 |
| 14 | `app/support.tsx` | `type` field sent as `'passenger'\|'driver'` → contract enum is `'general'\|'billing'\|'technical'\|'driver'\|'ride'` | 🟠 |
| 15 | `app/(tabs)/profile.tsx`, `src/hooks/useProfile.ts` | Sends and reads `dob` field → not in contract `GET /users/me` response or `PATCH /users/me` body | 🟠 |
| 16 | `app/(tabs)/car.tsx` | `rideState.status === 'driver_en_route'` → not a valid contract status value | 🟠 |
| 17 | `app/(tabs)/car.tsx` | `rideState.driver.vehicle` displayed — not in `ride:driver_assigned` payload per contract | 🟠 |
| 18 | `src/api/socket.ts` | `booking:boarded` payload expects `{ bookingId, timestamp }` → contract emits `{ bookingId, tripId, timestamp }` | 🟡 |
| 19 | `src/api/socket.ts`, `app/notifications.tsx` | `notification:new` payload: app expects `{ id, category, title, body, time }` → contract sends `{ id, title, body, type, createdAt }` | 🟡 |
| 20 | `constants/data.ts` | `Notification` type uses `category` and `time` fields → contract field names are `type` and `createdAt` | 🟡 |
| 21 | `src/hooks/useRide.ts` | `requestRide` payload includes `notes` field → not in contract request body | 🟡 |
| 22 | `app/auth.tsx` (register) | Enforces `password.length >= 8` → contract specifies minimum 6 characters | 🟡 |
| 23 | `app/(tabs)/trips.tsx` | `PATCH /shuttle/bookings/:id/cancel` → contract uses `DELETE /shuttle/bookings/:id` | 🟡 |
| 24 | `app/stations.tsx` | `GET /shuttle/stations` → contract does not document this endpoint | 🟡 |
| 25 | `src/hooks/useRideChat.ts` | `trip:chat:message` socket event → not in contract WebSocket events | 🟡 |
| 26 | `app/(tabs)/favorites.tsx` | Shuttle favorites sourced from `constants/data` (static) — never calls API | 🔵 |
| 27 | `app/(tabs)/index.tsx`, `app/(tabs)/routes.tsx` | Location search uses `MOCK_LOCATIONS` hardcoded array, not `GET /suggestions` | 🔵 |
| 28 | `app/(tabs)/profile.tsx` | Payment methods (cards) are fully mocked — no API calls to any payment endpoint | 🔵 |

---

## 🔴 Critical — Runtime Failures

### C-01 · Wallet balance endpoint mismatch
**File:** `src/hooks/useWallet.ts`  
**App calls:** `GET /wallet`  
**Contract specifies:** `GET /wallet/balance`  
**Impact:** Wallet screen will always return a 404. Balance, spent amount, and transaction data cannot load.

---

### C-02 · Routes/Lines endpoint does not exist
**Files:** `src/hooks/useRoutes.ts`, `src/hooks/useTrips.ts`  
**App calls:** `GET /shuttle/lines`  
**Contract specifies:** `GET /routes` (Section: Routes) or `GET /shuttle/routes` (Section: Shuttle)  
`GET /shuttle/lines` does not appear anywhere in the contract.  
**Impact:** Routes screen, Home screen "Most Booked" section, and Trips screen all fail to load data. These are the primary screens of the app.

---

### C-03 · In-ride chat endpoints not in contract
**File:** `src/hooks/useRideChat.ts`  
**App calls:**
- `GET /trips/:id/chat` (fetch chat history)
- `POST /trips/:id/chat` (send message)

**Contract specifies:** Neither endpoint exists. The contract covers `GET /rides`, `POST /rides`, etc., but there is no chat sub-resource under `/trips`.  
**Impact:** The `ChatModal` in `app/(tabs)/car.tsx` will fail every time a user attempts to open chat during a ride.

---

### C-04 · Push token registration endpoint not in contract
**File:** `src/hooks/usePushToken.ts`  
**App calls:** `POST /users/me/push-token`  
**Contract specifies:** No such endpoint. The closest is `POST /notifications/push-token` or it may not exist.  
**Impact:** Push notification tokens are never registered with the backend. Users will not receive push notifications.

---

### C-05 · Login sends wrong credential field name
**File:** `app/auth.tsx` (login form submit)  
**App sends:** `{ credential: string, password: string }` where `credential` contains the user's email input  
**Contract requires:** `{ email: string, password: string }`  
**Impact:** Every login attempt fails with a 400/422 validation error. Authentication is completely broken.

---

### C-06 · Forgot-password endpoint not in contract
**File:** `app/auth.tsx`  
**App calls:** `POST /auth/forgot-password`  
**Contract specifies:** No such endpoint exists in the Auth section (Section 1). The contract only defines: `POST /auth/login`, `POST /auth/register`, `POST /auth/logout`, `POST /auth/verify-otp`.  
**Impact:** "Forgot Password" flow always fails with a 404.

---

### C-07 · Token refresh endpoint not in contract
**File:** `src/api/client.ts` (Axios response interceptor)  
**App calls:** `POST /auth/refresh` with `{ refreshToken }` on 401 responses  
**Contract specifies:** No token refresh endpoint is defined. The contract does not document any refresh flow.  
**Impact:** When the access token expires, the refresh attempt returns a 404, then the app may enter a retry loop or fail to re-authenticate silently.

---

### C-08 · Driver rating endpoint uses wrong path
**File:** `app/(tabs)/car.tsx` (`handleRatingSubmit`)  
**App calls:** `POST /rides/${rideState.rideId}/rate-driver`  
**Contract specifies:** `POST /rides/:id/rate` (Section: Ratings)  
**Impact:** Post-ride rating always returns a 404. Driver ratings are never recorded.

---

## 🟠 High — Partial or Intermittent Failures

### H-01 · Wrong socket event name for driver arrival
**Files:** `src/api/socket.ts`, `app/trip-tracking.tsx`  
**App listens to:** `ride:arrived`  
**Contract emits:** `ride:driver_arrived`  
**Impact:** The app never receives the driver-arrived event. In `app/trip-tracking.tsx`, the arrival banner and UI state transition never trigger. In `src/api/socket.ts`, the `onDriverArrived` callback is never called.

---

### H-02 · `ride:driver_assigned` payload shape mismatch
**File:** `src/api/socket.ts` (`RideSocketEvents` type and handler)  
**App expects payload:**
```ts
{
  rideId: string;
  driver: {
    id: string;
    name: string;
    phone: string;
    vehicle: string;   // ← app expects a string
    rating: number;
    location: { latitude: number; longitude: number };
    eta: number;       // ← app expects eta here
  };
}
```
**Contract specifies payload:**
```json
{
  "rideId": "string",
  "driver": {
    "id": "string",
    "name": "string",
    "phone": "string",
    "location": { "latitude": number, "longitude": number }
  }
}
```
**Discrepancies:**
- `driver.vehicle` — not in contract payload (app will receive `undefined`)
- `driver.rating` — not in contract payload (app will receive `undefined`)
- `driver.eta` — not in contract payload (app will receive `undefined`)

**Impact:** Driver card in `app/(tabs)/car.tsx` shows blank vehicle info and `—` for rating. ETA bubble always shows `…` and never updates.

---

### H-03 · Promos endpoint uses singular path
**File:** `src/hooks/usePromos.ts`  
**App calls:** `GET /promo`  
**Contract specifies:** `GET /promos` (plural, Section: Promos)  
**Impact:** Promo list always returns a 404. The promo screen in `app/promo.tsx` cannot load any available promos.

---

### H-04 · Promo validation missing required `amount` field
**File:** `src/hooks/usePromos.ts` (`validateCode` function)  
**App sends:** `POST /promos/validate` with body `{ code: string }`  
**Contract requires:** `{ code: string, amount: number }`  
**Impact:** Promo validation will fail with a 400/422 validation error because `amount` is required by the backend for discount calculation.

---

### H-05 · Support ticket type values are wrong
**File:** `app/support.tsx`  
**App sends** `type` as: `'passenger'` or `'driver'`  
**Contract enum:** `'general' | 'billing' | 'technical' | 'driver' | 'ride'`  
**`'passenger'` is not a valid value.** `'driver'` happens to match.  
**Impact:** Any support ticket submitted with `type: 'passenger'` (the default) will likely fail validation or be rejected by the backend.

---

### H-06 · Profile `dob` field not in contract
**Files:** `src/hooks/useProfile.ts`, `app/(tabs)/profile.tsx`  
**App reads:** `profile.dob` from `GET /users/me` response  
**App sends:** `{ name, email, dob }` in `PATCH /users/me`  
**Contract specifies** `GET /users/me` response: `{ id, name, email, phone, avatar, createdAt }`  
**Contract specifies** `PATCH /users/me` body: `{ name?, phone?, avatar? }` — no `email`, no `dob`  

Additional sub-issues:
- App sends `email` in the PATCH body but contract does not list `email` as a patchable field
- `dob` is completely absent from both the response shape and the PATCH body

**Impact:** `profile.dob` will always be `undefined`. The "Date of Birth" field in Personal Info modal is always empty and submitting it sends an unrecognized field.

---

### H-07 · `driver_en_route` is not a valid ride status
**File:** `app/(tabs)/car.tsx`  
**App checks:** `rideState.status === 'driver_en_route'` and maps it to `phase = 'active'`  
**Contract ride status values:** `pending | accepted | arrived | in_progress | completed | cancelled`  
`driver_en_route` is not a valid status. The contract uses `accepted` to mean the driver is on the way.  
**Impact:** The `driver_en_route` branch will never execute. However, `driver_assigned` (from the socket event) is also checked and is not a documented HTTP status value either. The phase mapping logic is partially unreachable.

---

### H-08 · `rideState.driver.vehicle` displayed but not in socket payload
**File:** `app/(tabs)/car.tsx`  
**App renders:** `rideState.driver?.vehicle` for the driver's car description  
**Contract:** `driver.vehicle` is not in the `ride:driver_assigned` socket payload (see H-02)  
**Impact:** Vehicle description always renders as empty string. This compounds H-02.

---

## 🟡 Medium — Minor Mismatches / Incorrect Field Names

### M-01 · `booking:boarded` missing `tripId` in expected payload
**File:** `src/api/socket.ts`  
**App expects payload:** `{ bookingId: string, timestamp: string }`  
**Contract emits:** `{ bookingId: string, tripId: string, timestamp: string }`  
**Impact:** App silently ignores `tripId`. Not currently used downstream, so visible impact is low, but the type definition is incorrect.

---

### M-02 · `notification:new` socket payload field name mismatches
**Files:** `src/api/socket.ts`, `app/notifications.tsx`, `constants/data.ts`  

| Field | App expects | Contract sends |
|-------|-------------|----------------|
| notification category/type | `category` | `type` |
| timestamp | `time` | `createdAt` |

**App expects:** `{ id, category, title, body, time, unread? }`  
**Contract sends:** `{ id, title, body, type, createdAt }`  

**Impact:** When a real-time notification arrives via socket, `notification.category` is `undefined` (instead of e.g. `'trip'`) and `notification.time` is `undefined`. Category-based filtering/icons in `app/notifications.tsx` will not work correctly. Timestamp display shows nothing.

---

### M-03 · `requestRide` sends undocumented `notes` field
**File:** `src/hooks/useRide.ts`  
**App sends** in `POST /rides`: `{ ...body, notes: string | undefined }`  
**Contract body:** `{ type, pickup: { latitude, longitude, address }, dropoff: { latitude, longitude, address } }`  
`notes` is not in the contract. Backend will silently ignore it, but the contract is the source of truth.  
**Impact:** No runtime failure; field is unrecognized and discarded.

---

### M-04 · Registration enforces wrong minimum password length
**File:** `app/auth.tsx`  
**App validation:** `password.length < 8` → shows error  
**Contract specifies:** minimum password length of **6** characters  
**Impact:** Users with valid 6–7 character passwords (accepted by the backend) are rejected by the frontend with a misleading error message.

---

### M-05 · Cancel booking uses wrong HTTP method
**File:** `app/(tabs)/trips.tsx` (`doCancel` function)  
**App calls:** `PATCH /shuttle/bookings/:id/cancel`  
**Contract specifies:** `DELETE /shuttle/bookings/:id`  
**Impact:** Booking cancellation returns a 404 or 405 Method Not Allowed. Cancelled bookings are not removed from the user's trip list after attempted cancellation.

---

### M-06 · Stations endpoint not documented in contract
**File:** `app/stations.tsx`  
**App calls:** `GET /shuttle/stations`  
**Contract:** The Shuttle section does not document a `/shuttle/stations` endpoint. Documented shuttle endpoints are: `GET /shuttle/routes`, `POST /shuttle/bookings`, `GET /shuttle/bookings`, `DELETE /shuttle/bookings/:id`, `GET /shuttle/trips/:id`.  
**Impact:** Stations screen will likely 404. The static fallback (`constants/data.ts`) is used, so users do see data, but it is never live.

---

### M-07 · In-ride chat socket event not in contract
**File:** `src/hooks/useRideChat.ts`  
**App listens to:** `trip:chat:message`  
**Contract WebSocket events:** `ride:requested`, `ride:driver_assigned`, `ride:driver_arrived`, `ride:status_update`, `ride:completed`, `ride:cancelled`, `booking:boarded`, `location:update`, `notification:new`  
`trip:chat:message` is not listed.  
**Impact:** Chat messages sent by the driver will never appear in the passenger's `ChatModal`. (This also compounds C-03.)

---

## 🔵 Low / Informational

### L-01 · Shuttle favorites use only static/local data
**File:** `app/(tabs)/favorites.tsx`  
**Observation:** `favoriteRoutes` is derived from `constants/data.ts` (`routes` array) filtered by locally stored favorite IDs. No API call is made to fetch or persist favorites.  
**Contract:** No favorites endpoint is documented, so this is not a contract mismatch, but the shuttle route data shown is always static and will not reflect live prices, seat counts, or schedule changes from the backend.

---

### L-02 · Location suggestions use hardcoded `MOCK_LOCATIONS`
**File:** `app/(tabs)/index.tsx`  
**Observation:** The destination search dropdown in Car/Bike mode uses a `MOCK_LOCATIONS` constant array hardcoded in the file. The contract documents `GET /suggestions?q=` for location autocomplete.  
**Impact:** No real location search is wired up. Users see only 4 hardcoded Cairo locations regardless of input.

---

### L-03 · Payment methods (cards) are fully mocked
**File:** `app/(tabs)/profile.tsx` (`PaymentMethodsModal`)  
**Observation:** `MOCK_CARDS` is a hardcoded constant. Add/remove card actions show `Alert` stubs. No API calls are made to any payment endpoint.  
**Contract:** The Payments section documents `GET /payments/methods`, `POST /payments/methods`, `DELETE /payments/methods/:id`.  
**Impact:** Payment method management is non-functional. This is a UI stub only.

---

### L-04 · `rideState.driver.rating` not in socket payload
**File:** `app/(tabs)/car.tsx`  
**Observation:** `rideState.driver?.rating?.toFixed(1)` is rendered in the driver card and on the completed-ride screen. Per the `ride:driver_assigned` contract payload, `rating` is not included.  
**Impact:** Rating always renders as `—`. Combined with H-02 and H-08.

---

## Cross-Cutting Issues

### X-01 · API base URL normalization is fragile
**File:** `src/api/client.ts`, `src/api/socket.ts`  
Both files contain complex normalization logic to strip/add `/api` suffix from `EXPO_PUBLIC_API_URL`. The logic differs slightly between the two files (client uses one approach, socket uses another). If the env variable is set without the `/api` suffix (the documented convention), the socket may double-append or strip the segment.  
**Recommendation:** Define a single canonical `getBaseUrl()` utility consumed by both, and document the required format of `EXPO_PUBLIC_API_URL`.

---

### X-02 · No handling for contract-defined `ride:status_update` event
**File:** `src/api/socket.ts`, `src/hooks/useRide.ts`  
**Contract emits:** `ride:status_update` with `{ rideId, status }` for all status transitions.  
**App handling:** The app maps ride phases from the initial `ride:driver_assigned` event and from `rideState.status`, but there is no dedicated listener for `ride:status_update` in `useRide.ts`. Status changes after assignment (e.g., `in_progress`, `completed`) may not be received unless the socket hook wires this event.

---

## Files Audited

| File | Status |
|------|--------|
| `src/api/client.ts` | ✅ Reviewed |
| `src/api/socket.ts` | ✅ Reviewed |
| `src/hooks/useRide.ts` | ✅ Reviewed |
| `src/hooks/useWallet.ts` | ✅ Reviewed |
| `src/hooks/useProfile.ts` | ✅ Reviewed |
| `src/hooks/useTrips.ts` | ✅ Reviewed |
| `src/hooks/useRoutes.ts` | ✅ Reviewed |
| `src/hooks/useNotifications.ts` | ✅ Reviewed |
| `src/hooks/usePromos.ts` | ✅ Reviewed |
| `src/hooks/useRideChat.ts` | ✅ Reviewed |
| `src/hooks/usePushToken.ts` | ✅ Reviewed |
| `app/auth.tsx` | ✅ Reviewed |
| `app/trip-tracking.tsx` | ✅ Reviewed |
| `app/notifications.tsx` | ✅ Reviewed |
| `app/support.tsx` | ✅ Reviewed |
| `app/promo.tsx` | ✅ Reviewed |
| `app/ticket.tsx` | ✅ Reviewed |
| `app/stations.tsx` | ✅ Reviewed |
| `app/(tabs)/index.tsx` | ✅ Reviewed |
| `app/(tabs)/wallet.tsx` | ✅ Reviewed |
| `app/(tabs)/profile.tsx` | ✅ Reviewed |
| `app/(tabs)/trips.tsx` | ✅ Reviewed |
| `app/(tabs)/routes.tsx` | ✅ Reviewed |
| `app/(tabs)/favorites.tsx` | ✅ Reviewed |
| `app/(tabs)/car.tsx` | ✅ Reviewed |
| `constants/data.ts` | ✅ Reviewed |
