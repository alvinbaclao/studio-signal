import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase, callApp } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { Placeholder } from "./Placeholder";
import type { Database } from "../lib/database.types";

type JoinCodeScope = Database["public"]["Enums"]["join_code_scope"];
type JoinCodeRow = Database["public"]["Tables"]["studio_join_code"]["Row"];

// Ports design-reference/JoinCodeManagement.dc.html, the "Join codes" tab
// of the Settings destination — "Studio & dance styles" is Task 26, which
// shares this same tab bar. See BUILD_PLAN.md Task 3.
export function Settings() {
  const { person } = useAuth();
  const [tab, setTab] = useState<"join-codes" | "studio">("join-codes");

  if (!hasRole(person, "director")) {
    return <Placeholder title="Settings" />;
  }

  return (
    <div style={{ padding: "18px 34px 30px" }}>
      <h2 style={{ fontSize: 24, letterSpacing: "-0.01em" }}>Settings</h2>

      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--hairline)", marginTop: 16 }}>
        <TabButton active={tab === "join-codes"} onClick={() => setTab("join-codes")}>
          Join codes
        </TabButton>
        <TabButton active={tab === "studio"} onClick={() => setTab("studio")}>
          Studio &amp; dance styles
        </TabButton>
      </div>

      {tab === "join-codes" ? (
        <>
          <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "16px 0 0", maxWidth: 640, lineHeight: 1.6 }}>
            Share the QR or the code — both open the same join link. Rotating invalidates the old
            one immediately; anyone who already joined keeps their account.
          </p>

          <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <JoinCodePanel
              studioId={person!.studio_id}
              scope="parent_dancer"
              eyebrow="Parent & dancer code"
              note={null}
            />
            <JoinCodePanel
              studioId={person!.studio_id}
              scope="instructor"
              eyebrow="Instructor code"
              note="Higher-trust code — a leaked link here reaches roster and posting access once assigned."
            />
          </div>
        </>
      ) : (
        <div style={{ marginTop: 22 }}>
          <Placeholder title="Studio & dance styles" />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 4px",
        marginBottom: -1,
        fontSize: 13,
        fontWeight: 700,
        color: active ? "var(--ink)" : "var(--ink-3)",
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid var(--signal-deep)" : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function JoinCodePanel({
  studioId,
  scope,
  eyebrow,
  note,
}: {
  studioId: string;
  scope: JoinCodeScope;
  eyebrow: string;
  note: string | null;
}) {
  const [row, setRow] = useState<JoinCodeRow | null | undefined>(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("studio_join_code")
      .select("*")
      .eq("studio_id", studioId)
      .eq("scope", scope)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRow(data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId, scope]);

  const isExpired = row?.expires_at ? new Date(row.expires_at) < new Date() : false;
  const isLive = !!row && !isExpired;

  const onRotate = async () => {
    setBusy(true);
    setError(null);
    const { error } = await callApp<string>("rotate_join_code", {
      p_studio_id: studioId,
      p_scope: scope,
    });
    if (error) setError(error.message);
    else await load();
    setBusy(false);
  };

  const onRevoke = async () => {
    if (!window.confirm("Revoke this code? Anyone who hasn't already joined won't be able to use it.")) {
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await callApp<undefined>("revoke_join_code", {
      p_studio_id: studioId,
      p_scope: scope,
    });
    if (error) setError(error.message);
    else await load();
    setBusy(false);
  };

  const onCopy = async () => {
    if (!row) return;
    await navigator.clipboard.writeText(row.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const joinUrl = row
    ? `${window.location.origin}/join?code=${encodeURIComponent(row.code)}&scope=${scope}`
    : "";

  return (
    <div className="card" style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "24px 26px" }}>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 10.5,
          letterSpacing: "0.11em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          fontWeight: 600,
        }}
      >
        {eyebrow}
      </div>

      {row === undefined ? (
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 16 }}>Loading…</p>
      ) : isLive ? (
        <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
          <div style={{ border: "1px solid var(--hairline)", borderRadius: 12, padding: 8, flexShrink: 0 }}>
            <QRCodeSVG value={joinUrl} size={128} />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 22,
                  letterSpacing: "0.09em",
                  color: "var(--ink)",
                }}
              >
                {row.code}
              </div>
              <button
                type="button"
                onClick={onCopy}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--sand)",
                  color: "var(--ink-2)",
                  fontSize: 12,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 10 }}>
              <b style={{ color: "var(--ink)" }}>{row.use_count}</b>{" "}
              {row.use_count === 1 ? "join" : "joins"} since{" "}
              {new Date(row.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>
              {row.expires_at
                ? `Expires ${new Date(row.expires_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : "Never expires"}
            </div>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 16 }}>
          {isExpired ? "The last code for this scope expired." : "No code yet."}
        </p>
      )}

      {error && (
        <p style={{ fontSize: 12.5, color: "var(--busy)", marginTop: 12 }}>{error}</p>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button
          type="button"
          onClick={onRotate}
          disabled={busy}
          style={{
            padding: "9px 16px",
            borderRadius: 9,
            background: "var(--sand)",
            color: "var(--ink)",
            fontSize: 12.5,
            fontWeight: 600,
            border: "none",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          Rotate code
        </button>
        {isLive && (
          <button
            type="button"
            onClick={onRevoke}
            disabled={busy}
            style={{
              padding: "9px 16px",
              borderRadius: 9,
              background: "var(--surface)",
              border: "1px solid var(--busy-tint)",
              color: "var(--busy)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            Revoke
          </button>
        )}
      </div>

      {note && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px dashed var(--hairline)",
            fontSize: 11.5,
            color: "var(--ink-3)",
            lineHeight: 1.5,
          }}
        >
          {note}
        </div>
      )}
    </div>
  );
}
