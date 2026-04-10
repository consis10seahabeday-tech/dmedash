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
  const normalized = max === min ? 0.5 : 1 - (score - min) / (max - min);
  if (normalized > 0.75) return "importance-critical";
  if (normalized > 0.45) return "importance-high";
  if (normalized > 0.2) return "importance-medium";
  return "importance-low";
}

// ── Caret save/restore for contenteditable ─────────────────────────────────
function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(el);
  range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  return range.toString().length;
}

function setCaretOffset(el: HTMLElement, offset: number) {
  const walk = (node: Node, remaining: { left: number }): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining.left <= len) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(node, remaining.left);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
        return true;
      }
      remaining.left -= len;
      return false;
    }
    // <br> counts as 1 newline character
    if ((node as Element).tagName === "BR") {
      if (remaining.left === 0) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStartBefore(node);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
        return true;
      }
      remaining.left -= 1;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (walk(child, remaining)) return true;
    }
    return false;
  };
  walk(el, { left: offset });
}

// ── Build highlighted HTML string ──────────────────────────────────────────
function buildHTML(text: string, importance: ImportanceResult[]): string {
  const scores = importance.map((i) => i.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const tokenize = (segment: string): string =>
    segment
      .split(/(\s+)/)
      .map((token) => {
        if (/^\s+$/.test(token)) return token;
        const clean = token.toLowerCase().replace(/[^a-z0-9]/g, "");
        const match = importance.find((imp) =>
          imp.phrase.toLowerCase().split(/\s+/).some((pw) => pw === clean)
        );
        if (match) {
          const cls = getHighlightColor(match.score, min, max);
          return `<mark class="${cls}">${escape(token)}</mark>`;
        }
        return escape(token);
      })
      .join("");

  return text
    .split("\n")
    .map((line) => {
      if (line === "") return `<div><br></div>`;
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx);
        const rest = line.slice(colonIdx);
        return `<div><strong class="line-key">${escape(key)}</strong>${tokenize(rest)}</div>`;
      }
      return `<div>${tokenize(line)}</div>`;
    })
    .join("");
}

// ── Extract plain text from contenteditable ────────────────────────────────
function extractPlainText(el: HTMLElement): string {
  const lines: string[] = [];
  el.childNodes.forEach((node) => {
    if ((node as Element).tagName === "DIV") {
      const inner = node as HTMLElement;
      // single <br> = empty line
      if (inner.childNodes.length === 1 && (inner.childNodes[0] as Element).tagName === "BR") {
        lines.push("");
      } else {
        lines.push(inner.textContent ?? "");
      }
    } else {
      lines.push(node.textContent ?? "");
    }
  });
  return lines.join("\n");
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

  const editorRef = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);
  // Track whether the last change came from user input (not from re-render)
  const suppressNextRender = useRef(false);

  // Sync content when input prop changes
  useEffect(() => {
    setContent(input);
  }, [input]);

  // Re-render highlighted HTML into the contenteditable whenever content or
  // importance changes, preserving caret position.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (suppressNextRender.current) {
      suppressNextRender.current = false;
      return;
    }
    const offset = document.activeElement === el ? getCaretOffset(el) : -1;
    el.innerHTML = buildHTML(content, importance);
    if (offset >= 0) setCaretOffset(el, offset);
  }, [content, importance]);

  // Fetch importance (debounced)
  const fetchImportance = useCallback(async (text: string) => {
    if (text.length < 1) { setImportance([]); return; }
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

  // Handle user typing in contenteditable
  const handleInput = () => {
    if (isComposing.current) return;
    const el = editorRef.current;
    if (!el) return;
    const plain = extractPlainText(el);
    suppressNextRender.current = true;
    setContent(plain);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Prevent paste from injecting rich HTML
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
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
              <button className="tam-btn tam-btn-copy" onClick={handleCopy}>
                {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}
              </button>
              <button className="tam-btn tam-btn-cancel" onClick={() => setIsOpen(false)}>
                <CloseIcon /> Cancel
              </button>
            </div>
          </div>

          {/* Single editor pane */}
          <div className="tam-body-single">
            <div
              ref={editorRef}
              className="tam-editor"
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onPaste={handlePaste}
              onCompositionStart={() => { isComposing.current = true; }}
              onCompositionEnd={() => { isComposing.current = false; handleInput(); }}
              spellCheck
            />
            {error && <div className="tam-error">{error}</div>}
          </div>
        </div>
      </div>
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

    --crit-bg: rgba(32, 178, 140, 0.16);
    --crit-fg: #2dd4aa;
    --crit-border: rgba(32, 178, 140, 0.38);

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

  .tam-body-single {
    flex: 1; min-height: 0;
    display: flex; flex-direction: column;
    padding: 20px 24px;
    background: var(--bg);
    overflow: hidden;
  }

  .tam-editor {
    flex: 1;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 22px;
    font-family: 'Inter', sans-serif;
    font-size: 15px; line-height: 1.85;
    color: var(--text);
    overflow-y: auto;
    word-break: break-word;
    outline: none;
    transition: border-color 0.15s;
    cursor: text;
  }
  .tam-editor:focus { border-color: var(--accent); }
  .tam-editor div { min-height: 1.85em; }

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
    color: #ffffff;
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
    .tam-modal { width: 100vw; height: 100vh; border-radius: 0; }
  }
`;