import swaggerJSDoc from "swagger-jsdoc";

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "VeeGo API",
      version: "1.0.0",
      description: "Full shuttle booking platform API — fleet operations, trip scheduling, bookings, wallet, and ride-hailing.",
    },
    servers: [{ url: "/api", description: "API server" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Access token obtained from /api/auth/login. Prefix: Bearer <token>",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "string" } },
        },
        PaginatedMeta: {
          type: "object",
          properties: {
            total: { type: "integer" },
            page: { type: "integer" },
            limit: { type: "integer" },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {

      // ─── HEALTH ──────────────────────────────────────────────────────────────
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Basic health check",
          security: [],
          responses: {
            200: { description: "Server is up", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" }, timestamp: { type: "string" } } } } } },
          },
        },
      },
      "/healthz": {
        get: {
          tags: ["Health"],
          summary: "Lightweight liveness probe",
          security: [],
          responses: { 200: { description: "OK" } },
        },
      },
      "/health/db": {
        get: {
          tags: ["Health"],
          summary: "Database connectivity check",
          security: [],
          responses: {
            200: { description: "Database connected" },
            503: { description: "Database unreachable" },
          },
        },
      },

      // ─── AUTH ─────────────────────────────────────────────────────────────────
      "/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Register a new user",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "email", "phone", "password"],
                  properties: {
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                    phone: { type: "string" },
                    password: { type: "string", minLength: 8 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "User registered, tokens returned" },
            400: { description: "Validation error or duplicate account" },
          },
        },
      },
      "/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login with email/phone and password",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["credential", "password"],
                  properties: {
                    credential: { type: "string", description: "Email or phone number" },
                    password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Login successful, access & refresh tokens returned" },
            401: { description: "Invalid credentials" },
            403: { description: "Account blocked" },
          },
        },
      },
      "/auth/refresh": {
        post: {
          tags: ["Auth"],
          summary: "Refresh access token",
          security: [],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } } } },
          },
          responses: {
            200: { description: "New tokens returned" },
            401: { description: "Invalid or expired refresh token" },
          },
        },
      },
      "/auth/me": {
        get: {
          tags: ["Auth"],
          summary: "Get current authenticated user",
          responses: {
            200: { description: "User object" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/auth/send-otp": {
        post: {
          tags: ["Auth"],
          summary: "Send OTP to phone number",
          security: [],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["phone"], properties: { phone: { type: "string" } } } } } },
          responses: { 200: { description: "OTP sent" }, 404: { description: "Phone not found" } },
        },
      },
      "/auth/verify-otp": {
        post: {
          tags: ["Auth"],
          summary: "Verify OTP code",
          security: [],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["phone", "otp"], properties: { phone: { type: "string" }, otp: { type: "string", minLength: 6, maxLength: 6 } } } } } },
          responses: { 200: { description: "OTP verified, tokens returned" }, 400: { description: "Invalid or expired OTP" } },
        },
      },
      "/auth/forgot-password": {
        post: {
          tags: ["Auth"],
          summary: "Request password reset code via SMS",
          security: [],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["phone"], properties: { phone: { type: "string" } } } } } },
          responses: { 200: { description: "Reset code sent (always 200 to prevent enumeration)" } },
        },
      },
      "/auth/reset-password": {
        post: {
          tags: ["Auth"],
          summary: "Reset password using SMS reset code",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["phone", "token", "newPassword"],
                  properties: { phone: { type: "string" }, token: { type: "string" }, newPassword: { type: "string", minLength: 8 } },
                },
              },
            },
          },
          responses: { 200: { description: "Password reset successful" }, 400: { description: "Invalid or expired token" } },
        },
      },

      // ─── USERS ────────────────────────────────────────────────────────────────
      "/users/me": {
        get: {
          tags: ["Users"],
          summary: "Get own profile",
          responses: { 200: { description: "User profile" }, 401: { description: "Unauthorized" } },
        },
        patch: {
          tags: ["Users"],
          summary: "Update own profile",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" } } } } } },
          responses: { 200: { description: "Updated profile" } },
        },
      },
      "/users/me/push-token": {
        post: {
          tags: ["Users"],
          summary: "Register push notification token",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" }, platform: { type: "string", enum: ["ios", "android", "web"] } } } } } },
          responses: { 200: { description: "Push token registered" } },
        },
      },
      "/users/me/bookings": {
        get: {
          tags: ["Users"],
          summary: "Get own booking history",
          responses: { 200: { description: "Array of bookings with trip details" } },
        },
      },

      // ─── ROUTES ───────────────────────────────────────────────────────────────
      "/routes": {
        get: {
          tags: ["Routes"],
          summary: "List all routes",
          security: [],
          parameters: [{ name: "search", in: "query", schema: { type: "string" }, description: "Search by name" }],
          responses: { 200: { description: "Paginated route list" } },
        },
        post: {
          tags: ["Routes"],
          summary: "Create a route (admin)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "fromLocation", "toLocation", "basePrice"],
                  properties: {
                    name: { type: "string" },
                    fromLocation: { type: "string" },
                    toLocation: { type: "string" },
                    basePrice: { type: "number" },
                    estimatedDuration: { type: "integer", description: "Minutes" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Route created" } },
        },
      },
      "/routes/{id}": {
        get: {
          tags: ["Routes"],
          summary: "Get route by ID",
          security: [],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Route object" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Routes"],
          summary: "Update route (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { 200: { description: "Updated route" } },
        },
        delete: {
          tags: ["Routes"],
          summary: "Delete route (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 204: { description: "Deleted" } },
        },
      },
      "/routes/{id}/stations": {
        get: {
          tags: ["Routes"],
          summary: "List stations for a route",
          security: [],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Ordered station list" } },
        },
        post: {
          tags: ["Routes"],
          summary: "Add station to route (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "order"],
                  properties: {
                    name: { type: "string" },
                    order: { type: "integer" },
                    latitude: { type: "number" },
                    longitude: { type: "number" },
                    direction: { type: "string", enum: ["outbound", "return"] },
                    segmentPrice: { type: "number", nullable: true },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Station added" } },
        },
      },
      "/routes/{id}/stations/{stationId}": {
        patch: {
          tags: ["Routes"],
          summary: "Update a station (admin)",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
            { name: "stationId", in: "path", required: true, schema: { type: "integer" } },
          ],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { 200: { description: "Updated station" } },
        },
        delete: {
          tags: ["Routes"],
          summary: "Delete a station (admin)",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
            { name: "stationId", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: { 204: { description: "Deleted" } },
        },
      },

      // ─── BUSES ────────────────────────────────────────────────────────────────
      "/buses": {
        get: {
          tags: ["Buses"],
          summary: "List buses (admin)",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated bus list" } },
        },
        post: {
          tags: ["Buses"],
          summary: "Create a bus (admin)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["plateNumber", "model", "capacity"],
                  properties: { plateNumber: { type: "string" }, model: { type: "string" }, capacity: { type: "integer" } },
                },
              },
            },
          },
          responses: { 201: { description: "Bus created" } },
        },
      },
      "/buses/{id}": {
        get: {
          tags: ["Buses"],
          summary: "Get bus by ID (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Bus object" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Buses"],
          summary: "Update bus (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { 200: { description: "Updated bus" } },
        },
        delete: {
          tags: ["Buses"],
          summary: "Delete bus (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 204: { description: "Deleted" } },
        },
      },

      // ─── DRIVERS (ADMIN) ──────────────────────────────────────────────────────
      "/drivers": {
        get: {
          tags: ["Drivers (Admin)"],
          summary: "List all active drivers (admin)",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated driver list" } },
        },
        post: {
          tags: ["Drivers (Admin)"],
          summary: "Create a driver profile (admin)",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["userId", "name", "phone"], properties: { userId: { type: "integer" }, name: { type: "string" }, phone: { type: "string" }, licenseNumber: { type: "string" }, nationalId: { type: "string" } } } } } },
          responses: { 201: { description: "Driver created" } },
        },
      },
      "/drivers/me": {
        get: {
          tags: ["Drivers (Admin)"],
          summary: "Get own driver profile (driver role)",
          responses: { 200: { description: "Driver profile" } },
        },
      },
      "/drivers/me/location": {
        patch: {
          tags: ["Drivers (Admin)"],
          summary: "Update own GPS location (driver role)",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["latitude", "longitude"], properties: { latitude: { type: "number" }, longitude: { type: "number" } } } } } },
          responses: { 200: { description: "Updated driver" } },
        },
      },
      "/drivers/{id}": {
        get: {
          tags: ["Drivers (Admin)"],
          summary: "Get driver by ID (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Driver object" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Drivers (Admin)"],
          summary: "Update driver (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { 200: { description: "Updated driver" } },
        },
        delete: {
          tags: ["Drivers (Admin)"],
          summary: "Soft-delete (suspend) driver (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 204: { description: "Driver suspended" } },
        },
      },

      // ─── DRIVER APP ───────────────────────────────────────────────────────────
      "/driver/auth/register": {
        post: {
          tags: ["Driver App"],
          summary: "Register as a driver",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "email", "phone", "password"],
                  properties: {
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                    phone: { type: "string" },
                    password: { type: "string", minLength: 8 },
                    licenseNumber: { type: "string" },
                    nationalId: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Driver registered" }, 409: { description: "Email or phone already exists" } },
        },
      },
      "/driver/auth/login": {
        post: {
          tags: ["Driver App"],
          summary: "Driver login",
          security: [],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["credential", "password"], properties: { credential: { type: "string" }, password: { type: "string" } } } } } },
          responses: { 200: { description: "Tokens and driver profile returned" }, 401: { description: "Invalid credentials" } },
        },
      },
      "/driver/auth/logout": {
        post: {
          tags: ["Driver App"],
          summary: "Driver logout (clears token, sets offline)",
          responses: { 200: { description: "Logged out" } },
        },
      },
      "/driver/me": {
        get: {
          tags: ["Driver App"],
          summary: "Get own driver profile",
          responses: { 200: { description: "Driver profile" } },
        },
      },
      "/driver/me/vehicle": {
        get: {
          tags: ["Driver App"],
          summary: "Get assigned vehicle",
          responses: { 200: { description: "Vehicle and vehicle type" } },
        },
      },
      "/driver/me/documents": {
        get: {
          tags: ["Driver App"],
          summary: "List own uploaded documents",
          responses: { 200: { description: "Document list" } },
        },
      },
      "/driver/me/ratings": {
        get: {
          tags: ["Driver App"],
          summary: "Get own rating and earnings summary",
          responses: { 200: { description: "Rating, trip count, total earned" } },
        },
      },
      "/driver/me/status": {
        get: {
          tags: ["Driver App"],
          summary: "Get own online/offline status and location",
          responses: { 200: { description: "Driver status object" } },
        },
      },
      "/driver/me/settings": {
        get: {
          tags: ["Driver App"],
          summary: "Get driver settings (vehicle type, notifications)",
          responses: { 200: { description: "Settings object" } },
        },
        patch: {
          tags: ["Driver App"],
          summary: "Update driver settings",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { vehicleType: { type: "string" }, notifications: { type: "boolean" } } } } } },
          responses: { 200: { description: "Updated settings" } },
        },
      },
      "/driver/status/online": {
        patch: {
          tags: ["Driver App"],
          summary: "Set driver status to online",
          responses: { 200: { description: "Driver now online" } },
        },
      },
      "/driver/status/offline": {
        patch: {
          tags: ["Driver App"],
          summary: "Set driver status to offline",
          responses: { 200: { description: "Driver now offline" } },
        },
      },
      "/driver/location": {
        patch: {
          tags: ["Driver App"],
          summary: "Update GPS location (REST fallback)",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["latitude", "longitude"], properties: { latitude: { type: "number" }, longitude: { type: "number" }, speed: { type: "number" }, heading: { type: "number" }, tripId: { type: "integer" } } } } } },
          responses: { 200: { description: "Location updated" } },
        },
      },
      "/driver/trips": {
        get: {
          tags: ["Driver App"],
          summary: "List own assigned trips",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: { 200: { description: "Paginated trip list" } },
        },
      },
      "/driver/trips/{id}": {
        get: {
          tags: ["Driver App"],
          summary: "Get a specific assigned trip",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Trip with bookings" } },
        },
      },
      "/driver/trips/{id}/accept": {
        patch: {
          tags: ["Driver App"],
          summary: "Accept an assigned trip",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Trip accepted" } },
        },
      },
      "/driver/trips/{id}/reject": {
        patch: {
          tags: ["Driver App"],
          summary: "Reject an assigned trip",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Trip rejected" } },
        },
      },
      "/driver/trips/{id}/start": {
        patch: {
          tags: ["Driver App"],
          summary: "Start a trip (sets status to active)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Trip started" } },
        },
      },
      "/driver/trips/{id}/complete": {
        patch: {
          tags: ["Driver App"],
          summary: "Complete a trip and auto-record earnings",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Trip completed, earnings recorded" } },
        },
      },
      "/driver/trips/{id}/cancel": {
        patch: {
          tags: ["Driver App"],
          summary: "Cancel an active/assigned trip",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["reason"], properties: { reason: { type: "string" } } } } } },
          responses: { 200: { description: "Trip cancelled" } },
        },
      },
      "/driver/rides/available": {
        get: {
          tags: ["Driver App"],
          summary: "List available ride requests (must be online)",
          responses: { 200: { description: "Array of rides in 'searching' status" } },
        },
      },
      "/driver/rides/{id}/accept": {
        patch: {
          tags: ["Driver App"],
          summary: "Accept a ride request",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Ride accepted, passenger notified via Socket" } },
        },
      },
      "/driver/rides/{id}/reject": {
        patch: {
          tags: ["Driver App"],
          summary: "Reject a ride request",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Ride rejected" } },
        },
      },
      "/driver/rides/{id}/arrived": {
        patch: {
          tags: ["Driver App"],
          summary: "Mark as arrived at pickup",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Status set to driver_arrived" } },
        },
      },
      "/driver/rides/{id}/start": {
        patch: {
          tags: ["Driver App"],
          summary: "Start the ride (passenger on board)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Ride in progress" } },
        },
      },
      "/driver/rides/{id}/complete": {
        patch: {
          tags: ["Driver App"],
          summary: "Complete the ride and settle payment",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Ride completed, wallet debited" } },
        },
      },
      "/driver/rides/{id}/cancel": {
        patch: {
          tags: ["Driver App"],
          summary: "Driver cancels the ride",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { reason: { type: "string" } } } } } },
          responses: { 200: { description: "Ride cancelled" } },
        },
      },

      // ─── TRIPS ────────────────────────────────────────────────────────────────
      "/trips": {
        get: {
          tags: ["Trips"],
          summary: "List trips (public)",
          security: [],
          parameters: [
            { name: "routeId", in: "query", schema: { type: "integer" } },
            { name: "status", in: "query", schema: { type: "string", enum: ["scheduled", "active", "completed", "cancelled"] } },
            { name: "date", in: "query", schema: { type: "string", format: "date" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated trip list" } },
        },
        post: {
          tags: ["Trips"],
          summary: "Create a trip (admin)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["routeId", "busId", "driverId", "departureTime", "arrivalTime", "price"],
                  properties: {
                    routeId: { type: "integer" },
                    busId: { type: "integer" },
                    driverId: { type: "integer" },
                    departureTime: { type: "string", format: "date-time" },
                    arrivalTime: { type: "string", format: "date-time" },
                    price: { type: "number" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Trip created" } },
        },
      },
      "/trips/{id}": {
        get: {
          tags: ["Trips"],
          summary: "Get trip by ID (public)",
          security: [],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Trip object" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Trips"],
          summary: "Update trip (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { 200: { description: "Updated trip" } },
        },
      },
      "/trips/{id}/cancel": {
        patch: {
          tags: ["Trips"],
          summary: "Cancel a trip (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Trip cancelled" } },
        },
      },

      // ─── BOOKINGS ─────────────────────────────────────────────────────────────
      "/bookings": {
        get: {
          tags: ["Bookings"],
          summary: "List bookings (admin)",
          parameters: [
            { name: "userId", in: "query", schema: { type: "integer" } },
            { name: "tripId", in: "query", schema: { type: "integer" } },
            { name: "status", in: "query", schema: { type: "string", enum: ["pending", "confirmed", "cancelled", "completed"] } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated booking list" } },
        },
        post: {
          tags: ["Bookings"],
          summary: "Book seats on a trip (authenticated user)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["tripId", "seatCount"],
                  properties: {
                    tripId: { type: "integer" },
                    seatCount: { type: "integer", minimum: 1 },
                    promoCode: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Booking confirmed" },
            400: { description: "Validation error or insufficient seats" },
            409: { description: "Concurrency conflict — seats just taken" },
          },
        },
      },
      "/bookings/{id}": {
        get: {
          tags: ["Bookings"],
          summary: "Get booking by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Booking object" }, 403: { description: "Forbidden" }, 404: { description: "Not found" } },
        },
      },
      "/bookings/{id}/cancel": {
        patch: {
          tags: ["Bookings"],
          summary: "Cancel a booking (auto-refund to wallet)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Booking cancelled and wallet refunded" } },
        },
      },

      // ─── WALLET ───────────────────────────────────────────────────────────────
      "/wallet": {
        get: {
          tags: ["Wallet"],
          summary: "Get own wallet balance",
          responses: { 200: { description: "userId and balance" } },
        },
      },
      "/wallet/transactions": {
        get: {
          tags: ["Wallet"],
          summary: "List own wallet transactions",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated transaction list" } },
        },
      },
      "/admin/wallet/transactions": {
        get: {
          tags: ["Wallet"],
          summary: "List all wallet transactions (admin)",
          parameters: [
            { name: "userId", in: "query", schema: { type: "integer" } },
            { name: "type", in: "query", schema: { type: "string", enum: ["deposit", "payment", "refund"] } },
            { name: "dateFrom", in: "query", schema: { type: "string", format: "date" } },
            { name: "dateTo", in: "query", schema: { type: "string", format: "date" } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated transaction list with user info" } },
        },
      },
      "/admin/wallet/refund": {
        post: {
          tags: ["Wallet"],
          summary: "Manual admin refund to a user's wallet",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["userId", "amount", "description"], properties: { userId: { type: "integer" }, amount: { type: "number" }, description: { type: "string" } } } } } },
          responses: { 200: { description: "Refund transaction created" } },
        },
      },

      // ─── PROMO CODES ──────────────────────────────────────────────────────────
      "/promo/validate": {
        post: {
          tags: ["Promo Codes"],
          summary: "Validate a promo code (authenticated user)",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string" } } } } } },
          responses: { 200: { description: "Valid promo code object" }, 400: { description: "Expired or usage limit reached" }, 404: { description: "Not found or inactive" } },
        },
      },
      "/promo": {
        get: {
          tags: ["Promo Codes"],
          summary: "List promo codes (admin)",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated promo list" } },
        },
        post: {
          tags: ["Promo Codes"],
          summary: "Create a promo code (admin)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "discountType", "discountValue"],
                  properties: {
                    code: { type: "string" },
                    discountType: { type: "string", enum: ["percentage", "fixed"] },
                    discountValue: { type: "number" },
                    expiryDate: { type: "string", format: "date-time" },
                    maxUsage: { type: "integer" },
                    isActive: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Promo code created" } },
        },
      },
      "/promo/{id}": {
        patch: {
          tags: ["Promo Codes"],
          summary: "Update a promo code (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { 200: { description: "Updated promo code" } },
        },
        delete: {
          tags: ["Promo Codes"],
          summary: "Delete a promo code (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 204: { description: "Deleted" } },
        },
      },

      // ─── NOTIFICATIONS ────────────────────────────────────────────────────────
      "/notifications": {
        get: {
          tags: ["Notifications"],
          summary: "List own notifications",
          responses: { 200: { description: "Notification array" } },
        },
        post: {
          tags: ["Notifications"],
          summary: "Send a notification to a user (admin)",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["userId", "title", "body"], properties: { userId: { type: "integer" }, title: { type: "string" }, body: { type: "string" } } } } } },
          responses: { 201: { description: "Notification created" } },
        },
      },
      "/notifications/{id}/read": {
        patch: {
          tags: ["Notifications"],
          summary: "Mark notification as read",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Notification marked read" } },
        },
      },
      "/admin/notifications/broadcast": {
        post: {
          tags: ["Notifications"],
          summary: "Broadcast notification to multiple users (admin)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title", "body"],
                  properties: {
                    title: { type: "string" },
                    body: { type: "string" },
                    target: { type: "string", enum: ["all", "users", "drivers", "specific"] },
                    userId: { type: "integer", description: "Required when target is 'specific'" },
                    includeBlocked: { type: "boolean" },
                    minRating: { type: "number" },
                    minTripCount: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Broadcast result with count of recipients" } },
        },
      },
      "/admin/notifications/history": {
        get: {
          tags: ["Notifications"],
          summary: "List all notification history (admin)",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 50 } },
          ],
          responses: { 200: { description: "Paginated notification list with user details" } },
        },
      },

      // ─── ADMIN: USERS ─────────────────────────────────────────────────────────
      "/admin/users": {
        get: {
          tags: ["Admin — Users"],
          summary: "List all users",
          parameters: [
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "role", in: "query", schema: { type: "string", enum: ["user", "driver", "admin"] } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated user list" } },
        },
      },
      "/admin/users/search": {
        get: {
          tags: ["Admin — Users"],
          summary: "Quick user search by name, phone, or email",
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string", minLength: 2 } }],
          responses: { 200: { description: "Matching users (max 10)" } },
        },
      },
      "/admin/users/{id}": {
        get: {
          tags: ["Admin — Users"],
          summary: "Get user by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "User object" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Admin — Users"],
          summary: "Update user",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { 200: { description: "Updated user" } },
        },
      },
      "/admin/users/{id}/toggle-block": {
        patch: {
          tags: ["Admin — Users"],
          summary: "Toggle block/unblock a user",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Updated user with new isBlocked state" } },
        },
      },

      // ─── ADMIN: ANALYTICS ─────────────────────────────────────────────────────
      "/admin/analytics": {
        get: {
          tags: ["Admin — Analytics"],
          summary: "General KPI analytics (users, trips, revenue, bookings)",
          responses: { 200: { description: "Analytics dashboard data" } },
        },
      },
      "/admin/analytics/revenue": {
        get: {
          tags: ["Admin — Analytics"],
          summary: "Revenue analytics by period",
          parameters: [{ name: "period", in: "query", schema: { type: "string", enum: ["daily", "weekly", "monthly"] } }],
          responses: { 200: { description: "Revenue breakdown array" } },
        },
      },
      "/admin/driver-analytics": {
        get: {
          tags: ["Admin — Analytics"],
          summary: "Driver analytics (status counts, earnings, top earners)",
          responses: { 200: { description: "Driver analytics object" } },
        },
      },
      "/admin/drivers/live": {
        get: {
          tags: ["Admin — Analytics"],
          summary: "Live driver locations and active trips",
          responses: { 200: { description: "All active drivers with GPS and trip data" } },
        },
      },

      // ─── ADMIN: TRIPS ─────────────────────────────────────────────────────────
      "/admin/trips": {
        get: {
          tags: ["Admin — Trips"],
          summary: "List all trips with admin-level detail",
          parameters: [
            { name: "driverId", in: "query", schema: { type: "integer" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 100 } },
          ],
          responses: { 200: { description: "Paginated trip list with meta" } },
        },
      },
      "/admin/trips/{id}/full-timeline": {
        get: {
          tags: ["Admin — Trips"],
          summary: "Full legal/safety timeline of a trip",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Trip, driver, vehicle, route, passengers, bookings and events" } },
        },
      },

      // ─── ADMIN: PAYOUTS ───────────────────────────────────────────────────────
      "/admin/payouts": {
        get: {
          tags: ["Admin — Payouts"],
          summary: "Driver payout summary with commission split",
          responses: { 200: { description: "Payout rows per driver" } },
        },
      },
      "/admin/payouts/{driverId}/confirm": {
        patch: {
          tags: ["Admin — Payouts"],
          summary: "Confirm/mark earnings as paid for a driver",
          parameters: [{ name: "driverId", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Number of records updated" } },
        },
      },

      // ─── ADMIN: SETTINGS ──────────────────────────────────────────────────────
      "/admin/settings/commission": {
        get: {
          tags: ["Admin — Settings"],
          summary: "Get commission settings",
          responses: { 200: { description: "appCommission, driverShare, payoutSchedule, minimumPayout" } },
        },
        patch: {
          tags: ["Admin — Settings"],
          summary: "Update commission settings",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    appCommission: { type: "number", minimum: 0, maximum: 100 },
                    driverShare: { type: "number", minimum: 0, maximum: 100 },
                    payoutSchedule: { type: "string", enum: ["daily", "weekly", "monthly"] },
                    minimumPayout: { type: "number", minimum: 0 },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Updated commission settings" } },
        },
      },
      "/admin/services/{type}/settings": {
        get: {
          tags: ["Admin — Settings"],
          summary: "Get service settings for car/shuttle/bike",
          parameters: [{ name: "type", in: "path", required: true, schema: { type: "string", enum: ["car", "shuttle", "bike"] } }],
          responses: { 200: { description: "Service configuration object" } },
        },
        patch: {
          tags: ["Admin — Settings"],
          summary: "Update service settings",
          parameters: [{ name: "type", in: "path", required: true, schema: { type: "string", enum: ["car", "shuttle", "bike"] } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    isEnabled: { type: "boolean" },
                    minDriverRating: { type: "number" },
                    requiredLicenseTypes: { type: "array", items: { type: "string" } },
                    requireInsurance: { type: "boolean" },
                    requireBackgroundCheck: { type: "boolean" },
                    maxActiveRidesPerDriver: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Updated service settings" } },
        },
      },
      "/admin/surge-settings": {
        get: {
          tags: ["Admin — Settings"],
          summary: "Get surge pricing settings",
          responses: { 200: { description: "Surge configuration" } },
        },
        patch: {
          tags: ["Admin — Settings"],
          summary: "Update surge pricing settings",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    isEnabled: { type: "boolean" },
                    multiplier: { type: "number", minimum: 1, maximum: 5 },
                    maxMultiplier: { type: "number" },
                    activeHoursStart: { type: "string", example: "07:00" },
                    activeHoursEnd: { type: "string", example: "09:00" },
                    activeZoneIds: { type: "array", items: { type: "integer" } },
                    triggerThreshold: { type: "number", minimum: 0, maximum: 100 },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Updated surge settings" } },
        },
      },

      // ─── STAFF & ROLES ────────────────────────────────────────────────────────
      "/admin/permissions/all": {
        get: {
          tags: ["Staff & Roles"],
          summary: "List all available permission strings",
          responses: { 200: { description: "Array of permission identifiers" } },
        },
      },
      "/admin/roles": {
        get: {
          tags: ["Staff & Roles"],
          summary: "List staff roles",
          responses: { 200: { description: "Roles with permissions" } },
        },
        post: {
          tags: ["Staff & Roles"],
          summary: "Create a staff role",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, description: { type: "string" }, permissions: { type: "array", items: { type: "string" } } } } } } },
          responses: { 201: { description: "Role created" } },
        },
      },
      "/admin/roles/{id}": {
        patch: {
          tags: ["Staff & Roles"],
          summary: "Update a staff role",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { 200: { description: "Updated role" } },
        },
        delete: {
          tags: ["Staff & Roles"],
          summary: "Delete a staff role (unassigns users)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Deleted" } },
        },
      },
      "/admin/staff": {
        get: {
          tags: ["Staff & Roles"],
          summary: "List admin staff members",
          parameters: [{ name: "search", in: "query", schema: { type: "string" } }],
          responses: { 200: { description: "Staff list with roles" } },
        },
        post: {
          tags: ["Staff & Roles"],
          summary: "Create a staff account",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "email", "phone", "password"], properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, password: { type: "string", minLength: 8 }, staffRoleId: { type: "integer" } } } } } },
          responses: { 201: { description: "Staff account created" } },
        },
      },
      "/admin/staff/{id}": {
        patch: {
          tags: ["Staff & Roles"],
          summary: "Update a staff member",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { 200: { description: "Updated staff member" } },
        },
      },

      // ─── DASHBOARD ────────────────────────────────────────────────────────────
      "/dashboard/summary": {
        get: {
          tags: ["Dashboard"],
          summary: "High-level fleet and platform summary",
          responses: { 200: { description: "Counts for routes, trips, buses, drivers, support, users" } },
        },
      },
      "/dashboard/activity": {
        get: {
          tags: ["Dashboard"],
          summary: "Recent activity feed (tickets, documents, suggestions, trips, bookings)",
          responses: { 200: { description: "Activity data" } },
        },
      },
      "/dashboard/analytics": {
        get: {
          tags: ["Dashboard"],
          summary: "30-day analytics charts (trips, routes, drivers, bookings)",
          responses: { 200: { description: "Analytics data for charts" } },
        },
      },
      "/dashboard/today": {
        get: {
          tags: ["Dashboard"],
          summary: "Today's live KPIs vs yesterday",
          responses: { 200: { description: "Trips today, revenue, drivers online, active trips" } },
        },
      },

      // ─── RIDES (HAILING) ──────────────────────────────────────────────────────
      "/rides/estimate": {
        post: {
          tags: ["Rides (Hailing)"],
          summary: "Estimate fare for a ride (zone pricing + surge)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["vehicleType", "pickupLatitude", "pickupLongitude", "dropoffLatitude", "dropoffLongitude"],
                  properties: {
                    vehicleType: { type: "string", enum: ["car", "bike"] },
                    pickupLatitude: { type: "number" },
                    pickupLongitude: { type: "number" },
                    dropoffLatitude: { type: "number" },
                    dropoffLongitude: { type: "number" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Distance, duration, estimated price, surge info" } },
        },
      },
      "/rides/request": {
        post: {
          tags: ["Rides (Hailing)"],
          summary: "Request a ride (user role)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["vehicleType", "pickupLatitude", "pickupLongitude", "pickupAddress", "dropoffLatitude", "dropoffLongitude", "dropoffAddress"],
                  properties: {
                    vehicleType: { type: "string", enum: ["car", "bike"] },
                    pickupLatitude: { type: "number" },
                    pickupLongitude: { type: "number" },
                    pickupAddress: { type: "string" },
                    dropoffLatitude: { type: "number" },
                    dropoffLongitude: { type: "number" },
                    dropoffAddress: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Ride created, drivers notified via Socket" }, 402: { description: "Insufficient wallet balance" } },
        },
      },
      "/rides/my": {
        get: {
          tags: ["Rides (Hailing)"],
          summary: "List own ride history (user role)",
          parameters: [
            { name: "vehicleType", in: "query", schema: { type: "string", enum: ["car", "bike"] } },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated ride list" } },
        },
      },
      "/rides/{id}": {
        get: {
          tags: ["Rides (Hailing)"],
          summary: "Get a ride by ID (passenger, driver, or admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Ride with passenger and driver info" }, 403: { description: "Forbidden" }, 404: { description: "Not found" } },
        },
      },
      "/rides/{id}/cancel": {
        patch: {
          tags: ["Rides (Hailing)"],
          summary: "Cancel a ride (passenger)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Ride cancelled" }, 400: { description: "Cannot cancel in current status" } },
        },
      },
      "/admin/rides/pricing": {
        get: {
          tags: ["Rides (Hailing)"],
          summary: "Get ride pricing config (admin)",
          responses: { 200: { description: "Pricing per vehicle type" } },
        },
      },
      "/admin/rides/pricing/{vehicleType}": {
        patch: {
          tags: ["Rides (Hailing)"],
          summary: "Update ride pricing (admin)",
          parameters: [{ name: "vehicleType", in: "path", required: true, schema: { type: "string", enum: ["car", "bike"] } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { baseFare: { type: "number" }, perKmRate: { type: "number" }, perMinuteRate: { type: "number" }, minimumFare: { type: "number" }, isActive: { type: "boolean" } },
                },
              },
            },
          },
          responses: { 200: { description: "Updated pricing" } },
        },
      },
      "/admin/rides": {
        get: {
          tags: ["Rides (Hailing)"],
          summary: "List all rides (admin)",
          parameters: [
            { name: "vehicleType", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "driverId", in: "query", schema: { type: "integer" } },
            { name: "passengerId", in: "query", schema: { type: "integer" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated ride list with passenger and driver" } },
        },
      },
      "/admin/rides/{id}": {
        get: {
          tags: ["Rides (Hailing)"],
          summary: "Get ride detail with events (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Ride with passenger, driver, and events" } },
        },
      },

      // ─── ZONES ────────────────────────────────────────────────────────────────
      "/zones": {
        get: {
          tags: ["Zones"],
          summary: "List all zones (admin)",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 100 } },
          ],
          responses: { 200: { description: "Zone list" } },
        },
        post: {
          tags: ["Zones"],
          summary: "Create a zone (admin)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "centerLat", "centerLng"],
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    centerLat: { type: "number" },
                    centerLng: { type: "number" },
                    radiusKm: { type: "number", default: 5 },
                    services: { type: "array", items: { type: "string", enum: ["car", "shuttle", "bike"] } },
                    isActive: { type: "boolean", default: true },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Zone created" } },
        },
      },
      "/zones/{id}": {
        get: {
          tags: ["Zones"],
          summary: "Get zone by ID (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Zone object" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Zones"],
          summary: "Update a zone (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { 200: { description: "Updated zone" } },
        },
        delete: {
          tags: ["Zones"],
          summary: "Delete a zone (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 204: { description: "Deleted" } },
        },
      },

      // ─── ZONE PRICING ─────────────────────────────────────────────────────────
      "/admin/zone-pricing": {
        get: {
          tags: ["Zone Pricing"],
          summary: "List zone pricing configurations (admin)",
          parameters: [{ name: "vehicleType", in: "query", schema: { type: "string", enum: ["car", "bike"] } }],
          responses: { 200: { description: "Zone pricing list with zone names" } },
        },
        post: {
          tags: ["Zone Pricing"],
          summary: "Create zone pricing entry (admin)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["zoneId", "vehicleType", "baseFare", "perKmRate", "minimumFare"],
                  properties: { zoneId: { type: "integer" }, vehicleType: { type: "string", enum: ["car", "bike"] }, baseFare: { type: "number" }, perKmRate: { type: "number" }, minimumFare: { type: "number" }, isActive: { type: "boolean" } },
                },
              },
            },
          },
          responses: { 201: { description: "Zone pricing created" }, 409: { description: "Duplicate zone + vehicle type" } },
        },
      },
      "/admin/zone-pricing/{id}": {
        patch: {
          tags: ["Zone Pricing"],
          summary: "Update zone pricing (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { 200: { description: "Updated zone pricing" } },
        },
        delete: {
          tags: ["Zone Pricing"],
          summary: "Delete zone pricing entry (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 204: { description: "Deleted" } },
        },
      },

      // ─── SHUTTLE ──────────────────────────────────────────────────────────────
      "/shuttle/lines": {
        get: {
          tags: ["Shuttle"],
          summary: "List active shuttle lines with stats",
          security: [],
          responses: { 200: { description: "Lines with station counts and trip stats" } },
        },
      },
      "/shuttle/lines/{id}": {
        get: {
          tags: ["Shuttle"],
          summary: "Get shuttle line detail with stations and upcoming trips",
          security: [],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Line with stations and active trips" } },
        },
      },
      "/shuttle/lines/{id}/activate": {
        post: {
          tags: ["Shuttle"],
          summary: "Activate a shuttle line and set next trip to boarding (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Route activated with optional boarding trip" } },
        },
      },
      "/shuttle/lines/{id}/complete": {
        post: {
          tags: ["Shuttle"],
          summary: "Complete all active trips on a shuttle line (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Number of completed trips" } },
        },
      },
      "/shuttle/lines/{id}/book": {
        post: {
          tags: ["Shuttle"],
          summary: "Driver books a recurring weekly slot on a shuttle line",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["weekStart", "weekEnd", "departureTime"],
                  properties: { weekStart: { type: "string", format: "date" }, weekEnd: { type: "string", format: "date" }, departureTime: { type: "string", example: "07:00", description: "One of the allowed slots (07:00, 08:00 … 16:00)" } },
                },
              },
            },
          },
          responses: { 201: { description: "Trip slot booked" }, 409: { description: "Slot already taken" }, 422: { description: "No bus assigned to driver" } },
        },
      },
      "/shuttle/assignments": {
        get: {
          tags: ["Shuttle"],
          summary: "List driver-bus assignments with current trips",
          security: [],
          responses: { 200: { description: "Drivers with assigned buses and current trip" } },
        },
      },
      "/shuttle/stops/{id}/board": {
        post: {
          tags: ["Shuttle"],
          summary: "Mark bus arrived at a stop (board event)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["tripId"], properties: { tripId: { type: "integer" } } } } } },
          responses: { 200: { description: "Station progress updated" } },
        },
      },
      "/shuttle/trips/{id}/passengers": {
        get: {
          tags: ["Shuttle"],
          summary: "Get booked passengers for a trip with boarding status",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Passenger list with boarding flags" } },
        },
      },
      "/shuttle/trips/{id}/board-stop": {
        post: {
          tags: ["Shuttle"],
          summary: "Mark stop reached and update passenger boarding status",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["stationId"], properties: { stationId: { type: "integer" } } } } } },
          responses: { 200: { description: "Stop progress with boarded passenger count" } },
        },
      },
      "/shuttle/driver/bookings": {
        get: {
          tags: ["Shuttle"],
          summary: "Driver's own shuttle bookings (upcoming, past, or all)",
          parameters: [{ name: "filter", in: "query", schema: { type: "string", enum: ["upcoming", "past", "all"], default: "upcoming" } }],
          responses: { 200: { description: "Driver's shuttle trip bookings" } },
        },
      },

      // ─── EARNINGS ─────────────────────────────────────────────────────────────
      "/earnings/summary": {
        get: {
          tags: ["Earnings"],
          summary: "Earnings summary (admin: all drivers; driver: own)",
          responses: { 200: { description: "Summary totals, by-status breakdown, recent earnings" } },
        },
      },
      "/earnings/weekly": {
        get: {
          tags: ["Earnings"],
          summary: "Weekly earnings breakdown",
          parameters: [
            { name: "weeks", in: "query", schema: { type: "integer", default: 8, minimum: 1, maximum: 52 } },
            { name: "driverId", in: "query", schema: { type: "integer" }, description: "Admin only" },
          ],
          responses: { 200: { description: "Weekly breakdown rows" } },
        },
      },
      "/earnings": {
        get: {
          tags: ["Earnings"],
          summary: "Paginated earnings records (admin)",
          parameters: [
            { name: "driverId", in: "query", schema: { type: "integer" } },
            { name: "status", in: "query", schema: { type: "string", enum: ["pending", "confirmed", "paid"] } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated earning records" } },
        },
      },
      "/earnings/{id}/status": {
        patch: {
          tags: ["Earnings"],
          summary: "Update earning record status (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["confirmed", "paid"] } } } } } },
          responses: { 200: { description: "Updated earning record" } },
        },
      },

      // ─── SUPPORT ──────────────────────────────────────────────────────────────
      "/support/tickets": {
        get: {
          tags: ["Support"],
          summary: "List support tickets (admin)",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["open", "pending", "resolved", "closed"] } },
            { name: "priority", in: "query", schema: { type: "string", enum: ["low", "medium", "high"] } },
            { name: "type", in: "query", schema: { type: "string", enum: ["passenger", "driver"] } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "userId", in: "query", schema: { type: "integer" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Paginated ticket list" } },
        },
        post: {
          tags: ["Support"],
          summary: "Create a support ticket (public)",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subject", "message"],
                  properties: {
                    subject: { type: "string" },
                    message: { type: "string" },
                    type: { type: "string", enum: ["passenger", "driver"] },
                    priority: { type: "string", enum: ["low", "medium", "high"] },
                    userId: { type: "integer" },
                    driverId: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Ticket created" } },
        },
      },
      "/support/tickets/{id}": {
        get: {
          tags: ["Support"],
          summary: "Get ticket detail with messages (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Ticket with messages" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Support"],
          summary: "Update ticket status or priority (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", enum: ["open", "pending", "resolved", "closed"] }, priority: { type: "string", enum: ["low", "medium", "high"] } } } } } },
          responses: { 200: { description: "Updated ticket" } },
        },
      },
      "/support/tickets/{id}/messages": {
        post: {
          tags: ["Support"],
          summary: "Reply to a support ticket (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["message"], properties: { message: { type: "string" }, senderType: { type: "string", enum: ["admin", "passenger", "driver"] } } } } } },
          responses: { 201: { description: "Reply sent" } },
        },
      },
      "/support/stats": {
        get: {
          tags: ["Support"],
          summary: "Support ticket stats by status (admin)",
          responses: { 200: { description: "Counts per status" } },
        },
      },

      // ─── DRIVER DOCUMENTS ─────────────────────────────────────────────────────
      "/driver-documents": {
        get: {
          tags: ["Driver Documents"],
          summary: "List all driver documents (admin)",
          parameters: [
            { name: "verificationStatus", in: "query", schema: { type: "string", enum: ["pending", "approved", "rejected"] } },
            { name: "type", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          ],
          responses: { 200: { description: "Document list with driver info" } },
        },
      },
      "/driver-documents/stats": {
        get: {
          tags: ["Driver Documents"],
          summary: "Document verification stats (admin)",
          responses: { 200: { description: "Counts per verification status" } },
        },
      },
      "/driver-documents/by-driver/{driverId}": {
        get: {
          tags: ["Driver Documents"],
          summary: "List all documents for a specific driver (admin)",
          parameters: [{ name: "driverId", in: "path", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Driver info and documents" } },
        },
      },
      "/driver-documents/upload/{driverId}": {
        post: {
          tags: ["Driver Documents"],
          summary: "Upload a document image for a driver",
          parameters: [{ name: "driverId", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file", "type"],
                  properties: {
                    file: { type: "string", format: "binary" },
                    type: { type: "string", enum: ["national_id_front", "national_id_back", "driving_license_front", "driving_license_back", "vehicle_license_front", "vehicle_license_back", "vehicle_photo", "profile_photo", "trip_selfie", "criminal_record"] },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Document record created with file URL" } },
        },
      },
      "/driver-documents/{id}": {
        patch: {
          tags: ["Driver Documents"],
          summary: "Update document verification status (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { verificationStatus: { type: "string", enum: ["pending", "approved", "rejected"] }, adminNotes: { type: "string" } } } } } },
          responses: { 200: { description: "Updated document" } },
        },
      },

      // ─── SUGGESTIONS ──────────────────────────────────────────────────────────
      "/suggestions": {
        get: {
          tags: ["Suggestions"],
          summary: "List route suggestions (admin)",
          responses: { 200: { description: "Suggestion list" } },
        },
        post: {
          tags: ["Suggestions"],
          summary: "Submit a route suggestion (public)",
          security: [],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["title", "startLocation", "endLocation"], properties: { title: { type: "string" }, type: { type: "string" }, startLocation: { type: "string" }, endLocation: { type: "string" }, description: { type: "string" } } } } } },
          responses: { 201: { description: "Suggestion submitted" } },
        },
      },
      "/suggestions/{id}": {
        patch: {
          tags: ["Suggestions"],
          summary: "Update suggestion status (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", enum: ["pending", "approved", "rejected"] } } } } } },
          responses: { 200: { description: "Updated suggestion" } },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
