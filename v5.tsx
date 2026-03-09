import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Command {
  label: string;
  cmd: string;
}

interface CommandsItem {
  id: string;
  label: string;
  icon: string;
  type: "commands";
  commands: Command[];
}

interface SpecialItem {
  id: string;
  label: string;
  icon: string;
  type: "compare" | "report";
}

type NavItem = CommandsItem | SpecialItem;

// ── Data ──────────────────────────────────────────────────────────────────────

const data: NavItem[] = [
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
  { id: "report",  label: "Report",  icon: "◧", type: "report"  },
];

// ── Constants ─────────────────────────────────────────────────────────────────

const today = new Date();
const formattedDate = today.toLocaleDateString("en-GB", {
  day: "2-digit", month: "long", year: "numeric",
});

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

// ── CopyButton ────────────────────────────────────────────────────────────────

interface CopyButtonProps {
  getText: string | (() => string);
}

function CopyButton({ getText }: CopyButtonProps): JSX.Element {
  const [copied, setCopied] = useState<boolean>(false);

  const fallbackCopy = (text: string): void => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.error("Copy failed", e);
    }
    document.body.removeChild(ta);
  };

  const handleCopy = (): void => {
    const text = typeof getText === "function" ? getText() : getText;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={
        copied
          ? "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono cursor-pointer transition-all duration-200 bg-green-50 text-green-700 border border-green-200"
          : "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono cursor-pointer transition-all duration-200 bg-transparent text-gray-400 border border-gray-200 hover:border-gray-300 hover:text-gray-500"
      }
    >
      <span className="text-[10px]">{copied ? "✓" : "⎘"}</span>
      {copied ? "copied" : "copy"}
    </button>
  );
}

// ── CommandsPanel ─────────────────────────────────────────────────────────────

interface CommandsPanelProps {
  item: CommandsItem;
}

