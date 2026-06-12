# VeeGo Backend — Master API Reference

> **Base URL (production):** `https://<domain>/api`  
> **Auth header:** `Authorization: Bearer <jwt>`  
> **Content-Type:** `application/json` (unless noted as multipart)  
> **All paths below are relative to `/api`**

---

## Table of Contents

1. [Architecture Notes](#architecture-notes)
2. [Complete Endpoint Index](#complete-endpoint-index)
3. [Auth & Identity](#1-auth--identity)
4. [Users (Passenger)](#2-users-passenger)
5. [Wallet](#3-wallet)
6. [Rides](#4-rides)
7. [Driver — Core](#5-driver--core)
8. [Drivers (Admin CRUD)](#6-drivers-admin-crud)
9. [Shuttle Lines & Stations](#7-shuttle-lines--stations)
10. [Shuttle Trips](#8-shuttle-trips)
11. [Shuttle — Passenger Flow](#9-shuttle--passenger-flow)
12. [Shuttle — Driver Flow](#10-shuttle--driver-flow)
13. [Shuttle Bookings (Driver Scheduling)](#11-shuttle-bookings-driver-scheduling)
14. [Shuttle Trips Admin](#12-shuttle-trips-admin)
15. [Shuttle Vehicle Types](#13-shuttle-vehicle-types)
16. [Schedules](#14-schedules)
17. [Bookings (Passenger Shuttle Tickets)](#15-bookings-passenger-shuttle-tickets)
18. [Buses](#16-buses)
19. [Promo Codes](#17-promo-codes)
20. [Bonus Targets & Driver Incentives](#18-bonus-targets--driver-incentives)
21. [Commission & Exemptions](#19-commission--exemptions)
22. [Notifications](#20-notifications)
23. [Ratings](#21-ratings)
24. [Earnings](#22-earnings)
25. [Vehicles (Admin Fleet)](#23-vehicles-admin-fleet)
26. [Vehicle Catalog](#24-vehicle-catalog)
27. [Service Controls](#25-service-controls)
28. [Zone Pricing](#26-zone-pricing)
29. [Zones](#27-zones)
30. [Payments (Admin)](#28-payments-admin)
31. [Locations](#29-locations)
32. [Chat](#30-chat)
33. [Driver Check-in](#31-driver-check-in)
34. [Support Tickets](#32-support-tickets)
35. [Suggestions](#33-suggestions)
36. [Tracking & SOS](#34-tracking--sos)
37. [Dashboard (Admin)](#35-dashboard-admin)
38. [Admin — Settings, Users & Analytics](#36-admin--settings-users--analytics)
39. [Staff & Roles](#37-staff--roles)
40. [Audit Logs](#38-audit-logs)
41. [Driver Documents](#39-driver-documents)
42. [Health](#40-health)
43. [WebSocket Events](#websocket-events)
44. [Final Stats](#final-stats)

---

## Architecture Notes

| Key | Value |
|-----|-------|
| Framework | Node.js + Express |
| ORM | Drizzle ORM |
| Database | PostgreSQL (Neon) |
| Auth | JWT Bearer token (`Authorization: Bearer <token>`) |
| Roles | `user` (passenger), `driver`, `admin` |
| Rate limit (ride request) | 3 requests per 2 min per user (env-configurable) |
| Commission priority | Active exemption (0%) → driver personal rate → global `commission.appCommission` setting |
| Peak bonus | Configurable `peakBonusRate` (default 20%) applied on driver cut during peak hours |
| Waiting charge | 3-min free window → per-minute charge; capped; locked at ride-start |
| Cancellation fees | `cancellation_fee_arrived` (default 5 EGP) + accrued waiting charge |
| Surge pricing | In-memory, updated every 5 min; broadcast via WebSocket |
| Dispatch | Sequential rounds; re-dispatches on driver cancel/decline |

---

## Complete Endpoint Index

| # | Method | Path | Auth | File |
|---|--------|------|------|------|
| 1 | POST | /auth/register | None | auth.ts |
| 2 | POST | /auth/login | None | auth.ts |
| 3 | POST | /auth/admin/login | None | auth.ts |
| 4 | POST | /auth/refresh | None | auth.ts |
| 5 | GET | /auth/me | Any | auth.ts |
| 6 | POST | /auth/send-otp | None | auth.ts |
| 7 | POST | /auth/verify-otp | None | auth.ts |
| 8 | POST | /auth/forgot-password | None | auth.ts |
| 9 | POST | /auth/reset-password | None | auth.ts |
| 10 | GET | /users/me | User | users.ts |
| 11 | PATCH | /users/me | User | users.ts |
| 12 | POST | /users/me/push-token | User | users.ts |
| 13 | GET | /users/me/bookings | User | users.ts |
| 14 | GET | /wallet | Any | wallet.ts |
| 15 | GET | /wallet/transactions | Any | wallet.ts |
| 16 | POST | /wallet/topup | Any | wallet.ts |
| 17 | PATCH | /admin/settings/wallet-limits | Admin | wallet.ts |
| 18 | GET | /admin/wallet/transactions | Admin | wallet.ts |
| 19 | POST | /admin/wallet/refund | Admin | wallet.ts |
| 20 | POST | /rides/estimate | User | rides.ts |
| 21 | POST | /rides/request | User | rides.ts |
| 22 | GET | /rides/my | User | rides.ts |
| 23 | GET | /rides/:id | Any | rides.ts |
| 24 | PATCH | /rides/:id/cancel | User | rides.ts |
| 25 | POST | /rides/:id/share | User | rides.ts |
| 26 | POST | /rides/:id/sos | Any | rides.ts |
| 27 | POST | /rides/:id/rate-driver | User | rides.ts |
| 28 | GET | /admin/rides | Admin | rides.ts |
| 29 | GET | /admin/rides/:id | Admin | rides.ts |
| 30 | GET | /admin/pricing | Admin | rides.ts |
| 31 | POST | /admin/pricing | Admin | rides.ts |
| 32 | PATCH | /admin/pricing/:id | Admin | rides.ts |
| 33 | DELETE | /admin/pricing/:id | Admin | rides.ts |
| 34 | GET | /driver/rides/available | Driver | rides.ts |
| 35 | GET | /driver/rides/active | Driver | rides.ts |
| 36 | PATCH | /driver/rides/:id/accept | Driver | rides.ts |
| 37 | PATCH | /driver/rides/:id/arrived | Driver | rides.ts |
| 38 | PATCH | /driver/rides/:id/start | Driver | rides.ts |
| 39 | POST | /driver/rides/:id/start | Driver | rides.ts (deprecated alias) |
| 40 | PATCH | /driver/rides/:id/complete | Driver | rides.ts |
| 41 | POST | /driver/rides/:id/complete | Driver | rides.ts (deprecated alias) |
| 42 | PATCH | /driver/rides/:id/decline | Driver | rides.ts |
| 43 | POST | /driver/rides/:id/decline | Driver | rides.ts (deprecated alias) |
| 44 | PATCH | /driver/rides/:id/cancel | Driver | rides.ts |
| 45 | POST | /driver/rides/:id/rate-rider | Driver | rides.ts |
| 46 | POST | /driver/auth/register | None | driver.ts |
| 47 | POST | /driver/auth/login | None | driver.ts |
| 48 | POST | /driver/auth/logout | Driver | driver.ts |
| 49 | GET | /driver/me | Driver | driver.ts |
| 50 | PATCH | /driver/me | Driver | driver.ts |
| 51 | GET | /driver/me/vehicle | Driver | driver.ts |
| 52 | GET | /driver/me/documents | Driver | driver.ts |
| 53 | GET | /driver/me/ratings | Driver | driver.ts |
| 54 | GET | /driver/me/status | Driver | driver.ts |
| 55 | GET | /driver/me/settings | Driver | driver.ts |
| 56 | PATCH | /driver/me/online | Driver | driver.ts |
| 57 | PATCH | /driver/me/offline | Driver | driver.ts |
| 58 | PATCH | /driver/me/location | Driver | driver.ts |
| 59 | GET | /driver/trips | Driver | driver.ts |
| 60 | GET | /driver/trips/:id | Driver | driver.ts |
| 61 | PATCH | /driver/trips/:id/start | Driver | driver.ts |
| 62 | PATCH | /driver/trips/:id/complete | Driver | driver.ts |
| 63 | PATCH | /driver/bookings/:id/no-show | Driver | driver.ts |
| 64 | GET | /driver/wallet/payout-methods | Driver | driver.ts |
| 65 | POST | /driver/wallet/payout-methods | Driver | driver.ts |
| 66 | DELETE | /driver/wallet/payout-methods/:id | Driver | driver.ts |
| 67 | POST | /driver/wallet/payout | Driver | driver.ts |
| 68 | GET | /driver/wallet/balance | Driver | driver.ts |
| 69 | GET | /driver/earnings | Driver | driver.ts |
| 70 | GET | /driver/earnings/history | Driver | driver.ts |
| 71 | GET | /driver/notifications | Driver | driver.ts |
| 72 | GET | /driver/reviews | Driver | driver.ts |
| 73 | GET | /driver/promotions | Driver | driver.ts |
| 74 | GET | /drivers | Admin | drivers.ts |
| 75 | POST | /drivers | Admin | drivers.ts |
| 76 | GET | /drivers/me | Driver | drivers.ts |
| 77 | PATCH | /drivers/me/location | Driver | drivers.ts |
| 78 | GET | /drivers/:id | Admin | drivers.ts |
| 79 | PATCH | /drivers/:id | Admin | drivers.ts |
| 80 | DELETE | /drivers/:id | Admin | drivers.ts |
| 81 | GET | /routes | None | routes.ts |
| 82 | POST | /routes | Admin | routes.ts |
| 83 | GET | /routes/:id | None | routes.ts |
| 84 | PATCH | /routes/:id | Admin | routes.ts |
| 85 | DELETE | /routes/:id | Admin | routes.ts |
| 86 | GET | /routes/:id/stations | None | routes.ts |
| 87 | POST | /routes/:id/stations | Admin | routes.ts |
| 88 | PATCH | /routes/:id/stations/:stationId | Admin | routes.ts |
| 89 | DELETE | /routes/:id/stations/:stationId | Admin | routes.ts |
| 90 | GET | /trips | None | trips.ts |
| 91 | POST | /trips | Admin | trips.ts |
| 92 | GET | /trips/:id | None | trips.ts |
| 93 | PATCH | /trips/:id | Admin | trips.ts |
| 94 | PATCH | /trips/:id/cancel | Admin | trips.ts |
| 95 | DELETE | /trips/:id | Admin | trips.ts |
| 96 | GET | /shuttle/lines | Any | shuttle.ts |
| 97 | GET | /shuttle/assignments | Any | shuttle.ts |
| 98 | GET | /shuttle/lines/:id | None | shuttle.ts |
| 99 | GET | /shuttle/trips/:id/passengers | Any | shuttle.ts |
| 100 | GET | /shuttle/lines/:id/passengers | Any | shuttle.ts |
| 101 | POST | /shuttle/bookings/:id/board | Any | shuttle.ts |
| 102 | POST | /shuttle/ratings | Any | shuttle.ts |
| 103 | GET | /shuttle/my-trips | User | shuttle.ts |
| 104 | GET | /shuttle/driver/my-trips | Driver | shuttle.ts |
| 105 | DELETE | /shuttle/bookings/:id | User | shuttle.ts |
| 106 | GET | /shuttle/my-debt | User | shuttle.ts |
| 107 | GET | /shuttle/lines/:routeId/available-weeks | Any | shuttleBookings.ts |
| 108 | GET | /shuttle/timeslots/:routeId | Any | shuttleBookings.ts |
| 109 | POST | /shuttle/route-bookings | Driver | shuttleBookings.ts |
| 110 | GET | /shuttle/route-bookings | Driver | shuttleBookings.ts |
| 111 | POST | /shuttle/route-bookings/:id/confirm-renewal | Driver | shuttleBookings.ts |
| 112 | GET | /shuttle/available-slots | Driver | shuttleBookings.ts |
| 113 | GET | /admin/shuttle/bookings | Admin | shuttleBookings.ts |
| 114 | GET | /admin/shuttle/bookings/:id | Admin | shuttleBookings.ts |
| 115 | PATCH | /admin/shuttle/bookings/:id/reassign | Admin | shuttleBookings.ts |
| 116 | PATCH | /admin/shuttle/bookings/:id/cancel | Admin | shuttleBookings.ts |
| 117 | PATCH | /admin/shuttle/bookings/:id/extend-window | Admin | shuttleBookings.ts |
| 118 | GET | /admin/shuttle/timeslots | Admin | shuttleBookings.ts |
| 119 | POST | /admin/shuttle/timeslots | Admin | shuttleBookings.ts |
| 120 | PATCH | /admin/shuttle/timeslots/:id | Admin | shuttleBookings.ts |
| 121 | DELETE | /admin/shuttle/timeslots/:id | Admin | shuttleBookings.ts |
| 122 | GET | /admin/shuttle-trips | Admin | shuttleTripsAdmin.ts |
| 123 | GET | /admin/shuttle-trips/:id | Admin | shuttleTripsAdmin.ts |
| 124 | GET | /admin/shuttle/cash-debts | Admin | shuttleTripsAdmin.ts |
| 125 | PATCH | /admin/shuttle/cash-debts/:userId/collect | Admin | shuttleTripsAdmin.ts |
| 126 | GET | /admin/shuttle/offences | Admin | shuttleTripsAdmin.ts |
| 127 | PATCH | /admin/shuttle/offences/:userId/reset | Admin | shuttleTripsAdmin.ts |
| 128 | GET | /admin/shuttle/vehicle-types | Admin | shuttleVehicleTypes.ts |
| 129 | POST | /admin/shuttle/vehicle-types | Admin | shuttleVehicleTypes.ts |
| 130 | PATCH | /admin/shuttle/vehicle-types/:id | Admin | shuttleVehicleTypes.ts |
| 131 | DELETE | /admin/shuttle/vehicle-types/:id | Admin | shuttleVehicleTypes.ts |
| 132 | GET | /shuttle/vehicle-types | Any | shuttleVehicleTypes.ts |
| 133 | POST | /schedules | Admin | schedules.ts |
| 134 | GET | /schedules | Admin | schedules.ts |
| 135 | GET | /schedules/:id | Admin | schedules.ts |
| 136 | PATCH | /schedules/:id | Admin | schedules.ts |
| 137 | POST | /schedules/:id/generate | Admin | schedules.ts |
| 138 | DELETE | /schedules/:id | Admin | schedules.ts |
| 139 | GET | /bookings | Admin | bookings.ts |
| 140 | POST | /bookings | User | bookings.ts |
| 141 | GET | /bookings/:id | Any | bookings.ts |
| 142 | PATCH | /bookings/:id/cancel | Any | bookings.ts |
| 143 | GET | /buses | Admin | buses.ts |
| 144 | POST | /buses | Admin | buses.ts |
| 145 | GET | /buses/:id | Admin | buses.ts |
| 146 | PATCH | /buses/:id | Admin | buses.ts |
| 147 | DELETE | /buses/:id | Admin | buses.ts |
| 148 | POST | /promo/validate | Any | promo.ts |
| 149 | GET | /promo | Admin | promo.ts |
| 150 | POST | /promo | Admin | promo.ts |
| 151 | PATCH | /promo/:id | Admin | promo.ts |
| 152 | DELETE | /promo/:id | Admin | promo.ts |
| 153 | GET | /admin/bonus-targets | Admin | bonusTargets.ts |
| 154 | POST | /admin/bonus-targets | Admin | bonusTargets.ts |
| 155 | PATCH | /admin/bonus-targets/:id | Admin | bonusTargets.ts |
| 156 | DELETE | /admin/bonus-targets/:id | Admin | bonusTargets.ts |
| 157 | GET | /admin/bonus-targets/:id/progress | Admin | bonusTargets.ts |
| 158 | GET | /admin/drivers/:id/bonus-progress | Admin | bonusTargets.ts |
| 159 | GET | /driver/bonus-targets | Driver | bonusTargets.ts |
| 160 | GET | /admin/commission-exemptions | Admin | commissionExemptions.ts |
| 161 | POST | /admin/commission-exemptions | Admin | commissionExemptions.ts |
| 162 | PATCH | /admin/commission-exemptions/:id | Admin | commissionExemptions.ts |
| 163 | DELETE | /admin/commission-exemptions/:id | Admin | commissionExemptions.ts |
| 164 | GET | /notifications | Any | notifications.ts |
| 165 | POST | /notifications | Admin | notifications.ts |
| 166 | GET | /admin/notifications/history | Admin | notifications.ts |
| 167 | POST | /admin/notifications/broadcast | Admin | notifications.ts |
| 168 | PATCH | /notifications/read-all | Any | notifications.ts |
| 169 | PATCH | /notifications/:id/read | Any | notifications.ts |
| 170 | GET | /admin/ratings | Admin | ratings.ts |
| 171 | GET | /admin/ratings/stats | Admin | ratings.ts |
| 172 | GET | /admin/ratings/:id | Admin | ratings.ts |
| 173 | DELETE | /admin/ratings/:id | Admin | ratings.ts |
| 174 | GET | /user/ratings/given | User | ratings.ts |
| 175 | GET | /earnings/summary | Any | earnings.ts |
| 176 | GET | /earnings/weekly | Any | earnings.ts |
| 177 | GET | /earnings | Admin | earnings.ts |
| 178 | PATCH | /earnings/:id/status | Admin | earnings.ts |
| 179 | GET | /vehicles | Admin | vehicles.ts |
| 180 | POST | /vehicles | Admin | vehicles.ts |
| 181 | GET | /vehicles/:id | Admin | vehicles.ts |
| 182 | PATCH | /vehicles/:id | Admin | vehicles.ts |
| 183 | DELETE | /vehicles/:id | Admin | vehicles.ts |
| 184 | GET | /vehicles/brands | Any | vehicleCatalog.ts |
| 185 | GET | /vehicles/brands/:id/models | Any | vehicleCatalog.ts |
| 186 | GET | /vehicles/models/:id/years | Any | vehicleCatalog.ts |
| 187 | GET | /vehicles/colors | Any | vehicleCatalog.ts |
| 188 | GET | /admin/vehicle-catalog/brands | Admin | vehicleCatalog.ts |
| 189 | POST | /admin/vehicle-catalog/brands | Admin | vehicleCatalog.ts |
| 190 | POST | /admin/vehicle-catalog/brands/bulk | Admin | vehicleCatalog.ts |
| 191 | POST | /admin/vehicle-brands/bulk-import | Admin | vehicleCatalog.ts |
| 192 | PATCH | /admin/vehicle-catalog/brands/:id | Admin | vehicleCatalog.ts |
| 193 | DELETE | /admin/vehicle-catalog/brands/:id | Admin | vehicleCatalog.ts |
| 194 | GET | /admin/vehicle-catalog/models | Admin | vehicleCatalog.ts |
| 195 | POST | /admin/vehicle-catalog/models | Admin | vehicleCatalog.ts |
| 196 | PATCH | /admin/vehicle-catalog/models/:id | Admin | vehicleCatalog.ts |
| 197 | DELETE | /admin/vehicle-catalog/models/:id | Admin | vehicleCatalog.ts |
| 198 | GET | /admin/vehicle-catalog/colors | Admin | vehicleCatalog.ts |
| 199 | POST | /admin/vehicle-catalog/colors | Admin | vehicleCatalog.ts |
| 200 | PATCH | /admin/vehicle-catalog/colors/:id | Admin | vehicleCatalog.ts |
| 201 | DELETE | /admin/vehicle-catalog/colors/:id | Admin | vehicleCatalog.ts |
| 202 | GET | /admin/services/:type/control | Admin | serviceControls.ts |
| 203 | PATCH | /admin/services/:type/control | Admin | serviceControls.ts |
| 204 | POST | /admin/services/:type/control/reset | Admin | serviceControls.ts |
| 205 | GET | /admin/services/:type/settings | Admin | serviceControls.ts |
| 206 | PATCH | /admin/services/:type/settings | Admin | serviceControls.ts |
| 207 | GET | /services/control | Any | serviceControls.ts |
| 208 | GET | /services/:type/control | Any | serviceControls.ts |
| 209 | GET | /services/:type/settings | Any | serviceControls.ts |
| 210 | GET | /admin/zone-pricing | Admin | zonePricing.ts |
| 211 | POST | /admin/zone-pricing | Admin | zonePricing.ts |
| 212 | PATCH | /admin/zone-pricing/:id | Admin | zonePricing.ts |
| 213 | DELETE | /admin/zone-pricing/:id | Admin | zonePricing.ts |
| 214 | GET | /zones | Admin | zones.ts |
| 215 | POST | /zones | Admin | zones.ts |
| 216 | GET | /zones/:id | Admin | zones.ts |
| 217 | PATCH | /zones/:id | Admin | zones.ts |
| 218 | DELETE | /zones/:id | Admin | zones.ts |
| 219 | GET | /admin/payments | Admin | payments.ts |
| 220 | GET | /admin/payments/summary | Admin | payments.ts |
| 221 | GET | /admin/payments/:id | Admin | payments.ts |
| 222 | PATCH | /admin/payments/:id | Admin | payments.ts |
| 223 | GET | /admin/driver-locations | Admin | locations.ts |
| 224 | GET | /admin/driver-locations/:driverId/latest | Admin | locations.ts |
| 225 | GET | /admin/user-locations | Admin | locations.ts |
| 226 | GET | /user/locations | Any | locations.ts |
| 227 | POST | /user/locations | Any | locations.ts |
| 228 | PATCH | /user/locations/:id | Any | locations.ts |
| 229 | DELETE | /user/locations/:id | Any | locations.ts |
| 230 | POST | /trips/:id/chat | Any | chat.ts |
| 231 | GET | /trips/:id/chat | Any | chat.ts |
| 232 | GET | /admin/chat/stats | Admin | chat.ts |
| 233 | GET | /admin/chat | Admin | chat.ts |
| 234 | GET | /admin/chat/trip/:id | Admin | chat.ts |
| 235 | POST | /admin/chat/trip/:id | Admin | chat.ts |
| 236 | PATCH | /admin/chat/messages/:id/read | Admin | chat.ts |
| 237 | POST | /driver/checkin | Driver | checkin.ts |
| 238 | GET | /driver/checkin/status | Driver | checkin.ts |
| 239 | GET | /admin/checkins | Admin | checkin.ts |
| 240 | GET | /support/tickets | Admin | support.ts |
| 241 | POST | /support/tickets | None | support.ts |
| 242 | GET | /support/tickets/:id | Admin | support.ts |
| 243 | PATCH | /support/tickets/:id | Admin | support.ts |
| 244 | POST | /support/tickets/:id/messages | Admin | support.ts |
| 245 | GET | /support/stats | Admin | support.ts |
| 246 | GET | /suggestions | Admin | suggestions.ts |
| 247 | POST | /suggestions | None | suggestions.ts |
| 248 | GET | /suggestions/:id | Admin | suggestions.ts |
| 249 | PATCH | /suggestions/:id | Admin | suggestions.ts |
| 250 | GET | /track/:token | None | track.ts |
| 251 | POST | /rides/:id/sos | Any | rides.ts |
| 252 | GET | /admin/sos-events | Admin | admin.ts |
| 253 | POST | /admin/sos-events/:id/resolve | Admin | admin.ts |
| 254 | GET | /dashboard/summary | Admin | dashboard.ts |
| 255 | GET | /dashboard/activity | Admin | dashboard.ts |
| 256 | GET | /dashboard/analytics | Admin | dashboard.ts |
| 257 | GET | /dashboard/today | Admin | dashboard.ts |
| 258 | GET | /admin/settings/commission | Admin | admin.ts |
| 259 | PATCH | /admin/settings/commission | Admin | admin.ts |
| 260 | PATCH | /admin/drivers/:id/commission | Admin | admin.ts |
| 261 | GET | /admin/surge-settings | Admin | admin.ts |
| 262 | PATCH | /admin/surge-settings | Admin | admin.ts |
| 263 | GET | /admin/queue/status | Admin | admin.ts |
| 264 | POST | /admin/queue/retry/:jobId | Admin | admin.ts |
| 265 | POST | /admin/queue/retry-all | Admin | admin.ts |
| 266 | GET | /admin/analytics | Admin | admin.ts |
| 267 | GET | /admin/users | Admin | admin.ts |
| 268 | GET | /admin/users/search | Admin | admin.ts |
| 269 | GET | /admin/users/:id | Admin | admin.ts |
| 270 | PATCH | /admin/users/:id | Admin | admin.ts |
| 271 | PATCH | /admin/users/:id/toggle-block | Admin | admin.ts |
| 272 | DELETE | /admin/users/:id | Admin | admin.ts |
| 273 | GET | /admin/drivers | Admin | admin.ts |
| 274 | GET | /admin/drivers/live | Admin | admin.ts |
| 275 | GET | /admin/drivers/dispatch-stats | Admin | admin.ts |
| 276 | DELETE | /admin/drivers/:id | Admin | admin.ts |
| 277 | GET | /admin/driver-analytics | Admin | admin.ts |
| 278 | GET | /admin/analytics/passengers | Admin | admin.ts |
| 279 | GET | /admin/analytics/services | Admin | admin.ts |
| 280 | GET | /admin/analytics/promo | Admin | admin.ts |
| 281 | GET | /admin/analytics/complaints | Admin | admin.ts |
| 282 | GET | /admin/settings/app | Admin | admin.ts |
| 283 | PUT | /admin/settings/app | Admin | admin.ts |
| 284 | PATCH | /admin/settings/app | Admin | admin.ts |
| 285 | GET | /admin/transactions | Admin | admin.ts |
| 286 | POST | /admin/trips/:id/cancel | Admin | admin.ts |
| 287 | GET | /admin/bookings | Admin | admin.ts |
| 288 | GET | /admin/dispatch/peak-settings | Admin | admin.ts |
| 289 | PUT | /admin/dispatch/peak-settings | Admin | admin.ts |
| 290 | GET | /admin/duplicate-alerts | Admin | admin.ts |
| 291 | PATCH | /admin/duplicate-alerts/:id/resolve | Admin | admin.ts |
| 292 | POST | /admin/drivers/:id/check-criminal-record | Admin | admin.ts |
| 293 | GET | /admin/car-categories | Admin | admin.ts |
| 294 | POST | /admin/car-categories | Admin | admin.ts |
| 295 | PATCH | /admin/car-categories/:id | Admin | admin.ts |
| 296 | DELETE | /admin/car-categories/:id | Admin | admin.ts |
| 297 | GET | /admin/settings | Admin | admin.ts |
| 298 | PATCH | /admin/settings | Admin | admin.ts |
| 299 | GET | /admin/settings/:key | Admin | admin.ts |
| 300 | GET | /admin/permissions/all | Admin | staff.ts |
| 301 | GET | /admin/roles | Admin | staff.ts |
| 302 | POST | /admin/roles | Admin | staff.ts |
| 303 | PATCH | /admin/roles/:id | Admin | staff.ts |
| 304 | DELETE | /admin/roles/:id | Admin | staff.ts |
| 305 | GET | /admin/staff | Admin | staff.ts |
| 306 | POST | /admin/staff | Admin | staff.ts |
| 307 | PATCH | /admin/staff/:id | Admin | staff.ts |
| 308 | DELETE | /admin/staff/:id | Admin | staff.ts |
| 309 | GET | /admin/audit-logs | Admin | auditLogs.ts |
| 310 | GET | /admin/audit-logs/:id | Admin | auditLogs.ts |
| 311 | GET | /admin/audit-logs/distinct/actions | Admin | auditLogs.ts |
| 312 | GET | /admin/audit-logs/distinct/entity-types | Admin | auditLogs.ts |
| 313 | GET | /driver-documents | Admin | driverDocuments.ts |
| 314 | GET | /driver-documents/by-driver/:driverId | Admin | driverDocuments.ts |
| 315 | POST | /driver-documents/upload/:driverId | Any | driverDocuments.ts |
| 316 | PATCH | /driver-documents/:id | Admin | driverDocuments.ts |
| 317 | GET | /driver-documents/stats | Admin | driverDocuments.ts |
| 318 | GET | /health | None | health.ts |
| 319 | GET | /healthz | None | health.ts |
| 320 | GET | /health/db | None | health.ts |

---

## 1. Auth & Identity

### POST /auth/register
**Auth:** None  
**Body:**
```json
{ "name": "string", "email": "string", "phone": "string", "password": "string" }
```
**Response:** `{ user: {...}, token: "jwt", refreshToken: "jwt" }`

---

### POST /auth/login
**Auth:** None  
**Note:** Returns 403 if the account has `role = "admin"` (use `/auth/admin/login` instead)  
**Body:**
```json
{ "email": "string", "password": "string" }
```
**Response:** `{ user: {...}, token: "jwt", refreshToken: "jwt" }`

---

### POST /auth/admin/login
**Auth:** None  
**Body:**
```json
{ "email": "string", "password": "string" }
```
**Response:** `{ user: {...}, token: "jwt" }` — token payload includes `role: "admin"`

---

### POST /auth/refresh
**Auth:** None  
**Body:**
```json
{ "refreshToken": "string" }
```
**Response:** `{ token: "jwt", refreshToken: "jwt" }`

---

### GET /auth/me
**Auth:** Any (Bearer)  
**Response:** `{ user: { id, name, email, phone, role, walletBalance, ... } }`

---

### POST /auth/send-otp
**Auth:** None  
**Body:** `{ "phone": "string" }`  
**Response:** `{ message: "OTP sent" }`

---

### POST /auth/verify-otp
**Auth:** None  
**Body:** `{ "phone": "string", "otp": "string" }`  
**Response:** `{ verified: true }` or error

---

### POST /auth/forgot-password
**Auth:** None  
**Body:** `{ "email": "string" }`  
**Response:** `{ message: "Reset link sent" }`

---

### POST /auth/reset-password
**Auth:** None  
**Body:** `{ "token": "string", "password": "string" }`  
**Response:** `{ message: "Password reset" }`

---

## 2. Users (Passenger)

### GET /users/me
**Auth:** User  
**Response:** Full user profile

---

### PATCH /users/me
**Auth:** User  
**Body:** `{ name?, email?, phone?, avatar? }` (all optional)  
**Response:** Updated user profile

---

### POST /users/me/push-token
**Auth:** User  
**Body:** `{ "token": "string", "platform": "ios"|"android" }`  
**Response:** `{ ok: true }`

---

### GET /users/me/bookings
**Auth:** User  
**Query:** `page?`, `limit?`, `status?`  
**Response:** `{ data: [Booking], total, page, limit }`

---

## 3. Wallet

### GET /wallet
**Auth:** Any  
**Response:** `{ balance: number, currency: "EGP" }`

---

### GET /wallet/transactions
**Auth:** Any  
**Query:** `page?`, `limit?`, `type?` (topup|payment|refund)  
**Response:** `{ data: [Transaction], total, page, limit }`

---

### POST /wallet/topup
**Auth:** Any  
**Body:** `{ "amount": number }` (positive)  
**Response:** `{ balance: number, transaction: {...} }`

---

### PATCH /admin/settings/wallet-limits
**Auth:** Admin  
**Body:** `{ minTopup?: number, maxTopup?: number, maxBalance?: number }`  
**Response:** Updated limits

---

### GET /admin/wallet/transactions
**Auth:** Admin  
**Query:** `page?`, `limit?`, `userId?`, `type?`  
**Response:** `{ data: [Transaction], total, page, limit }`

---

### POST /admin/wallet/refund
**Auth:** Admin  
**Body:** `{ "userId": number, "amount": number, "reason": "string" }`  
**Response:** `{ ok: true, newBalance: number }`

---

## 4. Rides

### POST /rides/estimate
**Auth:** User  
**Body:**
```json
{
  "pickupLatitude": number,
  "pickupLongitude": number,
  "dropoffLatitude": number,
  "dropoffLongitude": number,
  "vehicleType": "car"|"motorcycle"|"scooter"|"tuk_tuk"|"delivery",
  "categorySlug": "string?" // for car type
}
```
**Response:**
```json
{
  "estimatedPrice": number,
  "distanceKm": number,
  "estimatedDurationMinutes": number,
  "surgeMultiplier": number,
  "isSurge": boolean,
  "pricingSource": "zone"|"global"
}
```

---

### POST /rides/request
**Auth:** User  
**Rate limit:** 3 per 2 min per user  
**Body:**
```json
{
  "pickupLatitude": number,
  "pickupLongitude": number,
  "pickupAddress": "string",
  "dropoffLatitude": number,
  "dropoffLongitude": number,
  "dropoffAddress": "string",
  "vehicleType": "car"|"motorcycle"|"scooter"|"tuk_tuk"|"delivery",
  "categorySlug": "string?",
  "recipientName": "string?",   // delivery only
  "recipientPhone": "string?",  // delivery only
  "promoCode": "string?"
}
```
**Response (201):** `{ data: Ride }`  
**Ride statuses:** `searching → driver_assigned → driver_arrived → active → completed | cancelled`

---

### GET /rides/my
**Auth:** User  
**Query:** `vehicleType?`, `status?`, `page?` (default 1), `limit?` (default 20, max 100)  
**Response:** `{ data: [Ride], meta: { total, page, limit } }`

---

### GET /rides/:id
**Auth:** Any (passenger sees own; driver sees assigned; admin sees all)  
**Response:** `{ data: { ...ride, passenger: { id, name, phone }, driver: { id, name, phone } } }`

---

### PATCH /rides/:id/cancel
**Auth:** User (own ride only)  
**Fee logic:**
- `driver_arrived` status: `cancellation_fee_arrived` setting (default 5 EGP) + accrued waiting charge
- `active` status: `active_ride_cancellation_fee` setting (default 0)
- Other statuses: full refund  

**Response:** `{ data: { ...ride, refundAmount, cancellationFee } }`

---

### POST /rides/:id/share
**Auth:** User (own ride, must be `requested|driver_arrived|in_progress`)  
**Response (201):** `{ token: "string", url: "https://...", expiresAt: "ISO" }` (24h TTL, idempotent)

---

### POST /rides/:id/sos
**Auth:** Passenger or assigned driver  
**Ride must be `driver_arrived` or `in_progress`**  
**Body:**
```json
{ "latitude": number, "longitude": number, "notes": "string?" }
```
**Response (201):** `{ sosId: number, message: "SOS received" }`  
**Side effect:** Emits `sos:triggered` to admin room via WebSocket

---

### POST /rides/:id/rate-driver
**Auth:** User (ride passenger, ride must be `completed`)  
**Body:** `{ "rating": number (1–5), "comment": "string?" }`  
**Response (201):** `{ ok: true, rideId, rating }`  
**Side effect:** Recalculates `drivers.rating` average

---

### GET /admin/rides
**Auth:** Admin  
**Query:** `status?`, `vehicleType?`, `passengerId?`, `driverId?`, `from?`, `to?`, `page?`, `limit?`  
**Response:** `{ data: [Ride], total, page, limit }`

---

### GET /admin/rides/:id
**Auth:** Admin  
**Response:** Full ride with passenger, driver, events

---

### GET /admin/pricing (Car Categories)
**Auth:** Admin  
**Response:** `{ data: [CarCategory] }`

---

### POST /admin/pricing
**Auth:** Admin  
**Body:** `{ name, slug, minYear, baseFare, perKmRate, minimumFare, isActive? }`  
**Response (201):** Created `CarCategory`

---

### PATCH /admin/pricing/:id
**Auth:** Admin  
**Body:** Any partial CarCategory fields  
**Response:** Updated `CarCategory`

---

### DELETE /admin/pricing/:id
**Auth:** Admin  
**Response:** `{ ok: true }`

---

### Driver Ride Endpoints

#### GET /driver/rides/available
**Auth:** Driver (must be online)  
**Response:** `{ data: [Ride] }` — rides in `searching` status matching driver's vehicle type

#### GET /driver/rides/active
**Auth:** Driver  
**Response:** `{ data: Ride }` — current assigned/active ride

#### PATCH /driver/rides/:id/accept
**Auth:** Driver  
**Response:** `{ data: Ride }` (status → `driver_assigned`)  
**Side effect:** Emits `ride:driver_assigned` to passenger

#### PATCH /driver/rides/:id/arrived
**Auth:** Driver  
**Response:** `{ data: Ride }` (status → `driver_arrived`)  
**Side effect:** Starts waiting timer + no-show timer; emits `ride:driver_arrived`

#### PATCH /driver/rides/:id/start
**Auth:** Driver  
**Response:** `{ data: Ride }` (status → `active`; waiting charge locked)  
**Side effect:** Emits `ride:started`

#### PATCH /driver/rides/:id/complete
**Auth:** Driver  
**Response:** `{ data: { rideId, finalPrice, driverCut, waitingCharge } }`  
**Finance:** `finalPrice = estimatedPrice + waitingCharge`; commission deducted; peak bonus applied  
**Side effect:** Emits `ride:completed`; updates bonus progress; criminal record check

#### PATCH /driver/rides/:id/decline
**Auth:** Driver  
**Response:** `{ data: Ride }` (reset to `searching`)  
**Side effect:** Re-broadcasts `ride:new_request` to available drivers room

#### PATCH /driver/rides/:id/cancel
**Auth:** Driver (only from `driver_assigned` or `driver_arrived`)  
**Response:** `{ data: { rideId, status: "searching", message } }`  
**Side effect:** Re-dispatches ride; emits `ride:driver_cancelled` to passenger

#### POST /driver/rides/:id/rate-rider
**Auth:** Driver (ride must be `completed`)  
**Body:** `{ "rating": number (1–5), "comment": "string?" }`  
**Response (201):** `{ ok: true, rideId, rating }`

> **Deprecated aliases (kept for backward compat):**  
> `POST /driver/rides/:id/start` → same as PATCH  
> `POST /driver/rides/:id/complete` → same as PATCH  
> `POST /driver/rides/:id/decline` → same as PATCH

---

## 5. Driver — Core

### POST /driver/auth/register
**Auth:** None  
**Body:** `{ name, phone, email?, password, vehicleType, licenseNumber, nationalId, ... }`  
**Response (201):** `{ driver: {...}, token: "jwt" }`

---

### POST /driver/auth/login
**Auth:** None  
**Body:** `{ "phone": "string", "password": "string" }`  
**Response:** `{ driver: {...}, token: "jwt" }`

---

### POST /driver/auth/logout
**Auth:** Driver  
**Response:** `{ ok: true }`

---

### GET /driver/me
**Auth:** Driver  
**Response:** Full driver profile including vehicle, rating, status

---

### PATCH /driver/me
**Auth:** Driver  
**Body:** `{ name?, phone?, email?, avatar?, ... }` (all optional)  
**Response:** Updated driver profile

---

### GET /driver/me/vehicle
**Auth:** Driver  
**Response:** Driver's vehicle details

---

### GET /driver/me/documents
**Auth:** Driver  
**Response:** `{ data: [Document] }`

---

### GET /driver/me/ratings
**Auth:** Driver  
**Response:** `{ averageRating, totalRatings, breakdown: {...} }`

---

### GET /driver/me/status
**Auth:** Driver  
**Response:** `{ status, isOnline, onlineSince? }`

---

### GET /driver/me/settings
**Auth:** Driver  
**Response:** Driver notification/preference settings

---

### PATCH /driver/me/online
**Auth:** Driver  
**Response:** `{ status: "online", isOnline: true }`

---

### PATCH /driver/me/offline
**Auth:** Driver  
**Response:** `{ status: "offline", isOnline: false }`

---

### PATCH /driver/me/location
**Auth:** Driver  
**Body:** `{ "latitude": number, "longitude": number }`  
**Response:** `{ ok: true }`

---

### GET /driver/trips
**Auth:** Driver  
**Query:** `page?`, `limit?`, `status?`  
**Response:** Paginated list of shuttle trips assigned to this driver

---

### GET /driver/trips/:id
**Auth:** Driver  
**Response:** Full shuttle trip detail with passengers

---

### PATCH /driver/trips/:id/start
**Auth:** Driver  
**Response:** Updated trip (status → `active`)

---

### PATCH /driver/trips/:id/complete
**Auth:** Driver  
**Response:** Updated trip; driver earnings created; bonus progress updated; criminal record check  
**Side effect:** Emits notifications to passengers

---

### PATCH /driver/bookings/:id/no-show
**Auth:** Driver  
**Response:** Updated booking (status → `absent`)  
**No-show logic:**
- 1st offence → warning notification only
- 2nd+ → deduct ticket price from passenger wallet

---

### GET /driver/wallet/payout-methods
**Auth:** Driver  
**Response:** `{ data: [{ id, name, description, isAvailable }] }`

---

### POST /driver/wallet/payout-methods
**Auth:** Driver  
**Body:** `{ type, accountNumber?, accountName?, bankName?, phoneNumber? }`  
**Response (201):** Created payout method

---

### DELETE /driver/wallet/payout-methods/:id
**Auth:** Driver  
**Response:** `{ ok: true, deleted: "methodId" }`

---

### POST /driver/wallet/payout
**Auth:** Driver  
**Body:** `{ "amount": number (positive), "method": "string" }`  
**Response:** `{ ok: true, amount, method, message }` — marks all `confirmed` earnings as `paid`

---

### GET /driver/wallet/balance
**Auth:** Driver  
**Response:** `{ balance: number, totalPaid: number, totalPending: number }`

---

### GET /driver/earnings
**Auth:** Driver  
**Response:** `{ totalEarned, tripCount, recent: [Earning] }`

---

### GET /driver/earnings/history
**Auth:** Driver  
**Query:** `page?` (default 1), `limit?` (default 20)  
**Response:** `{ data: [Earning], total, page, limit }`

---

### GET /driver/notifications
**Auth:** Driver  
**Response:** `{ data: [Notification] }` — last 50

---

### GET /driver/reviews
**Auth:** Driver  
**Query:** `page?`, `limit?`  
**Response:** `{ data: [Review], total, page, limit, averageRating }`

---

### GET /driver/promotions
**Auth:** Driver  
**Response:** `{ data: [{ id, title, description, bonusPercentage|bonusAmount, validUntil, isActive, conditions }] }`

---

## 6. Drivers (Admin CRUD)

### GET /drivers
**Auth:** Admin  
**Query:** `page?`, `limit?`  
**Response:** `{ data: [Driver], total, page, limit }`

---

### POST /drivers
**Auth:** Admin  
**Body:** `{ name, phone, licenseNumber, nationalId, vehicleType, ... }`  
**Response (201):** Created driver record

---

### GET /drivers/me
**Auth:** Driver  
**Response:** Calling driver's profile

---

### PATCH /drivers/me/location
**Auth:** Driver  
**Body:** `{ latitude, longitude }`  
**Response:** `{ ok: true }`

---

### GET /drivers/:id
**Auth:** Admin  
**Response:** Specific driver profile

---

### PATCH /drivers/:id
**Auth:** Admin  
**Body:** `{ name?, phone?, vehicleType?, status?, ... }` (all optional)  
**Response:** Updated driver profile

---

### DELETE /drivers/:id
**Auth:** Admin  
**Response:** 204 No Content (soft-delete: sets `isActive = false`)

---

## 7. Shuttle Lines & Stations

### GET /routes
**Auth:** None  
**Query:** `search?`  
**Response:** `{ data: [Route], total }`

---

### POST /routes
**Auth:** Admin  
**Body:** `{ name, fromLocation, toLocation, estimatedDuration, basePrice, isActive? }`  
**Response (201):** Created `Route`

---

### GET /routes/:id
**Auth:** None  
**Response:** `Route` object

---

### PATCH /routes/:id
**Auth:** Admin  
**Body:** Any partial Route fields  
**Response:** Updated `Route`

---

### DELETE /routes/:id
**Auth:** Admin  
**Response:** 204 No Content (cascades to trips and bookings)

---

### GET /routes/:id/stations
**Auth:** None  
**Response:** Array of `Station` objects ordered by `order`

---

### POST /routes/:id/stations
**Auth:** Admin  
**Body:** `{ name, latitude, longitude, order, direction?: "outbound"|"return", segmentPrice? }`  
**Response (201):** Created `Station`

---

### PATCH /routes/:id/stations/:stationId
**Auth:** Admin  
**Body:** Any partial Station fields  
**Response:** Updated `Station`

---

### DELETE /routes/:id/stations/:stationId
**Auth:** Admin  
**Response:** 204 No Content

---

## 8. Shuttle Trips

### GET /trips
**Auth:** None  
**Query:** `routeId?`, `date?` (YYYY-MM-DD), `status?`, `page?` (default 1), `limit?` (default 20)  
**Response:** `{ data: [Trip], total, page, limit }`

---

### POST /trips
**Auth:** Admin  
**Body:** `{ routeId, busId, driverId, departureTime, arrivalTime, price }`  
**Response (201):** Created `Trip` (seats synced from bus capacity)

---

### GET /trips/:id
**Auth:** None  
**Response:** Full `Trip` object

---

### PATCH /trips/:id
**Auth:** Admin  
**Body:** `{ busId?, driverId?, departureTime?, arrivalTime?, price?, status? }`  
**Response:** Updated `Trip`

---

### PATCH /trips/:id/cancel
**Auth:** Admin  
**Response:** Cancelled trip; wallet refunds issued to all passengers; notifications sent

---

### DELETE /trips/:id
**Auth:** Admin  
**Note:** Fails if trip is `active`  
**Response:** 204 No Content; triggers wallet refunds and deletes bookings

---

## 9. Shuttle — Passenger Flow

### GET /shuttle/lines
**Auth:** Any  
**Response:**
```json
{
  "data": [{
    "id", "name", "from", "to", "basePrice",
    "stationCount", "totalTrips", "openTrips", "activeTrips",
    "totalSeats", "minRequired",
    "upcomingWeekStart",
    "timeslots": [{ "departureTime": "HH:MM", "availableSeats", "isBooked" }],
    "availableSlots", "totalSlots"
  }],
  "total"
}
```

---

### GET /shuttle/lines/:id
**Auth:** None  
**Response:** Route with `stations[]` and `activeTrips[]` each with seat counts and `shuttleStatus`

---

### GET /shuttle/trips/:id/passengers
**Auth:** Any  
**Response:** `{ tripId, tripStatus, shuttleStatus, totalSeats, bookedSeats, availableSeats, minRequired, data: [Booking+UserInfo], total }`

---

### GET /shuttle/lines/:id/passengers
**Auth:** Any  
**Response:** Passengers for the next upcoming trip on the route

---

### POST /shuttle/bookings/:id/board
**Auth:** Any  
**Body:** `{ stationId?: number }` (optional; drives 1-min station timeout timer)  
**Response:** `{ ok: true, booking: {...}, timestamp }`  
**Side effect:** Emits `booking:boarded` to passenger; starts 1-min station departure timer → emits `shuttle:station:timeout` to driver

---

### POST /shuttle/ratings
**Auth:** Any  
**Passenger** rates driver; **driver** rates boarded passengers (one per tripId per rater)  
**Body:** `{ tripId: number, rateeId: number, stars: number (1–5) }`  
**Response (201):** `{ ok: true, rating: {...} }`

---

### GET /shuttle/my-trips
**Auth:** User  
**Query:** `page?` (default 1), `limit?` (default 10, max 50)  
**Response:** `{ data: [{ tripId, bookingId, routeName, date, departureTime, driverName, driverRating, status, ticketPrice, paymentStatus, passengerRating }], total, page, limit }`

---

### DELETE /shuttle/bookings/:id
**Auth:** User (own booking)  
**Refund logic:** `> 12h before departure` → full refund; `≤ 12h` → no refund  
**Response:** `{ ok: true, bookingId, refunded: boolean }`

---

### GET /shuttle/my-debt
**Auth:** User  
**Response:** `{ hasDebt: boolean, debtAmount: number, offenceCount: number }`

---

## 10. Shuttle — Driver Flow

### GET /shuttle/assignments
**Auth:** Any  
**Response:** All active drivers with assigned buses and current trips

---

### GET /shuttle/driver/my-trips
**Auth:** Driver  
**Query:** `page?` (default 1), `limit?` (default 10, max 50)  
**Response:** `{ data: [{ tripId, routeName, date, departureTime, totalPassengers, boardedPassengers, absentPassengers, earnings, status }], total, page, limit }`

---

## 11. Shuttle Bookings (Driver Scheduling)

### GET /shuttle/lines/:routeId/available-weeks
**Auth:** Any  
**Response:** `{ routeId, routeName, weeks: [{ weekStart, weekEnd, slots: [{ id, departureTime, totalSeats, availableSeats, isBooked, isTaken }] }], total }`

---

### GET /shuttle/timeslots/:routeId
**Auth:** Any  
**Query:** `weekStart?` (YYYY-MM-DD, must be a Sunday)  
**Response:** `{ routeId, routeName, weekStart, weekEnd, data: [{ id, departureTime, availableSeats, totalSeats, isBooked, isTaken }], total }`

---

### POST /shuttle/route-bookings
**Auth:** Driver  
**Body:** `{ routeId: number, timeSlotId: number, weekStart: "YYYY-MM-DD" }`  
**Response:** `{ ok: true, booking: {...} }`

---

### GET /shuttle/route-bookings
**Auth:** Driver  
**Query:** `status?` (active|cancelled|pending_renewal|expired)  
**Response:** `{ data: [Booking+Route+TimeSlot], total }`

---

### POST /shuttle/route-bookings/:id/confirm-renewal
**Auth:** Driver (booking owner)  
**Response:** `{ ok: true, currentBooking, nextWeekBooking }`

---

### GET /shuttle/available-slots
**Auth:** Driver  
**Query:** `routeId` (required), `weekStart` (required, YYYY-MM-DD)  
**Response:** `{ routeId, weekStart, weekEnd, slots: [{ id, departureTime, totalSeats, minRequired, days: [{ tripId, date, dayOfWeek, availableSeats }] }] }`

---

### GET /admin/shuttle/bookings
**Auth:** Admin  
**Query:** `page?`, `limit?`, `week?`, `routeId?`, `driverId?`, `status?`  
**Response:** `{ data: [Booking], total, page, limit }`

---

### GET /admin/shuttle/bookings/:id
**Auth:** Admin  
**Response:** `{ data: {...} }` — full booking detail

---

### PATCH /admin/shuttle/bookings/:id/reassign
**Auth:** Admin  
**Body:** `{ driverId: number }`  
**Response:** `{ ok: true, booking: {...} }`  
**Side effect:** Emits `shuttle:booking:reassigned` to both old and new driver

---

### PATCH /admin/shuttle/bookings/:id/cancel
**Auth:** Admin  
**Body:** `{ reason?: "string" }`  
**Response:** `{ ok: true, booking: {...} }`

---

### PATCH /admin/shuttle/bookings/:id/extend-window
**Auth:** Admin  
**Body:** `{ hours: number }` (1–72)  
**Response:** `{ ok: true, booking: {...} }`

---

### GET /admin/shuttle/timeslots
**Auth:** Admin  
**Query:** `routeId?`  
**Response:** `{ data: [TimeSlot], total }`

---

### POST /admin/shuttle/timeslots
**Auth:** Admin  
**Body:** `{ routeId: number, departureTime: "HH:MM", isActive: boolean }`  
**Response:** `{ ok: true, slot: {...} }`

---

### PATCH /admin/shuttle/timeslots/:id
**Auth:** Admin  
**Body:** `{ departureTime?: "HH:MM", isActive?: boolean }`  
**Response:** `{ ok: true, slot: {...} }`

---

### DELETE /admin/shuttle/timeslots/:id
**Auth:** Admin  
**Response:** `{ ok: true, deleted: {...} }`

---

## 12. Shuttle Trips Admin

### GET /admin/shuttle-trips
**Auth:** Admin  
**Query:** `page?`, `limit?`, `status?`, `routeId?`, `dateFrom?`, `dateTo?`  
**Response:** Paginated shuttle trips with joined metadata

---

### GET /admin/shuttle-trips/:id
**Auth:** Admin  
**Response:** Full trip detail including stations and passengers

---

### GET /admin/shuttle/cash-debts
**Auth:** Admin  
**Response:** Users with negative wallet balances (no-show fines unpaid)

---

### PATCH /admin/shuttle/cash-debts/:userId/collect
**Auth:** Admin  
**Response:** Resets user balance to 0; logs wallet transaction

---

### GET /admin/shuttle/offences
**Auth:** Admin  
**Query:** `actorType?`, `lastAction?`, `dateFrom?`, `dateTo?`  
**Response:** List of shuttle offence records

---

### PATCH /admin/shuttle/offences/:userId/reset
**Auth:** Admin  
**Response:** Clears offence record for the user

---

## 13. Shuttle Vehicle Types

### GET /admin/shuttle/vehicle-types
**Auth:** Admin  
**Response:** `{ data: [ShuttleVehicleType] }`

---

### POST /admin/shuttle/vehicle-types
**Auth:** Admin  
**Body:** `{ name, type: "hiace"|"minibus", minYear, capacity, minPassengers, isActive }`  
**Response:** Created `ShuttleVehicleType`

---

### PATCH /admin/shuttle/vehicle-types/:id
**Auth:** Admin  
**Body:** Any partial fields  
**Response:** Updated type

---

### DELETE /admin/shuttle/vehicle-types/:id
**Auth:** Admin  
**Response:** Deactivates type (`isActive = false`)

---

### GET /shuttle/vehicle-types
**Auth:** Any  
**Response:** Active shuttle vehicle types

---

## 14. Schedules

### POST /schedules
**Auth:** Admin  
**Body:** `{ routeId, effectiveFrom, effectiveTo, vehicleType, slots: [{ dayOfWeek, departureTime }] }`  
**Response:** Created schedule

---

### GET /schedules
**Auth:** Admin  
**Query:** `routeId?`  
**Response:** Schedules list

---

### GET /schedules/:id
**Auth:** Admin  
**Response:** Schedule detail

---

### PATCH /schedules/:id
**Auth:** Admin  
**Body:** `{ effectiveFrom?, effectiveTo?, isActive? }`  
**Response:** Updated schedule

---

### POST /schedules/:id/generate
**Auth:** Admin  
**Response:** Generates trip rows for the schedule's effective period

---

### DELETE /schedules/:id
**Auth:** Admin  
**Response:** Deactivates schedule and cancels all future unassigned trips

---

## 15. Bookings (Passenger Shuttle Tickets)

### GET /bookings
**Auth:** Admin  
**Query:** `status?`, `search?`, `page?`, `limit?`  
**Response:** `{ data: [Booking+UserInfo+RouteInfo], total, page, limit }`

---

### POST /bookings
**Auth:** User  
**Body:** `{ tripId: number, seatCount: number, stationId?: number }`  
**Response (201):** Created `Booking`; wallet debited  
**Status flow:** `pending → confirmed → boarded | absent | completed | cancelled`

---

### GET /bookings/:id
**Auth:** Any  
**Response:** Full booking with trip and route info

---

### PATCH /bookings/:id/cancel
**Auth:** Any  
**Response:** Cancelled booking; partial or full refund depending on timing

---

## 16. Buses

### GET /buses
**Auth:** Admin  
**Query:** `page?`, `limit?`  
**Response:** `{ data: [Bus], total, page, limit }`

---

### POST /buses
**Auth:** Admin  
**Body:** `{ plateNumber, model, capacity, year, color, status }`  
**Response (201):** Created `Bus`

---

### GET /buses/:id
**Auth:** Admin  
**Response:** `Bus` object

---

### PATCH /buses/:id
**Auth:** Admin  
**Body:** Partial Bus fields  
**Response:** Updated `Bus`

---

### DELETE /buses/:id
**Auth:** Admin  
**Response:** 204 No Content

---

## 17. Promo Codes

### POST /promo/validate
**Auth:** Any  
**Body:** `{ "code": "string", "vehicleType"?: string, "rideAmount"?: number }`  
**Response:** `{ valid: true, discount: {...} }` or error

---

### GET /promo
**Auth:** Admin  
**Query:** `page?`, `limit?`, `isActive?`  
**Response:** `{ data: [PromoCode], total }`

---

### POST /promo
**Auth:** Admin  
**Body:**
```json
{
  "code": "string",
  "discountType": "percentage"|"fixed",
  "discountValue": number,
  "maxUsage"?: number,
  "expiryDate"?: "ISO",
  "isActive"?: boolean,
  "applicableService"?: "all"|"car"|"motorcycle"|...,
  "minRideAmount"?: number,
  "perUserLimit"?: number
}
```
**Response (201):** Created `PromoCode`

---

### PATCH /promo/:id
**Auth:** Admin  
**Body:** Any partial PromoCode fields  
**Response:** Updated `PromoCode`

---

### DELETE /promo/:id
**Auth:** Admin  
**Response:** `{ ok: true }`

---

## 18. Bonus Targets & Driver Incentives

### GET /admin/bonus-targets
**Auth:** Admin  
**Response:** `{ data: [BonusTarget] }`

---

### POST /admin/bonus-targets
**Auth:** Admin  
**Body:** `{ title, description?, targetType, targetValue, bonusAmount, vehicleType?, startsAt, endsAt, isActive? }`  
**Response (201):** Created `BonusTarget`

---

### PATCH /admin/bonus-targets/:id
**Auth:** Admin  
**Body:** Partial `BonusTarget` fields  
**Response:** Updated target

---

### DELETE /admin/bonus-targets/:id
**Auth:** Admin  
**Response:** `{ ok: true }`

---

### GET /admin/bonus-targets/:id/progress
**Auth:** Admin  
**Response:** Progress data for all drivers on this target

---

### GET /admin/drivers/:id/bonus-progress
**Auth:** Admin  
**Response:** All bonus target progress for a specific driver

---

### GET /driver/bonus-targets
**Auth:** Driver  
**Response:** Active bonus targets with this driver's progress for each

---

## 19. Commission & Exemptions

### GET /admin/commission-exemptions
**Auth:** Admin  
**Response:** `{ data: [CommissionExemption] }`

---

### POST /admin/commission-exemptions
**Auth:** Admin  
**Body:** `{ driverId, startsAt, endsAt, isActive?, notes? }`  
**Response (201):** Created exemption (driver pays 0% commission during window)

---

### PATCH /admin/commission-exemptions/:id
**Auth:** Admin  
**Body:** `{ startsAt?, endsAt?, isActive?, notes? }`  
**Response:** Updated exemption

---

### DELETE /admin/commission-exemptions/:id
**Auth:** Admin  
**Response:** `{ ok: true }`

---

### PATCH /admin/settings/commission
**Auth:** Admin  
**Body:** `{ appCommission?, driverShare?, payoutSchedule?, minimumPayout?, peakBonusRate? }`  
**Response:** Updated commission settings

---

### PATCH /admin/drivers/:id/commission
**Auth:** Admin  
**Body:** `{ commissionRate: number | null }` (null = use global rate)  
**Response:** `{ driverId, commissionRate }`

---

## 20. Notifications

### GET /notifications
**Auth:** Any  
**Response:** `{ data: [Notification] }` — caller's own notifications

---

### POST /notifications
**Auth:** Admin  
**Body:** `{ userId: number, title: string, body: string }`  
**Response (201):** Created notification; emits `notification:new` via WebSocket

---

### GET /admin/notifications/history
**Auth:** Admin  
**Query:** `page?`, `limit?`, `userId?`  
**Response:** `{ data: [Notification], total, page, limit }`

---

### POST /admin/notifications/broadcast
**Auth:** Admin  
**Body:** `{ title: string, body: string, targetRole?: "user"|"driver"|"all" }`  
**Response:** `{ sent: number }` — emits to all matched users via WebSocket

---

### PATCH /notifications/read-all
**Auth:** Any  
**Response:** `{ ok: true, updated: number }`

---

### PATCH /notifications/:id/read
**Auth:** Any  
**Response:** Updated notification with `isRead: true`

---

## 21. Ratings

### GET /admin/ratings
**Auth:** Admin  
**Query:** `page?`, `limit?`, `driverId?`, `type?`  
**Response:** `{ data: [Rating], total, page, limit }`

---

### GET /admin/ratings/stats
**Auth:** Admin  
**Response:** `{ averageRating, distribution: { 1:n, 2:n, 3:n, 4:n, 5:n }, total }`

---

### GET /admin/ratings/:id
**Auth:** Admin  
**Response:** Single rating record

---

### DELETE /admin/ratings/:id
**Auth:** Admin  
**Response:** `{ ok: true }`

---

### GET /user/ratings/given
**Auth:** User  
**Response:** Ratings the authenticated user has submitted

---

## 22. Earnings

### GET /earnings/summary
**Auth:** Any  
**Response:** Earnings summary for calling user

---

### GET /earnings/weekly
**Auth:** Any  
**Response:** Weekly earnings breakdown

---

### GET /earnings
**Auth:** Admin  
**Query:** `driverId?`, `page?`, `limit?`, `status?`  
**Response:** `{ data: [DriverEarning], total, page, limit }`

---

### PATCH /earnings/:id/status
**Auth:** Admin  
**Body:** `{ "status": "pending"|"confirmed"|"paid" }`  
**Response:** Updated earning record

---

## 23. Vehicles (Admin Fleet)

### GET /vehicles
**Auth:** Admin  
**Response:** `{ data: [Vehicle] }`

---

### POST /vehicles
**Auth:** Admin  
**Body:** `{ driverId, plateNumber, model, year, color, vehicleType, ... }`  
**Response (201):** Created `Vehicle`

---

### GET /vehicles/:id
**Auth:** Admin  
**Response:** `Vehicle`

---

### PATCH /vehicles/:id
**Auth:** Admin  
**Body:** Partial Vehicle fields  
**Response:** Updated `Vehicle`

---

### DELETE /vehicles/:id
**Auth:** Admin  
**Response:** `{ ok: true }`

---

## 24. Vehicle Catalog

### GET /vehicles/brands
**Auth:** Any  
**Response:** `{ data: [Brand] }`

---

### GET /vehicles/brands/:id/models
**Auth:** Any  
**Response:** `{ data: [Model] }`

---

### GET /vehicles/models/:id/years
**Auth:** Any  
**Response:** `[number]` — valid model years

---

### GET /vehicles/colors
**Auth:** Any  
**Response:** `{ data: [Color] }`

---

### Admin Catalog Endpoints (all require Admin)

| Method | Path | Body / Notes |
|--------|------|--------------|
| GET | /admin/vehicle-catalog/brands | List all brands |
| POST | /admin/vehicle-catalog/brands | `{ name, isChinese, isActive }` |
| POST | /admin/vehicle-catalog/brands/bulk | `{ brands: [{ name, isChinese }] }` → `{ inserted, data }` |
| POST | /admin/vehicle-brands/bulk-import | `{ brands: [{ name, isChinese, models: [{ name, minYear, maxYear }] }] }` → stats |
| PATCH | /admin/vehicle-catalog/brands/:id | `{ name?, isChinese?, isActive? }` |
| DELETE | /admin/vehicle-catalog/brands/:id | 204 |
| GET | /admin/vehicle-catalog/models | Models with brand names |
| POST | /admin/vehicle-catalog/models | `{ brandId, name, minYear, maxYear?, isActive }` |
| PATCH | /admin/vehicle-catalog/models/:id | Partial fields |
| DELETE | /admin/vehicle-catalog/models/:id | 204 |
| GET | /admin/vehicle-catalog/colors | List all colors |
| POST | /admin/vehicle-catalog/colors | `{ nameAr, nameEn, hexCode?, isActive }` |
| PATCH | /admin/vehicle-catalog/colors/:id | Partial fields |
| DELETE | /admin/vehicle-catalog/colors/:id | 204 |

---

## 25. Service Controls

### Admin Endpoints
| Method | Path | Notes |
|--------|------|-------|
| GET | /admin/services/:type/control | Service types: `car`, `shuttle`, `bike` |
| PATCH | /admin/services/:type/control | `{ isEnabled?, displayMode?, unavailableMessage?, unavailableAction?, activeZoneIds?, maintenanceEta?, maxActiveRides? }` |
| POST | /admin/services/:type/control/reset | Resets to defaults |
| GET | /admin/services/:type/settings | `{ serviceType, minDriverRating, requiredLicenseTypes, requireInsurance, requireBackgroundCheck, maxActiveRidesPerDriver }` |
| PATCH | /admin/services/:type/settings | Partial settings update |

**Response for control endpoints:** `Control & { logs: [Log] }`

### Public Endpoints (Any Auth)
| Method | Path | Response |
|--------|------|----------|
| GET | /services/control | `{ data: [Control] }` — all services |
| GET | /services/:type/control | Single `Control` object |
| GET | /services/:type/settings | Settings for service |

---

## 26. Zone Pricing

### GET /admin/zone-pricing
**Auth:** Admin  
**Query:** `vehicleType?` ("car" or "bike")  
**Response:** `{ data: [ZonePricingWithZoneName] }`

---

### POST /admin/zone-pricing
**Auth:** Admin  
**Body:** `{ zoneId, vehicleType, baseFare, perKmRate, minimumFare, isActive? }`  
**Response:** Created `ZonePricing`

---

### PATCH /admin/zone-pricing/:id
**Auth:** Admin  
**Body:** `{ baseFare?, perKmRate?, minimumFare?, isActive? }`  
**Response:** Updated `ZonePricing`

---

### DELETE /admin/zone-pricing/:id
**Auth:** Admin  
**Response:** 204 No Content

---

## 27. Zones

### GET /zones
**Auth:** Admin  
**Query:** `page?`, `limit?`  
**Response:** `{ data: [Zone], total, page, limit }`

---

### POST /zones
**Auth:** Admin  
**Body:** `{ name, description?, centerLat, centerLng, radiusKm?, services?, isActive? }`  
**Response:** Created `Zone`

---

### GET /zones/:id
**Auth:** Admin  
**Response:** `Zone`

---

### PATCH /zones/:id
**Auth:** Admin  
**Body:** Partial Zone fields  
**Response:** Updated `Zone`

---

### DELETE /zones/:id
**Auth:** Admin  
**Response:** 204 No Content

---

## 28. Payments (Admin)

### GET /admin/payments
**Auth:** Admin  
**Query:** `page?`, `limit?`, `status?`, `method?` (wallet|cash|card), `userId?`, `bookingId?`, `rideId?`, `from?` (ISO), `to?` (ISO)  
**Response:** `{ data: [Payment], total, page, limit }`

---

### GET /admin/payments/summary
**Auth:** Admin  
**Response:** `{ totalAmount, countsByStatus, countsByMethod }`

---

### GET /admin/payments/:id
**Auth:** Admin  
**Response:** `Payment` with user details

---

### PATCH /admin/payments/:id
**Auth:** Admin  
**Body:** `{ status?, notes?, transactionRef? }`  
**Response:** Updated `Payment`

---

## 29. Locations

### GET /admin/driver-locations
**Auth:** Admin  
**Query:** `driverId` (required), `page?`, `limit?`  
**Response:** Paginated historical location records

---

### GET /admin/driver-locations/:driverId/latest
**Auth:** Admin  
**Response:** Latest location for driver

---

### GET /admin/user-locations
**Auth:** Admin  
**Query:** `userId` (required)  
**Response:** Saved locations for user

---

### GET /user/locations
**Auth:** Any  
**Response:** Caller's saved locations

---

### POST /user/locations
**Auth:** Any  
**Body:** `{ label: "home"|"work"|"other", name, address, latitude, longitude, isDefault }`  
**Response:** Created `Location`

---

### PATCH /user/locations/:id
**Auth:** Any (own location)  
**Body:** Partial Location fields  
**Response:** Updated `Location`

---

### DELETE /user/locations/:id
**Auth:** Any (own location)  
**Response:** 204 No Content

---

## 30. Chat

### POST /trips/:id/chat
**Auth:** Any  
**Body:** `{ message: "string" }`  
**Response:** Created `ChatMessage`  
**Side effect:** Emits `trip:chat:message` to trip room and admin

---

### GET /trips/:id/chat
**Auth:** Any  
**Response:** `{ data: [ChatMessage], total }`

---

### GET /admin/chat/stats
**Auth:** Admin  
**Response:** `{ totalMessages, unreadMessages, tripConversations }`

---

### GET /admin/chat
**Auth:** Admin  
**Query:** `page?`, `limit?`  
**Response:** `{ data: [ConversationSummary], total, page, limit }`

---

### GET /admin/chat/trip/:id
**Auth:** Admin  
**Response:** `{ tripId, tripStatus, messages: [ChatMessage], total }` — marks messages as read

---

### POST /admin/chat/trip/:id
**Auth:** Admin  
**Body:** `{ message: "string" }`  
**Response:** Created `ChatMessage` (senderType: admin)

---

### PATCH /admin/chat/messages/:id/read
**Auth:** Admin  
**Response:** Updated `ChatMessage`

---

## 31. Driver Check-in

### POST /driver/checkin
**Auth:** Driver  
**Body:** `multipart/form-data` — `file` (image), `tripId?` (int)  
**Response:** `CheckinRecord & { message }`

---

### GET /driver/checkin/status
**Auth:** Driver  
**Response:** `{ checkInRequired, checkInDeadline, lastCheckInAt, isOnline, onlineSince, recentCheckins: [CheckinRecord] }`

---

### GET /admin/checkins
**Auth:** Admin  
**Query:** `page?`, `limit?`, `driverId?`, `faceDetected?`, `checkInType?`, `since?`  
**Response:** `{ data: [CheckinWithDriverInfo], total, page, limit }`

---

## 32. Support Tickets

### GET /support/tickets
**Auth:** Admin  
**Query:** `page?`, `limit?`, `status?` (open|pending|resolved|closed), `priority?` (low|medium|high), `type?` (passenger|driver), `search?`, `userId?`  
**Response:** `{ data: [Ticket], total, page, limit }`

---

### POST /support/tickets
**Auth:** None  
**Body:** `{ subject, message, type: "passenger"|"driver", priority: "low"|"medium"|"high", userId?, driverId? }`  
**Response:** Created `Ticket`

---

### GET /support/tickets/:id
**Auth:** Admin  
**Response:** `Ticket` with `user`, `driver`, and `messages[]`

---

### PATCH /support/tickets/:id
**Auth:** Admin  
**Body:** `{ status?: "open"|"pending"|"resolved"|"closed", priority?: "low"|"medium"|"high" }`  
**Response:** Updated `Ticket`

---

### POST /support/tickets/:id/messages
**Auth:** Admin  
**Body:** `{ message: "string", senderType: "admin"|"passenger"|"driver" }`  
**Response:** Created `Message`

---

### GET /support/stats
**Auth:** Admin  
**Response:** `{ open, pending, resolved, closed }`

---

## 33. Suggestions

### GET /suggestions
**Auth:** Admin  
**Query:** `page?`, `limit?`, `status?` (pending|approved|rejected), `type?` (new_route|new_station|route_edit), `search?`  
**Response:** `{ data: [Suggestion], total, page, limit }`

---

### POST /suggestions
**Auth:** None  
**Body:** `{ type, title, description, startLocation?, endLocation?, userId?, driverId? }`  
**Response:** Created `Suggestion`

---

### GET /suggestions/:id
**Auth:** Admin  
**Response:** `Suggestion` with `user` and `driver` info

---

### PATCH /suggestions/:id
**Auth:** Admin  
**Body:** `{ status: "pending"|"approved"|"rejected", adminNotes?: "string" }`  
**Response:** Updated `Suggestion`

---

## 34. Tracking & SOS

### GET /track/:token
**Auth:** None (shareable link)  
**Response:**
```json
{
  "rideId": number,
  "status": "string",
  "pickup": { "address", "latitude", "longitude" },
  "dropoff": { "address", "latitude", "longitude" },
  "driver": { "name", "vehicleType", "latitude", "longitude", "locationFresh" } | null,
  "etaMinutes": number,
  "expiresAt": "ISO"
}
```

---

### GET /admin/sos-events
**Auth:** Admin  
**Query:** `status?`, `from?`, `to?`, `limit?`, `offset?`  
**Response:** Log of emergency SOS triggers

---

### POST /admin/sos-events/:id/resolve
**Auth:** Admin  
**Body:** `{ notes?: "string" }`  
**Response:** Resolved SOS event record

---

## 35. Dashboard (Admin)

### GET /dashboard/summary
**Auth:** Admin  
**Response:**
```json
{
  "routes": { "total", "active", "inactive" },
  "stations": { "total" },
  "trips": { "total", "active", "scheduled", "boarding", "upcoming", "cancelled" },
  "fleet": { "totalBuses", "activeBuses", "totalDrivers", "onlineDrivers" },
  "support": { "openTickets", "pendingTickets", "totalMessages" },
  "verifications": { "pending" },
  "suggestions": { "pending" },
  "users": { "total", "passengers", "drivers" },
  "generatedAt": "ISO"
}
```

---

### GET /dashboard/activity
**Auth:** Admin  
**Response:** `{ recentTickets, pendingDocuments, recentSuggestions, upcomingDepartures, activeTrips, recentBookings }`

---

### GET /dashboard/analytics
**Auth:** Admin  
**Response:** `{ tripsPerDay, routePopularity, tripStatusBreakdown, driverActivity, busiestStations, bookingsPerDay }`

---

### GET /dashboard/today
**Auth:** Admin  
**Response:** `{ tripsToday, tripsYesterday, revenueToday, revenueYesterday, driversOnline, passengersActive, last7DaysTrips, last7DaysRevenue, activeTrips, generatedAt }`

---

## 36. Admin — Settings, Users & Analytics

### Commission & Surge

| Method | Path | Body / Notes |
|--------|------|--------------|
| GET | /admin/settings/commission | Returns full commission config |
| PATCH | /admin/settings/commission | `{ appCommission?, driverShare?, payoutSchedule?, minimumPayout?, peakBonusRate? }` |
| PATCH | /admin/drivers/:id/commission | `{ commissionRate: number\|null }` |
| GET | /admin/surge-settings | Surge config + live per-vehicle-type states |
| PATCH | /admin/surge-settings | `{ isEnabled?, multiplier?, maxMultiplier?, activeHoursStart?, activeHoursEnd?, activeZoneIds?, triggerThreshold? }` |

---

### Users

| Method | Path | Query / Notes |
|--------|------|---------------|
| GET | /admin/users | `search?`, `role?`, `page?`, `limit?` — paginated |
| GET | /admin/users/search | `q` (min 2 chars) → fast search |
| GET | /admin/users/:id | Full profile |
| PATCH | /admin/users/:id | `{ name?, email?, phone?, role?, walletBalance? }` |
| PATCH | /admin/users/:id/toggle-block | Toggles `isBlocked` |
| DELETE | /admin/users/:id | Hard delete |

---

### Drivers (Admin)

| Method | Path | Notes |
|--------|------|-------|
| GET | /admin/drivers | `search?`, `status?`, `page?`, `limit?` |
| GET | /admin/drivers/live | All active drivers + current active trips |
| GET | /admin/drivers/dispatch-stats | Driver dispatch metrics (acceptance rate, rejections) |
| DELETE | /admin/drivers/:id | Cascade driver deletion |
| GET | /admin/driver-analytics | Totals, top earners, recent earnings |
| POST | /admin/drivers/:id/check-criminal-record | Manual criminal record audit trigger |

---

### Analytics

| Method | Path | Response |
|--------|------|----------|
| GET | /admin/analytics | Global stats (users, revenue, bookings) |
| GET | /admin/analytics/passengers | Top passengers + activity trends |
| GET | /admin/analytics/services | Revenue/usage breakdown by service type |
| GET | /admin/analytics/promo | Promo code performance |
| GET | /admin/analytics/complaints | Support ticket breakdown + resolution trends |

---

### App Settings

| Method | Path | Body |
|--------|------|------|
| GET | /admin/settings/app | All global app settings |
| PUT | /admin/settings/app | Full replace |
| PATCH | /admin/settings/app | Partial update `{ appName?, supportEmail?, supportPhone?, ... }` |
| GET | /admin/settings | All raw key/value pairs |
| PATCH | /admin/settings | `{ key, value }` — upsert single setting |
| GET | /admin/settings/:key | Get specific setting |

---

### Dispatch

| Method | Path | Notes |
|--------|------|-------|
| GET | /admin/dispatch/peak-settings | Peak hour windows + dispatch logic config |
| PUT | /admin/dispatch/peak-settings | `{ dispatch_peak_windows?, dispatch_drivers_per_round?, ... }` |

---

### Job Queue

| Method | Path | Notes |
|--------|------|-------|
| GET | /admin/queue/status | `{ pending, dlq, failures }` |
| POST | /admin/queue/retry/:jobId | Retry single job |
| POST | /admin/queue/retry-all | Retry all DLQ jobs |

---

### Other Admin

| Method | Path | Notes |
|--------|------|-------|
| GET | /admin/transactions | Paginated wallet transaction log |
| POST | /admin/trips/:id/cancel | Cancel shuttle trip with refunds |
| GET | /admin/bookings | `status?`, `search?`, `page?`, `limit?` |
| GET | /admin/duplicate-alerts | `resolved?`, `matchType?`, `page?`, `limit?` |
| PATCH | /admin/duplicate-alerts/:id/resolve | `{ notes? }` |
| GET | /admin/car-categories | List ride car categories |
| POST | /admin/car-categories | `{ name, slug, minYear, baseFare, perKmRate, minimumFare, ... }` |
| PATCH | /admin/car-categories/:id | Partial update |
| DELETE | /admin/car-categories/:id | 204 |

---

## 37. Staff & Roles

### GET /admin/permissions/all
**Auth:** Admin  
**Response:** `{ permissions: [string] }`

---

### GET /admin/roles
**Auth:** Admin  
**Response:** `{ data: [Role], total }`

---

### POST /admin/roles
**Auth:** Admin  
**Body:** `{ name, description, permissions: [string] }`  
**Response:** Created `Role`

---

### PATCH /admin/roles/:id
**Auth:** Admin  
**Body:** `{ name?, description?, permissions? }`  
**Response:** Updated `Role`

---

### DELETE /admin/roles/:id
**Auth:** Admin  
**Response:** `{ success: true }`

---

### GET /admin/staff
**Auth:** Admin  
**Query:** `search?`  
**Response:** Admin users with their roles

---

### POST /admin/staff
**Auth:** Admin  
**Body:** `{ name, email, phone, password, staffRoleId }`  
**Response:** Created staff user (password omitted)

---

### PATCH /admin/staff/:id
**Auth:** Admin  
**Body:** `{ name?, email?, phone?, staffRoleId?, isBlocked?, password? }`  
**Response:** Updated staff user

---

### DELETE /admin/staff/:id
**Auth:** Admin  
**Response:** `{ success: true }`

---

## 38. Audit Logs

### GET /admin/audit-logs
**Auth:** Admin  
**Query:** `page?`, `limit?`, `action?`, `entityType?`, `userId?`, `from?`, `to?`  
**Response:** `{ data: [AuditLog], total, page, limit }`

---

### GET /admin/audit-logs/:id
**Auth:** Admin  
**Response:** `AuditLog` detail

---

### GET /admin/audit-logs/distinct/actions
**Auth:** Admin  
**Response:** `[string]` — unique action names

---

### GET /admin/audit-logs/distinct/entity-types
**Auth:** Admin  
**Response:** `[string]` — unique entity types

---

## 39. Driver Documents

### GET /driver-documents
**Auth:** Admin  
**Query:** `page?`, `limit?`, `verificationStatus?`, `type?`  
**Response:** Paginated document list

---

### GET /driver-documents/by-driver/:driverId
**Auth:** Admin  
**Response:** All documents for a driver

---

### POST /driver-documents/upload/:driverId
**Auth:** Any  
**Body:** `multipart/form-data` — `file` (image), `type` (document type enum)  
**Response:** Uploaded document record

---

### PATCH /driver-documents/:id
**Auth:** Admin  
**Body:** `{ verificationStatus, adminNotes? }`  
**Response:** Updated document  
**Note:** Approving all required documents automatically activates the driver

---

### GET /driver-documents/stats
**Auth:** Admin  
**Response:** `{ pending, approved, rejected, expired }` counts

---

## 40. Health

### GET /health
**Auth:** None  
**Response:** `{ status: "ok", timestamp: "ISO" }`

---

### GET /healthz
**Auth:** None  
**Response:** `{ status: "ok" }`

---

### GET /health/db
**Auth:** None  
**Response:** DB connectivity status and latency

---

## WebSocket Events

**Connection:** `wss://<domain>/socket.io` with `Authorization: Bearer <jwt>`

### Socket Rooms

| Room Constant | Room Name | Who Joins |
|---------------|-----------|-----------|
| `ADMIN` | `admin:room` | Admin users |
| `PASSENGERS_ALL` | `passengers:all` | All connected passengers |
| `PASSENGER(userId)` | `passenger:{userId}` | Specific passenger |
| `DRIVER(userId)` | `driver:{userId}` | Specific driver |
| `DRIVERS_AVAILABLE(type)` | `drivers:available:{vehicleType}` | Available drivers by type |
| `TRIP(tripId)` | `trip:{tripId}` | Everyone in a shuttle trip |

---

### Server → Client Events (Ride)

| Event | Room | Payload |
|-------|------|---------|
| `ride:driver_assigned` | `passenger:{id}` | `{ rideId, driverId, driverName, driver: { name, phone, vehicle, rating }, eta }` |
| `ride:driver_arrived` | `passenger:{id}` | `{ rideId, driverId }` |
| `ride:started` | `passenger:{id}` | `{ rideId, driverId }` |
| `ride:completed` | `passenger:{id}` | `{ rideId, finalPrice, fare, waitingCharge }` |
| `ride:cancelled` | `driver:{userId}` | `{ rideId, cancelledBy, reason, cancellationFee }` |
| `ride:driver_cancelled` | `passenger:{id}` | `{ rideId, message }` |
| `ride:no_show_cancelled` | `passenger:{id}` | `{ rideId, reason }` |
| `ride:driver_location` | `passenger:{id}` | `{ rideId, location: { latitude, longitude }, timestamp }` |
| `ride:status_update` | `passenger:{id}` | `{ rideId, status }` |
| `ride:deviation_warning` | Passenger + Admin + Driver | `{ rideId, driverLat, driverLng, deviationMeters, detectedAt }` |

---

### Server → Client Events (Driver Dispatch)

| Event | Room | Payload |
|-------|------|---------|
| `ride:offer` | `driver:{userId}` | `{ rideId, vehicleType, pickupAddress, dropoffAddress, distanceKm, estimatedPrice, expiresInSeconds }` |
| `ride:new_request` | `drivers:available:{type}` | `{ rideId, vehicleType, pickupAddress, dropoffAddress, distanceKm, estimatedPrice }` |
| `ride:offer_expired` | `driver:{userId}` | `{ rideId, reason: "round_expired" }` |
| `ride:no_longer_available` | `driver:{userId}` | `{ rideId, reason: "accepted_by_another" }` |

---

### Server → Client Events (Waiting Charge)

| Event | Room | Payload |
|-------|------|---------|
| `ride:waiting:charge:started` | `passenger:{id}` | `{ rideId, ratePerMinute, freeWindowMinutes, maxCharge }` |
| `ride:waiting:charge:updated` | `passenger:{id}` | `{ rideId, chargedMinutes, runningTotal, ratePerMinute, maxCharge }` |
| `ride:waiting:charge:capped` | `passenger:{id}` | `{ rideId, maxCharge, chargedMinutes }` |

---

### Server → Client Events (Shuttle)

| Event | Room | Payload |
|-------|------|---------|
| `shuttle:booking:created` | Passenger | `{ bookingId, tripId, routeName }` |
| `shuttle:booking:cancelled` | Passenger | `{ bookingId, reason }` |
| `shuttle:renewal:confirmed` | Driver | `{ bookingId, nextWeek }` |
| `shuttle:booking:reassigned` | Driver | `{ bookingId, newDriverId }` |
| `shuttle:driver:location` | `trip:{tripId}` | `{ tripId, driverId, lat, lng, heading }` |
| `shuttle:checkin:required` | `driver:{userId}` | `{ tripId, deadlineMinutes, message }` |
| `shuttle:station:timeout` | `driver:{userId}` | `{ tripId, stationId }` |
| `booking:boarded` | `passenger:{id}` | `{ bookingId, passengerId, timestamp }` |

---

### Server → Client Events (General)

| Event | Room | Payload |
|-------|------|---------|
| `notification:new` | Passenger or Driver | `{ id, category, title, body, time }` |
| `trip:chat:message` | `trip:{tripId}` + Admin | `{ id, tripId, senderId, senderType, message, createdAt }` |
| `surge:updated` | `passengers:all` | `{ vehicleType, multiplier, previousMultiplier, tier, ratio, isActive }` |
| `service:control:changed` | All connected | `{ serviceType, isEnabled, unavailableMessage }` |
| `service:settings:changed` | All connected | `{ serviceType, ...settings }` |
| `sos:triggered` | `admin:room` | `{ sosId, rideId, userId, role, latitude, longitude, notes, triggeredAt }` |

---

### Server → Client Events (Driver Check-in)

| Event | Payload |
|-------|---------|
| `driver:checkin:required` | `{ tripId, deadlineMinutes, message }` |
| `driver:checkin:approved` | `{ checkinId, checkInType, submittedAt }` |
| `driver:checkin:rejected` | `{ checkinId, reason }` |
| `driver:cooldown:cleared` | `{ driverId }` |

---

### Client → Server Events

| Event | Payload | Notes |
|-------|---------|-------|
| `driver:location:update` | `{ latitude, longitude, speed, heading, tripId? }` | Driver broadcasts real-time GPS |
| `driver:ride:location` | `{ rideId, latitude, longitude }` | Driver location for active ride (forwarded to passenger) |
| `join` | `{ room: string }` | Join a named room |
| `passenger:join:trip` | `{ tripId }` | Passenger subscribes to trip location updates |
| `driver:trip:start` | `{ tripId }` | Driver signals trip started (via socket) |
| `driver:trip:complete` | `{ tripId }` | Driver signals trip completed (via socket) |
| `driver:status:online` | — | Moves driver to available room |
| `driver:status:offline` | — | Removes driver from available room |
| `driver:status:busy` | — | Removes driver from available room |

---

## Final Stats

| Metric | Count |
|--------|-------|
| **Total route files** | 35 |
| **Total HTTP endpoints** | 320 |
| **Passenger-facing endpoints** | ~65 |
| **Driver-facing endpoints** | ~55 |
| **Admin-only endpoints** | ~180 |
| **Public (no auth) endpoints** | ~20 |
| **WebSocket server→client event types** | 32 |
| **WebSocket client→server event types** | 8 |
| **Socket rooms** | 6 patterns |
| **Services covered** | Ride-hailing (car, motorcycle, scooter, delivery), Shuttle, Admin |
| **Auth roles** | user (passenger), driver, admin |

---

*Generated: 2026-06-12 | VeeGo Backend Monorepo*
