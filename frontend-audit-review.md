# Frontend Audit Review — Rider App vs Backend Source

**Method:** Each claimed issue was verified directly against the backend source code,  
not against any prior contract document.  
**Verdict key:**  
- ✅ **Frontend bug** — app is wrong, backend is correct  
- 🔴 **Backend bug / gap** — backend is missing or inconsistent  
- ❌ **Audit report wrong** — neither app nor backend has a problem; the audit's "source of truth" was incorrect  
- ⚠️ **Partially wrong** — real issue exists but the audit misidentified the cause or the correct value

---

## Critical Issues

### C-01 · `GET /wallet` vs `GET /wallet/balance`
**Verdict: ✅ Frontend bug — confirmed**

`GET /wallet/balance` is the correct endpoint (wallet.ts). The app calling `GET /wallet` will receive a 404. Fix: update the hook to use `/wallet/balance`.

---

### C-02 · `GET /shuttle/lines` does not exist
**Verdict: ❌ Audit report wrong**

`GET /shuttle/lines` **does exist**. It is defined on line 12 of `shuttle.ts` and returns all active shuttle routes enriched with station counts and trip statistics. The app is calling the correct endpoint. No fix needed.

---

### C-03 · `GET /trips/:id/chat` and `POST /trips/:id/chat` not in contract
**Verdict: ❌ Audit report wrong**

Both endpoints **exist** in `chat.ts`:
- `GET /trips/:id/chat` — returns trip chat history (line 59)
- `POST /trips/:id/chat` — sends a message (line 20)

Both require authentication and work for passengers, drivers, and admins. The app is calling the correct paths. No fix needed.

---

### C-04 · `POST /users/me/push-token` not in contract
**Verdict: ❌ Audit report wrong**

The endpoint **exists** in `users.ts` (line 42):
```
POST /users/me/push-token
Body: { token: string }
```
It updates `pushToken` on the user record. The app is correct. No fix needed.

---

### C-05 · Login sends `{ credential, password }` — contract requires `{ email, password }`
**Verdict: ❌ Audit report wrong**

The backend **explicitly accepts both field names**. `auth.ts` line 69:
```ts
const normalized = { ...body, credential: body.credential ?? body.email };
```
The login handler accepts a `credential` field and falls back to `email` if absent. Sending `{ credential, password }` is valid and intentional. No fix needed.

---

### C-06 · `POST /auth/forgot-password` does not exist
**Verdict: ❌ Audit report wrong**

`POST /auth/forgot-password` **exists** in `auth.ts`. The app is calling the correct endpoint. No fix needed.

---

### C-07 · `POST /auth/refresh` does not exist
**Verdict: ❌ Audit report wrong**

`POST /auth/refresh` **exists** in `auth.ts`. The token refresh interceptor is calling the correct endpoint. No fix needed.

---

### C-08 · `POST /rides/:id/rate-driver` vs `POST /rides/:id/rate`
**Verdict: ✅ Frontend bug — confirmed**

The correct endpoint is `POST /rides/:id/rate`. There is no `/rate-driver` path anywhere in the backend. Every post-ride rating attempt will return a 404. Fix: change the path in `handleRatingSubmit` from `rides/${rideState.rideId}/rate-driver` to `rides/${rideState.rideId}/rate`.

---

## High Issues

### H-01 · App listens to `ride:arrived` — audit says contract emits `ride:driver_arrived`
**Verdict: ❌ Audit report wrong**

The backend emits **`ride:arrived`** — that is the actual event name in `rides.ts` line 722:
```ts
io.to(`passenger:${ride.passengerId}`).emit("ride:arrived", { rideId, driverId: driver.id });
```
The app listening for `ride:arrived` is **correct**. `ride:driver_arrived` is the name listed in `socket-events.ts` as a constant label but is **not what the rides route actually emits**. The audit used the wrong reference. No fix needed.

---

### H-02 · `ride:driver_assigned` payload missing `driver.vehicle`, `driver.rating`, and `eta`
**Verdict: ❌ Audit report wrong**

