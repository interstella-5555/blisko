# `admin` — Admin panel conventions

- `admin/protected-by-default` — All admin tRPC procedures use `protectedProcedure` (requires valid `admin-session` cookie). There is no `publicProcedure` export — if you need one, you're probably doing something wrong. Auth routes (request-otp, verify-otp, logout) are plain Nitro API routes, not tRPC.
