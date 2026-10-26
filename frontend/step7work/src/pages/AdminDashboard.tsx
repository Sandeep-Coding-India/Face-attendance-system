import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api";

type StaffRole = "hr" | "manager";

type StaffResult = {
  user_id?: string;
  login_id?: string;
  full_name?: string;
  email?: string;
  role?: string;
  company_id?: string;
  company_name?: string;
  message?: string;
};

type DashboardStats = {
  total_employees?: number;
  present_today?: number;
  absent_today?: number;
  attendance_percentage?: number;
};

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [showStaff, setShowStaff] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole>("hr");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<StaffResult | null>(null);
  const [stats, setStats] = useState<DashboardStats>({});

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("faceattend_user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const companyId =
    localStorage.getItem("faceattend_company_id") ||
    user.company_id ||
    "Company";

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      setStatsLoading(true);
      const data = await apiRequest("/attendance/dashboard");
      setStats(data || {});
    } catch {
      // Keep the dashboard usable if the stats endpoint is unavailable.
    } finally {
      setStatsLoading(false);
    }
  }

  function resetStaffForm() {
    setFullName("");
    setEmail("");
    setPassword("");
    setStaffRole("hr");
    setError("");
    setSuccess(null);
  }

  function closeStaff() {
    if (!loading) {
      setShowStaff(false);
      resetStaffForm();
    }
  }

  async function createStaff(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(null);
    setLoading(true);

    try {
      const data = await apiRequest("/users/staff", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          role: staffRole,
          password,
        }),
      });

      setSuccess(data);
    } catch (err: any) {
      setError(err?.message || "Unable to create the account.");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("faceattend_user");
    localStorage.removeItem("faceattend_company_id");
    navigate("/login", { replace: true });
  }

  return (
    <main className="dashboard-page">
      <aside className="sidebar">
        <button className="brand light" onClick={() => navigate("/")}>
          <span className="brand-mark">FA</span>
          <span>
            <strong>FaceAttend</strong>
            <small>ADMIN workspace</small>
          </span>
        </button>

        <div className="side-nav">
          <button className="active">⌂ Dashboard</button>
          <button>◉ Employees</button>
          <button>◷ Attendance</button>
          <button>▣ Reports</button>
          <button>⚙ Settings</button>
        </div>

        <button className="logout" onClick={logout}>
          ↪ Sign out
        </button>
      </aside>

      <section className="dash-main">
        <div className="dash-header">
          <div>
            <span className="eyebrow">
              <span /> COMPANY OVERVIEW
            </span>
            <h1>Admin Dashboard</h1>
            <p>
              Company ID: <strong>{companyId}</strong>
            </p>
          </div>
          <div className="avatar">AD</div>
        </div>

        <div className="stat-grid">
          <Stat
            label="Employees"
            value={
              statsLoading
                ? "..."
                : String(stats.total_employees ?? 0)
            }
            note="Company employees"
          />
          <Stat
            label="Present today"
            value={
              statsLoading
                ? "..."
                : String(stats.present_today ?? 0)
            }
            note={`${Number(stats.attendance_percentage ?? 0).toFixed(1)}% attendance`}
          />
          <Stat
            label="Absent today"
            value={
              statsLoading
                ? "..."
                : String(stats.absent_today ?? 0)
            }
            note="Needs attention"
          />
          <Stat
            label="Workspace"
            value="LIVE"
            note="Company scoped"
          />
        </div>

        <div className="dash-grid">
          <div className="panel large">
            <div className="panel-head">
              <div>
                <h3>Attendance workspace</h3>
                <p className="panel-subtitle">
                  Live company-level attendance overview
                </p>
              </div>
              <span className="live-tag">● LIVE</span>
            </div>

            <div className="admin-feature-grid">
              <Feature
                number="01"
                title="Company scoped"
                text="Admin, HR and Manager data stays inside this company."
              />
              <Feature
                number="02"
                title="Face attendance"
                text="Employees do not need an account to mark attendance."
              />
              <Feature
                number="03"
                title="Role based access"
                text="HR and Manager receive their own unique login ID."
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Quick actions</h3>
            </div>

            <button className="quick primary-quick" onClick={() => setShowStaff(true)}>
              ＋ Create HR / Manager
            </button>
            <button className="quick">＋ Add employee</button>
            <button className="quick">▣ View reports</button>
          </div>
        </div>

        <div className="panel table-panel">
          <div className="panel-head">
            <div>
              <h3>Staff access</h3>
              <p className="panel-subtitle">
                Create accounts for the people who manage this company.
              </p>
            </div>
            <button className="small-btn" onClick={() => setShowStaff(true)}>
              + New account
            </button>
          </div>

          <div className="staff-info-row">
            <div>
              <span className="row-avatar">HR</span>
              <strong>HR account</strong>
              <small>Can manage employees and attendance.</small>
            </div>
            <div>
              <span className="row-avatar">MG</span>
              <strong>Manager account</strong>
              <small>Can manage company operations within assigned access.</small>
            </div>
            <div className="staff-rule">
              <b>Admin creates the ID</b>
              <span>Generated by the backend after account creation.</span>
            </div>
          </div>
        </div>
      </section>

      {showStaff && (
        <div className="modal-backdrop" onMouseDown={closeStaff}>
          <section
            className="staff-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={closeStaff}>
              ×
            </button>

            {!success ? (
              <>
                <div className="modal-icon">FA</div>
                <span className="eyebrow">
                  <span /> ADMIN ONLY
                </span>
                <h2>Create staff account</h2>
                <p className="modal-copy">
                  Create an HR or Manager account. The backend will generate
                  the unique company-scoped login ID.
                </p>

                {error && <div className="form-error">{error}</div>}

                <form onSubmit={createStaff}>
                  <label>
                    Account type
                    <div className="role-switch">
                      <button
                        type="button"
                        className={staffRole === "hr" ? "selected" : ""}
                        onClick={() => setStaffRole("hr")}
                      >
                        HR
                      </button>
                      <button
                        type="button"
                        className={staffRole === "manager" ? "selected" : ""}
                        onClick={() => setStaffRole("manager")}
                      >
                        Manager
                      </button>
                    </div>
                  </label>

                  <label>
                    Full name
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      required
                    />
                  </label>

                  <label>
                    Email
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="hr@company.com"
                      required
                    />
                  </label>

                  <label>
                    Password
                    <div className="password-wrap">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create password"
                        minLength={6}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>

                  <button className="primary-btn full" type="submit" disabled={loading}>
                    {loading ? "Creating account..." : `Create ${staffRole === "hr" ? "HR" : "Manager"} account`}
                    <span>{loading ? "" : "→"}</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="staff-success">
                <div className="success-icon">✓</div>
                <span className="eyebrow centered">
                  <span /> ACCOUNT CREATED
                </span>
                <h2>{success.role === "manager" ? "Manager" : "HR"} account ready</h2>
                <p>
                  Give these credentials to the staff member. They can sign in
                  using the Company ID, Login ID and password.
                </p>

                <div className="credential-box">
                  <div>
                    <small>COMPANY ID</small>
                    <strong>{success.company_id || companyId}</strong>
                  </div>
                  <div>
                    <small>LOGIN ID</small>
                    <strong>{success.user_id || success.login_id || "Generated by backend"}</strong>
                  </div>
                  <div>
                    <small>NAME</small>
                    <strong>{success.full_name || fullName}</strong>
                  </div>
                  <div>
                    <small>EMAIL</small>
                    <strong>{success.email || email}</strong>
                  </div>
                </div>

                <div className="copy-note">
                  🔐 Save the Login ID. Employees do not use this login.
                </div>

                <button className="primary-btn full" onClick={closeStaff}>
                  Done
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="stat">
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{note}</span>
    </div>
  );
}

function Feature({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="admin-feature">
      <b>{number}</b>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
