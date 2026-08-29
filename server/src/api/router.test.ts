import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { createDatabase } from "../db/connection.js";
import { ensureTestUsers, OTHER_TEST_USER_ID, TEST_USER_ID } from "../db/testUser.js";
import { createApiRouter } from "./router.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const TOKEN_TO_USER: Record<string, string> = {
  "test-token": TEST_USER_ID,
  "other-token": OTHER_TEST_USER_ID,
};

async function fakeVerify(token: string): Promise<string | null> {
  return TOKEN_TO_USER[token] ?? null;
}

function buildApp(sql: postgres.Sql) {
  const app = express();
  app.use("/api/v1", createApiRouter(sql, fakeVerify));
  return app;
}

describe("API router", () => {
  const sql = createDatabase(TEST_DATABASE_URL);
  let app: express.Express;

  beforeEach(async () => {
    await sql`TRUNCATE entries, tags, entry_tags, profiles RESTART IDENTITY CASCADE`;
    await ensureTestUsers(sql);
    app = buildApp(sql);
  });

  afterAll(async () => {
    await sql.end();
  });

  async function createSeedEntry(token = "test-token") {
    const res = await request(app)
      .post("/api/v1/entries")
      .set("Authorization", `Bearer ${token}`)
      .send({ date: "2026-07-20", mood_rating: 5, energy_level: 5, tags: ["tired"] });
    return res.body as { id: number };
  }

  describe("auth", () => {
    it("rejects requests without a token", async () => {
      const res = await request(app).get("/api/v1/entries");
      expect(res.status).toBe(401);
    });

    it("rejects requests with an invalid token", async () => {
      const res = await request(app)
        .get("/api/v1/entries")
        .set("Authorization", "Bearer bogus");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /entries", () => {
    it("creates an entry and returns 201", async () => {
      const res = await request(app)
        .post("/api/v1/entries")
        .set("Authorization", "Bearer test-token")
        .send({
          date: "2026-07-20",
          mood_rating: 7,
          energy_level: 6,
          sleep_hours: 7.5,
          notes: "Felt good today",
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        date: "2026-07-20",
        mood_rating: 7,
        energy_level: 6,
        sleep_hours: 7.5,
        notes: "Felt good today",
        user_id: TEST_USER_ID,
      });
    });

    it("returns 400 for an out-of-range mood_rating", async () => {
      const res = await request(app)
        .post("/api/v1/entries")
        .set("Authorization", "Bearer test-token")
        .send({ date: "2026-07-20", mood_rating: 20, energy_level: 6 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    });
  });

  describe("GET /entries", () => {
    it("lists only this user's entries", async () => {
      await createSeedEntry();
      await createSeedEntry("other-token");

      const res = await request(app)
        .get("/api/v1/entries")
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it("applies query filters", async () => {
      await request(app)
        .post("/api/v1/entries")
        .set("Authorization", "Bearer test-token")
        .send({ date: "2026-07-20", mood_rating: 3, energy_level: 3 });
      await request(app)
        .post("/api/v1/entries")
        .set("Authorization", "Bearer test-token")
        .send({ date: "2026-07-21", mood_rating: 9, energy_level: 9 });

      const res = await request(app)
        .get("/api/v1/entries")
        .query({ min_mood_rating: 6 })
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].date).toBe("2026-07-21");
    });

    it("returns 400 for an invalid query param", async () => {
      const res = await request(app)
        .get("/api/v1/entries")
        .query({ min_mood_rating: "not-a-number" })
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(400);
    });
  });

  describe("GET /entries/:id", () => {
    it("returns the entry with its tags", async () => {
      const seed = await createSeedEntry();

      const res = await request(app)
        .get(`/api/v1/entries/${seed.id}`)
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: seed.id, tags: ["tired"] });
    });

    it("returns 404 for a nonexistent entry", async () => {
      const res = await request(app)
        .get("/api/v1/entries/9999")
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(404);
    });

    it("returns 404 for another user's entry", async () => {
      const seed = await createSeedEntry("other-token");

      const res = await request(app)
        .get(`/api/v1/entries/${seed.id}`)
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /entries/:id", () => {
    it("updates only the provided fields", async () => {
      const seed = await createSeedEntry();

      const res = await request(app)
        .patch(`/api/v1/entries/${seed.id}`)
        .set("Authorization", "Bearer test-token")
        .send({ mood_rating: 9 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        mood_rating: 9,
        energy_level: 5,
        tags: ["tired"],
      });
    });

    it("cannot update another user's entry", async () => {
      const seed = await createSeedEntry("other-token");

      const res = await request(app)
        .patch(`/api/v1/entries/${seed.id}`)
        .set("Authorization", "Bearer test-token")
        .send({ mood_rating: 1 });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /entries/:id", () => {
    it("deletes the entry", async () => {
      const seed = await createSeedEntry();

      const res = await request(app)
        .delete(`/api/v1/entries/${seed.id}`)
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/v1/entries/${seed.id}`)
        .set("Authorization", "Bearer test-token");
      expect(getRes.status).toBe(404);
    });

    it("cannot delete another user's entry", async () => {
      const seed = await createSeedEntry("other-token");

      const res = await request(app)
        .delete(`/api/v1/entries/${seed.id}`)
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(404);
    });
  });

  describe("GET /today", () => {
    it("returns null when nothing logged today", async () => {
      const res = await request(app)
        .get("/api/v1/today")
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it("returns today's entry when one exists", async () => {
      const today = new Date().toISOString().slice(0, 10);
      await request(app)
        .post("/api/v1/entries")
        .set("Authorization", "Bearer test-token")
        .send({ date: today, mood_rating: 6, energy_level: 6 });

      const res = await request(app)
        .get("/api/v1/today")
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body.date).toBe(today);
    });
  });

  describe("GET /search", () => {
    it("finds matches and returns 400 without a keyword", async () => {
      await request(app)
        .post("/api/v1/entries")
        .set("Authorization", "Bearer test-token")
        .send({
          date: "2026-07-20",
          mood_rating: 5,
          energy_level: 5,
          notes: "a rough meeting",
        });

      const res = await request(app)
        .get("/api/v1/search")
        .query({ keyword: "meeting" })
        .set("Authorization", "Bearer test-token");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);

      const missingKeyword = await request(app)
        .get("/api/v1/search")
        .set("Authorization", "Bearer test-token");
      expect(missingKeyword.status).toBe(400);
    });
  });

  describe("GET /streak", () => {
    it("returns null with no entries, data once logged", async () => {
      const empty = await request(app)
        .get("/api/v1/streak")
        .set("Authorization", "Bearer test-token");
      expect(empty.body).toBeNull();

      await createSeedEntry();

      const res = await request(app)
        .get("/api/v1/streak")
        .set("Authorization", "Bearer test-token");
      expect(res.status).toBe(200);
      expect(res.body.current_streak).toBeGreaterThanOrEqual(0);
    });
  });

  describe("GET /summary", () => {
    it("requires a valid period", async () => {
      const res = await request(app)
        .get("/api/v1/summary")
        .query({ period: "year" })
        .set("Authorization", "Bearer test-token");
      expect(res.status).toBe(400);
    });

    it("returns null when there's no data for the period", async () => {
      const res = await request(app)
        .get("/api/v1/summary")
        .query({ period: "week" })
        .set("Authorization", "Bearer test-token");
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });
  });

  describe("GET /mood-trends", () => {
    it("requires a valid period", async () => {
      const res = await request(app)
        .get("/api/v1/mood-trends")
        .query({ period: "year" })
        .set("Authorization", "Bearer test-token");
      expect(res.status).toBe(400);
    });
  });

  describe("GET /patterns", () => {
    it("returns an empty array with no data", async () => {
      const res = await request(app)
        .get("/api/v1/patterns")
        .set("Authorization", "Bearer test-token");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("GET /tags", () => {
    it("returns all tag names alphabetically, shared across users", async () => {
      await createSeedEntry("test-token");
      await request(app)
        .post("/api/v1/entries")
        .set("Authorization", "Bearer other-token")
        .send({ date: "2026-07-21", mood_rating: 6, energy_level: 6, tags: ["zzz-tag"] });

      const res = await request(app)
        .get("/api/v1/tags")
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(["tired", "zzz-tag"]);
    });
  });

  describe("GET /profile", () => {
    it("returns null when no profile has been set up", async () => {
      const res = await request(app)
        .get("/api/v1/profile")
        .set("Authorization", "Bearer test-token");
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });
  });

  describe("PUT /profile", () => {
    it("creates a profile on first upsert", async () => {
      const res = await request(app)
        .put("/api/v1/profile")
        .set("Authorization", "Bearer test-token")
        .send({ name: "Amaia", pronouns: "she/her", exercise: ["Running", "Yoga"] });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        user_id: TEST_USER_ID,
        name: "Amaia",
        pronouns: "she/her",
        exercise: ["Running", "Yoga"],
        hobbies: [],
      });
    });

    it("only changes the provided fields on subsequent upserts", async () => {
      await request(app)
        .put("/api/v1/profile")
        .set("Authorization", "Bearer test-token")
        .send({ name: "Amaia", diet: "Vegetarian" });

      const res = await request(app)
        .put("/api/v1/profile")
        .set("Authorization", "Bearer test-token")
        .send({ pronouns: "she/her" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        name: "Amaia",
        diet: "Vegetarian",
        pronouns: "she/her",
      });
    });

    it("keeps each user's profile separate", async () => {
      await request(app)
        .put("/api/v1/profile")
        .set("Authorization", "Bearer test-token")
        .send({ name: "Amaia" });
      await request(app)
        .put("/api/v1/profile")
        .set("Authorization", "Bearer other-token")
        .send({ name: "Someone Else" });

      const res = await request(app)
        .get("/api/v1/profile")
        .set("Authorization", "Bearer test-token");

      expect(res.body.name).toBe("Amaia");
    });

    it("clears a scalar field when explicitly set to null", async () => {
      await request(app)
        .put("/api/v1/profile")
        .set("Authorization", "Bearer test-token")
        .send({ name: "Amaia", note: "some note" });

      const res = await request(app)
        .put("/api/v1/profile")
        .set("Authorization", "Bearer test-token")
        .send({ note: null });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: "Amaia", note: null });
    });

    it("returns 400 for an invalid body", async () => {
      const res = await request(app)
        .put("/api/v1/profile")
        .set("Authorization", "Bearer test-token")
        .send({ exercise: "not-an-array" });

      expect(res.status).toBe(400);
    });
  });
});
