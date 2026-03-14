import { useState, useCallback } from "react";

type ResolutionType = "permanent" | "temporary" | "workaround" | "";

interface FormState {
  eventCode: string;
  category: string;
  categoryOther: string;
  subCategory: string;
  subCategoryOther: string;
  detailedRCA: string;
  actionTaken: string;
  resolutionType: ResolutionType;
  preventiveAction: string;
}

const EVENT_CODES = [
  "DQ-001 – Missing Records",
  "DQ-002 – Duplicate Entries",
  "DQ-003 – Schema Mismatch",
  "DQ-004 – Null Values",
  "DQ-005 – Data Drift",
];

const CATEGORIES: Record<string, string[]> = {
  "Data Ingestion": ["Pipeline Failure", "Source Unavailable", "Timeout"],
  "Data Transformation": ["Mapping Error", "Type Casting", "Aggregation Bug"],
  "Data Validation": ["Constraint Violation", "Format Error", "Range Breach"],
  "Data Storage": ["Write Failure", "Partition Error", "Capacity Issue"],
  "Other": [],
};

const RESOLUTION_TYPES: { value: ResolutionType; label: string }[] = [
  { value: "permanent", label: "Permanent Fix" },
  { value: "temporary", label: "Temporary Fix" },
  { value: "workaround", label: "Workaround Applied" },
];

const initialState: FormState = {
  eventCode: "",
  category: "",
  categoryOther: "",
  subCategory: "",
  subCategoryOther: "",
  detailedRCA: "",
  actionTaken: "",
  resolutionType: "",
  preventiveAction: "",
};

