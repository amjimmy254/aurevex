
<header className="topbar">
  <div className="brand">
    <span className="brand-icon">A</span>
    AUREVEX
  </div>

  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
    <span className="demo-label">
      DEMO ACCOUNT
    </span>

    <button
      onClick={async () => {
        await fetch("/api/logout", { method: "POST" });
        window.location.href = "/login";
      }}
      style={{
        background: "#ff526d",
        color: "#ffffff",
        border: "none",
        padding: "9px 14px",
        borderRadius: "7px",
        cursor: "pointer",
        fontWeight: "bold",
      }}
    >
      LOG OUT
    </button>
  </div>
</header>
