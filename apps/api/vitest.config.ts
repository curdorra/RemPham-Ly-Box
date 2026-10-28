import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://ott:ott@localhost:5432/ott_test";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: "test-secret-test-secret-test-secret",
      DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX ?? "",
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
      RAZORPAY_WEBHOOK_SECRET: "",
      CDN_SIGNING_KEY: "",
      CONTENT_KEY_SECRET: "test-content-key",
      // Keep uploads on local disk even when .env has R2 set up.
      R2_ACCOUNT_ID: "",
      R2_ACCESS_KEY_ID: "",
      R2_SECRET_ACCESS_KEY: "",
      R2_BUCKET: "",
      MEDIA_BASE_URL: "",
    },
  },
});
