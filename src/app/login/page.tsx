"use client";

import { useEffect, useState } from "react";
import { roomDisplayName } from "@/lib/caption/roomSettings";

export default function LoginPage() {
  const [halls, setHalls] = useState<string[]>([]);
  const [hall, setHall] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let remembered = "";
    try {
      remembered = localStorage.getItem("livecap_last_hall") || "";
    } catch {}
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.enabled) {
          window.location.replace("/caption");
          return;
        }
        const list: string[] = data.halls || [];
        setHalls(list);
        setHall(remembered && (list.includes(remembered) || remembered === "*") ? remembered : list[0] || "*");
      })
      .catch(() => setError("Cannot reach LiveCap. Check the internet connection."));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hall, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Login failed.");
        setBusy(false);
        return;
      }
      try {
        localStorage.setItem("livecap_last_hall", hall);
      } catch {}
      const next = new URLSearchParams(window.location.search).get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      window.location.replace(hall === "*" && safeNext ? safeNext : data.redirect || "/caption");
    } catch {
      setError("Cannot reach LiveCap. Check the internet connection.");
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5 shadow-xl"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded border border-brand-gold text-brand-gold text-xs font-bold">VBE</span>
            <h1 className="text-lg font-semibold">LiveCap</h1>
          </div>
          <p className="text-sm text-zinc-400">Đăng nhập phòng / Log in to your hall</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wide text-zinc-400">Phòng / Hall</span>
          <select
            value={hall}
            onChange={(e) => setHall(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2.5 text-base"
          >
            {halls.map((h) => (
              <option key={h} value={h}>
                {roomDisplayName(h)}
              </option>
            ))}
            <option value="*">Admin (tất cả các phòng / all halls)</option>
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wide text-zinc-400">Mật khẩu / Password</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2.5 text-base"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-lg bg-brand-gold text-zinc-950 font-semibold py-2.5 disabled:opacity-50"
        >
          {busy ? "…" : "Vào phòng / Enter"}
        </button>
      </form>
    </main>
  );
}
