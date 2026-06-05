---
name: Shuttle cascade-delete constraints
description: FK dependency order for deleting users, drivers, and routes in the Shuttle admin API
---

## Rule
Always delete in dependency order — child rows first, then parent rows.

**Why:** Several FK columns lack ON DELETE CASCADE in the DB schema, so Postgres rejects the delete with a constraint violation at runtime (confirmed: bookings_user_id_users_id_fk error on DELETE /admin/users/:id).

## User deletion order (DELETE /admin/users/:id)
1. If user is a driver: UPDATE trips SET driver_id=NULL, UPDATE rides SET driver_id=NULL
2. DELETE rides WHERE passenger_id=userId
3. DELETE bookings WHERE user_id=userId
4. DELETE wallet_transactions WHERE user_id=userId
5. DELETE notifications WHERE user_id=userId
6. DELETE sos_events WHERE user_id=userId
7. If driver: DELETE drivers WHERE user_id=userId (cascades docs, locations, earnings, ratings, vehicles)
8. DELETE users WHERE id=userId (cascades user_locations; set-null: audit_logs, suggestions, support)

## Driver deletion order (DELETE /admin/drivers/:id)
Same as user deletion but start from driverId → look up userId, null out trips/rides first.

## Route deletion order (DELETE /routes/:id)
1. SELECT trip ids WHERE route_id=routeId
2. DELETE bookings WHERE trip_id IN (tripIds)
3. DELETE trips WHERE route_id=routeId (cascades trip_events, trip_station_progress, chat_messages)
4. DELETE routes WHERE id=routeId (cascades stations)

## Tables WITHOUT cascade on foreign keys (must handle manually)
- bookings.user_id → usersTable
- notifications.user_id → usersTable
- sos_events.user_id → usersTable
- wallet_transactions.user_id → usersTable
- rides.passenger_id → usersTable
- drivers.user_id → usersTable
- trips.driver_id → driversTable
- rides.driver_id → driversTable
- trips.route_id → routesTable
- bookings.trip_id → tripsTable
