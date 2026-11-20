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
        for (let i = 0; i + 1 < args.length; i += 2) h.set(args[i], args[i + 1]);
        data.set(key, h);
        return 1;
      }
      case "HSETNX": {
        const h = (data.get(key) as Map<string, string>) || new Map();
        if (!h.has(args[0])) h.set(args[0], args[1]);
        data.set(key, h);
        return 1;
      }
      case "RPUSH": {
        const list = (data.get(key) as string[]) || [];
        data.set(key, [...list, ...args]);
        return list.length + args.length;
      }
      case "LTRIM":
        data.set(key, ((data.get(key) as string[]) || []).slice(Number(args[0])));
        return "OK";
      case "LRANGE":
        return ((data.get(key) as string[]) || []).slice(Number(args[0]));
      case "DEL":
        data.delete(key);
        return 1;
      case "INCR": {
        const next = (Number(data.get(key)) || 0) + 1;
        data.set(key, String(next));
        return next;
      }
      case "HMGET": {
        const h = data.get(key) as Map<string, string> | undefined;
        return args.map((f) => h?.get(f) ?? null);
      }
      case "HGET":
        return (data.get(key) as Map<string, string> | undefined)?.get(args[0]) ?? null;
      case "LINDEX": {
        const list = (data.get(key) as string[]) || [];
        const i = Number(args[0]);
        return list[i < 0 ? list.length + i : i] ?? null;
      }
      case "LLEN":
        return ((data.get(key) as string[]) || []).length;
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
      case "ZADD": {
        const z = (data.get(key) as Map<string, number>) || new Map();
        z.set(args[1], Number(args[0]));
        data.set(key, z);
        return 1;
      }
      case "ZRANGE":
      case "ZREMRANGEBYRANK": {
        const z = (data.get(key) as Map<string, number>) || new Map();
        const sorted = [...z.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]);
        const norm = (i: number) => (i < 0 ? sorted.length + i : i);
        const picked = sorted.slice(Math.max(0, norm(Number(args[0]))), norm(Number(args[1])) + 1);
        if (op.toUpperCase() === "ZRANGE") return picked;
        picked.forEach((m) => z.delete(m));
        return picked.length;
      }
      case "PING":
        return "PONG";
      case "HINCRBY":
      case "HINCRBYFLOAT": {
        const h = (data.get(key) as Map<string, string>) || new Map();
        const next = (Number(h.get(args[0])) || 0) + Number(args[1]);
        h.set(args[0], String(next));
        data.set(key, h);
        return next;
      }
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
