
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Login failed.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setMessage("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "#08090c",
      color: "#f4f4f5",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: 20
    }}>
      <form onSubmit={handleLogin} style={{
        width: "100%",
        maxWidth: 420,
        background: "#111318",
        border: "1px solid #594725",
        borderRadius: 16,
        padding: 28
      }}>
        <h1 style={{
          color: "#f3d18b",
          letterSpacing: 4,
          textAlign: "center"
        }}>
          AUREVEX
        </h1>

        <h2 style={{ textAlign: "center" }}>
          Welcome back
        </h2>

        <p style={{
          color: "#9296a1",
          textAlign: "center",
          fontSize: 13
        }}>
          Sign in to your account.
        </p>

        <label>Email address</label>
        <input
          required
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={fieldStyle}
        />

        <label>Password</label>
        <input
          required
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Your password"
          style={fieldStyle}
        />

        <button
          disabled={loading}
          type="submit"
          style={{
            width: "100%",
            padding: 14,
            marginTop: 22,
            border: 0,
            borderRadius: 8,
            background: "#d9ad55",
            color: "#08090c",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          {loading ? "Signing in..." : "LOG IN"}
        </button>

        {message && (
          <p style={{ color: "#f3d18b", fontSize: 13 }}>
            {message}
          </p>
        )}

        <p style={{
          textAlign: "center",
          color: "#9296a1",
          fontSize: 13,
          marginTop: 22
        }}>
          New here?{" "}
          <Link href="/register" style={{ color: "#f3d18b" }}>
            Create an account
          </Link>
        </p>

      
      </form>
    </main>
  );
}

const fieldStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 13,
  marginTop: 8,
  marginBottom: 18,
  borderRadius: 8,
  border: "1px solid #292c34",
  background: "#08090c",
  color: "#ffffff",
  outline: "none"
};
