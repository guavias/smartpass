import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Dashboard.module.css";
import hilineLogo from "../../../assets/hilineLogo.png";
import personIcon from "../../../assets/person.png";
import lookupGlassIcon from "../../../assets/lookupglass.png";
import clipboardIcon from "../../../assets/clipboard.png";
import {
  clearAdminSession,
  getAdminAccessLogs,
  getAdminPassQr,
  getAdminPasses,
  getAdminSession,
  isAdminSessionValid,
  patchAdminPass,
  regenerateAdminPassQr,
} from "../../../api/admin";
import { ApiError } from "../../../api/client";
import { createGuestPass, createVisitorPass } from "../../../api/reservations";

type PassType = "Visitor" | "Overnight Guest";
type Status = "Active" | "Expired" | "Upcoming" | "Revoked";
type ScanResult = "allow" | "deny";
type ContactMethod = "Email" | "SMS";
type ManualContactMethod = "Email" | "Phone";
type ManualPassType = "visitor" | "guest";

type PassRecord = {
  passId: string;
  reservationId: string;
  portalToken: string;
  name: string;
  type: PassType;
  status: Status;
  startAt: string;
  endAt: string;
  adults: number;
  children: number;
  numDays?: number;
  email: string;
  phone: string;
  preferredContact: ContactMethod;
  orderTotal: number | null;
  tax: number | null;
  paymentStatus: string;
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

type ManualCreateDraft = {
  passType: ManualPassType;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredContact: ManualContactMethod;
  adults: number;
  children: number;
  pets: number;
  startAt: string;
  endAt: string;
  reservationId: string;
};

const ADULT_PRICE_PER_DAY = 15;
const CHILD_PRICE_PER_DAY = 5;
const TX_TAX_RATE = 0.0825;

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
  const v = value?.toLowerCase();
  return v === "granted" || v === "approved" || v === "allow" ? "allow" : "deny";
}

