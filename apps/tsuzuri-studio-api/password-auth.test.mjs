import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { loadWorker } from "./test-support.mjs";

const worker = await loadWorker();

function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const file of [
    "schema.sql",
    "migrations/20260911_curriculum_foundation.sql",
    "migrations/20260918_customer_email_auth.sql",
    "migrations/20260927_customer_password_auth.sql",
  ]) sql.exec(readFileSync(`apps/tsuzuri-studio-api/${file}`, "utf8"));
  sql.prepare("INSERT INTO members(id,email,role,status) VALUES ('editor','editor@example.com','editor','active'),('viewer','viewer@example.com','viewer','active')").run();
  const env = {
    ALLOW_DEV_AUTH: "true",
    CUSTOMER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    DB: {
      prepare(query) {
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          async first() { return sql.prepare(query).get(...args) || null; },
          async all() { return { results: sql.prepare(query).all(...args) }; },
          async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
        };
      },
    },
  };
  async function call(path, { method = "GET", body, email, cookie } = {}) {
    const headers = {};
    if (email) headers["x-column-studio-dev-email"] = email;
    if (cookie) headers.cookie = cookie;
    if (body) headers["content-type"] = "application/json";
    return worker.fetch(new Request(`https://test.local${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }), env);
  }
  return { sql, call };
}

test("Studioの管理者・編集者だけが認証コードなしでTAYORIパスワードを設定し、ログインできる", async () => {
  const { sql, call } = fixture();
  const staffPath = "/api/totonoe-studio/api/customer/auth/password/staff";
  const password = "correct-horse-battery-2026";
  assert.equal((await call(staffPath, { method: "POST", email: "viewer@example.com", body: { password } })).status, 403);
  assert.equal((await call("/api/totonoe-member/api/customer/auth/password/staff", { method: "POST", email: "editor@example.com", body: { password } })).status, 404);
  assert.equal((await call(staffPath, { method: "POST", email: "editor@example.com", body: { password: "short" } })).status, 400);

  const setup = await call(staffPath, { method: "POST", email: "editor@example.com", body: { password } });
  assert.equal(setup.status, 200);
  const cookie = setup.headers.get("set-cookie");
  assert.match(cookie, /totonoe_session=.*HttpOnly; Secure; SameSite=Lax/);
  const credential = sql.prepare("SELECT password_hash, password_salt, password_iterations FROM customer_password_credentials").get();
  assert.notEqual(credential.password_hash, password);
  assert.equal(credential.password_salt.length, 32);
  assert.equal(credential.password_iterations, 100000);

  const status = await (await call("/api/totonoe-member/api/customer/auth/status", { cookie })).json();
  assert.equal(status.authenticated, true);
  assert.equal(status.access.staff_access, true);
  assert.equal(status.access.staff_role, "editor");
  assert.equal(status.access.has_weekly_access, true);
  assert.equal(status.access.has_curriculum_access, true);
  const profile = await (await call("/api/totonoe-member/api/customer/profile", { cookie })).json();
  assert.equal(profile.profile.staff_access, true);
  assert.equal(profile.profile.has_curriculum_access, true);
  assert.equal((await call("/api/totonoe-member/api/weekly/materials", { cookie })).status, 200);

  const login = await call("/api/totonoe-member/api/customer/auth/password/login", { method: "POST", body: { email: "EDITOR@example.com", password } });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /totonoe_session=/);
  const wrong = await call("/api/totonoe-member/api/customer/auth/password/login", { method: "POST", body: { email: "editor@example.com", password: "wrong-password-2026" } });
  assert.equal(wrong.status, 401);
});
