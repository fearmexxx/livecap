import { createServer, type Server } from "node:http";

/** Minimal in-memory stand-in for the Upstash Redis REST /pipeline endpoint (tests only). */
export function startFakeUpstash(token = "test-token"): Promise<{ url: string; server: Server; data: Map<string, unknown> }> {
  const data = new Map<string, unknown>();
  const run = (cmd: (string | number)[]): unknown => {
    const [op, key, ...args] = cmd.map(String);
    switch (op.toUpperCase()) {
      case "GET":
        return (data.get(key) as string) ?? null;
      case "SET":
        data.set(key, args[0]);
        return "OK";
      case "HSET": {
        const h = (data.get(key) as Map<string, string>) || new Map();
        h.set(args[0], args[1]);
        data.set(key, h);
        return 1;
      }
      case "HGETALL": {
        const h = data.get(key) as Map<string, string> | undefined;
        return h ? [...h.entries()].flat() : [];
      }
      case "HDEL": {
        const h = data.get(key) as Map<string, string> | undefined;
        args.forEach((f) => h?.delete(f));
        return args.length;
      }
      case "SADD": {
        const s = (data.get(key) as Set<string>) || new Set();
        args.forEach((m) => s.add(m));
        data.set(key, s);
        return 1;
      }
      case "SMEMBERS":
        return [...((data.get(key) as Set<string>) || [])];
      case "EXPIRE":
        return 1;
      default:
        throw new Error("unsupported " + op);
    }
  };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401).end("unauthorized");
        return;
      }
      const cmds = JSON.parse(body) as (string | number)[][];
      const out = cmds.map((c) => {
        try {
          return { result: run(c) };
        } catch (e) {
          return { error: String(e) };
        }
      });
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(out));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${addr.port}`, server, data });
    })
  );
}
