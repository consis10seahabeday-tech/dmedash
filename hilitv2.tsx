import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
interface ImportanceResult {
  phrase: string;
  score: number;
}

interface TextAnalysisModalProps {
  input: string;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getHighlightColor(score: number, min: number, max: number): string {
  // Lower YAKE score = more important → map to stronger highlight
  const normalized = max === min ? 0.5 : 1 - (score - min) / (max - min);
  if (normalized > 0.75) return "importance-critical";
  if (normalized > 0.45) return "importance-high";
  if (normalized > 0.2) return "importance-medium";
  return "importance-low";
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function TextAnalysisModal({
  input,
  isOpen,
  setIsOpen,
}: TextAnalysisModalProps) {
  const [content, setContent] = useState(input);
  const [importance, setImportance] = useState<ImportanceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync content when input changes
  useEffect(() => {
    setContent(input);
  }, [input]);

  // Fetch importance when modal opens or content changes (debounced)
  const fetchImportance = useCallback(async (text: string) => {
    if (text.length < 1) {
      setImportance([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://10.105.35.8:8000/analyze-importance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setImportance(data.importance_results ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch importance");
      setImportance([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const id = setTimeout(() => fetchImportance(content), 600);
    return () => clearTimeout(id);
  }, [content, isOpen, fetchImportance]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Render highlighted HTML ──────────────────────────────────────────────
  const renderHighlighted = () => {
    const scores = importance.map((i) => i.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);

    const lines = content.split("\n");

    return lines.map((line, li) => {
      const hasColon = line.includes(":");
      const words = line.split(/(\s+)/);

      // Apply importance markup to the full line text
      let lineHtml = words
        .map((token) => {
          if (/^\s+$/.test(token)) return token;
          // Check if token is part of any importance phrase
          const match = importance.find((imp) =>
            imp.phrase
              .toLowerCase()
              .split(/\s+/)
              .some(
                (pw) => pw === token.toLowerCase().replace(/[^a-z0-9]/g, "")
              )
          );
          if (match) {
            const cls = getHighlightColor(match.score, min, max);
            return `<mark class="${cls}">${token}</mark>`;
          }
          return `<span>${token}</span>`;
        })
        .join("");

      // Bold first word if line has ':'
      if (hasColon && words.length > 0) {
        const firstWord = words[0];
        lineHtml = lineHtml.replace(
          new RegExp(`^(<mark[^>]*>|<span>)?${escapeRegex(firstWord)}`),
          (m) => `<strong class="line-key">${firstWord}</strong>` + m.slice(m.indexOf(firstWord) + firstWord.length)
        );
      }

      return (
        <span key={li} className={`line-block${hasColon ? " has-colon" : ""}`}>
          {li > 0 && <br />}
          {hasColon ? (
            <LineWithKey line={line} importance={importance} min={min} max={max} />
          ) : (
            <LineTokens tokens={words} importance={importance} min={min} max={max} />
          )}
        </span>
      );
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{css}</style>
      <div className="tam-backdrop" onClick={() => setIsOpen(false)}>
        <div className="tam-modal" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="tam-header">
            <div className="tam-title">
              <span className="tam-char-display">
                <span className="tam-count">{content.length}</span>
                <span className="tam-label"> characters</span>
              </span>
              {loading && <span className="tam-spinner" />}
            </div>
            <div className="tam-actions">
              <button
                className="tam-btn tam-btn-copy"
                onClick={handleCopy}
                title="Copy to clipboard"
              >
                {copied ? (
                  <>
                    <CheckIcon /> Copied
                  </>
                ) : (
                  <>
                    <CopyIcon /> Copy
                  </>
                )}
              </button>
              <button
                className="tam-btn tam-btn-cancel"
                onClick={() => setIsOpen(false)}
              >
                <CloseIcon /> Cancel
              </button>
            </div>
          </div>

          {/* Body — split view */}
          <div className="tam-body">
            {/* Left: editable textarea */}
            <div className="tam-pane tam-pane-edit">
              <div className="tam-pane-label">EDIT</div>
              <textarea
                ref={textareaRef}
                className="tam-textarea"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck
              />
              <div className="tam-char-counter">
                <span>{content.length}</span> / 2000
              </div>
            </div>

            {/* Right: highlighted preview */}
            <div className="tam-pane tam-pane-preview">
              <div className="tam-pane-label">PREVIEW</div>
              <div className="tam-preview">{renderHighlighted()}</div>

              {error && <div className="tam-error">{error}</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
function LineWithKey({
  line,
  importance,
  min,
  max,
}: {
  line: string;
  importance: ImportanceResult[];
  min: number;
  max: number;
}) {
  const colonIdx = line.indexOf(":");
  const key = line.slice(0, colonIdx);
  const rest = line.slice(colonIdx); // includes ':'

  return (
    <>
      <strong className="line-key">{key}</strong>
      <LineTokens
        tokens={rest.split(/(\s+)/)}
        importance={importance}
        min={min}
        max={max}
      />
    </>
  );
}

function LineTokens({
  tokens,
  importance,
  min,
  max,
}: {
  tokens: string[];
  importance: ImportanceResult[];
  min: number;
  max: number;
}) {
  return (
    <>
      {tokens.map((token, i) => {
        if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;
        const clean = token.toLowerCase().replace(/[^a-z0-9]/g, "");
        const match = importance.find((imp) =>
          imp.phrase
            .toLowerCase()
            .split(/\s+/)
            .some((pw) => pw === clean)
        );
        if (match) {
          const cls = getHighlightColor(match.score, min, max);
          return (
            <mark key={i} className={cls} title={`score: ${match.score}`}>
              {token}
            </mark>
          );
        }
        return <span key={i}>{token}</span>;
      })}
    </>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────
const CopyIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ── CSS ────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');

  :root {
    --bg: #0f0f11;
    --surface: #16161a;
    --surface2: #1e1e24;
    --border: #2a2a34;
    --text: #e8e8f0;
    --text-muted: #6b6b80;
    --accent: #7c6af7;
    --accent2: #3ecfcf;

    --crit-bg: rgba(255, 80, 80, 0.18);
    --crit-fg: #ff6b6b;
    --crit-border: rgba(255, 80, 80, 0.4);

    --high-bg: rgba(255, 165, 50, 0.16);
    --high-fg: #ffb347;
    --high-border: rgba(255, 165, 50, 0.35);

    --med-bg: rgba(124, 106, 247, 0.16);
    --med-fg: #a89af7;
    --med-border: rgba(124, 106, 247, 0.3);

    --low-bg: rgba(62, 207, 207, 0.12);
    --low-fg: #6ecfcf;
    --low-border: rgba(62, 207, 207, 0.25);

    --key-fg: #f0e6c8;
    --key-border: #8a7a40;
  }

  .tam-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.72);
    backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
    animation: fadeIn 0.18s ease;
  }

  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes slideUp { from { transform: translateY(18px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

  .tam-modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    width: min(96vw, 1200px);
    max-height: 95vh;
    height: 80vh;
    display: flex; flex-direction: column;
    box-shadow: 0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04);
    animation: slideUp 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    overflow: hidden;
    font-family: 'Geist Mono', monospace;
  }

  .tam-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    flex-shrink: 0;
  }

  .tam-title {
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; font-weight: 600;
    letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--text);
  }

  .tam-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
  }

  .tam-spinner {
    width: 14px; height: 14px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    display: inline-block;
  }
  @keyframes spin { to { transform: rotate(360deg) } }

  .tam-actions {
    display: flex; align-items: center; gap: 10px;
  }

  .tam-hint {
    font-size: 11px; color: var(--text-muted);
    padding: 4px 10px; background: var(--surface2);
    border-radius: 6px; border: 1px solid var(--border);
  }
  .tam-hint.warn { color: var(--high-fg); border-color: var(--high-border); }

  .tam-btn {
    display: flex; align-items: center; gap: 10px;
    padding: 13px 28px; border-radius: 9px;
    font-family: inherit; font-size: 16px; font-weight: 500;
    border: 1px solid; cursor: pointer;
    transition: all 0.15s;
  }

  .tam-btn-copy {
    background: rgba(124,106,247,0.12);
    color: var(--accent); border-color: rgba(124,106,247,0.3);
  }
  .tam-btn-copy:hover {
    background: rgba(124,106,247,0.22);
    box-shadow: 0 0 12px rgba(124,106,247,0.25);
  }

  .tam-btn-cancel {
    background: rgba(255,80,80,0.08);
    color: #e07070; border-color: rgba(255,80,80,0.25);
  }
  .tam-btn-cancel:hover {
    background: rgba(255,80,80,0.16);
  }

  .tam-body {
    display: grid; grid-template-columns: 1fr 1fr;
    flex: 1; min-height: 0;
    overflow: hidden;
  }

  .tam-pane {
    display: flex; flex-direction: column;
    padding: 16px 20px;
    overflow: hidden;
  }

  .tam-pane-edit { border-right: 1px solid var(--border); background: var(--bg); }
  .tam-pane-preview { background: var(--surface); }

  .tam-pane-label {
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.12em; color: var(--text-muted);
    margin-bottom: 10px;
  }

  .tam-textarea {
    flex: 1;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-family: 'Geist Mono', monospace;
    font-size: 13px; line-height: 1.7;
    padding: 12px 14px;
    resize: none;
    outline: none;
    transition: border-color 0.15s;
  }
  .tam-textarea:focus { border-color: var(--accent); }

  .tam-char-counter {
    font-size: 11px; color: var(--text-muted);
    text-align: right; margin-top: 6px;
  }
  .tam-char-counter .warn { color: var(--high-fg); }

  .tam-preview {
    flex: 1;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
    font-family: 'Inter', sans-serif;
    font-size: 14px; line-height: 1.8;
    color: var(--text);
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .line-block { display: contents; }

  .line-key {
    color: var(--key-fg);
    font-weight: 700;
    border-bottom: 1px solid var(--key-border);
    padding-bottom: 1px;
  }

  mark {
    border-radius: 3px;
    padding: 1px 2px;
    font-style: inherit;
  }

  .importance-critical {
    background: var(--crit-bg); color: var(--crit-fg);
    border: 1px solid var(--crit-border);
    box-shadow: 0 0 6px rgba(255,80,80,0.2);
  }
  .importance-high {
    background: var(--high-bg); color: var(--high-fg);
    border: 1px solid var(--high-border);
  }
  .importance-medium {
    background: var(--med-bg); color: var(--med-fg);
    border: 1px solid var(--med-border);
  }
  .importance-low {
    background: var(--low-bg); color: var(--low-fg);
    border: 1px solid var(--low-border);
  }

  .tam-char-display {
    display: flex; align-items: baseline; gap: 6px;
  }
  .tam-count {
    color: var(--accent);
    font-size: 26px; font-weight: 700;
    min-width: 2ch;
    line-height: 1;
  }
  .tam-label {
    color: var(--text-muted);
    font-size: 13px; font-weight: 400;
    letter-spacing: 0.04em;
  }

  .tam-error {
    margin-top: 10px; padding: 8px 12px;
    background: rgba(255,80,80,0.1);
    border: 1px solid var(--crit-border);
    border-radius: 6px;
    font-size: 12px; color: var(--crit-fg);
  }

  @media (max-width: 640px) {
    .tam-body { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; overflow-y: auto; }
    .tam-pane-edit { border-right: none; border-bottom: 1px solid var(--border); }
  }
`;