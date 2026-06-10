# Phase 3 — Mobile Apps Impact Report

---

## Passenger App

### New Socket Events to Listen For

---

#### 1. `notification:new`
**What changed:** Passengers who are marked absent on a shuttle trip now receive a structured notification. This event already existed but the content is new for shuttle no-shows.

**When to listen:** Always — persistent listener for push notifications.

**Payload shape:**
```json
{
  "id": "string",
  "category": "trip",
  "title": "Absent Mark — First Warning",
  "body": "You were marked absent on your shuttle trip. This is your first warning. A repeat no-show will result in the ticket price being deducted from your wallet.",
  "time": "2026-06-15T08:32:00.000Z"
}
```
Second offence and beyond:
```json
{
  "id": "string",
  "category": "trip",
  "title": "Absent Mark — Fine Applied",
  "body": "You were marked absent on your shuttle trip. The ticket price (25.00 EGP) has been deducted from your wallet.",
  "time": "2026-06-15T08:32:00.000Z"
}
```
Driver no-show refund notification:
```json
{
  "id": "string",
  "category": "trip",
  "title": "Trip Cancelled — Driver No-Show",
  "body": "Your shuttle trip was cancelled because the driver did not show up. Your wallet has been fully refunded.",
  "time": "2026-06-15T08:05:00.000Z"
}
```

**What the passenger app should do:**
- Show the notification in the notification center.
- If `title` contains "Fine Applied", also refresh the passenger's wallet balance (call `GET /wallet/balance` or re-fetch the wallet screen).
- If `title` contains "Driver No-Show", refresh the trip list and show a banner that the trip was cancelled.

---

#### 2. `shuttle:driver:location` *(new)*
**When to listen:** Join the trip room (`passenger:join:trip` with the `tripId`) before or at departure time. The server starts broadcasting this event 20 minutes before the trip departure, and continues while the trip is in `driver_assigned`, `boarding`, or `active` status.

**How to join the trip room:**
```
// Emit once when the passenger lands on the trip tracking screen
socket.emit("passenger:join:trip", { tripId: 123 })
```

**Payload shape:**
```json
{
  "tripId": 123,
  "driverId": 45,
  "lat": 30.0444,
  "lng": 31.2357,
  "heading": 270
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tripId` | number | The shuttle trip the passenger has booked |
| `driverId` | number | Internal driver ID |
| `lat` | number | Driver's current latitude |
| `lng` | number | Driver's current longitude |
| `heading` | number \| null | Compass bearing (0–359°) or `null` if unknown |

**What the passenger app should do:**
- Display the driver's bus icon on a map, updating its position on every event.
- Stop updating the map when the trip status becomes `completed` or `cancelled` (listen for `booking:boarded` or the trip-cancelled notification as a termination signal).
- Only passengers in the `TRIP(tripId)` room receive this event — no filtering needed client-side.

---

## Driver App

### New Socket Events to Listen For

---

#### 1. `shuttle:checkin:required` *(new — Fix 4)*
**When to listen:** Immediately after the driver emits `driver:status:online`. The server checks for an upcoming shuttle trip within 3 hours and emits this event synchronously if one is found.

**Payload shape:**
```json
{
  "tripId": 123,
  "deadlineMinutes": 10,
  "message": "You have a shuttle trip starting soon. Please submit a selfie check-in within 10 minutes."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tripId` | number | The shuttle trip that triggered the check-in requirement |
| `deadlineMinutes` | number | Minutes the driver has to submit the selfie (always 10) |
| `message` | string | Human-readable instruction |

**What the driver app should do:**
1. Immediately navigate to or overlay the selfie check-in screen.
2. Start a visible 10-minute countdown timer.
3. When the driver captures the selfie, call `POST /driver/checkin` — the existing endpoint. Include `tripId` in the form-data (as a number field named `tripId`) so it is linked to the correct shuttle trip.
4. On `driver:checkin:approved`: dismiss the overlay and allow the driver to proceed.
5. If the deadline passes without submission: the server will emit `driver:checkin:rejected` and set the driver offline. Show an appropriate error and prompt to go online again.

**Submission endpoint:**
```
POST /driver/checkin
Content-Type: multipart/form-data
Body fields:
  selfie (file)   — the photo
  tripId (number) — optional, link to shuttle trip (already supported by schema)
```

---

#### 2. `shuttle:station:timeout` *(new — Fix 5)*
**When to listen:** After the driver calls `POST /shuttle/bookings/:id/board` for the first passenger at a station. The server starts a 60-second countdown. After 60 seconds, if the timer hasn't been cleared, this event fires.

**Payload shape:**
```json
{
  "tripId": 123,
  "stationId": 7
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tripId` | number | The active shuttle trip |
| `stationId` | number \| null | The station where the timeout occurred, or `null` if no `stationId` was sent in the board request |

**What the driver app should do:**
- Show a non-blocking banner or vibration prompt: "Please mark all remaining passengers at this station as boarded or absent."
- Do NOT auto-mark passengers — the driver must still make the decision.
- The timer is a reminder only; boarding continues normally after it fires.

**How to send `stationId` when boarding:**
When calling `POST /shuttle/bookings/:id/board`, include `stationId` in the JSON body:
```json
{ "stationId": 7 }
```
The field is optional. If omitted, the timer still fires but `stationId` will be `null` in the payload.

---

#### 3. `notification:new` — New driver-specific no-show notifications *(Fix 2)*
**When to listen:** Always — persistent listener.

**Payload variations for driver no-shows:**

First offence:
```json
{
  "id": "string",
  "category": "trip",
  "title": "Missed Trip — First Warning",
  "body": "You missed your shuttle trip #123. This is your first warning. Repeated no-shows will result in financial penalties and account suspension.",
  "time": "2026-06-15T08:05:00.000Z"
}
```

Second offence (fare deducted):
```json
{
  "id": "string",
  "category": "trip",
  "title": "Missed Trip — Fare Deducted",
  "body": "You missed your shuttle trip #123. The total passenger fares (175.00 EGP) have been deducted from your wallet. This is your second warning.",
  "time": "2026-06-15T08:05:00.000Z"
}
```

Third+ offence (suspended):
```json
{
  "id": "string",
  "category": "trip",
  "title": "Account Suspended",
  "body": "Your driver account has been suspended due to repeated no-shows (trip #123). Please contact support.",
  "time": "2026-06-15T08:05:00.000Z"
}
```

**What the driver app should do:**
- Show the notification in the driver notification center.
- On a "Fare Deducted" notification, refresh the earnings/wallet balance.
- On an "Account Suspended" notification: force-logout the driver and show a "Your account has been suspended" screen with a support contact link. All subsequent API calls will return 403 once the account is blocked.

---

### Changed Endpoint Behaviour

#### `PATCH /driver/bookings/:id/absent`
**What changed (Fix 1):** After marking the passenger absent, the server now:
- Looks up the passenger's no-show offence count.
- First offence: sends a warning notification to the passenger (no wallet change).
- Second+ offence: deducts the booking's `totalPrice` from the passenger's wallet (balance can go negative) and sends a fine notification.

**No change to the request or response shape** — the driver app does not need to change how it calls this endpoint.

#### `POST /shuttle/bookings/:id/board`
**What changed (Fix 5):** An optional `stationId` integer field is now accepted in the JSON body. Sending it enables the station-specific timeout. If omitted, a fallback timer fires once per trip.

**Updated request body:**
```json
{
  "stationId": 7
}
```
Both formats (with and without `stationId`) are valid. No breaking change.
