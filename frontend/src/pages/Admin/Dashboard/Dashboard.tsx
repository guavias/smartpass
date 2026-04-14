import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Dashboard.module.css";
import hilineLogo from "../../../assets/hilineLogo.png";
import personIcon from "../../../assets/person.png";
import lookupGlassIcon from "../../../assets/lookupglass.png";
import clipboardIcon from "../../../assets/clipboard.png";
import {
  clearAdminSession,
  getAdminAccessLogs,
  getAdminPasses,
  getAdminSession,
  isAdminSessionValid,
  patchAdminPass,
} from "../../../api/admin";
import { ApiError } from "../../../api/client";

type PassType = "Visitor" | "Overnight Guest";
type Status = "Active" | "Expired" | "Upcoming" | "Revoked";
type ScanResult = "allow" | "deny";
type ContactMethod = "Email" | "SMS";
type PassRecord = {
  passId: string;
  reservationId: string;
  name: string;
  type: PassType;
  status: Status;
  startAt: string;
  endAt: string;
  adults: number;
  children: number;
  email: string;
  phone: string;
  preferredContact: ContactMethod;
  orderTotal: number;
  tax: number;
  paymentMethod: string;
  last4: string;
  squarePaymentId: string;
};

type AccessLog = {
  id: string;
  passId: string;
  name: string;
  at: string;
  result: ScanResult;
  reason: string;
  location: string;
};

type EditAudit = {
  id: string;
  passId: string;
  changedBy: string;
  changedAt: string;
  reason: string;
  changes: string[];
};

function toStatus(value: string): Status {
  const normalized = value.toLowerCase();
  if (normalized === "active") return "Active";
  if (normalized === "expired") return "Expired";
  if (normalized === "revoked") return "Revoked";
  if (normalized === "upcoming" || normalized === "inactive") return "Upcoming";
  return "Active";
}

function toPassType(value: string): PassType {
  return value.toLowerCase() === "guest" ? "Overnight Guest" : "Visitor";
}

function toScanResult(value?: string): ScanResult {
  return value?.toLowerCase() === "approved" || value?.toLowerCase() === "allow" ? "allow" : "deny";
}

/**
 * Parse an ISO datetime string and ensure it's treated as UTC.
 * The backend always sends UTC times, so we need to ensure they're handled correctly.
 */
function parseUTCDateTime(isoDateTime: string): Date {
  if (!isoDateTime) {
    return new Date(); // Fallback to current time if invalid
  }
  
  // Ensure the string has timezone indicator
  let cleanDateTime = isoDateTime.trim();
  
  // If no timezone indicator is present, assume UTC
  if (!cleanDateTime.includes('Z') && !cleanDateTime.includes('+') && !cleanDateTime.includes('-', 10)) {
    cleanDateTime += 'Z';
  }
  
  return new Date(cleanDateTime);
}

