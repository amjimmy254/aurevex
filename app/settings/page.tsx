
"use client";

import { useState, FormEvent } from "react";

export default function SettingsPage() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          currentPassword: current,
          newPassword: password
        })
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setMessage(data.message);
      setCurrent("");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const input = {
    display: "block",
    width: "100%",
    boxSizing: "border-box" as const,
    padding: 13,
    marginBottom: 18,
    borderRadius: 8,
    border: "1px solid #344256",
    background: "#080b12",
    color: "white",
    fontSize: 16
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "#080b12",
      color: "#f1f5f9",
      padding: 24,
      fontFamily: "Arial"
    }}>
      <div style={{ maxWidth: 620, margin: "auto" }}>
        <header style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 28
        }}>
          <strong>AUREVEX</strong>
          <a href="/profile" style={{ color: "#00dfa2" }}>← Profile</a>
        </header>

        <section style={{
          background: "#0e1521",
          border: "1px solid #1f2b3d",
          borderRadius: 14,
          padding: 24
        }}>
          <h1>Account Settings</h1>
          <p style={{ color: "#9aabc0" }}>
            Protect your account by using a unique password.
          </p>

          <h2 style={{ fontSize: 18 }}>Change Password</h2>

          <form onSubmit={submit}>
            <label htmlFor="current">Current password</label>
            <input id="current" type="password"
              autoComplete="current-password"
              required maxLength={72}
              value={current}
              onChange={e => setCurrent(e.target.value)}
              style={input} />

            <label htmlFor="new">New password</label>
            <input id="new" type="password"
              autoComplete="new-password"
              required minLength={10} maxLength={72}
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={input} />

            <label htmlFor="confirm">Confirm new password</label>
            <input id="confirm" type="password"
              autoComplete="new-password"
              required minLength={10} maxLength={72}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              style={input} />

            {error && <p role="alert" style={{ color: "#ff647c" }}>{error}</p>}
            {message && <p role="status" style={{ color: "#00dfa2" }}>{message}</p>}

            <button disabled={saving} type="submit"
              style={{
                width: "100%",
                padding: 14,
                border: 0,
                borderRadius: 8,
                background: "#00dfa2",
                fontWeight: "bold",
                cursor: "pointer"
              }}>
              {saving ? "Updating..." : "Update Password"}
            </button>
          </form>

          <p style={{ color: "#8190a5", fontSize: 12 }}>
            Passwords are stored as secure hashes.
          </p>
        </section>
      </div>
    </main>
  );
}
