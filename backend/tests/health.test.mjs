import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { app } from "../dist/app.js";

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("health endpoint returns the service status contract", async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "finsight-api",
  });
});

test("unknown API paths return a consistent not found error", async () => {
  const response = await fetch(`${baseUrl}/api/v1/not-a-route`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
    },
  });
});
