---
name: Generated client auth
description: How the @workspace/api-client-react generated hooks send auth tokens
---

## Rule
The generated customFetch sends bearer tokens via a module-level _authTokenGetter. This getter must be configured at app startup before any hooks are used.

**Why:** Without setAuthTokenGetter, all generated hook calls (useListDrivers, useDeleteRoute, etc.) go out without Authorization headers and get 401/403.

## How to apply
- Configured in artifacts/admin-dashboard/src/main.tsx: setAuthTokenGetter(() => localStorage.getItem("accessToken"))
- GET /drivers requires requireRole("admin") — works with admin token via customFetch
- DELETE /routes/:id requires requireRole("admin") — same
- For admin-specific endpoints not in the generated client, use adminFetch from @/lib/api directly
