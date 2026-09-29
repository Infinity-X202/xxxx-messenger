process.env.NODE_ENV ??= "test";
process.env.APP_URL ??= "http://localhost:5173";
process.env.CORS_ORIGIN ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://ixm:ixm@localhost:5432/infinity_x_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.SESSION_SECRET ??= "test-session-secret-do-not-use-in-prod-32";
