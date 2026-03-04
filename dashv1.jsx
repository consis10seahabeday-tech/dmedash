import { useState } from "react";

const data = [
  {
    id: "network",
    label: "Network",
    icon: "◈",
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
    id: "system",
    label: "System",
    icon: "◉",
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
    id: "docker",
    label: "Docker",
    icon: "⬡",
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
    id: "logs",
    label: "Logs",
    icon: "≡",
    commands: [
      { label: "System logs", cmd: "journalctl -n 50 --no-pager" },
      { label: "Kernel logs", cmd: "dmesg | tail -20" },
      { label: "Auth logs", cmd: "sudo tail -50 /var/log/auth.log" },
      { label: "Service logs", cmd: "journalctl -u nginx -n 30 --no-pager" },
      { label: "Boot log", cmd: "journalctl -b --no-pager | tail -30" },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    icon: "▣",
    commands: [
      { label: "Block devices", cmd: "lsblk -o NAME,SIZE,TYPE,MOUNTPOINT" },
      { label: "Mount points", cmd: "findmnt" },
      { label: "Inode usage", cmd: "df -i" },
      { label: "Large files", cmd: "find / -type f -size +100M 2>/dev/null | head -10" },
      { label: "Dir sizes", cmd: "du -sh /* 2>/dev/null | sort -rh | head -15" },
    ],
  },
  {
    id: "security",
    label: "Security",
    icon: "⊕",
    commands: [
      { label: "Failed logins", cmd: "grep 'Failed password' /var/log/auth.log | tail -10" },
      { label: "Active users", cmd: "who" },
      { label: "Sudo history", cmd: "grep 'sudo' /var/log/auth.log | tail -10" },
      { label: "Firewall rules", cmd: "sudo iptables -L -n --line-numbers" },
      { label: "Open files", cmd: "lsof -i -n -P | head -20" },
    ],
  },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-all duration-200"
      style={{
        background: copied ? "#1a2a1a" : "transparent",
        color: copied ? "#4ade80" : "#6b7280",
        border: `1px solid ${copied ? "#2d4a2d" : "#2a2a2a"}`,
        fontFamily: "monospace",
      }}
    >
      {copied ? (
        <>
          <span style={{ fontSize: 10 }}>✓</span> copied
        </>
      ) : (
        <>
          <span style={{ fontSize: 10 }}>⎘</span> copy
        </>
      )}
    </button>
  );
}

export default function DMEDashboard() {
  const [selected, setSelected] = useState(data[0]);

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ background: "#0d0d0d", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
    >
      {/* Sidebar */}
      <aside
        className="flex flex-col w-52 h-full shrink-0"
        style={{ borderRight: "1px solid #1e1e1e" }}
      >
        {/* Logo */}
        <div
          className="px-5 py-5"
          style={{ borderBottom: "1px solid #1e1e1e" }}
        >
          <div className="text-xs tracking-widest uppercase" style={{ color: "#3f3f3f" }}>
            dashboard
          </div>
          <div
            className="text-lg font-bold tracking-wider mt-0.5"
            style={{ color: "#e5e5e5", letterSpacing: "0.1em" }}
          >
            DME
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex flex-col gap-0.5 px-3 py-4 flex-1">
          {data.map((item) => {
            const isActive = selected.id === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className="flex items-center gap-3 px-3 py-2.5 rounded text-left transition-all duration-150 w-full"
                style={{
                  background: isActive ? "#1a1a1a" : "transparent",
                  color: isActive ? "#e5e5e5" : "#4a4a4a",
                  border: isActive ? "1px solid #252525" : "1px solid transparent",
                }}
              >
                <span style={{ fontSize: 12, opacity: isActive ? 1 : 0.5 }}>{item.icon}</span>
                <span className="text-sm tracking-wide">{item.label}</span>
                {isActive && (
                  <span className="ml-auto text-xs" style={{ color: "#3a3a3a" }}>
                    {item.commands.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="px-5 py-4"
          style={{ borderTop: "1px solid #1a1a1a" }}
        >
          <div className="text-xs" style={{ color: "#2e2e2e" }}>
            v1.0.0
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <header
          className="flex items-center justify-between px-8 py-5 shrink-0"
          style={{ borderBottom: "1px solid #1a1a1a" }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "#3a3a3a" }}>
                {selected.icon}
              </span>
              <h1 className="text-sm font-semibold tracking-widest uppercase" style={{ color: "#c0c0c0" }}>
                {selected.label}
              </h1>
            </div>
            <p className="text-xs mt-0.5" style={{ color: "#3a3a3a" }}>
              {selected.commands.length} commands available
            </p>
          </div>

          <div
            className="text-xs px-3 py-1 rounded"
            style={{
              color: "#2a4a2a",
              background: "#111811",
              border: "1px solid #1a2e1a",
            }}
          >
            <span style={{ color: "#3a6a3a" }}>● </span>ready
          </div>
        </header>

        {/* Commands */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="flex flex-col gap-2 max-w-3xl">
            {selected.commands.map((command, i) => (
              <div
                key={i}
                className="group flex items-center justify-between px-5 py-4 rounded"
                style={{
                  background: "#111111",
                  border: "1px solid #1e1e1e",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#2a2a2a";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#1e1e1e";
                }}
              >
                <div className="flex flex-col gap-1.5 flex-1 mr-6">
                  <div className="text-xs tracking-wide" style={{ color: "#555555" }}>
                    {command.label}
                  </div>
                  <code
                    className="text-sm"
                    style={{ color: "#d4d4d4", letterSpacing: "0.02em" }}
                  >
                    {command.cmd}
                  </code>
                </div>
                <CopyButton text={command.cmd} />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}