import { useState } from "react";

const data = [
  {
    id: "network", label: "Network", icon: "◈", type: "commands",
    commands: [
      { label: "Show IP address", cmd: "ip addr show" },
      { label: "List open ports", cmd: "ss -tulnp" },
      { label: "Ping gateway", cmd: "ping -c 4 $(ip route | awk '/default/ {print $3}')" },
      { label: "DNS lookup", cmd: "dig +short google.com" },
      { label: "Trace route", cmd: "traceroute google.com" },
      { label: "Network interfaces", cmd: "ip link show" },
    ],
  },
  {
    id: "system", label: "System", icon: "◉", type: "commands",
    commands: [
      { label: "CPU info", cmd: "lscpu | grep -E 'Model name|CPU(s)|MHz'" },
      { label: "Memory usage", cmd: "free -h" },
      { label: "Disk usage", cmd: "df -h --total" },
      { label: "System uptime", cmd: "uptime -p" },
      { label: "Running processes", cmd: "ps aux --sort=-%cpu | head -10" },
      { label: "Kernel version", cmd: "uname -r" },
      { label: "OS info", cmd: "cat /etc/os-release" },
    ],
  },
  {
    id: "docker", label: "Docker", icon: "⬡", type: "commands",
    commands: [
      { label: "List containers", cmd: "docker ps -a" },
      { label: "Running containers", cmd: "docker ps" },
      { label: "List images", cmd: "docker images" },
      { label: "Container stats", cmd: "docker stats --no-stream" },
      { label: "Prune unused", cmd: "docker system prune -f" },
      { label: "Inspect network", cmd: "docker network ls" },
    ],
  },
  {
    id: "logs", label: "Logs", icon: "≡", type: "commands",
    commands: [
      { label: "System logs", cmd: "journalctl -n 50 --no-pager" },
      { label: "Kernel logs", cmd: "dmesg | tail -20" },
      { label: "Auth logs", cmd: "sudo tail -50 /var/log/auth.log" },
      { label: "Service logs", cmd: "journalctl -u nginx -n 30 --no-pager" },
      { label: "Boot log", cmd: "journalctl -b --no-pager | tail -30" },
    ],
  },
  {
    id: "storage", label: "Storage", icon: "▣", type: "commands",
    commands: [
      { label: "Block devices", cmd: "lsblk -o NAME,SIZE,TYPE,MOUNTPOINT" },
      { label: "Mount points", cmd: "findmnt" },
      { label: "Inode usage", cmd: "df -i" },
      { label: "Large files", cmd: "find / -type f -size +100M 2>/dev/null | head -10" },
      { label: "Dir sizes", cmd: "du -sh /* 2>/dev/null | sort -rh | head -15" },
    ],
  },
  {
    id: "security", label: "Security", icon: "⊕", type: "commands",
    commands: [
      { label: "Failed logins", cmd: "grep 'Failed password' /var/log/auth.log | tail -10" },
      { label: "Active users", cmd: "who" },
      { label: "Sudo history", cmd: "grep 'sudo' /var/log/auth.log | tail -10" },
      { label: "Firewall rules", cmd: "sudo iptables -L -n --line-numbers" },
      { label: "Open files", cmd: "lsof -i -n -P | head -20" },
    ],
  },
  { id: "compare", label: "Compare", icon: "⇄", type: "compare" },
  { id: "report", label: "Report", icon: "◧", type: "report" },
];

const today = new Date();
const formattedDate = today.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

const defaultReport = `DME Health Check Report — ${formattedDate}
──────────────────────────────────────────────────

HEALTH CHECK JOBS
─────────────────
[✓] CPU usage check           — Within normal range (avg 18%)
[✓] Memory usage check        — 6.2 GB / 16 GB used (38%)
[✓] Disk usage check          — 112 GB / 500 GB used (22%)
[✓] Network latency check     — Avg 4ms to gateway, no packet loss
[✓] Docker containers check   — All 8 containers running, 0 exited
[✓] System uptime check       — 14 days, 3 hours — stable
[✓] Auth log scan             — No failed login attempts detected
[✓] Firewall rules check      — Rules intact, no anomalies

DATA COMPARISON
───────────────
[✓] Preprod vs Prod schema    — No deviations detected
[✓] Row count comparison      — Orders table: preprod 48,210 / prod 48,210
[✓] Config diff               — Environment variables aligned
[✓] API response diff         — Endpoints returning identical payloads
[✓] Database indexes          — Consistent across both environments
[✓] Cron job schedules        — Matching in preprod and prod

SUMMARY
───────
No deviations found between preprod and production environments.
All health check jobs completed successfully.
System is stable and operating within expected parameters.

Signed off by: DME Automation
`;

function CopyButton({ getText }) {
  const [copied, setCopied] = useState(false);

  const fallbackCopy = (text) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch (e) { console.error("Copy failed", e); }
    document.body.removeChild(ta);
  };

  const handleCopy = () => {
    const text = typeof getText === "function" ? getText() : getText;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  return (
    <button
      onClick={handleCopy}
      style={{
        display: "flex", alignItems: "center", gap: 6, fontSize: 12,
        padding: "4px 10px", borderRadius: 4, cursor: "pointer",
        transition: "all 0.2s",
        background: copied ? "#f0faf0" : "transparent",
        color: copied ? "#2d7a2d" : "#aaaaaa",
        border: `1px solid ${copied ? "#c6e6c6" : "#e0e0e0"}`,
        fontFamily: "monospace",
      }}
    >
      <span style={{ fontSize: 10 }}>{copied ? "✓" : "⎘"}</span>
      {copied ? "copied" : "copy"}
    </button>
  );
}

