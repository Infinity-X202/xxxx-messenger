# Admin (future)

Roles exist on `users.role`: `user`, `moderator`, `admin`.

There is **no** built-in admin panel and **no** default admin password.

To create an operator:

1. Register normally.
2. Set `BOOTSTRAP_ADMIN_EMAIL` to that address **before** first registration, **or**
3. Promote in a controlled maintenance session:

```sql
UPDATE users SET role = 'admin' WHERE email = 'ops@example.com';
```

Do this only over a secure channel to the database (never expose Postgres).
