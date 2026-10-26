import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { askHotel, listHotels, type AskResult } from "./ask.js";
import { loadConfig } from "./config.js";
import { createGraphStore } from "./graph.js";
import { TypeSafeJevJudge } from "./jev.js";

const publicDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public",
);

const FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
};

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(payload);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (chunks.reduce((total, part) => total + part.length, 0) > 100_000) {
      throw new Error("Request body is too large.");
    }
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text) as unknown;
}

export function createApp(deps: {
  graph: Pick<
    ReturnType<typeof createGraphStore>,
    "listHotels" | "getFactSheet"
  >;
  judge: TypeSafeJevJudge | { judge: TypeSafeJevJudge["judge"] };
}) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/api/hotels") {
        const hotels = await listHotels(deps.graph);
        sendJson(response, 200, { hotels });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/ask") {
        let body: unknown;
        try {
          body = await readJson(request);
        } catch {
          sendJson(response, 400, {
            error: "Send a JSON body with hotelName and question.",
          });
          return;
        }
        const record =
          body && typeof body === "object"
            ? (body as Record<string, unknown>)
            : {};
        const result: AskResult = await askHotel(deps.graph, deps.judge, {
          hotelName: record.hotelName,
          question: record.question,
        });
        if (!result.ok) {
          sendJson(response, result.status, { error: result.error });
          return;
        }
        const { ok: _ok, ...payload } = result;
        sendJson(response, 200, payload);
        return;
      }

      if (request.method === "GET" && FILES[url.pathname]) {
        const asset = FILES[url.pathname];
        const contents = await readFile(path.join(publicDir, asset.file));
        response.writeHead(200, {
          "content-type": asset.type,
          "cache-control": "no-store",
        });
        response.end(contents);
        return;
      }

      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      sendJson(response, 500, { error: message });
    }
  });
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  const config = loadConfig();
  const graph = createGraphStore(config);
  const judge = new TypeSafeJevJudge(config);
  const server = createApp({ graph, judge });
  server.listen(config.port, "127.0.0.1", () => {
    console.log(`Hotel yes/no agent at http://127.0.0.1:${config.port}`);
  });
}