function parseUTCDateTime(isoDateTime: string): Date {
  if (!isoDateTime) {
    return new Date();
  }

  let cleanDateTime = isoDateTime.trim();

  if (!cleanDateTime.includes("Z") && !cleanDateTime.includes("+") && !cleanDateTime.includes("-", 10)) {
    cleanDateTime += "Z";
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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function inputDateTimeToIso(value: string) {
  const d = new Date(value);
  return d.toISOString();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string) {
  return /^\d{3}-\d{3}-\d{4}$/.test(phone);
}

function formatPhoneInput(value: string, keepTrailingHyphen = true) {
  const digits = value.replace(/\D/g, "").slice(0, 10);

  if (digits.length < 3) return digits;
  if (digits.length === 3) return keepTrailingHyphen ? `${digits}-` : digits;
  if (digits.length < 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 6) {
    return keepTrailingHyphen ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-` : `${digits.slice(0, 3)}-${digits.slice(3, 6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function calculateDays(startIso: string, endIso: string) {
  const start = parseUTCDateTime(startIso);
  const end = parseUTCDateTime(endIso);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const ms = endDay.getTime() - startDay.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
}

function buildDefaultManualDraft(): ManualCreateDraft {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 1);

  const pad = (n: number) => String(n).padStart(2, "0");
  const toInput = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  return {
    passType: "visitor",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    preferredContact: "Email",
    adults: 1,
    children: 0,
    pets: 0,
    startAt: toInput(now),
    endAt: toInput(end),
    reservationId: "",
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [session, setSession] = useState(getAdminSession());

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
  const selectedPass = useMemo(() => passes.find((p) => p.passId === selectedPassId) ?? null, [passes, selectedPassId]);

  const [draft, setDraft] = useState<{
    status: Status;
    email: string;
    phone: string;
    preferredContact: ContactMethod;
    startAt: string;
    endAt: string;
    adults: number;
    children: number;
  } | null>(null);

  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrTargetPass, setQrTargetPass] = useState<PassRecord | null>(null);
  const [qrPayload, setQrPayload] = useState("");
  const [qrError, setQrError] = useState("");
  const [qrReloadConfirming, setQrReloadConfirming] = useState(false);
  const [isRegeneratingQr, setIsRegeneratingQr] = useState(false);

  const [isManualCreateOpen, setIsManualCreateOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualCreateDraft>(() => buildDefaultManualDraft());
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [isCreatingManual, setIsCreatingManual] = useState(false);

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
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.passId.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);

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

  const qrImageUrl = useMemo(() => {
    if (!qrTargetPass) return "";
    const cacheBust = `${Date.now()}`;
    return `/api/v1/admin/passes/${encodeURIComponent(qrTargetPass.passId)}/qr-image?payload=${encodeURIComponent(qrPayload)}&t=${cacheBust}`;
  }, [qrTargetPass, qrPayload]);

  const loadDashboardData = useCallback(async () => {
    if (!isAdminSessionValid(session)) return;
    try {
      setLoadError("");
      const [passData, logData] = await Promise.all([getAdminPasses({ page: 1, page_size: 100 }), getAdminAccessLogs(200, 0)]);

      setPasses(
        passData.items.map((item) => ({
          passId: item.pass_id,
          reservationId: item.reservation_id ?? "N/A",
          portalToken: item.portal_token ?? "",
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
          numDays: item.num_days ?? undefined,
          orderTotal: item.payment_amount ?? null,
          tax: item.payment_tax ?? null,
          paymentStatus: item.payment_status ?? "N/A",
          squarePaymentId: item.payment_reference ?? "N/A",
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
  }, [session]);

  function openDetails(passId: string) {
    const pass = passes.find((p) => p.passId === passId);
    if (!pass) return;
    setSelectedPassId(passId);
    setDraft({
      status: pass.status,
      email: pass.email,
      phone: pass.phone,
      preferredContact: pass.preferredContact,
      startAt: toInputDateTimeValue(pass.startAt),
      endAt: toInputDateTimeValue(pass.endAt),
      adults: pass.adults,
      children: pass.children,
    });
  }

  async function openQrModal(pass: PassRecord) {
    setQrError("");

    setQrTargetPass(pass);
    setIsQrModalOpen(true);
  }

  function closeQrModal() {
    setIsQrModalOpen(false);
    setQrTargetPass(null);
    setQrPayload("");
    setQrError("");
    setQrReloadConfirming(false);
    setIsRegeneratingQr(false);
  }

  async function confirmRegenerateQr() {
    if (!qrTargetPass?.passId) return;
    setIsRegeneratingQr(true);
    setQrReloadConfirming(false);
    try {
      const qr = await regenerateAdminPassQr(qrTargetPass.passId);
      setQrPayload(qr.qr_payload);
      setQrError("");
    } catch (error) {
      if (error instanceof ApiError) {
        setQrError(error.message);
      } else {
        setQrError("Unable to regenerate QR code.");
      }
    } finally {
      setIsRegeneratingQr(false);
    }
  }

  function saveDetails() {
    if (!selectedPass || !draft) return;

    const changes: string[] = [];
    if (selectedPass.status !== draft.status) changes.push(`Status: ${selectedPass.status} -> ${draft.status}`);
    if (selectedPass.email !== draft.email) changes.push(`Email: ${selectedPass.email} -> ${draft.email}`);
    if (selectedPass.phone !== draft.phone) changes.push(`Phone: ${selectedPass.phone} -> ${draft.phone}`);
    if (selectedPass.preferredContact !== draft.preferredContact)
      changes.push(`Preferred contact: ${selectedPass.preferredContact} -> ${draft.preferredContact}`);
    if (toInputDateTimeValue(selectedPass.startAt) !== draft.startAt)
      changes.push(`Start: ${fmtDateTime(selectedPass.startAt)} -> ${fmtDateTime(new Date(draft.startAt).toISOString())}`);
    if (toInputDateTimeValue(selectedPass.endAt) !== draft.endAt)
      changes.push(`End: ${fmtDateTime(selectedPass.endAt)} -> ${fmtDateTime(new Date(draft.endAt).toISOString())}`);
    if (selectedPass.adults !== draft.adults || selectedPass.children !== draft.children)
      changes.push(`Party size: ${selectedPass.adults}/${selectedPass.children} -> ${draft.adults}/${draft.children}`);

    const nextStartAt = new Date(draft.startAt).toISOString();
    const nextEndAt = new Date(draft.endAt).toISOString();

    // Recalculate status from dates unless admin explicitly set Revoked
    const derivedStatus: Status = (() => {
      if (draft.status === "Revoked") return "Revoked";
      const now = Date.now();
      const start = new Date(nextStartAt).getTime();
      const end = new Date(nextEndAt).getTime();
      if (now < start) return "Upcoming";
      if (now > end) return "Expired";
      return "Active";
    })();

    setIsSaving(true);
    patchAdminPass(selectedPass.passId, {
      status: derivedStatus.toLowerCase(),
      email: draft.email,
      phone: draft.phone,
      access_start: nextStartAt,
      access_end: nextEndAt,
      num_adults: draft.adults,
      num_children: draft.children,
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
              status: derivedStatus,
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

  function openManualCreateModal() {
    setManualDraft(buildDefaultManualDraft());
    setManualErrors({});
    setIsManualCreateOpen(true);
  }

  async function submitManualCreate() {
    const nextErrors: Record<string, string> = {};
    const fullName = `${manualDraft.firstName.trim()} ${manualDraft.lastName.trim()}`.trim();

    if (!manualDraft.firstName.trim()) nextErrors.firstName = "First name is required.";
    if (!manualDraft.lastName.trim()) nextErrors.lastName = "Last name is required.";

    if (!manualDraft.email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!isValidEmail(manualDraft.email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!manualDraft.phone.trim()) {
      nextErrors.phone = "Phone is required.";
    } else if (!isValidPhone(manualDraft.phone.trim())) {
      nextErrors.phone = "Phone must be in xxx-xxx-xxxx format.";
    }

    if (!manualDraft.startAt) nextErrors.startAt = "Start date/time is required.";
    if (!manualDraft.endAt) nextErrors.endAt = "End date/time is required.";

    if (manualDraft.startAt && manualDraft.endAt && new Date(manualDraft.endAt) <= new Date(manualDraft.startAt)) {
      nextErrors.endAt = "End must be after start.";
    }

    if (manualDraft.passType === "guest" && !manualDraft.reservationId.trim()) {
      nextErrors.reservationId = "Reservation ID is required for overnight guest passes.";
    }

    if (manualDraft.passType === "visitor" && manualDraft.adults + manualDraft.children < 1) {
      nextErrors.partySize = "At least one guest is required.";
    }

    setManualErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsCreatingManual(true);
    try {
      if (manualDraft.passType === "guest") {
        await createGuestPass({
          name: fullName,
          email: manualDraft.email.trim(),
          phone: manualDraft.phone.trim(),
          reservation_id: manualDraft.reservationId.trim(),
          check_in: inputDateTimeToIso(manualDraft.startAt),
          check_out: inputDateTimeToIso(manualDraft.endAt),
          num_adults: manualDraft.adults,
          num_children: manualDraft.children,
        });
      } else {
        const startIso = inputDateTimeToIso(manualDraft.startAt);
        const endIso = inputDateTimeToIso(manualDraft.endAt);
        const days = calculateDays(startIso, endIso);
        const subtotal = manualDraft.adults * days * ADULT_PRICE_PER_DAY + manualDraft.children * days * CHILD_PRICE_PER_DAY;
        const total = +(subtotal + subtotal * TX_TAX_RATE).toFixed(2);

        await createVisitorPass({
          name: fullName,
          email: manualDraft.email.trim(),
          phone: manualDraft.phone.trim(),
          vehicle_info: "N/A",
          access_start: startIso,
          num_days: days,
          num_adults: manualDraft.adults,
          num_children: manualDraft.children,
          payment_amount: total,
          payment_method: "cash",
          payment_source_id: "",
          idempotency_key: `admin-manual-${Date.now()}`,
        });
      }

      setIsManualCreateOpen(false);
      setManualErrors({});
      await loadDashboardData();
    } catch (error) {
      if (error instanceof ApiError) {
        setManualErrors({ submit: error.message });
      } else {
        setManualErrors({ submit: "Unable to create pass right now." });
      }
    } finally {
      setIsCreatingManual(false);
    }
  }

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    if (isAdminSessionValid(session)) return;

    clearAdminSession();
    navigate("/admin/login", { replace: true });
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

  useEffect(() => {
    if (!isQrModalOpen || !qrTargetPass?.passId) return;
    getAdminPassQr(qrTargetPass.passId)
      .then((qr) => { setQrPayload(qr.qr_payload); setQrError(""); })
      .catch(() => { setQrError("Unable to load QR code."); });
  }, [isQrModalOpen, qrTargetPass]);

  function handleLogout() {
    clearAdminSession();
    setSession(null);
    navigate("/admin/login");
  }

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <h1 className={styles.title}>Admin Dashboard</h1>
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <span>Today Accepted</span>
            <strong>{todayAccepted}</strong>
          </div>
          <div className={styles.kpi}>
            <span>Today Denied</span>
            <strong>{todayDenied}</strong>
          </div>
          <div className={styles.kpi}>
            <span>Active Passes Now</span>
            <strong>{activeNow}</strong>
          </div>
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
                <strong>{d.passId}</strong> - {d.reason} ({d.location}) . {fmtDateTime(d.at)}
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
            <button className={view === "passes" ? styles.sideBtnActive : styles.sideBtn} onClick={() => setView("passes")}>
              <img src={lookupGlassIcon} alt="Guest Directory" className={styles.navIcon} />
              Guest Directory
            </button>
            <button className={view === "logs" ? styles.sideBtnActive : styles.sideBtn} onClick={() => setView("logs")}>
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
              <div className={styles.filtersHeader}>
                <h3 className={styles.filtersTitle}>Guest Directory</h3>
                <button className={styles.primaryBtn} onClick={openManualCreateModal}>Create Pass +</button>
              </div>

              <div className={styles.filters}>
                <input className={styles.input} placeholder="Search name, pass ID, email" value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "All" | Status)}>
                  <option>All</option>
                  <option>Active</option>
                  <option>Expired</option>
                  <option>Upcoming</option>
                  <option>Revoked</option>
                </select>
                <select className={styles.select} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "All" | PassType)}>
                  <option>All</option>
                  <option>Visitor</option>
                  <option>Overnight Guest</option>
                </select>
                <label className={styles.check}>
                  <input type="checkbox" checked={deniedOnlyPasses} onChange={(e) => setDeniedOnlyPasses(e.target.checked)} /> Denied only
                </label>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Pass ID</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Access period</th>
                      <th>Type</th>
                      <th>Party size</th>
                      <th>Last scan</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPasses.map((p) => (
                      <tr key={p.passId}>
                        <td>{p.passId}</td>
                        <td>{p.name}</td>
                        <td>
                          <span className={`${styles.pill} ${styles[`pill${p.status}`]}`}>{p.status}</span>
                        </td>
                        <td>
                          {fmtDateTime(p.startAt)} - {fmtDateTime(p.endAt)}
                        </td>
                        <td>{p.type}</td>
                        <td>
                          {p.adults}/{p.children}
                        </td>
                        <td>
                          {p.lastScan ? (
                            <span>
                              {fmtDateTime(p.lastScan.at)} .{" "}
                              <b className={p.lastScan.result === "allow" ? styles.allow : styles.deny}>{p.lastScan.result.toUpperCase()}</b>
                            </span>
                          ) : (
                            <span className={styles.muted}>No scans</span>
                          )}
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            <button className={styles.linkBtn} onClick={() => openDetails(p.passId)}>
                              View / Edit
                            </button>
                            <button className={styles.linkBtn} onClick={() => void openQrModal(p)}>
                              View QR
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section className={styles.panel}>
              <div className={styles.filters}>
                <input className={styles.input} placeholder="Pass ID" value={logPassId} onChange={(e) => setLogPassId(e.target.value)} />
                <input className={styles.select} type="datetime-local" value={logFrom} onChange={(e) => setLogFrom(e.target.value)} />
                <input className={styles.select} type="datetime-local" value={logTo} onChange={(e) => setLogTo(e.target.value)} />
                <label className={styles.check}>
                  <input type="checkbox" checked={logDeniedOnly} onChange={(e) => setLogDeniedOnly(e.target.checked)} /> Denied only
                </label>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Pass ID</th>
                      <th>Name</th>
                      <th>Result</th>
                      <th>Reason</th>
                      <th>Scanner/Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((l) => (
                      <tr key={l.id}>
                        <td>{fmtDateTime(l.at)}</td>
                        <td>{l.passId}</td>
                        <td>{l.name}</td>
                        <td>
                          <b className={l.result === "allow" ? styles.allow : styles.deny}>{l.result.toUpperCase()}</b>
                        </td>
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
              <div>
                <strong>Pass ID:</strong> {selectedPass.passId}
              </div>
              <div>
                <strong>Reservation ID:</strong> {selectedPass.reservationId}
              </div>
              <div>
                <strong>Status:</strong> {selectedPass.status}
              </div>
              <div>
                <strong>Access Window:</strong> {fmtDateTime(selectedPass.startAt)} - {fmtDateTime(selectedPass.endAt)}
              </div>
            </div>

            <h4 className={styles.subTitle}>Editable</h4>
            <div className={styles.formGrid}>
              <label>
                Status
                <select className={styles.select} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>
                  <option>Active</option>
                  <option>Upcoming</option>
                  <option>Expired</option>
                  <option>Revoked</option>
                </select>
              </label>
              <label>
                Email
                <input className={styles.input} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </label>
              <label>
                Phone
                <input
                  className={styles.input}
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: formatPhoneInput(e.target.value) })}
                  placeholder="xxx-xxx-xxxx"
                  inputMode="tel"
                  maxLength={12}
                />
              </label>
              <label>
                Preferred Contact
                <select className={styles.select} value={draft.preferredContact} onChange={(e) => setDraft({ ...draft, preferredContact: e.target.value as ContactMethod })}>
                  <option>Email</option>
                  <option>SMS</option>
                </select>
              </label>
              <label>
                Start
                <input className={styles.select} type="datetime-local" value={draft.startAt} onChange={(e) => setDraft({ ...draft, startAt: e.target.value })} />
              </label>
              <label>
                End
                <input className={styles.select} type="datetime-local" value={draft.endAt} onChange={(e) => setDraft({ ...draft, endAt: e.target.value })} />
              </label>
              <label>
                Adults
                <input className={styles.input} type="number" min={1} value={draft.adults} onChange={(e) => setDraft({ ...draft, adults: Number(e.target.value) })} />
              </label>
              <label>
                Children
                <input className={styles.input} type="number" min={0} value={draft.children} onChange={(e) => setDraft({ ...draft, children: Number(e.target.value) })} />
              </label>
            </div>

            {draft.adults < 1 && (
              <p className={styles.errorText} style={{ marginBottom: 8 }}>A pass must have at least 1 adult.</p>
            )}
            {draft.adults < 1 && draft.children > 0 && (
              <p className={styles.errorText} style={{ marginBottom: 8 }}>Children cannot be on a pass without at least 1 adult.</p>
            )}
            {(draft.adults !== selectedPass.adults || draft.children !== selectedPass.children) && draft.adults >= 1 && (
              <div className={styles.confirmBox} style={{ marginBottom: 12 }}>
                <p className={styles.confirmText} style={{ margin: 0 }}>
                  Party size changed from {selectedPass.adults} adult{selectedPass.adults !== 1 ? "s" : ""} / {selectedPass.children} child{selectedPass.children !== 1 ? "ren" : ""} to {draft.adults} adult{draft.adults !== 1 ? "s" : ""} / {draft.children} child{draft.children !== 1 ? "ren" : ""}.
                  {" "}Any payment adjustment (refund or additional charge) must be processed separately.
                </p>
              </div>
            )}

            <h4 className={styles.subTitle}>Read-only Payment</h4>
            <div className={styles.group}>
              <div>
                <strong>Total Paid:</strong> {selectedPass.orderTotal != null ? `$${selectedPass.orderTotal.toFixed(2)}` : "N/A"}
              </div>
              <div>
                <strong>Tax:</strong> {selectedPass.tax != null ? `$${selectedPass.tax.toFixed(2)}` : "N/A"}
              </div>
              <div>
                <strong>Payment Status:</strong> {selectedPass.paymentStatus}
              </div>
              <div>
                <strong>Square Payment ID:</strong> {selectedPass.squarePaymentId}
              </div>
            </div>

            <h4 className={styles.subTitle}>Recent Access Attempts</h4>
            <ul className={styles.logList}>
              {(logsByPass.get(selectedPass.passId) ?? []).slice(0, 10).map((l) => (
                <li key={l.id}>
                  {fmtDateTime(l.at)} - <b className={l.result === "allow" ? styles.allow : styles.deny}>{l.result.toUpperCase()}</b> ({l.reason})
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
                    {fmtDateTime(a.changedAt)} - {a.changedBy} ({a.reason})
                  </li>
                ))}
              {!audit.some((a) => a.passId === selectedPass.passId) ? <li className={styles.muted}>No edits yet.</li> : null}
            </ul>

            <div className={styles.drawerActions}>
              <button className={styles.secondaryBtn} onClick={() => setSelectedPassId(null)}>
                Cancel
              </button>
              <button className={styles.primaryBtn} onClick={saveDetails} disabled={isSaving || draft.adults < 1}>
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </aside>
      )}

      {isQrModalOpen && qrTargetPass ? (
        <div className={styles.modalBackdrop} onClick={closeQrModal} role="dialog" aria-modal="true" aria-label="Current pass QR">
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.drawerTitle}>Current QR: {qrTargetPass.name}</h3>
            <p className={styles.muted}>Pass ID: {qrTargetPass.passId}</p>

            <div className={styles.qrFrame}>
              {qrPayload ? <img src={qrImageUrl} alt="Current pass QR" className={styles.qrImage} /> : <p className={styles.muted}>Loading QR...</p>}
            </div>

            <p className={styles.qrTimer}>
              QR Code active from {fmtDateTime(qrTargetPass.startAt)} to {fmtDateTime(qrTargetPass.endAt)}
            </p>
            {qrError ? <p className={styles.errorText}>{qrError}</p> : null}

            {qrReloadConfirming ? (
              <div className={styles.confirmBox}>
                <p className={styles.confirmText}>Reloading this QR code will invalidate the previous QR code. Proceed?</p>
                <div className={styles.drawerActions}>
                  <button className={styles.secondaryBtn} onClick={() => setQrReloadConfirming(false)}>
                    No
                  </button>
                  <button className={styles.primaryBtn} onClick={() => void confirmRegenerateQr()} disabled={isRegeneratingQr}>
                    {isRegeneratingQr ? "Regenerating..." : "Yes, Reload"}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.drawerActions}>
                <button className={styles.secondaryBtn} onClick={closeQrModal}>
                  Close
                </button>
                <button className={styles.primaryBtn} onClick={() => setQrReloadConfirming(true)}>
                  Reload QR
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {isManualCreateOpen ? (
        <div className={styles.modalBackdrop} onClick={() => setIsManualCreateOpen(false)} role="dialog" aria-modal="true" aria-label="Manual pass creation">
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.drawerTitle}>Manual Pass Creation</h3>
            <p className={styles.muted}>Create a pass from the admin guest directory without entering payment card details.</p>

            <div className={styles.formGrid}>
              <label>
                Pass Type
                <select
                  className={styles.select}
                  value={manualDraft.passType}
                  onChange={(e) => setManualDraft({ ...manualDraft, passType: e.target.value as ManualPassType })}
                >
                  <option value="visitor">Visitor Day Pass</option>
                  <option value="guest">Overnight Guest Pass</option>
                </select>
              </label>

              <label>
                First Name
                <input
                  className={styles.input}
                  value={manualDraft.firstName}
                  onChange={(e) => setManualDraft({ ...manualDraft, firstName: e.target.value })}
                />
                {manualErrors.firstName ? <span className={styles.errorText}>{manualErrors.firstName}</span> : null}
              </label>

              <label>
                Last Name
                <input className={styles.input} value={manualDraft.lastName} onChange={(e) => setManualDraft({ ...manualDraft, lastName: e.target.value })} />
                {manualErrors.lastName ? <span className={styles.errorText}>{manualErrors.lastName}</span> : null}
              </label>

              <label>
                Email
                <input className={styles.input} value={manualDraft.email} onChange={(e) => setManualDraft({ ...manualDraft, email: e.target.value })} />
                {manualErrors.email ? <span className={styles.errorText}>{manualErrors.email}</span> : null}
              </label>

              <label>
                Phone (xxx-xxx-xxxx)
                <input
                  className={styles.input}
                  value={manualDraft.phone}
                  onChange={(e) => setManualDraft({ ...manualDraft, phone: formatPhoneInput(e.target.value) })}
                  placeholder="xxx-xxx-xxxx"
                  inputMode="tel"
                  maxLength={12}
                />
                {manualErrors.phone ? <span className={styles.errorText}>{manualErrors.phone}</span> : null}
              </label>

              <label>
                Preferred Contact
                <select
                  className={styles.select}
                  value={manualDraft.preferredContact}
                  onChange={(e) => setManualDraft({ ...manualDraft, preferredContact: e.target.value as ManualContactMethod })}
                >
                  <option value="Email">Email</option>
                  <option value="Phone">Phone</option>
                </select>
              </label>

              <label>
                Access Start
                <input
                  className={styles.select}
                  type="datetime-local"
                  value={manualDraft.startAt}
                  onChange={(e) => setManualDraft({ ...manualDraft, startAt: e.target.value })}
                />
                {manualErrors.startAt ? <span className={styles.errorText}>{manualErrors.startAt}</span> : null}
              </label>

              <label>
                Access End
                <input
                  className={styles.select}
                  type="datetime-local"
                  value={manualDraft.endAt}
                  onChange={(e) => setManualDraft({ ...manualDraft, endAt: e.target.value })}
                />
                {manualErrors.endAt ? <span className={styles.errorText}>{manualErrors.endAt}</span> : null}
              </label>

              {manualDraft.passType === "guest" ? (
                <>
                  <label>
                    Reservation ID
                    <input
                      className={styles.input}
                      value={manualDraft.reservationId}
                      onChange={(e) => setManualDraft({ ...manualDraft, reservationId: e.target.value })}
                    />
                    {manualErrors.reservationId ? <span className={styles.errorText}>{manualErrors.reservationId}</span> : null}
                  </label>
                  <label>
                    Adults
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      value={manualDraft.adults}
                      onChange={(e) => setManualDraft({ ...manualDraft, adults: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Children
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={manualDraft.children}
                      onChange={(e) => setManualDraft({ ...manualDraft, children: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Pets
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={manualDraft.pets}
                      onChange={(e) => setManualDraft({ ...manualDraft, pets: Number(e.target.value) })}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Adults
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={manualDraft.adults}
                      onChange={(e) => setManualDraft({ ...manualDraft, adults: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Children
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={manualDraft.children}
                      onChange={(e) => setManualDraft({ ...manualDraft, children: Number(e.target.value) })}
                    />
                  </label>
                  {manualErrors.partySize ? <span className={styles.errorText}>{manualErrors.partySize}</span> : null}
                </>
              )}
            </div>

            {manualErrors.submit ? <p className={styles.errorText}>{manualErrors.submit}</p> : null}

            <div className={styles.drawerActions}>
              <button className={styles.secondaryBtn} onClick={() => setIsManualCreateOpen(false)}>
                Cancel
              </button>
              <button className={styles.primaryBtn} onClick={() => void submitManualCreate()} disabled={isCreatingManual}>
                {isCreatingManual ? "Creating..." : "Create Pass"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
