---
name: Admin auth flow
description: How admin authentication works in the Shuttle monorepo
---

## Rule
Admin users must log in via POST /auth/admin/login, never POST /auth/login.

**Why:** POST /auth/login is the passenger endpoint and explicitly blocks role=admin accounts with 403. POST /auth/admin/login only accepts role=admin accounts.

## How to apply
- Admin dashboard login page: calls /auth/admin/login via adminFetch
- Super admin seed: info.veegoapp@gmail.com / pass123 / role:"admin" — created idempotently on startup in artifacts/api-server/src/lib/seed.ts
- All /api/admin/* routes are protected by authenticate + requireRole("admin")
- Staff delete self-protection: DELETE /admin/staff/:id returns 400 if req.user.id === id