function CommandsPanel({ item }) {
  return (
    <>
      <header style={{ borderBottom: "1px solid #eeeeee", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#1a1a1a", margin: 0 }}>{item.label}</h1>
          </div>
          <p style={{ fontSize: 11, color: "#aaaaaa", marginTop: 3 }}>{item.commands.length} commands available</p>
        </div>
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 760 }}>
          {item.commands.map((command, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderRadius: 6, background: "#f9f9f9", border: "1px solid #eeeeee", transition: "border-color 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#d8d8d8"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#eeeeee"; }}
            >
              <div style={{ flex: 1, marginRight: 24 }}>
                <div style={{ fontSize: 11, color: "#aaaaaa", marginBottom: 5, letterSpacing: "0.04em" }}>{command.label}</div>
                <code style={{ fontSize: 13, color: "#1a1a1a", fontFamily: "monospace", letterSpacing: "0.02em" }}>{command.cmd}</code>
              </div>
              <CopyButton getText={command.cmd} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ComparePanel() {
  return (
    <>
      <header style={{ borderBottom: "1px solid #eeeeee", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#1a1a1a", margin: 0 }}>Compare</h1>
          </div>
          <p style={{ fontSize: 11, color: "#aaaaaa", marginTop: 3 }}>Preprod vs Production</p>
        </div>
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
          <div style={{ display: "flex", gap: 16 }}>
            {["Preprod", "Prod"].map((env) => (
              <div key={env} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#aaaaaa" }}>{env}</label>
                <textarea
                  rows={15}
                  placeholder={`Paste ${env.toLowerCase()} output here...`}
                  style={{
                    width: "100%", background: "#f9f9f9", border: "1px solid #eeeeee",
                    color: "#1a1a1a", padding: "14px 16px", fontFamily: "monospace",
                    fontSize: 13, lineHeight: 1.65, borderRadius: 6, resize: "none",
                    outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#d0d0d0"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#eeeeee"; }}
                />
              </div>
            ))}
          </div>
          <div>
            <button
              style={{
                padding: "9px 24px", borderRadius: 6, fontSize: 13, letterSpacing: "0.04em",
                background: "#1a3a5c", color: "#ffffff", border: "none",
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#245080"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#1a3a5c"; }}
            >
              Compare
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ReportPanel() {
  const [reportText, setReportText] = useState(defaultReport);

  return (
    <>
      <header style={{ borderBottom: "1px solid #eeeeee", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#1a1a1a", margin: 0 }}>Report</h1>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, color: "#aaaaaa", border: "1px solid #eeeeee", background: "#f9f9f9" }}>{formattedDate}</span>
          </div>
          <p style={{ fontSize: 11, color: "#aaaaaa", marginTop: 3 }}>Editable health check report</p>
        </div>
        <CopyButton getText={() => reportText} />
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
        <textarea
          value={reportText}
          onChange={(e) => setReportText(e.target.value)}
          style={{
            width: "100%", minHeight: 520, background: "#f9f9f9",
            border: "1px solid #eeeeee", color: "#1a1a1a",
            padding: "20px 24px", fontFamily: "monospace", fontSize: 13,
            lineHeight: 1.8, borderRadius: 6, resize: "vertical",
            outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
            maxWidth: 780,
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#d0d0d0"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#eeeeee"; }}
        />
      </div>
    </>
  );
}

const regularItems = data.filter((d) => d.type === "commands");
const specialItems = data.filter((d) => d.type !== "commands");

export default function DMEDashboard() {
  const [selected, setSelected] = useState(data[0]);

  const NavItem = ({ item }) => {
    const isActive = selected.id === item.id;
    return (
      <button
        onClick={() => setSelected(item)}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "9px 12px", borderRadius: 5, textAlign: "left",
          background: isActive ? "rgba(255,255,255,0.15)" : "transparent",
          color: isActive ? "#ffffff" : "rgba(255,255,255,0.5)",
          border: isActive ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
          cursor: "pointer", transition: "all 0.15s", fontSize: 13,
        }}
      >
        <span style={{ letterSpacing: "0.02em" }}>{item.label}</span>
        {isActive && item.commands && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{item.commands.length}</span>
        )}
      </button>
    );
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden", background: "#0d0d0d", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Sidebar */}
      <aside style={{ display: "flex", flexDirection: "column", width: 200, height: "100%", flexShrink: 0, borderRight: "none", background: "#1a3a5c" }}>
        <div style={{ padding: "20px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>dashboard</div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.1em", color: "#ffffff", marginTop: 2 }}>DME</div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", flex: 1, padding: "12px 10px", overflowY: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {regularItems.map((item) => <NavItem key={item.id} item={item} />)}
          </div>
          <div style={{ margin: "12px 0", borderTop: "1px solid rgba(255,255,255,0.1)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {specialItems.map((item) => <NavItem key={item.id} item={item} />)}
          </div>
        </nav>

        <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>v1.0.0</div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", background: "#ffffff" }}>
        {selected.type === "commands" && <CommandsPanel item={selected} />}
        {selected.type === "compare" && <ComparePanel />}
        {selected.type === "report" && <ReportPanel />}
      </main>
    </div>
  );
}