function CommandsPanel({ item }: CommandsPanelProps): JSX.Element {
  return (
    <>
      <header className="flex items-center justify-between px-8 py-5 border-b border-gray-100 shrink-0">
        <div>
          <h1 className="text-xs font-semibold tracking-widest uppercase text-gray-800 m-0">
            {item.label}
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {item.commands.length} commands available
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex flex-col gap-2 max-w-3xl">
          {item.commands.map((command: Command, i: number) => (
            <div
              key={i}
              className="flex items-center justify-between px-5 py-3.5 rounded-md bg-gray-50 border border-gray-100 transition-colors duration-150 hover:border-gray-300"
            >
              <div className="flex-1 mr-6">
                <div className="text-[11px] text-gray-400 mb-1 tracking-wide">
                  {command.label}
                </div>
                <code className="text-[13px] text-gray-800 font-mono">{command.cmd}</code>
              </div>
              <CopyButton getText={command.cmd} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── ComparePanel ──────────────────────────────────────────────────────────────

interface ParsedRow {
  num: number | null;
  name: string;
  flag: string;
  raw: string;
}

interface DiffRow {
  name: string;
  flag: string;
  preprodNum: number | null;
  prodNum: number | null;
  mismatch: boolean;
  zeroIssue: boolean;
}

function parseBlock(text: string): ParsedRow[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(/\s+/);
      const num = parts[0] !== undefined ? Number(parts[0]) : null;
      const name = parts[1] ?? "";
      const flag = parts[2] ?? "";
      return { num: isNaN(num as number) ? null : num, name, flag, raw: line };
    });
}

function runDiff(preprod: string, prod: string): DiffRow[] {
  const preprodRows = parseBlock(preprod);
  const prodRows = parseBlock(prod);

  // Match by index — names are guaranteed to be in the same order
  return preprodRows.map((prow, i) => {
    const prodRow = prodRows[i] ?? null;
    const preprodNum = prow.num;
    const prodNum = prodRow?.num ?? null;
    const mismatch = preprodNum !== prodNum;
    const zeroIssue = preprodNum === 0 || prodNum === 0;
    return {
      name: prow.name,
      flag: prow.flag || prodRow?.flag || "",
      preprodNum,
      prodNum,
      mismatch,
      zeroIssue,
    };
  });
}

function ComparePanel(): JSX.Element {
  const [preprodText, setPreprodText] = useState<string>("");
  const [prodText, setProdText] = useState<string>("");
  const [results, setResults] = useState<DiffRow[] | null>(null);

  const handleCompare = (): void => {
    const diff = runDiff(preprodText, prodText);
    setResults(diff);
  };

  const mismatches = results?.filter((r) => r.mismatch || r.zeroIssue) ?? [];
  const allMatch = results !== null && mismatches.length === 0;

  return (
    <>
      <header className="flex items-center px-8 py-5 border-b border-gray-100 shrink-0">
        <div>
          <h1 className="text-xs font-semibold tracking-widest uppercase text-gray-800 m-0">
            Compare
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5">Preprod vs Production</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex flex-col gap-5 max-w-4xl">

          {/* Text areas */}
          <div className="flex gap-4">
            {(["Preprod", "Prod"] as const).map((env) => (
              <div key={env} className="flex flex-col flex-1 gap-2">
                <label className="text-[11px] tracking-widest uppercase text-gray-400">
                  {env}
                </label>
                <textarea
                  rows={10}
                  placeholder={`Paste ${env.toLowerCase()} output here...\ne.g. 12 STG_BC TRUE`}
                  value={env === "Preprod" ? preprodText : prodText}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    env === "Preprod"
                      ? setPreprodText(e.target.value)
                      : setProdText(e.target.value)
                  }
                  className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-[13px] font-mono leading-relaxed rounded-md px-4 py-3.5 resize-none outline-none transition-colors duration-150 focus:border-gray-400 placeholder:text-gray-300"
                />
              </div>
            ))}
          </div>

          {/* Compare button */}
          <div>
            <button
              onClick={handleCompare}
              className="px-6 py-2 rounded-md text-sm text-white tracking-wide cursor-pointer transition-colors duration-150"
              style={{ background: "#1a3a5c" }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.background = "#245080";
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.background = "#1a3a5c";
              }}
            >
              Compare
            </button>
          </div>

          {/* Results */}
          {results !== null && (
            <div className="flex flex-col gap-3">

              {/* Summary badge */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-500">
                  Results
                </span>
                {allMatch ? (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                    ✓ No deviations — {results.length} rows matched
                  </span>
                ) : (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                    {mismatches.length} deviation{mismatches.length > 1 ? "s" : ""} found
                  </span>
                )}
              </div>

              {/* Diff table */}
              <div className="rounded-md border border-gray-100 overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_100px_100px_100px] bg-gray-50 border-b border-gray-100 px-4 py-2">
                  <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-400">Name</span>
                  <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 text-center">Preprod</span>
                  <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 text-center">Prod</span>
                  <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 text-center">Status</span>
                </div>

                {/* Rows */}
                {results.map((row, i) => {
                  const isOdd = i % 2 === 1;
                  const rowBg = row.mismatch || row.zeroIssue
                    ? "bg-red-50"
                    : isOdd ? "bg-gray-50/50" : "bg-white";

                  return (
                    <div
                      key={i}
                      className={`grid grid-cols-[1fr_100px_100px_100px] px-4 py-2.5 border-b border-gray-100 last:border-b-0 ${rowBg}`}
                    >
                      {/* Name */}
                      <span className="text-[13px] font-mono text-gray-700">{row.name}</span>

                      {/* Preprod number */}
                      <span className={[
                        "text-[13px] font-mono text-center",
                        row.zeroIssue && row.preprodNum === 0 ? "text-orange-500 font-semibold" : "text-gray-700",
                      ].join(" ")}>
                        {row.preprodNum ?? "—"}
                      </span>

                      {/* Prod number */}
                      <span className={[
                        "text-[13px] font-mono text-center",
                        row.zeroIssue && row.prodNum === 0 ? "text-orange-500 font-semibold" : "text-gray-700",
                      ].join(" ")}>
                        {row.prodNum ?? "—"}
                      </span>

                      {/* Status */}
                      <div className="flex justify-center items-center">
                        {row.zeroIssue ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 font-medium">
                            ZERO
                          </span>
                        ) : row.mismatch ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-medium">
                            DIFF
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200 font-medium">
                            OK
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

// ── ReportPanel ───────────────────────────────────────────────────────────────

function ReportPanel(): JSX.Element {
  const [reportText, setReportText] = useState<string>(defaultReport);

  return (
    <>
      <header className="flex items-center justify-between px-8 py-5 border-b border-gray-100 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xs font-semibold tracking-widest uppercase text-gray-800 m-0">
              Report
            </h1>
            <span className="text-[11px] px-2.5 py-0.5 rounded text-gray-400 border border-gray-200 bg-gray-50">
              {formattedDate}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">Editable health check report</p>
        </div>
        <CopyButton getText={() => reportText} />
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <textarea
          value={reportText}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setReportText(e.target.value)
          }
          className="w-full max-w-3xl min-h-[520px] bg-gray-50 border border-gray-200 text-gray-800 text-[13px] font-mono leading-[1.8] rounded-md px-6 py-5 resize-y outline-none transition-colors duration-150 focus:border-gray-400"
        />
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const regularItems = data.filter((d): d is CommandsItem => d.type === "commands");
const specialItems = data.filter((d): d is SpecialItem  => d.type !== "commands");

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DMEDashboard(): JSX.Element {
  const [selected, setSelected] = useState<NavItem>(data[0]);

  const SideNavItem = ({ item }: { item: NavItem }): JSX.Element => {
    const isActive = selected.id === item.id;
    return (
      <button
        onClick={() => setSelected(item)}
        className={
          isActive
            ? "flex items-center gap-2.5 w-full px-3 py-2 rounded text-left text-[13px] cursor-pointer transition-all duration-150 bg-white/15 text-white border border-white/20"
            : "flex items-center gap-2.5 w-full px-3 py-2 rounded text-left text-[13px] cursor-pointer transition-all duration-150 bg-transparent text-white/50 border border-transparent hover:text-white/80"
        }
      >
        <span className="tracking-wide">{item.label}</span>
        {isActive && item.type === "commands" && (
          <span className="ml-auto text-[11px] text-white/35">
            {(item as CommandsItem).commands.length}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Sidebar */}
      <aside
        className="flex flex-col w-50 h-full shrink-0"
        style={{ background: "#1a3a5c" }}
      >
        <div className="px-5 py-5 border-b border-white/10">
          <div className="text-[10px] tracking-[0.15em] uppercase text-white/40">
            dashboard
          </div>
          <div className="text-lg font-bold tracking-widest text-white mt-0.5">DME</div>
        </div>

        <nav className="flex flex-col flex-1 px-2.5 py-3 overflow-y-auto">
          <div className="flex flex-col gap-0.5">
            {regularItems.map((item) => (
              <SideNavItem key={item.id} item={item} />
            ))}
          </div>
          <div className="my-3 border-t border-white/10" />
          <div className="flex flex-col gap-0.5">
            {specialItems.map((item) => (
              <SideNavItem key={item.id} item={item} />
            ))}
          </div>
        </nav>

        <div className="px-5 py-3.5 border-t border-white/10">
          <div className="text-[11px] text-white/20">v1.0.0</div>
        </div>
      </aside>

      {/* Main panel */}
      <main className="flex flex-col flex-1 overflow-hidden bg-white">
        {selected.type === "commands" && (
          <CommandsPanel item={selected as CommandsItem} />
        )}
        {selected.type === "compare" && <ComparePanel />}
        {selected.type === "report"  && <ReportPanel />}
      </main>
    </div>
  );
}