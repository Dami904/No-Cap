"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type InstalledRepo = { fullName: string; private: boolean };

/** Searchable repo combobox — replaces a plain <select>, which has no filtering
 *  and gets unwieldy the moment a GitHub App installation covers more than a
 *  handful of repos (e.g. "all repositories" access). */
export function RepoPicker({
  repos,
  value,
  onChange,
}: {
  repos: InstalledRepo[];
  value: string;
  onChange: (fullName: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [repos, query]);

  function select(fullName: string) {
    onChange(fullName);
    setQuery(fullName);
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (e.target.value !== value) onChange(""); // force an explicit re-pick
        }}
        onFocus={() => setOpen(true)}
        placeholder={`Search ${repos.length} repo${repos.length === 1 ? "" : "s"}…`}
        autoComplete="off"
        required
      />
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 0.4rem)",
            left: 0,
            right: 0,
            zIndex: 20,
            maxHeight: "16rem",
            overflowY: "auto",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            boxShadow: "var(--shadow)",
          }}
        >
          {filtered.length === 0 ? (
            <div className="dim" style={{ padding: "0.65rem 0.85rem", fontSize: "0.85rem" }}>
              No repos match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filtered.map((r) => (
              <button
                key={r.fullName}
                type="button"
                role="option"
                aria-selected={r.fullName === value}
                onClick={() => select(r.fullName)}
                style={{
                  display: "flex",
                  width: "100%",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  padding: "0.6rem 0.85rem",
                  background: r.fullName === value ? "var(--accent-bg)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text)",
                  font: "inherit",
                  fontSize: "0.88rem",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span className="break-all">{r.fullName}</span>
                {r.private && <span className="pill">private</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
