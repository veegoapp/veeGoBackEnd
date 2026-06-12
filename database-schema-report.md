# VeeGo Database Schema Report

> Generated: 2026-06-12  
> **Total tables:** 54  
> **Total columns:** 521

---

## Table of Contents

- [audit_logs](#audit-logs)
- [bookings](#bookings)
- [buses](#buses)
- [car_categories](#car-categories)
- [chat_messages](#chat-messages)
- [driver_bonus_progress](#driver-bonus-progress)
- [driver_bonus_targets](#driver-bonus-targets)
- [driver_checkins](#driver-checkins)
- [driver_commission_exemptions](#driver-commission-exemptions)
- [driver_documents](#driver-documents)
- [driver_duplicate_alerts](#driver-duplicate-alerts)
- [driver_earnings](#driver-earnings)
- [driver_locations](#driver-locations)
- [driver_shuttle_bookings](#driver-shuttle-bookings)
- [drivers](#drivers)
- [notifications](#notifications)
- [payments](#payments)
- [promo_code_usages](#promo-code-usages)
- [promo_codes](#promo-codes)
- [ratings](#ratings)
- [ride_dispatch_state](#ride-dispatch-state)
- [ride_events](#ride-events)
- [ride_pricing](#ride-pricing)
- [ride_share_tokens](#ride-share-tokens)
- [rides](#rides)
- [route_schedules](#route-schedules)
- [route_suggestions](#route-suggestions)
- [route_time_slots](#route-time-slots)
- [routes](#routes)
- [schedule_slots](#schedule-slots)
- [service_control_logs](#service-control-logs)
- [service_controls](#service-controls)
- [service_settings](#service-settings)
- [settings](#settings)
- [shuttle_offences](#shuttle-offences)
- [shuttle_ratings](#shuttle-ratings)
- [shuttle_vehicle_types](#shuttle-vehicle-types)
- [sos_events](#sos-events)
- [staff_roles](#staff-roles)
- [stations](#stations)
- [support_messages](#support-messages)
- [support_tickets](#support-tickets)
- [trip_events](#trip-events)
- [trip_station_progress](#trip-station-progress)
- [trips](#trips)
- [user_locations](#user-locations)
- [users](#users)
- [vehicle_brands](#vehicle-brands)
- [vehicle_colors](#vehicle-colors)
- [vehicle_models](#vehicle-models)
- [vehicles](#vehicles)
- [wallet_transactions](#wallet-transactions)
- [zone_pricing](#zone-pricing)
- [zones](#zones)

---

## audit_logs

**Columns:** 10

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('audit_logs_id_seq'::regclass)` |
| `user_id` | integer | YES | — |
| `action` | text | NO | — |
| `entity_type` | text | NO | — |
| `entity_id` | integer | YES | — |
| `old_data` | jsonb | YES | — |
| `new_data` | jsonb | YES | — |
| `ip_address` | text | YES | — |
| `user_agent` | text | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |

## bookings

**Columns:** 10

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('bookings_id_seq'::regclass)` |
| `user_id` | integer | NO | — |
| `trip_id` | integer | NO | — |
| `seat_count` | integer | NO | — |
| `total_price` | numeric | NO | — |
| `status` | USER-DEFINED | NO | `'confirmed'::booking_status` |
| `payment_status` | USER-DEFINED | NO | `'paid'::payment_status` |
| `promo_code_id` | integer | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## buses

**Columns:** 10

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('buses_id_seq'::regclass)` |
| `plate_number` | text | NO | — |
| `capacity` | integer | NO | — |
| `model` | text | NO | — |
| `vehicle_type_id` | integer | YES | — |
| `current_latitude` | real | YES | — |
| `current_longitude` | real | YES | — |
| `is_active` | boolean | NO | `true` |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## car_categories

**Columns:** 12

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('car_categories_id_seq'::regclass)` |
| `name` | text | NO | — |
| `slug` | text | NO | — |
| `min_year` | integer | NO | — |
| `max_year` | integer | YES | — |
| `base_fare` | numeric | NO | — |
| `per_km_rate` | numeric | NO | — |
| `per_minute_rate` | numeric | NO | — |
| `minimum_fare` | numeric | NO | — |
| `is_active` | boolean | NO | `true` |
| `sort_order` | integer | NO | `0` |
| `created_at` | timestamp with time zone | NO | `now()` |

## chat_messages

**Columns:** 8

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('chat_messages_id_seq'::regclass)` |
| `ticket_id` | integer | YES | — |
| `trip_id` | integer | YES | — |
| `sender_id` | integer | YES | — |
| `sender_type` | USER-DEFINED | NO | — |
| `message` | text | NO | — |
| `is_read` | boolean | NO | `false` |
| `created_at` | timestamp with time zone | NO | `now()` |

## driver_bonus_progress

**Columns:** 8

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('driver_bonus_progress_id_seq'::regclass)` |
| `driver_id` | integer | NO | — |
| `target_id` | integer | NO | — |
| `current_value` | numeric | NO | `'0'::numeric` |
| `is_completed` | boolean | NO | `false` |
| `completed_at` | timestamp with time zone | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## driver_bonus_targets

**Columns:** 13

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('driver_bonus_targets_id_seq'::regclass)` |
| `name` | text | NO | — |
| `description` | text | YES | — |
| `service_type` | text | NO | `'all'::text` |
| `target_type` | text | NO | — |
| `target_value` | numeric | NO | — |
| `bonus_amount` | numeric | NO | — |
| `starts_at` | timestamp with time zone | NO | — |
| `ends_at` | timestamp with time zone | NO | — |
| `is_active` | boolean | NO | `true` |
| `is_deleted` | boolean | NO | `false` |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## driver_checkins

**Columns:** 8

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('driver_checkins_id_seq'::regclass)` |
| `driver_id` | integer | NO | — |
| `trip_id` | integer | YES | — |
| `checkin_type` | USER-DEFINED | NO | — |
| `image_url` | text | NO | — |
| `face_detected` | boolean | NO | `false` |
| `submitted_at` | timestamp with time zone | NO | `now()` |
| `created_at` | timestamp with time zone | NO | `now()` |

## driver_commission_exemptions

**Columns:** 8

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('driver_commission_exemptions_id_seq'::regclass)` |
| `driver_id` | integer | NO | — |
| `starts_at` | timestamp with time zone | NO | — |
| `ends_at` | timestamp with time zone | NO | — |
| `reason` | text | YES | — |
| `is_active` | boolean | NO | `true` |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## driver_documents

**Columns:** 9

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('driver_documents_id_seq'::regclass)` |
| `driver_id` | integer | NO | — |
| `trip_id` | integer | YES | — |
| `type` | USER-DEFINED | NO | — |
| `file_url` | text | NO | — |
| `mime_type` | text | YES | `'image/jpeg'::text` |
| `verification_status` | USER-DEFINED | NO | `'pending'::doc_verification_status` |
| `admin_notes` | text | YES | — |
| `uploaded_at` | timestamp with time zone | NO | `now()` |

## driver_duplicate_alerts

**Columns:** 8

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('driver_duplicate_alerts_id_seq'::regclass)` |
| `new_driver_id` | integer | NO | — |
| `existing_driver_id` | integer | NO | — |
| `match_type` | USER-DEFINED | NO | — |
| `resolved_at` | timestamp with time zone | YES | — |
| `resolved_by` | integer | YES | — |
| `notes` | text | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |

## driver_earnings

**Columns:** 10

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('driver_earnings_id_seq'::regclass)` |
| `driver_id` | integer | NO | — |
| `trip_id` | integer | YES | — |
| `ride_id` | integer | YES | — |
| `amount` | numeric | NO | — |
| `type` | text | NO | `'ride'::text` |
| `status` | USER-DEFINED | NO | `'pending'::earning_status` |
| `notes` | text | YES | — |
| `date` | timestamp with time zone | NO | `now()` |
| `created_at` | timestamp with time zone | NO | `now()` |

## driver_locations

**Columns:** 7

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('driver_locations_id_seq'::regclass)` |
| `driver_id` | integer | NO | — |
| `latitude` | real | NO | — |
| `longitude` | real | NO | — |
| `speed` | real | YES | — |
| `heading` | real | YES | — |
| `recorded_at` | timestamp with time zone | NO | `now()` |

## driver_shuttle_bookings

**Columns:** 15

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('driver_shuttle_bookings_id_seq'::regclass)` |
| `driver_id` | integer | NO | — |
| `route_id` | integer | NO | — |
| `time_slot_id` | integer | NO | — |
| `week_start` | date | NO | — |
| `week_end` | date | NO | — |
| `status` | USER-DEFINED | NO | `'active'::driver_shuttle_booking_status` |
| `renewal_notified_at` | timestamp with time zone | YES | — |
| `renewal_deadline` | timestamp with time zone | YES | — |
| `renewal_confirmed_at` | timestamp with time zone | YES | — |
| `cancelled_at` | timestamp with time zone | YES | — |
| `cancelled_by` | text | YES | — |
| `cancel_reason` | text | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## drivers

**Columns:** 29

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('drivers_id_seq'::regclass)` |
| `user_id` | integer | NO | — |
| `name` | text | NO | — |
| `phone` | text | NO | — |
| `license_number` | text | YES | — |
| `national_id` | text | YES | — |
| `rating` | numeric | NO | `5.0` |
| `assigned_bus_id` | integer | YES | — |
| `vehicle_type` | text | YES | — |
| `current_latitude` | real | YES | — |
| `current_longitude` | real | YES | — |
| `current_speed` | real | YES | — |
| `current_heading` | real | YES | — |
| `is_online` | boolean | NO | `false` |
| `status` | USER-DEFINED | NO | `'offline'::driver_status` |
| `is_active` | boolean | NO | `true` |
| `location_updated_at` | timestamp with time zone | YES | — |
| `online_since` | timestamp with time zone | YES | — |
| `checkin_required` | boolean | NO | `false` |
| `checkin_deadline` | timestamp with time zone | YES | — |
| `last_checkin_at` | timestamp with time zone | YES | — |
| `commission_rate` | numeric | YES | — |
| `total_dispatched` | integer | NO | `0` |
| `total_accepted` | integer | NO | `0` |
| `last_dispatched_at` | timestamp with time zone | YES | — |
| `consecutive_rejections` | integer | NO | `0` |
| `cooldown_until` | timestamp with time zone | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## notifications

**Columns:** 6

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('notifications_id_seq'::regclass)` |
| `user_id` | integer | NO | — |
| `title` | text | NO | — |
| `body` | text | NO | — |
| `is_read` | boolean | NO | `false` |
| `created_at` | timestamp with time zone | NO | `now()` |

## payments

**Columns:** 11

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('payments_id_seq'::regclass)` |
| `user_id` | integer | NO | — |
| `booking_id` | integer | YES | — |
| `ride_id` | integer | YES | — |
| `amount` | numeric | NO | — |
| `method` | USER-DEFINED | NO | `'wallet'::payment_method` |
| `status` | USER-DEFINED | NO | `'pending'::payment_tx_status` |
| `transaction_ref` | text | YES | — |
| `notes` | text | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## promo_code_usages

**Columns:** 4

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('promo_code_usages_id_seq'::regclass)` |
| `promo_code_id` | integer | NO | — |
| `user_id` | integer | NO | — |
| `used_at` | timestamp with time zone | NO | `now()` |

## promo_codes

**Columns:** 13

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('promo_codes_id_seq'::regclass)` |
| `code` | text | NO | — |
| `discount_type` | USER-DEFINED | NO | — |
| `discount_value` | numeric | NO | — |
| `expiry_date` | timestamp with time zone | YES | — |
| `max_usage` | integer | YES | — |
| `used_count` | integer | NO | `0` |
| `per_user_limit` | integer | YES | — |
| `applicable_service` | text | NO | `'all'::text` |
| `min_ride_amount` | numeric | YES | — |
| `is_active` | boolean | NO | `true` |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## ratings

**Columns:** 9

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('ratings_id_seq'::regclass)` |
| `rater_id` | integer | NO | — |
| `driver_id` | integer | NO | — |
| `trip_id` | integer | YES | — |
| `ride_id` | integer | YES | — |
| `context` | USER-DEFINED | NO | `'trip'::rating_context` |
| `score` | numeric | NO | — |
| `comment` | text | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |

## ride_dispatch_state

**Columns:** 9

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('ride_dispatch_state_id_seq'::regclass)` |
| `ride_id` | integer | NO | — |
| `current_round` | integer | NO | `1` |
| `notified_ids` | ARRAY | NO | `'{}'::integer[]` |
| `current_round_ids` | ARRAY | NO | `'{}'::integer[]` |
| `round_started_at` | timestamp with time zone | NO | `now()` |
| `status` | text | NO | `'active'::text` |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## ride_events

**Columns:** 5

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('ride_events_id_seq'::regclass)` |
| `ride_id` | integer | NO | — |
| `type` | text | NO | — |
| `metadata` | jsonb | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |

## ride_pricing

**Columns:** 8

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('ride_pricing_id_seq'::regclass)` |
| `vehicle_type` | text | NO | — |
| `base_fare` | numeric | NO | — |
| `per_km_rate` | numeric | NO | — |
| `per_minute_rate` | numeric | NO | `'0'::numeric` |
| `minimum_fare` | numeric | NO | — |
| `is_active` | boolean | NO | `true` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## ride_share_tokens

**Columns:** 5

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('ride_share_tokens_id_seq'::regclass)` |
| `ride_id` | integer | NO | — |
| `token` | text | NO | — |
| `created_at` | timestamp with time zone | NO | `now()` |
| `expires_at` | timestamp with time zone | NO | — |

## rides

**Columns:** 30

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('rides_id_seq'::regclass)` |
| `passenger_id` | integer | NO | — |
| `driver_id` | integer | YES | — |
| `vehicle_type` | text | NO | — |
| `requested_category` | text | YES | — |
| `pickup_latitude` | real | NO | — |
| `pickup_longitude` | real | NO | — |
| `pickup_address` | text | NO | — |
| `dropoff_latitude` | real | NO | — |
| `dropoff_longitude` | real | NO | — |
| `dropoff_address` | text | NO | — |
| `recipient_name` | text | YES | — |
| `recipient_phone` | text | YES | — |
| `distance_km` | numeric | YES | — |
| `estimated_duration_minutes` | integer | YES | — |
| `estimated_price` | numeric | YES | — |
| `final_price` | numeric | YES | — |
| `waiting_charge` | numeric | YES | `0.00` |
| `promo_code_id` | integer | YES | — |
| `status` | text | NO | `'requested'::text` |
| `cancel_reason` | text | YES | — |
| `cancel_note` | text | YES | — |
| `requested_at` | timestamp with time zone | NO | `now()` |
| `driver_assigned_at` | timestamp with time zone | YES | — |
| `driver_arrived_at` | timestamp with time zone | YES | — |
| `started_at` | timestamp with time zone | YES | — |
| `completed_at` | timestamp with time zone | YES | — |
| `cancelled_at` | timestamp with time zone | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## route_schedules

**Columns:** 9

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('route_schedules_id_seq'::regclass)` |
| `route_id` | integer | NO | — |
| `effective_from` | date | NO | — |
| `effective_to` | date | NO | — |
| `vehicle_type` | USER-DEFINED | NO | `'hiace'::shuttle_vehicle_type` |
| `default_capacity` | integer | NO | `14` |
| `is_active` | boolean | NO | `true` |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## route_suggestions

**Columns:** 12

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('route_suggestions_id_seq'::regclass)` |
| `user_id` | integer | YES | — |
| `driver_id` | integer | YES | — |
| `type` | USER-DEFINED | NO | `'new_route'::suggestion_type` |
| `title` | text | NO | — |
| `description` | text | NO | — |
| `start_location` | text | YES | — |
| `end_location` | text | YES | — |
| `status` | USER-DEFINED | NO | `'pending'::suggestion_status` |
| `admin_notes` | text | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## route_time_slots

**Columns:** 5

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('route_time_slots_id_seq'::regclass)` |
| `route_id` | integer | NO | — |
| `departure_time` | text | NO | — |
| `is_active` | boolean | NO | `true` |
| `created_at` | timestamp with time zone | NO | `now()` |

## routes

**Columns:** 9

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('routes_id_seq'::regclass)` |
| `name` | text | NO | — |
| `from_location` | text | NO | — |
| `to_location` | text | NO | — |
| `estimated_duration` | integer | NO | — |
| `base_price` | numeric | NO | — |
| `is_active` | boolean | NO | `true` |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## schedule_slots

**Columns:** 5

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('schedule_slots_id_seq'::regclass)` |
| `schedule_id` | integer | NO | — |
| `day_of_week` | integer | NO | — |
| `departure_time` | text | NO | — |
| `created_at` | timestamp with time zone | NO | `now()` |

## service_control_logs

**Columns:** 5

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('service_control_logs_id_seq'::regclass)` |
| `service_type` | USER-DEFINED | NO | — |
| `changed_by` | integer | YES | — |
| `changed_at` | timestamp with time zone | NO | `now()` |
| `changes` | jsonb | NO | — |

## service_controls

**Columns:** 11

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('service_controls_id_seq'::regclass)` |
| `service_type` | USER-DEFINED | NO | — |
| `is_enabled` | boolean | NO | `true` |
| `display_mode` | USER-DEFINED | NO | `'live'::display_mode` |
| `unavailable_message` | text | YES | — |
| `unavailable_action` | USER-DEFINED | NO | `'none'::unavailable_action` |
| `active_zone_ids` | ARRAY | NO | `'{}'::integer[]` |
| `maintenance_eta` | timestamp with time zone | YES | — |
| `max_active_rides` | integer | YES | — |
| `updated_by` | integer | YES | — |
| `updated_at` | timestamp with time zone | NO | `now()` |

## service_settings

**Columns:** 9

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('service_settings_id_seq'::regclass)` |
| `service_type` | USER-DEFINED | NO | — |
| `min_driver_rating` | numeric | NO | `0.0` |
| `required_license_types` | ARRAY | NO | `'{}'::text[]` |
| `require_insurance` | boolean | NO | `false` |
| `require_background_check` | boolean | NO | `false` |
| `max_active_rides_per_driver` | integer | NO | `1` |
| `updated_by` | integer | YES | — |
| `updated_at` | timestamp with time zone | NO | `now()` |

## settings

**Columns:** 4

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('settings_id_seq'::regclass)` |
| `key` | text | NO | — |
| `value` | text | NO | — |
| `updated_at` | timestamp with time zone | NO | `now()` |

## shuttle_offences

**Columns:** 8

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('shuttle_offences_id_seq'::regclass)` |
| `user_id` | integer | NO | — |
| `actor_type` | USER-DEFINED | NO | — |
| `offence_count` | integer | NO | `1` |
| `last_action` | USER-DEFINED | NO | `'warning'::offence_action` |
| `last_offence_at` | timestamp with time zone | NO | `now()` |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## shuttle_ratings

**Columns:** 6

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('shuttle_ratings_id_seq'::regclass)` |
| `trip_id` | integer | NO | — |
| `rater_id` | integer | NO | — |
| `ratee_id` | integer | NO | — |
| `stars` | smallint | NO | — |
| `created_at` | timestamp with time zone | NO | `now()` |

## shuttle_vehicle_types

**Columns:** 8

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('shuttle_vehicle_types_id_seq'::regclass)` |
| `name` | text | NO | — |
| `type` | USER-DEFINED | NO | — |
| `min_year` | integer | NO | — |
| `capacity` | integer | NO | — |
| `min_passengers` | integer | NO | — |
| `is_active` | boolean | NO | `true` |
| `created_at` | timestamp with time zone | NO | `now()` |

## sos_events

**Columns:** 11

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('sos_events_id_seq'::regclass)` |
| `user_id` | integer | NO | — |
| `ride_id` | integer | YES | — |
| `role` | text | NO | — |
| `latitude` | real | NO | — |
| `longitude` | real | NO | — |
| `triggered_at` | timestamp with time zone | NO | `now()` |
| `status` | text | NO | `'active'::text` |
| `notes` | text | YES | — |
| `resolved_by_id` | integer | YES | — |
| `resolved_at` | timestamp with time zone | YES | — |

## staff_roles

**Columns:** 6

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('staff_roles_id_seq'::regclass)` |
| `name` | text | NO | — |
| `description` | text | YES | — |
| `permissions` | ARRAY | NO | `'{}'::text[]` |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## stations

**Columns:** 9

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('stations_id_seq'::regclass)` |
| `route_id` | integer | NO | — |
| `name` | text | NO | — |
| `latitude` | real | NO | — |
| `longitude` | real | NO | — |
| `order` | integer | NO | — |
| `direction` | text | NO | `'outbound'::text` |
| `segment_price` | numeric | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |

## support_messages

**Columns:** 6

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('support_messages_id_seq'::regclass)` |
| `ticket_id` | integer | NO | — |
| `sender_type` | USER-DEFINED | NO | — |
| `sender_id` | integer | YES | — |
| `message` | text | NO | — |
| `created_at` | timestamp with time zone | NO | `now()` |

## support_tickets

**Columns:** 10

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('support_tickets_id_seq'::regclass)` |
| `user_id` | integer | YES | — |
| `driver_id` | integer | YES | — |
| `type` | USER-DEFINED | NO | `'passenger'::ticket_type` |
| `subject` | text | NO | — |
| `message` | text | NO | — |
| `status` | USER-DEFINED | NO | `'open'::ticket_status` |
| `priority` | USER-DEFINED | NO | `'medium'::ticket_priority` |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## trip_events

**Columns:** 5

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('trip_events_id_seq'::regclass)` |
| `trip_id` | integer | NO | — |
| `type` | text | NO | — |
| `metadata` | jsonb | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |

## trip_station_progress

**Columns:** 7

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('trip_station_progress_id_seq'::regclass)` |
| `trip_id` | integer | NO | — |
| `station_id` | integer | NO | — |
| `status` | USER-DEFINED | NO | `'pending'::station_progress_status` |
| `arrived_at` | timestamp with time zone | YES | — |
| `completed_at` | timestamp with time zone | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |

## trips

**Columns:** 23

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('trips_id_seq'::regclass)` |
| `route_id` | integer | NO | — |
| `schedule_id` | integer | YES | — |
| `bus_id` | integer | YES | — |
| `driver_id` | integer | YES | — |
| `departure_time` | timestamp with time zone | NO | — |
| `arrival_time` | timestamp with time zone | NO | — |
| `available_seats` | integer | NO | — |
| `total_seats` | integer | NO | — |
| `price` | numeric | NO | — |
| `status` | USER-DEFINED | NO | `'scheduled'::trip_status` |
| `is_active` | boolean | NO | `true` |
| `recurring_type` | USER-DEFINED | NO | `'one_time'::recurring_type` |
| `weekdays` | text | YES | — |
| `vehicle_type` | USER-DEFINED | NO | `'hiace'::shuttle_vehicle_type` |
| `cancel_reason` | text | YES | — |
| `accepted_at` | timestamp with time zone | YES | — |
| `arrived_at` | timestamp with time zone | YES | — |
| `started_at` | timestamp with time zone | YES | — |
| `completed_at` | timestamp with time zone | YES | — |
| `cancelled_at` | timestamp with time zone | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## user_locations

**Columns:** 10

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('user_locations_id_seq'::regclass)` |
| `user_id` | integer | NO | — |
| `label` | text | NO | `'other'::text` |
| `name` | text | NO | — |
| `address` | text | NO | — |
| `latitude` | real | NO | — |
| `longitude` | real | NO | — |
| `is_default` | boolean | NO | `false` |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## users

**Columns:** 19

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('users_id_seq'::regclass)` |
| `name` | text | NO | — |
| `email` | text | NO | — |
| `phone` | text | NO | — |
| `password` | text | NO | — |
| `avatar` | text | YES | — |
| `wallet_balance` | numeric | NO | `'0'::numeric` |
| `role` | USER-DEFINED | NO | `'user'::user_role` |
| `staff_role_id` | integer | YES | — |
| `is_verified` | boolean | NO | `false` |
| `is_blocked` | boolean | NO | `false` |
| `refresh_token` | text | YES | — |
| `otp_code` | text | YES | — |
| `otp_expires_at` | timestamp with time zone | YES | — |
| `password_reset_token` | text | YES | — |
| `password_reset_expires_at` | timestamp with time zone | YES | — |
| `push_token` | text | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## vehicle_brands

**Columns:** 6

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('vehicle_brands_id_seq'::regclass)` |
| `name` | text | NO | — |
| `service_type` | text | NO | `'car'::text` |
| `is_chinese` | boolean | NO | `false` |
| `is_active` | boolean | NO | `true` |
| `created_at` | timestamp with time zone | NO | `now()` |

## vehicle_colors

**Columns:** 5

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('vehicle_colors_id_seq'::regclass)` |
| `name_ar` | text | NO | — |
| `name_en` | text | NO | — |
| `hex_code` | text | YES | — |
| `is_active` | boolean | NO | `true` |

## vehicle_models

**Columns:** 7

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('vehicle_models_id_seq'::regclass)` |
| `brand_id` | integer | NO | — |
| `name` | text | NO | — |
| `min_year` | integer | NO | — |
| `max_year` | integer | YES | — |
| `is_active` | boolean | NO | `true` |
| `created_at` | timestamp with time zone | NO | `now()` |

## vehicles

**Columns:** 16

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('vehicles_id_seq'::regclass)` |
| `driver_id` | integer | NO | — |
| `plate_number` | text | NO | — |
| `make` | text | NO | — |
| `model` | text | NO | — |
| `year` | integer | NO | — |
| `color` | text | NO | — |
| `vehicle_type` | USER-DEFINED | NO | `'car'::vehicle_type` |
| `status` | USER-DEFINED | NO | `'pending'::vehicle_status` |
| `is_active` | boolean | NO | `true` |
| `brand_id` | integer | YES | — |
| `model_id` | integer | YES | — |
| `color_id` | integer | YES | — |
| `category_id` | integer | YES | — |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## wallet_transactions

**Columns:** 6

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('wallet_transactions_id_seq'::regclass)` |
| `user_id` | integer | NO | — |
| `amount` | numeric | NO | — |
| `type` | USER-DEFINED | NO | — |
| `description` | text | NO | — |
| `created_at` | timestamp with time zone | NO | `now()` |

## zone_pricing

**Columns:** 9

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('zone_pricing_id_seq'::regclass)` |
| `zone_id` | integer | NO | — |
| `vehicle_type` | text | NO | — |
| `base_fare` | numeric | NO | — |
| `per_km_rate` | numeric | NO | — |
| `minimum_fare` | numeric | NO | — |
| `is_active` | boolean | NO | `true` |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

## zones

**Columns:** 10

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| `id` | integer | NO | `nextval('zones_id_seq'::regclass)` |
| `name` | text | NO | — |
| `description` | text | YES | — |
| `center_lat` | real | NO | — |
| `center_lng` | real | NO | — |
| `radius_km` | real | NO | `5` |
| `services` | ARRAY | NO | `'{}'::text[]` |
| `is_active` | boolean | NO | `true` |
| `created_at` | timestamp with time zone | NO | `now()` |
| `updated_at` | timestamp with time zone | NO | `now()` |

---

## Summary

| Metric | Value |
|--------|-------|
| Total tables | **54** |
| Total columns | **521** |
