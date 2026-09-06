import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import { createPvpRouter } from "../pvpRoutes";

let now = 1_000_000;
const app = express();
app.use(express.json());
app.use("/api/pvp", createPvpRouter({ now: () => now, sessionTtlMs: 100 }));
const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api/pvp`;

  const invalidOffer = await fetch(`${baseUrl}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ offer: "" }),
  });
  assert.equal(invalidOffer.status, 400);

  const created = await fetch(`${baseUrl}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ offer: "offer-fixture" }),
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json() as { code?: string; expiresAt?: string };
  assert.ok(createdBody.code);
  assert.ok(createdBody.expiresAt);

  const offer = await fetch(`${baseUrl}/sessions/${createdBody.code}/offer`);
  assert.equal(offer.status, 200);
  assert.deepEqual(await offer.json(), { offer: "offer-fixture", expiresAt: createdBody.expiresAt });

  const answer = await fetch(`${baseUrl}/sessions/${createdBody.code}/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answer: "answer-fixture" }),
  });
  assert.equal(answer.status, 200);

  const candidates = await fetch(`${baseUrl}/sessions/${createdBody.code}/candidates`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      role: "host",
      candidates: [
        { candidate: "candidate-fixture", sdpMid: "0", sdpMLineIndex: 0 },
        { candidate: "" },
        { candidate: "x".repeat(2_000) },
      ],
    }),
  });
  assert.equal(candidates.status, 200);
  assert.equal((await candidates.json() as { accepted?: number }).accepted, 1);

  const readCandidates = await fetch(`${baseUrl}/sessions/${createdBody.code}/candidates?role=guest&since=0`);
  assert.equal(readCandidates.status, 200);
  assert.equal((await readCandidates.json() as { candidates?: unknown[] }).candidates?.length, 1);

  now += 101;
  const expiredOffer = await fetch(`${baseUrl}/sessions/${createdBody.code}/offer`);
  assert.equal(expiredOffer.status, 404);
  const expiredAnswer = await fetch(`${baseUrl}/sessions/${createdBody.code}/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answer: "late-answer" }),
  });
  assert.equal(expiredAnswer.status, 404);
  console.log("PASS: PvP signaling validates candidates and expires sessions deterministically");
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
