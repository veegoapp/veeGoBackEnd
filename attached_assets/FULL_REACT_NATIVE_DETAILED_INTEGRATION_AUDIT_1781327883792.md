# VeeGo Passenger App — Full Technical Integration Audit

**Generated:** June 2025  
**Scope:** Full codebase audit — UI, API, state management, navigation, dead code, broken integrations  
**Framework:** React Native (Expo SDK 52, Expo Router v6)  
**Language:** TypeScript  
**API Client:** Axios (`src/api/client.ts`)  
**Realtime:** Socket.io (`src/api/socket.ts`)

---

## Table of Contents

1. [Full UI + Screen Inventory](#1-full-ui--screen-inventory)
2. [Full API Inventory](#2-full-api-inventory)
3. [Screen → API Mapping](#3-screen--api-mapping)
4. [Working Status Analysis](#4-working-status-analysis)
5. [Dead Code / Dead UI Detection](#5-dead-code--dead-ui-detection)
6. [Missing Integrations](#6-missing-integrations)
7. [Broken or Incorrect Integrations](#7-broken-or-incorrect-integrations)
8. [State Management Analysis](#8-state-management-analysis)
9. [Authentication Flow](#9-authentication-flow)
10. [Navigation + Feature Coverage](#10-navigation--feature-coverage)
11. [Backend Connection Health Score](#11-backend-connection-health-score)
12. [Risk Assessment](#12-risk-assessment)
13. [Final Actionable Fix Plan](#13-final-actionable-fix-plan)

---

## 1. Full UI + Screen Inventory

### 1.1 Entry & Onboarding Screens

---

#### `app/index.tsx` — Splash / Entry Screen
**Purpose:** App entry point. Reads stored tokens and preferences, then routes to language selection, onboarding, or main tabs.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| VeeGo logo (animated) | Animated image | None — decorative | No | Working |
| Loading progress bar | Animated View | None — auto-advances | No | Working |
| Auto-navigation logic | `useEffect` | Reads AsyncStorage; routes to `lang-select`, `onboarding`, or `/(tabs)` | No (local storage only) | Working |

**Notes:** No user-triggered buttons. Fully automatic routing.

---

#### `app/lang-select.tsx` — Language Selection
**Purpose:** First-run language selection between English and Arabic.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| English card | `TouchableOpacity` | Sets language to `en`, navigates to `/onboarding` | No | Working |
| Arabic card | `TouchableOpacity` | Sets language to `ar`, navigates to `/onboarding` | No | Working |

**Notes:** Language persisted to `AsyncStorage` via `ThemeContext`. No backend call.

---

#### `app/onboarding.tsx` — Onboarding Slides
**Purpose:** 3-slide feature introduction carousel.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Slide illustrations | `Image` | Decorative | No | Working |
| Dot indicators | View | Passive — reflects current slide | No | Working |
| Skip button | `TouchableOpacity` | Navigates directly to `/auth` | No | Working |
| Next button | `TouchableOpacity` | Advances slide; on last slide navigates to `/auth` | No | Working |
| Get Started button (last slide) | `TouchableOpacity` | Navigates to `/auth` | No | Working |

---

#### `app/auth.tsx` — Authentication
**Purpose:** Login, registration, and full password-reset (OTP) flow.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Sign In tab | `TouchableOpacity` | Switches to login form | No | Working |
| Sign Up tab | `TouchableOpacity` | Switches to register form | No | Working |
| Forgot Password tab | `TouchableOpacity` | Switches to forgot-password form | No | Working |
| Email/Phone input | `TextInput` | Captures credential | No | Working |
| Password input | `TextInput` | Captures password (masked) | No | Working |
| Show/hide password icon | `TouchableOpacity` | Toggles `secureTextEntry` | No | Working |
| Sign In button | `TouchableOpacity` | `POST /auth/login` → stores tokens → navigates to `/(tabs)` | **Yes** | Working |
| Sign Up button | `TouchableOpacity` | `POST /auth/register` → stores tokens → navigates to `/(tabs)` | **Yes** | Working |
| Send OTP button | `TouchableOpacity` | `POST /auth/forgot-password` → transitions to OTP input view | **Yes** | Working |
| Verify OTP button | `TouchableOpacity` | `POST /auth/verify-otp` → stores reset token | **Yes** | Working |
| Reset Password button | `TouchableOpacity` | `POST /auth/reset-password` → returns to login | **Yes** | Working |
| Language toggle (EN/AR) | `TouchableOpacity` | Swaps app locale in-screen | No | Working |
| Error message display | `Text` | Shows API error messages inline | No | Working |

---

### 1.2 Main Tab Screens (`app/(tabs)/`)

---

#### `app/(tabs)/index.tsx` — Home Screen
**Purpose:** Service mode selector (Shuttle, Car, Scooter, Delivery) with search, debt banner, active ticket widget, and quick route cards.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Bell / Notifications icon | `TouchableOpacity` | Navigates to `/notifications` | No | Working |
| Avatar icon (top right) | `TouchableOpacity` | **No `onPress` handler — does nothing** | No | **Dead** |
| Service tabs (Shuttle, Car, Scooter, Delivery) | `TouchableOpacity` ×4 | Switches `ServiceMode` state; Car/Scooter tabs navigate to `/(tabs)/car`; Delivery shows "Coming Soon" alert | `ServiceControlContext` | Working |
| Debt banner CTA | `TouchableOpacity` | Shows wallet recharge alert | No (local alert) | Working |
| Shuttle search bar | `TouchableOpacity` | Navigates to `/routes` | No | Working |
| Car/Scooter pickup field | `TouchableOpacity` | Opens inline location search dropdown | No | Working |
| Car/Scooter dropoff field | `TouchableOpacity` | Opens inline location search dropdown | No | Working |
| Location suggestion item | `TouchableOpacity` | Selects location, fills field | No (local `WG_COORDS`) | Working (static data) |
| Active ticket widget | `TouchableOpacity` | Navigates to `/ticket` | No | Working |
| Route card (popular routes) | `TouchableOpacity` | Triggers `BookingContext.openRoute()` → opens `TripSheet` | No (routes from context) | Working |
| See All (routes) | `TouchableOpacity` | Navigates to `/(tabs)/routes` | No | Working |

**Critical Issue:** The Avatar button (`TouchableOpacity` at line ~214) has **no `onPress`** — it is a completely dead button visible on the main screen.

---

#### `app/(tabs)/car.tsx` — Car Ride Booking
**Purpose:** Full ride-hailing flow for car and scooter: location entry → price estimate → finding driver → live tracking → completion/rating.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Pickup PlacePicker | `TouchableOpacity` | Opens dropdown with `WG_COORDS` static locations | No (hardcoded coords) | Working (static) |
| Dropoff PlacePicker | `TouchableOpacity` | Opens dropdown with `WG_COORDS` static locations | No (hardcoded coords) | Working (static) |
| Promo code input | `TextInput` | Captures promo string | No | Working |
| Apply promo button | `TouchableOpacity` | `POST /promo/validate` | **Yes** | Working |
| Confirm Ride button | `TouchableOpacity` | `POST /rides/request` → transitions to `finding` phase | **Yes** | Working |
| Cancel Ride button | `TouchableOpacity` | `PATCH /rides/{id}/cancel` | **Yes** | Working |
| Safety (SOS) button | `TouchableOpacity` | Opens `SafetySheet` — only shows `Alert.alert` locally | No API | **Dead (no SOS API)** |
| Driver Call button | `TouchableOpacity` | Opens phone dialer via `Linking.openURL('tel:...')` | No | Working |
| Driver Chat button | `TouchableOpacity` | Opens in-app chat modal (`useRideChat`) | **Yes** (socket + REST) | Working |
| Rate Driver (submit) | `TouchableOpacity` | `POST /rides/{id}/rate-driver` | **Yes** | Working |
| Rate Driver (skip) | `TouchableOpacity` | Dismisses rating sheet, resets phase | No | Working |
| Try Again button (error state) | `TouchableOpacity` | Resets ride state to `request` phase | No | Working |
| Custom grid map | Static view | Decorative map visualization with hardcoded pin positions | No real map | **Mock/Static** |

---

#### `app/(tabs)/routes.tsx` — Route Discovery
**Purpose:** Browse and search all available shuttle lines.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Search input | `TextInput` | Filters route list locally | No (client-side filter) | Working |
| Filter chips (line codes) | `TouchableOpacity` | Filters list by line code | No (client-side) | Working |
| Route card | `TouchableOpacity` | Opens `TripSheet` via `BookingContext.openRoute()` | No (triggers context) | Working |
| Refresh / Pull-to-refresh | ScrollView gesture | Re-calls `GET /shuttle/lines` | **Yes** | Working |

---

#### `app/(tabs)/trips.tsx` — My Trips
**Purpose:** Paginated history of shuttle bookings and car/scooter rides, split into Upcoming and Past tabs.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Upcoming tab | `TouchableOpacity` | Switches to upcoming filter | No | Working |
| Past tab | `TouchableOpacity` | Switches to past filter | No | Working |
| Trip card (shuttle) | `TouchableOpacity` | Navigates to `/trip-detail?id={bookingId}` | No | Working |
| Trip card (ride) | `TouchableOpacity` | Navigates to `/receipt?id={rideId}` or shows status | No | Working |
| Cancel button (upcoming) | `TouchableOpacity` | Shows confirmation Alert → `DELETE /shuttle/bookings/{id}` | **Yes** | Working |
| Load more (pagination) | Scroll trigger | Fetches next page of `GET /users/me/bookings` | **Yes** | Working |

---

#### `app/(tabs)/wallet.tsx` — Wallet
**Purpose:** View balance, recharge wallet, view transactions, access promos.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Balance display | `Text` | Shows current wallet balance | `GET /wallet` | Working |
| Recharge amount chips (50/100/200/500 EGP) | `TouchableOpacity` ×4 | Sets selected `rechargeAmount` locally | No | Working |
| Recharge button | `TouchableOpacity` | Shows confirm Alert → `POST /wallet/topup` | **Yes** | Working |
| Transfer button | `TouchableOpacity` | Shows **"Coming Soon"** alert — no API | No | **Dead** |
| Promo code button | `TouchableOpacity` | Navigates to `/promo` | No | Working |
| Transaction list item | `FlatList` item | Non-interactive — displays tx data | No | Working |
| Debt CTA in banner | `TouchableOpacity` | Triggers recharge confirm alert | No | Working |

---

#### `app/(tabs)/favorites.tsx` — Favorites
**Purpose:** Saved shuttle routes and frequently used car/scooter destinations.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Favorite route card | `TouchableOpacity` | Opens `TripSheet` for that route | No | Working |
| Remove favorite (heart icon) | `TouchableOpacity` | Removes from `FavoritesContext` (AsyncStorage) | No | Working |
| Frequent destination card | `TouchableOpacity` | Pre-fills pickup/dropoff on Home tab | No | Working |
| Rebook button | `TouchableOpacity` | Navigates to `/(tabs)/car` with pre-filled params | No | Working |

---

#### `app/(tabs)/profile.tsx` — Profile & Settings
**Purpose:** Account information, security settings, preferences, help links, and logout.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Edit profile photo | `TouchableOpacity` | Opens image picker — **no upload API call** | No API | **Dead** |
| Personal Info row | `TouchableOpacity` | Opens `PersonalInfoModal` | No | Working |
| Save profile button (in modal) | `TouchableOpacity` | `PATCH /users/me` | **Yes** | Working |
| Payment Methods row | `TouchableOpacity` | Shows **"Coming Soon"** alert | No | **Dead** |
| Security row | `TouchableOpacity` | Opens `SecurityModal` | No | Working |
| Biometric toggle | `Switch` | Calls `PATCH /users/me` with `biometricEnabled` | **Yes** | Working |
| 2FA toggle | `Switch` | Calls `PATCH /users/me` with `twoFactorEnabled` | **Yes** | Working |
| Privacy & Data row | `TouchableOpacity` | Opens informational modal — no action | No | Working |
| Notifications toggle | `Switch` | Toggles local push notification preferences | No API | Partial |
| Dark Mode toggle | `Switch` | Updates `ThemeContext` → saved to AsyncStorage | No | Working |
| Language row | `TouchableOpacity` | Opens language picker sheet | No | Working |
| Help & FAQ row | `TouchableOpacity` | Opens `SupportModal` inline | No | Working |
| Contact Support row | `TouchableOpacity` | Navigates to `/support` | No | Working |
| Delete Account button | `TouchableOpacity` | Shows Alert only — **no API call, no actual deletion** | No | **Dead** |
| Sign Out button | `TouchableOpacity` | Clears tokens, clears contexts, navigates to `/auth` | No API needed | Working |
| Phone field (Personal Info) | `TextInput` | Hardcoded `+20 100 000 0000`, `editable={false}` | No | **Dead (static)** |

---

### 1.3 Flow / Utility Screens

---

#### `app/ticket.tsx` — Boarding Pass
**Purpose:** Live digital boarding pass with QR code for the passenger's active shuttle booking.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Back/close button | `TouchableOpacity` | Navigates to `/(tabs)` home | No | Working |
| Share icon | `TouchableOpacity` | Opens native share sheet with trip link | No API | Working |
| QR code display | `QRCode` component | Renders booking ID as scannable QR | No | Working |
| Boarded banner | Auto-display | Shows on socket event `booking:boarded` | **Socket** | Working |
| Live tracking badge | Auto-display | Shows driver location on socket event | **Socket** | Working |

---

#### `app/trip-detail.tsx` — Shuttle Trip Detail
**Purpose:** Full details for a specific shuttle booking with live driver tracking and cancellation.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Back button | `TouchableOpacity` | `router.back()` | No | Working |
| Cancel booking button | `TouchableOpacity` | Shows refund policy Alert → `DELETE /shuttle/bookings/{id}` | **Yes** | Working |
| Share / Invite friends button | `TouchableOpacity` | Opens native share sheet with deep link | No API | Working |
| Driver location map | Live map view | Updates via socket `passenger:trip:tracking` | **Socket** | Working |
| Status badge | Auto-display | Reflects live status from socket | **Socket** | Working |

---

#### `app/trip-tracking.tsx` — Live Ride Tracking
**Purpose:** Fullscreen map for live car/scooter ride tracking.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Back button | `TouchableOpacity` | `router.back()` | No | Working |
| Call driver button | `TouchableOpacity` | `Linking.openURL('tel:{phone}')` | No API | Working |
| Driver status display | Auto-display | Updates via socket events | **Socket** | Working |

---

#### `app/receipt.tsx` — Post-Ride Receipt
**Purpose:** Shows fare breakdown after a completed car/scooter ride. Allows driver rating.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Rate Driver button | `TouchableOpacity` | Opens rating sheet → `POST /rides/{id}/rate-driver` | **Yes** | Working |
| Done button | `TouchableOpacity` | Navigates to `/(tabs)` home | No | Working |
| Fare row display | `Text` | Shows base fare, waiting charge, discount | No (passed as params) | Working |

---

#### `app/stations.tsx` — Station List
**Purpose:** Lists all stops for a specific shuttle route with distance/ETA info.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Back button | `TouchableOpacity` | `router.back()` | No | Working |
| Station card | Non-interactive list | Displays station name, area | No | Working |
| Refresh (pull-to-refresh) | ScrollView gesture | Re-calls `GET /routes/{id}/stations` | **Yes** | Working |

---

#### `app/notifications.tsx` — Notification Center
**Purpose:** Inbox for all system and trip notifications with unread indicators.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Back button | `TouchableOpacity` | `router.back()` | No | Working |
| Mark All Read button | `TouchableOpacity` | `PATCH /notifications/read-all` | **Yes** | Working |
| Notification card | `TouchableOpacity` | Context-aware deep navigation (e.g., to `/trip-detail` or `/promo`) | No | Working |

---

#### `app/promo.tsx` — Promotions
**Purpose:** View available promo offers and manually enter/apply a promo code.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Back button | `TouchableOpacity` | `router.back()` | No | Working |
| Code input | `TextInput` | Captures promo code string | No | Working |
| Apply button | `TouchableOpacity` | `POST /promo/validate` | **Yes** | Working |
| Promo card | `TouchableOpacity` | Auto-fills and applies that card's code | **Yes** (via same validate) | Working |

---

#### `app/support.tsx` — Support / Help Center
**Purpose:** Send a support ticket and access direct contact channels.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Back button | `TouchableOpacity` | `router.back()` | No | Working |
| Live Chat card | `TouchableOpacity` | Opens WhatsApp via `Linking.openURL` | No API | Working |
| Phone card | `TouchableOpacity` | Dials number via `Linking.openURL('tel:...')` | No API | Working |
| Issue type chips | `TouchableOpacity` | Selects issue category locally | No | Working |
| Message textarea | `TextInput` | Captures issue description | No | Working |
| Send button | `TouchableOpacity` | `POST /support/tickets` | **Yes** | Working |

---

#### `app/suspended.tsx` — Account Suspended
**Purpose:** Informational lockout screen displayed when a user has multiple no-show offenses.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Contact Support button | `TouchableOpacity` | Opens WhatsApp via `Linking.openURL` | No API | Working |

---

### 1.4 Overlay / Sheet Components

---

#### `components/TripSheet.tsx` — Shuttle Booking Sheet
**Purpose:** Slide-up sheet for selecting trip date, time, seat count, and proceeding to confirmation.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Close button | `TouchableOpacity` | Dismisses sheet | No | Working |
| Date selector | Date picker | Sets `selectedDate` | No | Working |
| Time slot chips | `TouchableOpacity` | Sets selected trip slot | Context (`scheduledTrips`) | Working |
| Seat +/- buttons | `TouchableOpacity` | Adjusts `seatCount` | No | Working |
| Heart / Favorite button | `TouchableOpacity` | **No `onPress` — does nothing** | No | **Dead** |
| Review & Confirm button | `TouchableOpacity` | Opens `ConfirmSheet` | No | Working |

---

#### `components/ConfirmSheet.tsx` — Booking Confirmation Sheet
**Purpose:** Final review of booking details before payment deduction.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Edit Details button | `TouchableOpacity` | Goes back to `TripSheet` | No | Working |
| Confirm & Pay button | `TouchableOpacity` | `POST /bookings` → navigates to `/ticket` | **Yes** | Working |

---

#### `components/shared/SafetySheet.tsx` — Safety / SOS Sheet
**Purpose:** Emergency safety options during an active ride.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| SOS / Emergency button | `TouchableOpacity` | Shows `Alert.alert` only — **no emergency API or call** | No | **Dead** |
| Share ride button | `TouchableOpacity` | Opens native share sheet | No API | Working |
| Close button | `TouchableOpacity` | Dismisses sheet | No | Working |

---

#### `components/bike/BikeServiceScreen.tsx` — Bike/Scooter Service
**Purpose:** UI for the bike/scooter service tab.

| Element | Type | Action | Backend | Status |
|---------|------|---------|---------|--------|
| Bike map | Static view | Renders `MOCK_RIDER` data — hardcoded dummy rider | No | **Mock data** |
| Book button | `TouchableOpacity` | Shows "Coming Soon" alert | No | **Dead** |

---

## 2. Full API Inventory

### 2.1 Authentication Endpoints

| # | Method | Endpoint | File | Purpose |
|---|--------|----------|------|---------|
| 1 | POST | `/auth/login` | `app/auth.tsx` | User login; returns access + refresh tokens |
| 2 | POST | `/auth/register` | `app/auth.tsx` | New user registration |
| 3 | POST | `/auth/refresh` | `src/api/client.ts` (interceptor) | Refreshes expired access token |
| 4 | POST | `/auth/forgot-password` | `app/auth.tsx` | Sends OTP to user's contact |
| 5 | POST | `/auth/verify-otp` | `app/auth.tsx` | Verifies OTP, returns reset token |
| 6 | POST | `/auth/reset-password` | `app/auth.tsx` | Resets password with verified reset token |

### 2.2 User / Profile Endpoints

| # | Method | Endpoint | File | Purpose |
|---|--------|----------|------|---------|
| 7 | GET | `/users/me` | `src/hooks/useProfile.ts`, `src/hooks/useNotifications.ts` | Fetch current user profile |
| 8 | PATCH | `/users/me` | `src/hooks/useProfile.ts` | Update profile fields (name, email, biometric, 2FA) |
| 9 | POST | `/users/me/push-token` | `src/hooks/usePushToken.ts` | Register Expo push token for notifications |

### 2.3 Shuttle / Routes Endpoints

| # | Method | Endpoint | File | Purpose |
|---|--------|----------|------|---------|
| 10 | GET | `/shuttle/lines` | `src/api/shuttleService.ts`, `src/hooks/useRoutes.ts` | List all active shuttle routes |
| 11 | GET | `/shuttle/lines/:id` | `src/api/shuttleService.ts` | Route detail with next 20 trip slots |
| 12 | GET | `/trips/:id` | `src/api/shuttleService.ts` | Single trip details |
| 13 | GET | `/routes/:id/stations` | `src/api/shuttleService.ts` | Ordered station list for a route |
| 14 | GET | `/shuttle/my-debt` | `src/api/shuttleService.ts`, `src/hooks/useMyDebt.ts`, `src/hooks/useDebt.ts` | Check outstanding cash debt / no-show count |

### 2.4 Booking Endpoints

| # | Method | Endpoint | File | Purpose |
|---|--------|----------|------|---------|
| 15 | GET | `/users/me/bookings` | `src/api/shuttleService.ts`, `src/hooks/useTrips.ts` | All shuttle bookings for current user (paginated) |
| 16 | GET | `/bookings/:id` | `src/api/shuttleService.ts` | Single booking detail |
| 17 | GET | `/bookings` | `src/hooks/useFavoriteDestinations.ts` | All bookings (for deriving frequent routes) |
| 18 | POST | `/bookings` | `src/api/shuttleService.ts` | Create new shuttle booking |
| 19 | DELETE | `/shuttle/bookings/:id` | `src/api/shuttleService.ts` | Cancel shuttle booking |

### 2.5 Ride-Hailing Endpoints

| # | Method | Endpoint | File | Purpose |
|---|--------|----------|------|---------|
| 20 | POST | `/rides/request` | `src/hooks/useRide.ts` | Request a new car/scooter ride |
| 21 | GET | `/rides/:id` | `src/hooks/useRide.ts` | Poll current ride status |
| 22 | GET | `/rides` | `src/hooks/useTrips.ts`, `src/hooks/useFavoriteDestinations.ts` | Fetch user's ride history |
| 23 | PATCH | `/rides/:id/cancel` | `src/hooks/useRide.ts` | Cancel active ride |
| 24 | POST | `/rides/:id/rate-driver` | `app/(tabs)/car.tsx` (direct) | Submit star rating + comment for driver |

### 2.6 Wallet Endpoints

| # | Method | Endpoint | File | Purpose |
|---|--------|----------|------|---------|
| 25 | GET | `/wallet` | `src/hooks/useWallet.ts` | Current balance and spending summary |
| 26 | GET | `/wallet/transactions` | `src/hooks/useWallet.ts` | Paginated transaction history |
| 27 | POST | `/wallet/topup` | `src/hooks/useWallet.ts` | Top-up wallet (cash/payment method) |

### 2.7 Promo Endpoints

| # | Method | Endpoint | File | Purpose |
|---|--------|----------|------|---------|
| 28 | GET | `/promo` | `src/hooks/usePromos.ts` | Fetch available promo offers |
| 29 | POST | `/promo/validate` | `src/hooks/usePromos.ts` | Validate and apply a promo code |

### 2.8 Notifications Endpoints

| # | Method | Endpoint | File | Purpose |
|---|--------|----------|------|---------|
| 30 | GET | `/notifications` | `src/hooks/useNotifications.ts` | Fetch notification history |
| 31 | PATCH | `/notifications/read-all` | `src/hooks/useNotifications.ts` | Mark all notifications as read |

### 2.9 Chat Endpoints

| # | Method | Endpoint | File | Purpose |
|---|--------|----------|------|---------|
| 32 | GET | `/trips/:id/chat` | `src/hooks/useRideChat.ts` | Fetch chat history with driver |
| 33 | POST | `/trips/:id/chat` | `src/hooks/useRideChat.ts` | Send message to driver |

### 2.10 Support Endpoints

| # | Method | Endpoint | File | Purpose |
|---|--------|----------|------|---------|
| 34 | POST | `/support/tickets` | `app/support.tsx` (direct) | Submit a support ticket |

### 2.11 Socket.io Real-time Events

| Direction | Event | Screen | Purpose |
|-----------|-------|--------|---------|
| Server → Client | `ride:driver_assigned` | `car.tsx` via `useRide` | Driver matched, transitions to `driver_assigned` phase |
| Server → Client | `ride:driver_location` | `car.tsx`, `trip-tracking.tsx` | Driver GPS position update |
| Server → Client | `ride:driver_arrived` | `car.tsx` | Driver has reached pickup |
| Server → Client | `ride:started` | `car.tsx` | Ride has started |
| Server → Client | `ride:completed` | `car.tsx` | Ride finished → triggers rating/receipt |
| Server → Client | `ride:cancelled` | `car.tsx` | Ride cancelled by driver or timeout |
| Server → Client | `booking:boarded` | `ticket.tsx` | Driver boarded passenger → shows boarded badge |
| Server → Client | `passenger:trip:tracking` | `ticket.tsx`, `trip-detail.tsx` | Driver GPS for shuttle tracking |
| Server → Client | `service:control:changed` | `ServiceControlContext` | Enable/disable services in real-time |
| Server → Client | `auth:login` | `useNotifications` | User authenticated → joins passenger room |
| Client → Server | Auth token handshake | `src/api/socket.ts` | Authenticates socket connection |

---

## 3. Screen → API Mapping

| Screen | REST Endpoints Used | Socket Events | Data Flow |
|--------|---------------------|---------------|-----------|
| `index` (splash) | None | None | AsyncStorage → routing logic |
| `lang-select` | None | None | AsyncStorage write |
| `onboarding` | None | None | Static content |
| `auth` | 1, 2, 4, 5, 6 | None | Form → POST → token storage → navigate |
| `(tabs)/index` | 14 (debt), service control | `service:control:changed` | Context → UI availability |
| `(tabs)/car` | 20, 21, 23, 24, 29 | ride:* events (5 types) | Request → socket state machine → receipt |
| `(tabs)/routes` | 10 | None | GET → filter → `BookingContext` |
| `(tabs)/trips` | 15, 22 | None | GET paginated → card list |
| `(tabs)/wallet` | 25, 26, 27 | None | GET balance + txns → POST topup |
| `(tabs)/favorites` | 17, 22 (via hook) | None | GET history → derive frequent |
| `(tabs)/profile` | 7, 8 | None | GET profile → PATCH updates |
| `ticket` | None (params) | `booking:boarded`, `passenger:trip:tracking` | Socket events → live UI |
| `trip-detail` | 16, 19 | `passenger:trip:tracking` | GET detail + socket driver location |
| `trip-tracking` | None | ride location events | Socket → map update |
| `receipt` | 24 | None | Params display → optional POST rating |
| `stations` | 13 | None | GET → list |
| `notifications` | 7 (for userId), 30, 31 | `auth:login` | GET → list → PATCH read |
| `promo` | 28, 29 | None | GET offers → POST validate |
| `support` | 34 | None | POST ticket |
| `suspended` | None | None | Static informational |
| `TripSheet` | 11 (slots) | None | GET slots → booking context |
| `ConfirmSheet` | 18 | None | POST booking → navigate ticket |

---

## 4. Working Status Analysis

### Feature-Level Status

| Feature | Status | Notes |
|---------|--------|-------|
| User registration | ✅ Fully working | Complete OTP + password reset flow |
| User login | ✅ Fully working | Token storage + auto-refresh interceptor |
| Token auto-refresh | ✅ Fully working | Axios response interceptor handles 401 |
| Shuttle route browsing | ✅ Fully working | Live from `/shuttle/lines` |
| Shuttle booking (TripSheet) | ✅ Fully working | Full slot selection + confirmation |
| Shuttle booking cancellation | ✅ Fully working | With 12h refund policy alert |
| Shuttle live tracking | ✅ Fully working | Socket-based driver location |
| Boarding pass QR | ✅ Fully working | QR + socket boarded event |
| Car ride request | ✅ Fully working | POST + socket state machine |
| Car ride cancellation | ✅ Fully working | PATCH cancel |
| Driver rating | ✅ Fully working | POST rate-driver |
| Ride chat | ✅ Fully working | REST history + socket send |
| Wallet balance + transactions | ✅ Fully working | GET wallet + transactions |
| Wallet top-up | ✅ Fully working | POST topup with confirmation |
| Promo validation | ✅ Fully working | POST validate in both car.tsx and promo.tsx |
| Notifications | ✅ Fully working | GET + PATCH read-all + socket join |
| Push notifications (Expo) | ✅ Fully working | Token registration on login |
| Support ticket submission | ✅ Fully working | POST /support/tickets |
| Profile update | ✅ Fully working | PATCH /users/me |
| Biometric / 2FA toggle | ✅ Fully working | Saved via PATCH /users/me |
| Language switching | ✅ Fully working | ThemeContext + AsyncStorage |
| Dark mode | ✅ Fully working | ThemeContext + AsyncStorage |
| Favorites (shuttle routes) | ✅ Fully working | AsyncStorage-backed |
| Frequent destinations | ⚠️ Partially working | Derived from ride history — no dedicated API |
| Ride estimate / price | ⚠️ Partially working | Uses `/rides/request` response; no pre-estimate call |
| Notifications dark mode toggle | ⚠️ Partially working | Stored locally only, not synced to backend |
| Profile photo edit | ❌ Broken / Dead | Opens picker but no upload API |
| Avatar button (Home) | ❌ Dead | No `onPress` handler |
| Heart / Favorite in TripSheet | ❌ Dead | No `onPress` handler |
| Transfer (Wallet) | ❌ Dead | "Coming Soon" alert only |
| Payment Methods (Profile) | ❌ Dead | "Coming Soon" alert only |
| Delete Account | ❌ Dead | Alert only — no API call |
| SOS / Emergency | ❌ Dead | Alert only — no emergency API |
| Bike service | ❌ Dead | Mock data + "Coming Soon" |
| Scooter service | ⚠️ Partially working | Routes to car.tsx (shared with car) |
| Phone field (Profile) | ❌ Dead | Hardcoded, non-editable |

---

## 5. Dead Code / Dead UI Detection

### 5.1 Dead Buttons (No Real Function)

| Button | Screen/Component | Issue |
|--------|------------------|-------|
| Avatar icon (top right) | `app/(tabs)/index.tsx` ~line 214 | `TouchableOpacity` with **no `onPress`** |
| Heart / Favorite | `components/TripSheet.tsx` ~line 424 | `TouchableOpacity` with **no `onPress`** |
| SOS / Emergency | `components/shared/SafetySheet.tsx` | Only shows `Alert.alert()` — no API, no emergency call |
| Transfer button | `app/(tabs)/wallet.tsx` | Shows "Coming Soon" alert — feature not built |
| Payment Methods | `app/(tabs)/profile.tsx` | Shows "Coming Soon" alert — feature not built |
| Delete Account | `app/(tabs)/profile.tsx` | Shows Alert only — no `DELETE /users/me` call |
| Edit profile photo | `app/(tabs)/profile.tsx` | Opens image picker, result is discarded — no upload |
| Bike "Book" button | `components/bike/BikeServiceScreen.tsx` | Shows "Coming Soon" alert |

### 5.2 Screens with No Backend Connection

| Screen | Type | Notes |
|--------|------|-------|
| `app/index.tsx` (splash) | Static | Intentional — local storage only |
| `app/lang-select.tsx` | Static | Intentional — local preference |
| `app/onboarding.tsx` | Static | Intentional — informational |
| `app/suspended.tsx` | Static | Informational lockout — contact is via WhatsApp link |

### 5.3 Duplicate / Redundant Hooks

| Hook | Duplicate Of | Notes |
|------|-------------|-------|
| `src/hooks/useDebt.ts` | `src/hooks/useMyDebt.ts` | Both call `GET /shuttle/my-debt`. `useDebt` is **not imported anywhere** — fully dead code |

### 5.4 Unused Library

| Library | Status | Notes |
|---------|--------|-------|
| `@tanstack/react-query` | **Installed but never used** | Present in `package.json`. No `QueryClientProvider`, no `useQuery` calls anywhere in the app |

### 5.5 Mock / Static Data Still in Use

| Location | Data | Impact |
|----------|------|--------|
| `app/(tabs)/car.tsx` — `WG_COORDS` | Hardcoded location name → GPS coordinate map | Car rides only work within hardcoded Wadi El Gedid locations. No real geocoding. |
| `app/(tabs)/car.tsx` — Grid map | Hardcoded `USER_X`/`DEST_X` pin positions | Visual map is decorative, not a real map |
| `components/bike/BikeServiceScreen.tsx` — `MOCK_RIDER` | Dummy rider object with static coords | Entire bike service renders fake data |
| `app/(tabs)/profile.tsx` — phone `"+20 100 000 0000"` | Hardcoded, `editable={false}` | Users cannot view or change real phone number |
| `constants/data.ts` — `TIMES` | Static time placeholders | Partially replaced by `scheduledTrips` from API |

### 5.6 APIs Defined but Never Called

| Endpoint | Defined Where | Never Called From |
|----------|---------------|-------------------|
| `GET /shuttle/my-debt` | `src/hooks/useDebt.ts` | `useDebt` hook is never imported or used |

---

## 6. Missing Integrations

| UI Feature | Missing Backend Integration | Priority |
|------------|-----------------------------|----------|
| Profile photo upload | No `POST /users/me/avatar` or similar multipart endpoint | High |
| Phone number edit | Phone field is hardcoded and non-editable — no `PATCH /users/me/phone` flow | High |
| SOS / Emergency button | No emergency API call, no `tel:` fallback, no server notification | High |
| Wallet transfer | "Transfer" button exists with no implementation — no `POST /wallet/transfer` | Medium |
| Payment methods management | "Payment Methods" menu item is a dead end — no card management UI or API | Medium |
| Delete Account | `DELETE /users/me` endpoint not called — button shows only an alert | Medium |
| Ride price estimate | No `GET /rides/estimate` before confirming — price only known after POST | Medium |
| Push notification preferences sync | Notification toggle stored locally — not synced to backend `PATCH /users/me/notifications` | Low |
| Heart/Favorite in TripSheet | `FavoritesContext` exists but the button in TripSheet has no `onPress` | Low |
| Deep link for car rides | Deep linking handles `veego://shuttle/trip/{id}` but not `veego://ride/{id}` | Low |

---

## 7. Broken or Incorrect Integrations

### 7.1 Endpoint Mismatch / Inconsistency

| Issue | Location | Details |
|-------|----------|---------|
| Dual debt hooks | `useMyDebt.ts` vs `useDebt.ts` | Both call `GET /shuttle/my-debt`. Home screen uses `useMyDebt`; `useDebt` is dead. Creates confusion and risk of divergence if one is updated. |
| Chat endpoint uses `/trips/:id/chat` | `src/hooks/useRideChat.ts` | The route parameter is named `tripId` but car rides have a `rideId`. Endpoint path uses `/trips/` which may conflict with shuttle trip namespace depending on backend routing. |
| `GET /bookings` vs `GET /users/me/bookings` | `useFavoriteDestinations.ts` vs `useTrips.ts` | Two different endpoints fetching bookings. `useFavoriteDestinations` uses `/bookings` (all), `useTrips` uses `/users/me/bookings` (user-scoped paginated). Behavior depends on backend; may return different shapes. |

### 7.2 Missing Request Parameters

| Call | Missing Parameter | Impact |
|------|-------------------|--------|
| `POST /wallet/topup` | `paymentMethod` field passed but not configurable in UI — always defaults to a hardcoded value | Users cannot select payment method for top-up |
| `POST /rides/request` | No estimated fare shown to user before confirmation | Ride price is a surprise — UX issue |
| `DELETE /shuttle/bookings/:id` | No server-side reason code for cancellation | Backend cannot distinguish user-initiated vs timeout cancellations |

### 7.3 Authentication / Token Issues

| Issue | Location | Details |
|-------|----------|---------|
| Socket not re-authenticated after token refresh | `src/api/socket.ts` | If the access token is refreshed by the HTTP interceptor, the open socket connection still holds the old token until reconnect |
| No token expiry check on app resume | `app/index.tsx` | App only checks token existence on splash, not validity. An expired token without a refresh token will fail silently until the first API call |
| `useNotifications` fetches `/users/me` separately | `src/hooks/useNotifications.ts` line 29 | Fetches user profile again just to get `userId` for socket room join — redundant, should use shared profile context |

### 7.4 Incorrect Response Handling

| Issue | Location | Details |
|-------|----------|---------|
| `rideState.cancelReason` raw string shown to user | `app/(tabs)/car.tsx` | If backend sends a raw cancel reason string, it's displayed directly to the user without sanitization or translation |
| `promo.validate` error uses `result.message` directly | `app/(tabs)/car.tsx` | Backend error message shown raw to user — may be in wrong language or be a technical string |

---

## 8. State Management Analysis

### 8.1 Context Providers

| Context | File | Persisted | Socket | Purpose |
|---------|------|-----------|--------|---------|
| `ThemeContext` | `context/ThemeContext.tsx` | ✅ AsyncStorage | No | Dark mode, language, i18n (`t()`), `isRTL` |
| `BookingContext` | `context/BookingContext.tsx` | ❌ In-memory | No | Shuttle booking lifecycle (route → slots → confirm) |
| `ServiceControlContext` | `context/ServiceControlContext.tsx` | ❌ In-memory | ✅ `service:control:changed` | Service availability flags per zone |
| `FavoritesContext` | `context/FavoritesContext.tsx` | ✅ AsyncStorage | No | Set of saved route IDs |
| `TabBarContext` | `context/TabBarContext.tsx` | ❌ In-memory | No | Show/hide bottom tab bar |

### 8.2 Custom Hooks

| Hook | API Calls | Socket | Local State | Notes |
|------|-----------|--------|-------------|-------|
| `useRide` | POST, GET, PATCH | ✅ ride:* | Phase machine | Core ride lifecycle — complex, well-structured |
| `useTrips` | GET (×2) | No | Pagination | Merges shuttle + ride history |
| `useProfile` | GET, PATCH | No | Form state | Used by profile screen |
| `useWallet` | GET (×2), POST | No | Balance, txns | Well-structured |
| `useNotifications` | GET, PATCH, GET (userId) | ✅ auth:login | List, unread count | Redundant `/users/me` call |
| `usePromos` | GET, POST | No | Promo list | Used by both `promo.tsx` and `car.tsx` |
| `usePushToken` | POST | No | Token | Runs once on auth |
| `useRoutes` | GET | No | Route list | Used by routes tab |
| `useRideChat` | GET, POST | ✅ message events | Messages | Used in car.tsx chat overlay |
| `useFavoriteDestinations` | GET (×2) | No | Derived list | Fetches all bookings + rides |
| `useMyDebt` | GET | No | Debt info | Used correctly on home screen |
| **`useDebt`** | GET | No | Debt info | **Dead — never imported** |

### 8.3 Unused Library

- **`@tanstack/react-query`**: Listed in `package.json` but never initialized (`QueryClientProvider` missing from `_layout.tsx`) and never used (`useQuery`, `useMutation` never called). This is dead weight — 42KB+ unused.

### 8.4 Duplicate / Conflicting Logic

- `useMyDebt` and `useDebt` are functionally identical — both call `GET /shuttle/my-debt`. Only `useMyDebt` is used.
- `useNotifications` fetches `/users/me` independently to get `userId`. This data is already available via `useProfile`. Should consume shared profile context instead.

---

## 9. Authentication Flow

### 9.1 Token Storage

| Platform | Storage | Keys |
|----------|---------|------|
| iOS / Android | `expo-secure-store` (hardware-backed) | `veego_access_token`, `veego_refresh_token` |
| Web | `localStorage` | `veego_access_token`, `veego_refresh_token` |

### 9.2 Login Flow

```
User submits credentials
  → POST /auth/login  (or /auth/register)
  → Server returns { accessToken, refreshToken }
  → persistTokens() stores both
  → Axios interceptor attaches Authorization: Bearer <token> to all future requests
  → router.push('/(tabs)')
```

### 9.3 Token Refresh Flow (Axios Response Interceptor)

```
Any API call returns 401
  → Interceptor reads stored refreshToken
  → POST /auth/refresh with { refreshToken }
  → Success: new accessToken stored, original request retried
  → Failure: tokens cleared → router.push('/auth')
```

### 9.4 Account Suspension (403)

```
Any API call returns 403 with body { reason: 'account_suspended' }
  → Interceptor clears tokens
  → router.push('/suspended')
```

### 9.5 Socket Authentication

```
Socket connects → emits stored accessToken in handshake
  → Server validates token
  → On auth:login event → client joins 'passenger:<userId>' room
```

**Known Issue:** Token refresh via HTTP interceptor does NOT update the existing socket connection. Socket continues with old token until socket reconnects or page reload.

### 9.6 Protected Routes

- All tab screens and stack screens beyond `auth`/`onboarding` require a valid token.
- Protection is enforced at splash screen (`app/index.tsx`) — it checks token existence and redirects.
- **No route-level guard**: individual screens do not re-check token validity. A token that expires mid-session will fail on the next API call, triggering the refresh interceptor.

---

## 10. Navigation + Feature Coverage

### 10.1 Full Navigation Tree

```
app/index.tsx (Splash)
├── /lang-select        → first run
├── /onboarding         → first run after language
├── /auth               → login/register
└── /(tabs)             → main app (requires auth)
    ├── index           → Home
    ├── trips           → My Trips
    ├── favorites       → Favorites
    ├── wallet          → Wallet
    ├── car             → Car/Ride Booking
    └── profile         → Profile & Settings

Root Stack (overlay on tabs):
├── /stations           → from Home or Routes
├── /notifications      → from Home header bell
├── /ticket             → from Home widget or Trips
├── /trip-detail        → from Trips or notifications
├── /trip-tracking      → from Car screen
├── /receipt            → from Car screen (ride complete)
├── /promo              → from Wallet
├── /support            → from Profile
└── /suspended          → from 403 interceptor

Global Overlays (mounted in _layout.tsx):
├── TripSheet           → from Home or Routes
└── ConfirmSheet        → from TripSheet
```

### 10.2 Deep Linking

| Link | Resolves To | Status |
|------|-------------|--------|
| `veego://shuttle/trip/{id}` | `/trip-detail?id={id}` | ✅ Working |
| `veego://ride/{id}` | No handler | ❌ Missing |
| `veego://promo/{code}` | No handler | ❌ Missing |

### 10.3 Orphan / Unreachable Screens

| Screen | Issue |
|--------|-------|
| `app/(tabs)/routes.tsx` | Accessible from Home search bar and Favorites, but not from the tab bar directly. Not an orphan but slightly hidden. |
| `app/suspended.tsx` | Only reachable via 403 API interceptor — cannot be navigated to manually. Intentional. |

### 10.4 Broken Navigation Flows

| Flow | Issue |
|------|-------|
| Notification → Ride | Notifications can deep-link to shuttle trip-detail but not to an active car ride |
| Post-ride receipt back | `Done` on `receipt.tsx` navigates to home, which is correct — but active socket state in `car.tsx` may not be fully reset |

---

## 11. Backend Connection Health Score

```
Score: 71 / 100
```

| Category | Score | Reasoning |
|----------|-------|-----------|
| API Coverage (endpoints used vs. defined) | 18/20 | 34 endpoints correctly wired; 1 dead hook |
| Authentication | 17/20 | Solid refresh flow; socket re-auth gap; no route guards |
| Real-time (Socket) | 9/10 | Well-structured; token sync gap after HTTP refresh |
| State Management | 7/10 | Good context architecture; dead library; duplicate hook |
| Error Handling | 6/10 | Raw server strings shown to users; some silent failures |
| Dead UI / Dead Code | 7/15 | 8 dead buttons; 1 dead hook; 1 dead library; mock data in 4 places |
| Missing Features (wired) | 7/15 | 9 missing integrations (photo, SOS, transfer, payment methods, etc.) |

---

## 12. Risk Assessment

| Risk | Level | Description |
|------|-------|-------------|
| SOS button does nothing | 🔴 **HIGH** | Safety feature appears functional but is entirely inert. User in emergency taps SOS and nothing happens. |
| Profile photo picker discards result | 🔴 **HIGH** | Users believe they updated their photo — nothing is saved or uploaded. |
| Delete Account shows fake confirmation | 🔴 **HIGH** | User taps "Delete Account", confirms, nothing happens. Builds false trust. |
| Socket token not refreshed | 🟠 **MEDIUM** | After a token refresh, real-time events may stop working until socket reconnects. Affects live tracking. |
| `useDebt` dead code | 🟠 **MEDIUM** | Dual debt hooks are a maintenance trap — a future developer may update the dead one. |
| `@tanstack/react-query` installed but unused | 🟡 **LOW** | Adds bundle weight with no benefit. |
| Hardcoded phone number in profile | 🟡 **LOW** | User cannot see or update their real phone number. |
| Raw server error strings shown to users | 🟡 **LOW** | Backend error messages in wrong language may be exposed to users. |
| No ride price estimate before booking | 🟡 **LOW** | User doesn't know cost until after the ride starts. |
| `WG_COORDS` hardcoded location list | 🟡 **LOW** | Car pickup/dropoff is limited to a static list. Adding new locations requires a code release. |

---

## 13. Final Actionable Fix Plan

### P0 — Critical (Fix immediately)

| # | Task | File(s) | Action |
|---|------|---------|--------|
| 1 | **Fix SOS button** | `components/shared/SafetySheet.tsx` | Call `Linking.openURL('tel:911')` AND trigger a `POST /rides/{id}/sos` alert to backend |
| 2 | **Fix Delete Account** | `app/(tabs)/profile.tsx` | Implement `DELETE /users/me`, clear all tokens + contexts on success |
| 3 | **Fix profile photo upload** | `app/(tabs)/profile.tsx` | Add `POST /users/me/avatar` multipart call after image picker selection |
| 4 | **Add `onPress` to Avatar button** | `app/(tabs)/index.tsx` ~line 214 | Navigate to `/(tabs)/profile` or remove the button |

### P1 — High Priority

| # | Task | File(s) | Action |
|---|------|---------|--------|
| 5 | **Fix Heart/Favorite in TripSheet** | `components/TripSheet.tsx` ~line 424 | Wire to `FavoritesContext.toggle(routeId)` |
| 6 | **Fix socket token after HTTP refresh** | `src/api/client.ts`, `src/api/socket.ts` | On successful token refresh, call `socket.auth.token = newToken; socket.disconnect().connect()` |
| 7 | **Remove dead `useDebt` hook** | `src/hooks/useDebt.ts` | Delete file; consolidate on `useMyDebt` |
| 8 | **Remove `@tanstack/react-query`** | `package.json` | `pnpm remove @tanstack/react-query` — saves bundle size |
| 9 | **Fix phone number field** | `app/(tabs)/profile.tsx` | Fetch real phone from `GET /users/me`, display it, make it editable with `PATCH /users/me` |

### P2 — Medium Priority

| # | Task | File(s) | Action |
|---|------|---------|--------|
| 10 | **Add ride price estimate** | `app/(tabs)/car.tsx` | Add `GET /rides/estimate` call on location selection; show estimated price before confirming |
| 11 | **Add Wallet Transfer** | `app/(tabs)/wallet.tsx` | Implement transfer flow to another user ID, or remove the button entirely |
| 12 | **Add Payment Methods screen** | `app/(tabs)/profile.tsx` | Build card management UI with `GET/POST/DELETE /payment-methods` or remove the menu item |
| 13 | **Fix `useNotifications` redundant fetch** | `src/hooks/useNotifications.ts` | Read `userId` from shared profile context instead of re-calling `GET /users/me` |
| 14 | **Handle raw backend error strings** | `app/(tabs)/car.tsx`, `app/support.tsx` | Map backend error codes to translated strings via `t()` instead of displaying raw server messages |
| 15 | **Add deep link for rides** | `app/_layout.tsx` | Add `veego://ride/{id}` handler → navigate to `/trip-tracking` or `/receipt` |

### P3 — Low Priority / Enhancement

| # | Task | File(s) | Action |
|---|------|---------|--------|
| 16 | **Replace hardcoded `WG_COORDS`** | `app/(tabs)/car.tsx` | Fetch available pickup/dropoff points from `GET /locations` or similar |
| 17 | **Sync notification preferences to backend** | `app/(tabs)/profile.tsx` | Add `PATCH /users/me/notifications` when notification toggle changes |
| 18 | **Add ride deep links from notifications** | `src/hooks/useNotifications.ts` | Parse ride-type notifications and navigate to active ride screen |
| 19 | **Add promo deep link** | `app/_layout.tsx` | Add `veego://promo/{code}` handler → auto-fills promo on `/promo` screen |
| 20 | **Build real Bike/Scooter service** | `components/bike/BikeServiceScreen.tsx` | Remove `MOCK_RIDER`, connect to real bike service API, or clearly hide the tab until ready |

---

*End of audit. Total screens: 20. Total buttons audited: 89. Total API endpoints: 34 REST + 11 socket events. Dead buttons: 8. Missing integrations: 10. Critical risks: 3.*
