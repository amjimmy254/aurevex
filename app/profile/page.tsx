"use client";

import { useEffect, useState } from "react";

type Profile = {
  id: string;
  name: string;
  email: string;
  accountType: string;
  virtualBalance: number;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profile", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Could not load profile."
          );
        }

        setProfile(data.profile);
      })
      .catch((error) => {
        setError(error.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#080b12",
        color: "#f1f5f9",
        fontFamily: "Arial, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 720, margin: "auto" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <strong style={{ letterSpacing: 3, fontSize: 20 }}>
            AUREVEX
          </strong>

          <a
            href="/"
            style={{
              color: "#00dfa2",
              textDecoration: "none",
            }}
          >
            ← Dashboard
          </a>
        </header>

        <section
          style={{
            background: "#0e1521",
            border: "1px solid #1f2b3d",
            borderRadius: 14,
            padding: 24,
          }}
        >
          <h1>Account Profile</h1>

          <p style={{ color: "#8190a5" }}>
            Your account information and demo account details.
          </p>

          {loading && <p>Loading profile...</p>}

          {error && (
            <p role="alert" style={{ color: "#ff526d" }}>
              {error}
            </p>
          )}

          {profile && (
            <>
              <div style={{ marginTop: 24 }}>
                <Info
                  label="Display name"
                  value={profile.name}
                />

                <Info
                  label="Email"
                  value={profile.email}
                />

               
              </div>

             
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        paddingBottom: 12,
        marginBottom: 12,
        borderBottom: "1px solid #1f2b3d",
      }}
    >
      <div
        style={{
          color: "#8190a5",
          fontSize: 12,
          marginBottom: 6,
        }}
      >
        {label}
      </div>

      <div style={{ overflowWrap: "anywhere" }}>
        {value}
      </div>
    </div>
  );
}
