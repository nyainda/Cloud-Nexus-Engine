import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/auth";

const storageRouter = new Hono<AppEnv>();

storageRouter.post("/storage/uploads/request-url", requireAuth, async (c) => {
  const body = await c.req.json<{
    name: string;
    size: number;
    contentType: string;
  }>();

  const key = `uploads/${crypto.randomUUID()}-${body.name}`;

  if (!c.env.STORAGE) {
    return c.json({
      uploadURL: `/api/storage/direct-upload/${key}`,
      objectPath: `/objects/${key}`,
    });
  }

  try {
    const url = await c.env.STORAGE.createMultipartUpload(key);
    return c.json({
      uploadURL: url.uploadId,
      objectPath: `/objects/${key}`,
    });
  } catch {
    return c.json({
      uploadURL: `/api/storage/direct-upload/${key}`,
      objectPath: `/objects/${key}`,
    });
  }
});

storageRouter.get("/storage/objects/*", requireAuth, async (c) => {
  const path = c.req.param("*") ?? "";
  if (!c.env.STORAGE) {
    return c.json({ error: "Storage not configured" }, 503);
  }
  try {
    const object = await c.env.STORAGE.get(path);
    if (!object) return c.json({ error: "Not found" }, 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    return new Response(object.body, { headers });
  } catch {
    return c.json({ error: "Storage unavailable" }, 503);
  }
});

export default storageRouter;
