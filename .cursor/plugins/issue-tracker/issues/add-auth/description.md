# Add authentication

Introduce user authentication across the app: a users table, login/logout
endpoints, and session middleware.

## Goals

- Persist users and credentials.
- Issue and validate sessions.
- Protect authenticated routes.

Work is decomposed into two branches: [db-schema](issue:db-schema) then
[auth-endpoints](issue:auth-endpoints).
