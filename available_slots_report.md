# Available Slots Endpoint — Mobile Apps Impact Report

---

## Driver App

### Endpoint Name and Method
`GET /shuttle/available-slots`

---

### When to Call It
**Screen:** The slot selection screen — shown when a driver taps a route to browse available bookings for a specific week.

**User action:** The screen loads (or the driver selects a different week from the week picker). Call this endpoint **before** rendering the list of slots so the driver only ever sees slots they can successfully book. Never show all slots and filter client-side.

---

### Query Parameters

| Parameter  | Type   | Required | Format                                    | Example        |
|------------|--------|----------|-------------------------------------------|----------------|
| `routeId`  | integer | Yes     | Positive integer — the route's database ID | `routeId=3`   |
| `weekStart`| string  | Yes     | `YYYY-MM-DD` — must be a **Sunday**. Use the `weekStart` value returned by `GET /shuttle/lines/:routeId/available-weeks` — do not compute this client-side. | `weekStart=2026-06-14` |

---

### Full Response Shape

```json
{
  "routeId": 3,
  "weekStart": "2026-06-14",
  "weekEnd": "2026-06-18",
  "slots": [
    {
      "id": 12,
      "departureTime": "08:00",
      "totalSeats": 14,
      "minRequired": 7,
      "days": [
        { "tripId": 501, "date": "2026-06-14", "dayOfWeek": "Sunday",    "availableSeats": 10 },
        { "tripId": 502, "date": "2026-06-15", "dayOfWeek": "Monday",    "availableSeats": 9  },
        { "tripId": 503, "date": "2026-06-16", "dayOfWeek": "Tuesday",   "availableSeats": 11 },
        { "tripId": 504, "date": "2026-06-17", "dayOfWeek": "Wednesday", "availableSeats": 8  },
        { "tripId": 505, "date": "2026-06-18", "dayOfWeek": "Thursday",  "availableSeats": 10 }
      ]
    }
  ]
}
```

#### Field Explanations

| Field | Type | Description |
|-------|------|-------------|
| `routeId` | integer | The route ID that was queried |
| `weekStart` | string (`YYYY-MM-DD`) | The Sunday that starts the work week |
| `weekEnd` | string (`YYYY-MM-DD`) | The Thursday that ends the work week |
| `slots` | array | List of bookable time slots. Empty array `[]` means no slots are bookable for this week |
| `slots[].id` | integer | Time slot ID — pass this as `timeSlotId` when calling `POST /shuttle/route-bookings` |
| `slots[].departureTime` | string (`HH:MM`) | Cairo local departure time |
| `slots[].totalSeats` | integer | Maximum vehicle capacity (`14` for hiace, `28` for minibus) |
| `slots[].minRequired` | integer | Minimum passenger bookings needed to operate the trip (`7` for hiace, `14` for minibus) |
| `slots[].days` | array | One entry per working day (Sunday–Thursday), always 5 items, sorted Sunday → Thursday |
| `slots[].days[].tripId` | integer | The specific trip ID for that day |
| `slots[].days[].date` | string (`YYYY-MM-DD`) | Calendar date of the trip |
| `slots[].days[].dayOfWeek` | string | Human-readable day name: `"Sunday"`, `"Monday"`, `"Tuesday"`, `"Wednesday"`, `"Thursday"` |
| `slots[].days[].availableSeats` | integer | Remaining passenger seats on that day's trip |

---

### Error Cases the App Should Handle

| HTTP Status | `error` field value | What to show the driver |
|-------------|---------------------|-------------------------|
| `400` | `"routeId and weekStart are required query parameters"` | Developer error — both params must always be sent |
| `400` | `"routeId must be a valid integer"` | Developer error — validate before sending |
| `400` | `"weekStart is not a valid ISO date (expected YYYY-MM-DD)"` | Developer error — use the date from the server's available-weeks response |
| `400` | `"weekStart must be a Sunday in Cairo time. Use the date derived from the server's available-weeks response."` | Developer error — never compute `weekStart` client-side |
| `401` | *(no body / auth error)* | Session expired — prompt driver to log in again |
| `403` | *(forbidden)* | Only drivers can access this endpoint |
| `404` | `"Route not found"` | The route was removed — refresh the route list |
| `200` with `slots: []` | *(not an error)* | Show an empty state: "No slots available for this week" |

**Recommended UX:** On a `200` with `slots: []`, show a friendly message rather than a generic empty screen. On any `4xx`/`5xx`, show a retry option.

---

### Booking Flow (after this endpoint)
Once the driver taps a slot from the list returned by this endpoint, proceed directly to:

```
POST /shuttle/route-bookings
Body: { routeId, timeSlotId: slot.id, weekStart }
```

No additional validation is needed client-side — if a slot appears in this response it will pass all server-side checks at booking time (assuming no race condition with another driver booking in the same instant).

---

## Passenger App

**No changes expected.** This endpoint has **zero impact** on the passenger app.

- `GET /shuttle/available-slots` is gated behind `requireRole("driver")` — a passenger JWT will receive `403 Forbidden` and cannot call it.
- The endpoint reads trip and booking data but performs no writes, so passenger-facing trip availability is unaffected.
- No passenger screens, flows, or data models reference this endpoint.
- No shared state is mutated. Passenger booking counts and seat availability remain unchanged.

**Confirmation:** The passenger app requires no code changes, no API client updates, and no UI changes as a result of this endpoint being added.