async function postToAPI(endpoint: string, payload: Record<string, string>) {
  try {
    await fetch(`http://localhost:8000/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // silently ignore if server is not running
  }
}

export default function IncidentResolutionForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitted, setSubmitted] = useState(false);
  const [generating, setGenerating] = useState(false);

  const subCategories =
    form.category && form.category !== "Other"
      ? [...(CATEGORIES[form.category] ?? []), "Other"]
      : [];

  const handleChange = (
    e: React.ChangeEvent<HTMLSelectElement | HTMLTextAreaElement | HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "category" ? { subCategory: "", subCategoryOther: "" } : {}),
    }));
  };

  const handleRCABlur = useCallback(() => {
    if (form.detailedRCA.trim()) {
      postToAPI("rca", { detailedRCA: form.detailedRCA });
    }
  }, [form.detailedRCA]);

  const handlePreventiveBlur = useCallback(() => {
    if (form.preventiveAction.trim()) {
      postToAPI("preventive-action", { preventiveAction: form.preventiveAction });
    }
  }, [form.preventiveAction]);

  const handleReset = () => {
    setForm(initialState);
    setSubmitted(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 1200));
    setGenerating(false);
    setSubmitted(true);
  };

  const effectiveCategory =
    form.category === "Other" ? form.categoryOther : form.category;
  const effectiveSubCategory =
    form.subCategory === "Other" ? form.subCategoryOther : form.subCategory;

  const isComplete =
    form.eventCode &&
    effectiveCategory &&
    (form.category === "Other" || effectiveSubCategory) &&
    form.detailedRCA &&
    form.actionTaken &&
    form.resolutionType &&
    form.preventiveAction;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d1117",
        color: "#f1f5f9",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "48px 16px",
      }}
    >
      <style>{`
        .field-label {
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #8b949e;
          display: block;
          margin-bottom: 6px;
        }
        .field-hint {
          font-size: 0.78rem;
          color: #374151;
          margin-top: 5px;
        }
        .form-control {
          background: #161b22;
          border: 1px solid #30363d;
          color: #e2e8f0;
          border-radius: 6px;
          padding: 9px 12px;
          width: 100%;
          font-size: 0.875rem;
          font-family: inherit;
          transition: border-color 0.15s, box-shadow 0.15s;
          outline: none;
          box-sizing: border-box;
        }
        .form-control:focus {
          border-color: #58a6ff;
          box-shadow: 0 0 0 3px rgba(88,166,255,0.1);
        }
        .form-control:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        select.form-control {
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236e7681' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 32px;
          cursor: pointer;
        }
        select.form-control option { background: #161b22; }
        textarea.form-control {
          resize: vertical;
          min-height: 90px;
          line-height: 1.6;
        }
        .divider {
          border: none;
          border-top: 1px solid #21262d;
          margin: 22px 0;
        }
        .fade-in { animation: fadeIn 0.25s ease forwards; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .btn-primary {
          background: #238636;
          color: #fff;
          border: 1px solid #2ea043;
          border-radius: 6px;
          padding: 10px 20px;
          font-size: 0.875rem;
          font-family: inherit;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
          flex: 1;
        }
        .btn-primary:hover:not(:disabled) { background: #2ea043; }
        .btn-primary:disabled {
          background: #161b22;
          color: #30363d;
          border-color: #21262d;
          cursor: not-allowed;
        }
        .btn-secondary {
          background: transparent;
          color: #8b949e;
          border: 1px solid #30363d;
          border-radius: 6px;
          padding: 10px 18px;
          font-size: 0.875rem;
          font-family: inherit;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .btn-secondary:hover { border-color: #8b949e; color: #e2e8f0; }
        .shimmer {
          display: inline-block;
          width: 140px;
          height: 14px;
          border-radius: 4px;
          background: linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%);
          background-size: 200% 100%;
          animation: shimmer 1s infinite;
          vertical-align: middle;
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div style={{ width: "100%", maxWidth: "640px" }}>
        {/* Header */}
        <div style={{ marginBottom: "24px" }}>
          <h1
            style={{
              fontSize: "1.2rem",
              fontWeight: 700,
              color: "#f1f5f9",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            Incident Resolution{" "}
            <span style={{ color: "#58a6ff" }}>Data Quality</span>{" "}
            <span style={{ color: "#8b949e", fontWeight: 400 }}>Template</span>
          </h1>
          <p style={{ fontSize: "0.8rem", color: "#4b5563", marginTop: 4 }}>
            Complete all fields to generate a structured resolution report
          </p>
        </div>

        {submitted ? (
          <div
            className="fade-in"
            style={{
              border: "1px solid #238636",
              background: "#0d1f0d",
              borderRadius: 8,
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: "1.1rem" }}>✓</span>
              <span style={{ fontWeight: 700, color: "#3fb950", fontSize: "0.875rem" }}>
                Resolution Generated
              </span>
            </div>
            <p style={{ fontSize: "0.85rem", color: "#7ee787", lineHeight: 1.7, margin: 0 }}>
              Incident <strong style={{ color: "#3fb950" }}>{form.eventCode}</strong> logged under{" "}
              <strong style={{ color: "#3fb950" }}>
                {effectiveCategory} → {effectiveSubCategory || "N/A"}
              </strong>{" "}
              with resolution type:{" "}
              <strong style={{ color: "#3fb950" }}>{form.resolutionType}</strong>.
            </p>
            <button
              className="btn-secondary"
              onClick={handleReset}
              style={{ marginTop: 16, fontSize: "0.8rem" }}
            >
              ← New Incident
            </button>
          </div>
        ) : (
          <div
            style={{
              border: "1px solid #30363d",
              borderRadius: 8,
              background: "#0d1117",
              padding: "28px 24px",
            }}
          >
            {/* Event Code */}
            <div style={{ marginBottom: 18 }}>
              <label className="field-label">Event Code</label>
              <select
                name="eventCode"
                value={form.eventCode}
                onChange={handleChange}
                className="form-control"
              >
                <option value="">Select event code</option>
                {EVENT_CODES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <p className="field-hint">
                Select event code for auto population of resolution fields
              </p>
            </div>

            <hr className="divider" />

            {/* Category */}
            <div style={{ marginBottom: 18 }}>
              <label className="field-label">Category</label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className="form-control"
              >
                <option value="">Root Cause Category</option>
                {Object.keys(CATEGORIES).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <p className="field-hint">Category for the incident</p>
              {form.category === "Other" && (
                <input
                  className="form-control fade-in"
                  style={{ marginTop: 8 }}
                  type="text"
                  name="categoryOther"
                  value={form.categoryOther}
                  onChange={handleChange}
                  placeholder="Specify category"
                />
              )}
            </div>

            {/* Sub-category */}
            <div style={{ marginBottom: 18 }}>
              <label className="field-label">Sub-category</label>
              <select
                name="subCategory"
                value={form.subCategory}
                onChange={handleChange}
                className="form-control"
                disabled={!form.category || form.category === "Other"}
              >
                <option value="">Root Cause Sub-Category</option>
                {subCategories.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <p className="field-hint">
                {form.category === "Other"
                  ? "Not applicable for custom categories"
                  : "Sub-category for the incident"}
              </p>
              {form.subCategory === "Other" && (
                <input
                  className="form-control fade-in"
                  style={{ marginTop: 8 }}
                  type="text"
                  name="subCategoryOther"
                  value={form.subCategoryOther}
                  onChange={handleChange}
                  placeholder="Specify sub-category"
                />
              )}
            </div>

            <hr className="divider" />

            {/* Detailed RCA */}
            <div style={{ marginBottom: 18 }}>
              <label className="field-label">Detailed RCA</label>
              <textarea
                name="detailedRCA"
                value={form.detailedRCA}
                onChange={handleChange}
                onBlur={handleRCABlur}
                className="form-control"
                placeholder="Enter root cause analysis"
              />
              <p className="field-hint">Detailed root cause analysis for the incident</p>
            </div>

            {/* Action Taken */}
            <div style={{ marginBottom: 18 }}>
              <label className="field-label">Action Taken</label>
              <textarea
                name="actionTaken"
                value={form.actionTaken}
                onChange={handleChange}
                className="form-control"
                placeholder="Enter action taken"
              />
              <p className="field-hint">Action taken for the incident</p>
            </div>

            <hr className="divider" />

            {/* Resolution Type */}
            <div style={{ marginBottom: 18 }}>
              <label className="field-label">Resolution Type</label>
              <select
                name="resolutionType"
                value={form.resolutionType}
                onChange={handleChange}
                className="form-control"
              >
                <option value="">Resolution Type</option>
                {RESOLUTION_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="field-hint">Resolution type for the incident</p>
            </div>

            {/* Preventive Action */}
            <div style={{ marginBottom: 28 }}>
              <label className="field-label">Preventive Action</label>
              <textarea
                name="preventiveAction"
                value={form.preventiveAction}
                onChange={handleChange}
                onBlur={handlePreventiveBlur}
                className="form-control"
                placeholder="Enter preventive action"
              />
              <p className="field-hint">
                Enter preventive actions to avoid future incidents
              </p>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn-primary"
                onClick={handleGenerate}
                disabled={!isComplete || generating}
              >
                {generating ? <span className="shimmer" /> : "Generate Resolution"}
              </button>
              <button className="btn-secondary" onClick={handleReset}>
                Reset
              </button>
            </div>

            {!isComplete && (
              <p
                style={{
                  textAlign: "center",
                  marginTop: 10,
                  fontSize: "0.72rem",
                  color: "#374151",
                }}
              >
                Complete all fields to enable generation
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}