function fmtDateTime(value: string) {
  return parseUTCDateTime(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function toInputDateTimeValue(iso: string) {
  const d = parseUTCDateTime(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const session = getAdminSession();
  const [view, setView] = useState<"passes" | "logs">("passes");
  const [currentTime, setCurrentTime] = useState<string>("");
  const employeeName = session?.name ?? "Admin User";
  const employeeId = session?.adminId ?? "N/A";
  const [passes, setPasses] = useState<PassRecord[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [audit, setAudit] = useState<EditAudit[]>([]);
  const [loadError, setLoadError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | Status>("All");
  const [typeFilter, setTypeFilter] = useState<"All" | PassType>("All");
  const [deniedOnlyPasses, setDeniedOnlyPasses] = useState(false);

  const [selectedPassId, setSelectedPassId] = useState<string | null>(null);
  const selectedPass = useMemo(
    () => passes.find((p) => p.passId === selectedPassId) ?? null,
    [passes, selectedPassId]
  );

  const [draft, setDraft] = useState<{
    email: string;
    phone: string;
    preferredContact: ContactMethod;
    startAt: string;
    endAt: string;
    adults: number;
    children: number;
  } | null>(null);

  const [logPassId, setLogPassId] = useState("");
  const [logDeniedOnly, setLogDeniedOnly] = useState(false);
  const [logFrom, setLogFrom] = useState("");
  const [logTo, setLogTo] = useState("");

  const logsByPass = useMemo(() => {
    const map = new Map<string, AccessLog[]>();
    for (const l of [...logs].sort((a, b) => +new Date(b.at) - +new Date(a.at))) {
      const arr = map.get(l.passId) ?? [];
      arr.push(l);
      map.set(l.passId, arr);
    }
    return map;
  }, [logs]);

  const enrichedPasses = useMemo(
    () =>
      passes.map((p) => {
        const passLogs = logsByPass.get(p.passId) ?? [];
        const lastScan = passLogs[0];
        return { ...p, lastScan };
      }),
    [passes, logsByPass]
  );

  const filteredPasses = useMemo(() => {
    return enrichedPasses.filter((p) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.passId.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q);

      const matchStatus = statusFilter === "All" || p.status === statusFilter;
      const matchType = typeFilter === "All" || p.type === typeFilter;
      const matchDenied = !deniedOnlyPasses || p.lastScan?.result === "deny";
      return matchSearch && matchStatus && matchType && matchDenied;
    });
  }, [enrichedPasses, search, statusFilter, typeFilter, deniedOnlyPasses]);

  const filteredLogs = useMemo(() => {
    return logs
      .filter((l) => (!logDeniedOnly ? true : l.result === "deny"))
      .filter((l) => (!logPassId.trim() ? true : l.passId.toLowerCase().includes(logPassId.trim().toLowerCase())))
      .filter((l) => (!logFrom ? true : +new Date(l.at) >= +new Date(logFrom)))
      .filter((l) => (!logTo ? true : +new Date(l.at) <= +new Date(logTo)))
      .sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }, [logs, logDeniedOnly, logPassId, logFrom, logTo]);

  const todaysLogs = useMemo(() => {
    const today = new Date().toDateString();
    return logs.filter((l) => parseUTCDateTime(l.at).toDateString() === today);
  }, [logs]);

  const todayAccepted = todaysLogs.filter((l) => l.result === "allow").length;
  const todayDenied = todaysLogs.filter((l) => l.result === "deny").length;
  const activeNow = enrichedPasses.filter((p) => p.status === "Active").length;
  const recentDenials = [...logs]
    .filter((l) => l.result === "deny")
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 5);

  function openDetails(passId: string) {
    const pass = passes.find((p) => p.passId === passId);
    if (!pass) return;
    setSelectedPassId(passId);
    setDraft({
      email: pass.email,
      phone: pass.phone,
      preferredContact: pass.preferredContact,
      startAt: toInputDateTimeValue(pass.startAt),
      endAt: toInputDateTimeValue(pass.endAt),
      adults: pass.adults,
      children: pass.children,
    });
  }

  function saveDetails() {
    if (!selectedPass || !draft) return;

    const changes: string[] = [];
    if (selectedPass.email !== draft.email) changes.push(`Email: ${selectedPass.email} → ${draft.email}`);
    if (selectedPass.phone !== draft.phone) changes.push(`Phone: ${selectedPass.phone} → ${draft.phone}`);
    if (selectedPass.preferredContact !== draft.preferredContact)
      changes.push(`Preferred contact: ${selectedPass.preferredContact} → ${draft.preferredContact}`);
    if (toInputDateTimeValue(selectedPass.startAt) !== draft.startAt)
      changes.push(`Start: ${fmtDateTime(selectedPass.startAt)} → ${fmtDateTime(new Date(draft.startAt).toISOString())}`);
    if (toInputDateTimeValue(selectedPass.endAt) !== draft.endAt)
      changes.push(`End: ${fmtDateTime(selectedPass.endAt)} → ${fmtDateTime(new Date(draft.endAt).toISOString())}`);
    if (selectedPass.adults !== draft.adults || selectedPass.children !== draft.children)
      changes.push(`Party size: ${selectedPass.adults}/${selectedPass.children} → ${draft.adults}/${draft.children}`);

    const nextStartAt = new Date(draft.startAt).toISOString();
    const nextEndAt = new Date(draft.endAt).toISOString();

    setIsSaving(true);
    patchAdminPass(selectedPass.passId, {
      phone: draft.phone,
      access_start: nextStartAt,
      access_end: nextEndAt,
    })
      .catch(() => {
        // Keep local edits visible even if the backend rejects unsupported fields.
      })
      .finally(() => setIsSaving(false));

    setPasses((prev) =>
      prev.map((p) =>
        p.passId === selectedPass.passId
          ? {
              ...p,
              email: draft.email,
              phone: draft.phone,
              preferredContact: draft.preferredContact,
              startAt: nextStartAt,
              endAt: nextEndAt,
              adults: draft.adults,
              children: draft.children,
            }
          : p
      )
    );

    if (changes.length) {
      setAudit((prev) => [
        {
          id: crypto.randomUUID(),
          passId: selectedPass.passId,
          changedBy: "admin.user",
          changedAt: new Date().toISOString(),
          reason: "Support update",
          changes,
        },
        ...prev,
      ]);
    }

    setSelectedPassId(null);
    setDraft(null);
  }

  useEffect(() => {
    async function loadDashboardData() {
      if (!isAdminSessionValid(session)) return;
      try {
        setLoadError("");
        const [passData, logData] = await Promise.all([
          getAdminPasses({ page: 1, page_size: 200 }),
          getAdminAccessLogs(200, 0),
        ]);

        setPasses(
          passData.items.map((item) => ({
            passId: item.pass_id,
            reservationId: item.reservation_id ?? "N/A",
            name: item.guest_name,
            type: toPassType(item.pass_type),
            status: toStatus(item.status),
            startAt: item.start_at,
            endAt: item.end_at,
            adults: item.adults,
            children: item.children,
            email: item.email,
            phone: item.phone ?? "",
            preferredContact: "Email",
            orderTotal: 0,
            tax: 0,
            paymentMethod: "N/A",
            last4: "----",
            squarePaymentId: "N/A",
          }))
        );

        setLogs(
          logData.items.map((item, index) => ({
            id: item.event_id ?? `${item.pass_id ?? "event"}-${index}`,
            passId: item.pass_id ?? "N/A",
            name: item.guest_name ?? "Unknown",
            at: item.timestamp ?? new Date().toISOString(),
            result: toScanResult(item.result),
            reason: item.reason ?? item.result ?? "N/A",
            location: item.location ?? "Unknown",
          }))
        );
      } catch (error) {
        if (error instanceof ApiError) {
          setLoadError(error.message);
        } else {
          setLoadError("Unable to load dashboard data.");
        }
      }
    }

    void loadDashboardData();
  }, [session]);

  useEffect(() => {
    if (!isAdminSessionValid(session)) {
      clearAdminSession();
      navigate("/admin/login", { replace: true });
    }
  }, [navigate, session]);

  useEffect(() => {
    function updateTime() {
      const now = new Date();
      const cstTime = now.toLocaleString("en-US", {
        timeZone: "America/Chicago",
        month: "numeric",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      setCurrentTime(cstTime);
    }
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  function handleLogout() {
    clearAdminSession();
    navigate("/admin/login");
  }

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <h1 className={styles.title}>Admin Dashboard</h1>
        <div className={styles.kpis}>
          <div className={styles.kpi}><span>Today Accepted</span><strong>{todayAccepted}</strong></div>
          <div className={styles.kpi}><span>Today Denied</span><strong>{todayDenied}</strong></div>
          <div className={styles.kpi}><span>Active Passes Now</span><strong>{activeNow}</strong></div>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent Denials</h2>
        {loadError ? <p className={styles.muted}>{loadError}</p> : null}
        {recentDenials.length === 0 ? (
          <p className={styles.muted}>No denials today.</p>
        ) : (
          <ul className={styles.denialList}>
            {recentDenials.map((d) => (
              <li key={d.id}>
                <strong>{d.passId}</strong> — {d.reason} ({d.location}) · {fmtDateTime(d.at)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.workspace}>
        <aside className={styles.leftSidebar}>
          <div className={styles.sidebarLogo}>
            <img src={hilineLogo} alt="Hi-Line Resort" className={styles.logoImage} />
          </div>

          <div className={styles.sidebarTime}>{currentTime}</div>

          <div className={styles.sidebarUser}>
            <img src={personIcon} alt="Employee" className={styles.userIcon} />
            <div className={styles.userInfo}>
              <div className={styles.userName}>{employeeName}</div>
              <div className={styles.userId}>Employee ID: {employeeId}</div>
            </div>
          </div>

          <nav className={styles.sidebarNav}>
            <button
              className={view === "passes" ? styles.sideBtnActive : styles.sideBtn}
              onClick={() => setView("passes")}
            >
              <img src={lookupGlassIcon} alt="Guest Directory" className={styles.navIcon} />
              Guest Directory
            </button>
            <button
              className={view === "logs" ? styles.sideBtnActive : styles.sideBtn}
              onClick={() => setView("logs")}
            >
              <img src={clipboardIcon} alt="Access Logs" className={styles.navIcon} />
              Access Logs
            </button>
          </nav>

          <button className={`${styles.logoutBtn} ${styles.sidebarLogoutBtn}`} onClick={handleLogout}>
            Logout
          </button>
        </aside>

        <section className={styles.contentPane}>
          {view === "passes" ? (
            <section className={styles.panel}>
              <div className={styles.filters}>
                <input
                  className={styles.input}
                  placeholder="Search name, pass ID, email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select className={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "All" | Status)}>
                  <option>All</option><option>Active</option><option>Expired</option><option>Upcoming</option><option>Revoked</option>
                </select>
                <select className={styles.select} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "All" | PassType)}>
                  <option>All</option><option>Visitor</option><option>Overnight Guest</option>
                </select>
                <label className={styles.check}><input type="checkbox" checked={deniedOnlyPasses} onChange={(e) => setDeniedOnlyPasses(e.target.checked)} /> Denied only</label>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Pass ID</th><th>Name</th><th>Status</th><th>Access period</th><th>Type</th><th>Party size</th><th>Last scan</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPasses.map((p) => (
                      <tr key={p.passId}>
                        <td>{p.passId}</td>
                        <td>{p.name}</td>
                        <td><span className={`${styles.pill} ${styles[`pill${p.status}`]}`}>{p.status}</span></td>
                        <td>{fmtDateTime(p.startAt)} - {fmtDateTime(p.endAt)}</td>
                        <td>{p.type}</td>
                        <td>{p.adults}/{p.children}</td>
                        <td>
                          {p.lastScan ? (
                            <span>
                              {fmtDateTime(p.lastScan.at)} .{" "}
                              <b className={p.lastScan.result === "allow" ? styles.allow : styles.deny}>
                                {p.lastScan.result.toUpperCase()}
                              </b>
                            </span>
                          ) : (
                            <span className={styles.muted}>No scans</span>
                          )}
                        </td>
                        <td><button className={styles.linkBtn} onClick={() => openDetails(p.passId)}>View / Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section className={styles.panel}>
              <div className={styles.filters}>
                <input
                  className={styles.input}
                  placeholder="Pass ID"
                  value={logPassId}
                  onChange={(e) => setLogPassId(e.target.value)}
                />
                <input className={styles.select} type="datetime-local" value={logFrom} onChange={(e) => setLogFrom(e.target.value)} />
                <input className={styles.select} type="datetime-local" value={logTo} onChange={(e) => setLogTo(e.target.value)} />
                <label className={styles.check}><input type="checkbox" checked={logDeniedOnly} onChange={(e) => setLogDeniedOnly(e.target.checked)} /> Denied only</label>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Time</th><th>Pass ID</th><th>Name</th><th>Result</th><th>Reason</th><th>Scanner/Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((l) => (
                      <tr key={l.id}>
                        <td>{fmtDateTime(l.at)}</td>
                        <td>{l.passId}</td>
                        <td>{l.name}</td>
                        <td><b className={l.result === "allow" ? styles.allow : styles.deny}>{l.result.toUpperCase()}</b></td>
                        <td>{l.reason}</td>
                        <td>{l.location}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>
      </div>

      {selectedPass && draft && (
        <aside className={styles.drawerBackdrop} onClick={() => setSelectedPassId(null)}>
          <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.drawerTitle}>Pass Details</h3>

            <div className={styles.group}>
              <div><strong>Pass ID:</strong> {selectedPass.passId}</div>
              <div><strong>Reservation ID:</strong> {selectedPass.reservationId}</div>
              <div><strong>Status:</strong> {selectedPass.status}</div>
              <div><strong>Access Window:</strong> {fmtDateTime(selectedPass.startAt)} - {fmtDateTime(selectedPass.endAt)}</div>
            </div>

            <h4 className={styles.subTitle}>Editable</h4>
            <div className={styles.formGrid}>
              <label>Email<input className={styles.input} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
              <label>Phone<input className={styles.input} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
              <label>Preferred Contact
                <select className={styles.select} value={draft.preferredContact} onChange={(e) => setDraft({ ...draft, preferredContact: e.target.value as ContactMethod })}>
                  <option>Email</option>
                  <option>SMS</option>
                </select>
              </label>
              <label>Start<input className={styles.select} type="datetime-local" value={draft.startAt} onChange={(e) => setDraft({ ...draft, startAt: e.target.value })} /></label>
              <label>End<input className={styles.select} type="datetime-local" value={draft.endAt} onChange={(e) => setDraft({ ...draft, endAt: e.target.value })} /></label>
              <label>Adults<input className={styles.input} type="number" min={0} value={draft.adults} onChange={(e) => setDraft({ ...draft, adults: Number(e.target.value) })} /></label>
              <label>Children<input className={styles.input} type="number" min={0} value={draft.children} onChange={(e) => setDraft({ ...draft, children: Number(e.target.value) })} /></label>
            </div>

            <h4 className={styles.subTitle}>Read-only Payment</h4>
            <div className={styles.group}>
              <div><strong>Order Total:</strong> ${(selectedPass.orderTotal + selectedPass.tax).toFixed(2)}</div>
              <div><strong>Tax:</strong> ${selectedPass.tax.toFixed(2)}</div>
              <div><strong>Payment:</strong> {selectedPass.paymentMethod} •••• {selectedPass.last4}</div>
              <div><strong>Square Payment ID:</strong> {selectedPass.squarePaymentId}</div>
            </div>

            <h4 className={styles.subTitle}>Recent Access Attempts</h4>
            <ul className={styles.logList}>
              {(logsByPass.get(selectedPass.passId) ?? []).slice(0, 10).map((l) => (
                <li key={l.id}>
                  {fmtDateTime(l.at)} —{" "}
                  <b className={l.result === "allow" ? styles.allow : styles.deny}>{l.result.toUpperCase()}</b>{" "}
                  ({l.reason})
                </li>
              ))}
            </ul>

            <h4 className={styles.subTitle}>Edit Audit</h4>
            <ul className={styles.logList}>
              {audit
                .filter((a) => a.passId === selectedPass.passId)
                .slice(0, 5)
                .map((a) => (
                  <li key={a.id}>
                    {fmtDateTime(a.changedAt)} — {a.changedBy} ({a.reason})
                  </li>
                ))}
              {!audit.some((a) => a.passId === selectedPass.passId) ? <li className={styles.muted}>No edits yet.</li> : null}
            </ul>

            <div className={styles.drawerActions}>
              <button className={styles.secondaryBtn} onClick={() => setSelectedPassId(null)}>Cancel</button>
              <button className={styles.primaryBtn} onClick={saveDetails} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </aside>
      )}
    </main>
  );
}