
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Registration failed.");
        return;
      }

      setMessage("Account created! Opening your dashboard...");
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
      <form onSubmit={handleRegister} style={{
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
          Create your account
        </h2>

       

        <label>Full name</label>
        <input
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your full name"
          maxLength={80}
          style={fieldStyle}
        />

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
          minLength={10}
          maxLength={72}
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="At least 10 characters"
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
          {loading ? "Creating account..." : "CREATE ACCOUNT"}
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
          Already registered?{" "}
          <Link href="/login" style={{ color: "#f3d18b" }}>
            Log in
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