The actual payload emitted in `rides.ts` lines 658–669 is:
```json
{
  "rideId": 42,
  "driverId": 1,
  "driverName": "Ahmed Ali",
  "driver": {
    "name": "Ahmed Ali",
    "phone": "+966501234567",
    "vehicle": "car",
    "rating": 4.8
  },
  "eta": 5
}
```
`driver.vehicle` (the driver's vehicleType), `driver.rating`, and top-level `eta` are **all present**. The audit's version of the "contract payload" was outdated or fabricated. The app's field access is correct. No fix needed.

---

### H-03 · App calls `GET /promo` — audit says correct path is `GET /promos`
**Verdict: ⚠️ Frontend bug confirmed, but audit has wrong "correct" path**

The real endpoint is **`GET /promo/codes`** (promo.ts). Neither `GET /promo` (app) nor `GET /promos` (audit's claimed correct) is right. Fix: update the hook to call `/promo/codes`.

---

### H-04 · Promo validate sends `{ code }` only — audit says requires `{ code, amount }`
**Verdict: ⚠️ Frontend bug confirmed, but audit has wrong field name**

The backend requires `{ code, orderAmount }` — the field is `orderAmount`, not `amount` as the audit claims. Sending only `{ code }` will fail validation since `orderAmount` is used to calculate the discount. Fix: include `orderAmount: number` in the validate request body.

---

### H-05 · Support ticket `type` sent as `"passenger"` or `"driver"` — audit says wrong enum
**Verdict: ❌ Audit report wrong**

The actual enum in `support.ts` lines 12 and 23 is:
```ts
z.enum(["passenger", "driver"])
```
`"passenger"` and `"driver"` are the **only two valid values**. The audit's claimed "correct" enum of `general | billing | technical | driver | ride` is entirely fabricated and does not appear anywhere in the backend. The app is correct. No fix needed.

---

### H-06 · App reads/sends `dob` field on user profile
**Verdict: 🔴 Backend gap (or frontend assuming a feature that was never built)**

`dob` / `date_of_birth` / `dateOfBirth` appear **nowhere** in the backend — not in `users.ts`, `auth.ts`, or the database schema. The field is silently dropped on write and will always return `undefined` on read. This is not a mis-documented field; it simply does not exist. Resolution options: (a) add `dob` to the users table and endpoints in the backend, or (b) remove the field from the app UI.

---

### H-07 · App checks `rideState.status === "driver_en_route"`
**Verdict: ⚠️ Frontend bug confirmed, but audit lists wrong "correct" values**

`driver_en_route` is not a valid ride status. The actual backend statuses (`rides.ts`) are:
```
searching → driver_assigned → driver_arrived → active → completed | cancelled
```
The audit's claimed "correct" statuses (`pending | accepted | arrived | in_progress | completed | cancelled`) are also wrong and do not match the backend. Fix: map `driver_assigned` (not `driver_en_route`) to the "on the way" phase in the app.

---

### H-08 · App renders `rideState.driver.vehicle` — audit says not in socket payload
**Verdict: ❌ Audit report wrong**

`driver.vehicle` **is in the payload** (see H-02). The backend populates it with the driver's `vehicleType` string (e.g. `"car"`, `"motorcycle"`). The app rendering `rideState.driver.vehicle` is correct. No fix needed.

---

## Medium Issues

### M-01 · `booking:boarded` missing `tripId` in app's expected payload
**Verdict: 🔴 Backend inconsistency — two code paths emit different shapes**

There are two places in the backend that emit `booking:boarded`, and they have different payloads:

| Source | Payload |
|--------|---------|
| `shuttle.ts` line 745 | `{ bookingId, passengerId, timestamp }` — **no `tripId`** |
| `driver.ts` line 784 | `{ bookingId, tripId, timestamp }` — **no `passengerId`** |

The audit claims the contract always includes `tripId`, which is only true for the `driver.ts` code path. The app's type definition is incomplete either way. This is a backend inconsistency that should be resolved by aligning both emit sites to the same shape: `{ bookingId, tripId, passengerId, timestamp }`.

---

### M-02 · `notification:new` payload uses wrong field names
**Verdict: ✅ Frontend bug — confirmed**

The backend sends `{ id, title, body, type, createdAt }`. The app reads `category` (should be `type`) and `time` (should be `createdAt`). These will always be `undefined`. Fix: update the `Notification` type and all consumers to use `type` and `createdAt`.

---

### M-03 · `requestRide` sends extra `notes` field not in contract
**Verdict: Not a bug**

The backend ignores unknown fields in the request body. Sending `notes` causes no error and has no effect. This is harmless dead code in the app, not a runtime failure.

---

### M-04 · App enforces `password.length >= 8` — audit says contract minimum is 6
**Verdict: ❌ Audit report wrong**

The backend uses `z.string().min(8)` for passwords in `auth.ts`. The app enforcing a minimum of 8 characters is **correct** and matches the backend. The audit's claim of a minimum of 6 is wrong. No fix needed.

---

### M-05 · App calls `PATCH /shuttle/bookings/:id/cancel`
**Verdict: ⚠️ Frontend bug confirmed, but audit has the wrong "correct" path too**

Neither `PATCH /shuttle/bookings/:id/cancel` (app) nor `DELETE /shuttle/bookings/:id` (audit's claimed correct) exist. The correct endpoint is:
```
POST /bookings/:id/cancel
```
defined in `bookings.ts`. Fix: update the app to call `POST /bookings/:id/cancel`.

---

### M-06 · App calls `GET /shuttle/stations`
**Verdict: ✅ Frontend bug — confirmed**

`GET /shuttle/stations` does not exist. Individual route stations are served at `GET /routes/:id/stations` (public, no auth). Fix: update the app to call `GET /routes/:id/stations` with the specific route ID.

---

### M-07 · App listens to `trip:chat:message` socket event — audit says not in contract
**Verdict: ❌ Audit report wrong**

`trip:chat:message` **is emitted** by the backend. In `chat.ts` line 51:
```ts
io.to(SOCKET_ROOMS.TRIP(tripId)).emit(SOCKET_EVENTS.TRIP_CHAT_MESSAGE, payload);
```
`SOCKET_EVENTS.TRIP_CHAT_MESSAGE` resolves to `"trip:chat:message"` (socket-events.ts line 28). The app listening for this event is correct. No fix needed.

---

## Summary

| ID | Verdict | Action required |
|----|---------|----------------|
| C-01 | ✅ Frontend bug | Fix endpoint path: `/wallet` → `/wallet/balance` |
| C-02 | ❌ Audit wrong | None — endpoint exists |
| C-03 | ❌ Audit wrong | None — endpoints exist |
| C-04 | ❌ Audit wrong | None — endpoint exists |
| C-05 | ❌ Audit wrong | None — `credential` field is accepted |
| C-06 | ❌ Audit wrong | None — endpoint exists |
| C-07 | ❌ Audit wrong | None — endpoint exists |
| C-08 | ✅ Frontend bug | Fix path: `rate-driver` → `rate` |
| H-01 | ❌ Audit wrong | None — backend emits `ride:arrived`, app is correct |
| H-02 | ❌ Audit wrong | None — `driver.vehicle`, `driver.rating`, `eta` all present |
| H-03 | ⚠️ Partial | Fix path: `/promo` → `/promo/codes` (not `/promos`) |
| H-04 | ⚠️ Partial | Add `orderAmount` to validate body (not `amount`) |
| H-05 | ❌ Audit wrong | None — `"passenger"\|"driver"` is the correct enum |
| H-06 | 🔴 Backend gap | Add `dob` to backend, or remove from app UI |
| H-07 | ⚠️ Partial | Fix status: use `driver_assigned` (not `driver_en_route`) |
| H-08 | ❌ Audit wrong | None — `driver.vehicle` is in the payload |
| M-01 | 🔴 Backend inconsistency | Align `booking:boarded` payload across both emit sites |
| M-02 | ✅ Frontend bug | Use `type` and `createdAt` (not `category`/`time`) |
| M-03 | Not a bug | No action needed |
| M-04 | ❌ Audit wrong | None — min 8 is correct |
| M-05 | ⚠️ Partial | Fix path to `POST /bookings/:id/cancel` |
| M-06 | ✅ Frontend bug | Use `GET /routes/:id/stations` |
| M-07 | ❌ Audit wrong | None — event is emitted and documented |

**Breakdown:** 5 real frontend bugs · 1 backend gap · 1 backend inconsistency · 12 audit report errors · 4 partial (real issue + audit had wrong correction)
