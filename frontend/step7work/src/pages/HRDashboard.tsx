import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDelete, apiRequest, apiUpload } from "../api";

type Employee = {
  id: number;
  company_id?: number;
  employee_code?: string;
  name?: string;
  email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  face_registered?: boolean;
  face_enrolled?: boolean;
  embedding_count?: number;
};

type FaceState = {
  employee: Employee | null;
  sampleCount: number;
  requiredSamples: number;
  started: boolean;
  cameraOn: boolean;
  capturing: boolean;
  message: string;
  error: string;
  completed: boolean;
};

const emptyFace: FaceState = {
  employee: null,
  sampleCount: 0,
  requiredSamples: 10,
  started: false,
  cameraOn: false,
  capturing: false,
  message: "Select an employee to begin face registration.",
  error: "",
  completed: false,
};

export default function HRDashboard() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [activeView, setActiveView] = useState<"overview" | "employees" | "faces">("overview");
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    employee_code: "",
    name: "",
    email: "",
    phone: "",
    department: "",
    designation: "",
  });
  const [face, setFace] = useState<FaceState>(emptyFace);

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("faceattend_user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const companyId =
    localStorage.getItem("faceattend_company_id") || user.company_id || "";

  useEffect(() => {
    loadEmployees();
    return () => stopCamera();
  }, []);

  async function loadEmployees() {
    setLoading(true);
    setPageError("");
    try {
      const data = await apiRequest("/employees/");
      const list = Array.isArray(data) ? data : data?.employees || [];
      setEmployees(list);
    } catch (err: any) {
      setPageError(err?.message || "Unable to load employees.");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm({
      employee_code: "",
      name: "",
      email: "",
      phone: "",
      department: "",
      designation: "",
    });
    setShowEmployeeModal(true);
  }

  function openEdit(employee: Employee) {
    setEditingId(employee.id);
    setForm({
      employee_code: employee.employee_code || "",
      name: employee.name || "",
      email: employee.email || "",
      phone: employee.phone || "",
      department: employee.department || "",
      designation: employee.designation || "",
    });
    setShowEmployeeModal(true);
  }

  async function saveEmployee(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setToast("");
    try {
      const payload = {
        company_id: Number(companyId),
        employee_code: form.employee_code.trim(),
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        department: form.department.trim() || null,
        designation: form.designation.trim() || null,
      };

      if (!Number.isFinite(payload.company_id)) {
        throw new Error("The logged-in company ID is not a valid numeric ID.");
      }

      if (editingId) {
        const params = new URLSearchParams();
        Object.entries(payload).forEach(([key, value]) => {
          if (value !== null && value !== undefined) params.set(key, String(value));
        });
        await apiRequest(`/employees/${editingId}?${params.toString()}`, { method: "PUT" });
        showToast("Employee updated successfully.");
      } else {
        await apiRequest("/employees/", { method: "POST", body: JSON.stringify(payload) });
        showToast("Employee created successfully.");
      }
      setShowEmployeeModal(false);
      await loadEmployees();
    } catch (err: any) {
      setToast(err?.message || "Unable to save employee.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEmployee(employee: Employee) {
    if (!window.confirm(`Delete ${employee.name || "this employee"}?`)) return;
    try {
      await apiDelete(`/employees/${employee.id}`);
      showToast("Employee deleted successfully.");
      await loadEmployees();
    } catch (err: any) {
      showToast(err?.message || "Unable to delete employee.");
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  async function openFaceRegistration(employee: Employee) {
    stopCamera();
    setFace({ ...emptyFace, employee, message: "Starting secure face registration..." });
    setActiveView("faces");

    try {
      let data: any;
      try {
        data = await apiRequest(`/faces/start/${employee.id}`, { method: "POST" });
      } catch {
        data = await apiRequest(`/face/start/${employee.id}`, { method: "POST" });
      }
      setFace((current) => ({
        ...current,
        started: true,
        requiredSamples: Number(data?.required_samples || 10),
        message: "Registration started. Start the camera and capture samples.",
      }));
    } catch (err: any) {
      setFace((current) => ({ ...current, error: err?.message || "Unable to start registration." }));
    }
  }

  async function startCamera() {
    setFace((current) => ({ ...current, error: "", message: "Requesting camera access..." }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setFace((current) => ({ ...current, cameraOn: true, message: "Camera is ready. Keep one face inside the frame." }));
    } catch (err: any) {
      setFace((current) => ({ ...current, error: err?.message || "Camera permission was denied." }));
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setFace((current) => ({ ...current, cameraOn: false }));
  }

  async function captureSample() {
    if (!face.employee || !videoRef.current || !face.cameraOn || face.capturing) return;
    if (face.sampleCount >= face.requiredSamples) return;

    setFace((current) => ({ ...current, capturing: true, error: "", message: "Analyzing face..." }));

    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Unable to access camera frame.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Could not capture image."))), "image/jpeg", 0.9);
      });

      const formData = new FormData();
      formData.append("file", blob, `employee-${face.employee?.id}-sample.jpg`);

      let data: any;
      try {
        data = await apiUpload(`/faces/sample/${face.employee.id}`, formData);
      } catch {
        data = await apiUpload(`/face/sample/${face.employee.id}`, formData);
      }

      const count = Number(data?.sample_count ?? face.sampleCount + 1);
      const required = Number(data?.required_samples ?? face.requiredSamples);
      setFace((current) => ({
        ...current,
        sampleCount: count,
        requiredSamples: required,
        message: count >= 5
          ? `Sample ${count} saved. You can complete registration now.`
          : `Sample ${count} saved. Capture ${Math.max(5 - count, 0)} more minimum sample${Math.max(5 - count, 0) === 1 ? "" : "s"}.`,
      }));
    } catch (err: any) {
      setFace((current) => ({ ...current, error: err?.message || "Face sample failed.", message: "Try again with your face clearly visible." }));
    } finally {
      setFace((current) => ({ ...current, capturing: false }));
    }
  }

  async function finalizeFace() {
    if (!face.employee || face.sampleCount < 5) return;
    setFace((current) => ({ ...current, capturing: true, error: "", message: "Creating the final face embedding..." }));
    try {
      let data: any;
      try {
        data = await apiRequest(`/faces/finalize/${face.employee.id}`, { method: "POST" });
      } catch {
        data = await apiRequest(`/face/finalize/${face.employee.id}`, { method: "POST" });
      }
      stopCamera();
      setFace((current) => ({ ...current, completed: true, capturing: false, message: data?.message || "Face registration completed successfully." }));
      await loadEmployees();
    } catch (err: any) {
      setFace((current) => ({ ...current, capturing: false, error: err?.message || "Unable to complete registration." }));
    }
  }

  function resetFace() {
    stopCamera();
    setFace(emptyFace);
  }

  function logout() {
    stopCamera();
    localStorage.removeItem("access_token");
    localStorage.removeItem("faceattend_user");
    localStorage.removeItem("faceattend_company_id");
    navigate("/login", { replace: true });
  }

  const filteredEmployees = employees.filter((employee) => {
    const q = search.toLowerCase();
    return [employee.name, employee.employee_code, employee.department, employee.designation]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });

  const faceRegisteredCount = employees.filter((e) => e.face_registered || e.face_enrolled || Number(e.embedding_count) > 0).length;

  return (
    <main className="dashboard-page">
      <aside className="sidebar">
        <button className="brand light" onClick={() => navigate("/")}>
          <span className="brand-mark">FA</span>
          <span><strong>FaceAttend</strong><small>HR workspace</small></span>
        </button>
        <div className="side-nav">
          <button className={activeView === "overview" ? "active" : ""} onClick={() => setActiveView("overview")}>⌂ Dashboard</button>
          <button className={activeView === "employees" ? "active" : ""} onClick={() => setActiveView("employees")}>◉ Employees</button>
          <button className={activeView === "faces" ? "active" : ""} onClick={() => setActiveView("faces")}>◎ Face Registration</button>
          <button onClick={() => navigate("/hr/dashboard")}>◷ Attendance</button>
          <button onClick={() => navigate("/hr/dashboard")}>▣ Reports</button>
        </div>
        <button className="logout" onClick={logout}>↪ Sign out</button>
      </aside>

      <section className="dash-main">
        <div className="dash-header">
          <div>
            <span className="eyebrow"><span /> HR WORKSPACE</span>
            <h1>{activeView === "faces" ? "Face Registration" : activeView === "employees" ? "Employee Management" : "HR Dashboard"}</h1>
            <p>Company ID: <strong>{companyId || "Not available"}</strong></p>
          </div>
          <div className="avatar">HR</div>
        </div>

        {toast && <div className="dashboard-toast">✓ {toast}</div>}
        {pageError && <div className="form-error">{pageError}</div>}

        {activeView === "overview" && (
          <>
            <div className="stat-grid">
              <Stat label="Employees" value={loading ? "..." : String(employees.length)} note="Company total" />
              <Stat label="Face registered" value={loading ? "..." : String(faceRegisteredCount)} note={`${employees.length ? Math.round((faceRegisteredCount / employees.length) * 100) : 0}% complete`} />
              <Stat label="Face pending" value={loading ? "..." : String(Math.max(employees.length - faceRegisteredCount, 0))} note="Ready for registration" />
              <Stat label="Workspace" value="LIVE" note="HR company scoped" />
            </div>

            <div className="dash-grid">
              <div className="panel large">
                <div className="panel-head"><div><h3>HR operations</h3><p className="panel-subtitle">Manage employees and prepare face recognition.</p></div><span className="live-tag">● LIVE</span></div>
                <div className="admin-feature-grid">
                  <Feature number="01" title="Add employees" text="Create employee records with code, department and designation." onClick={openCreate} />
                  <Feature number="02" title="Register faces" text="Use the live camera to capture multiple samples and create an embedding." onClick={() => setActiveView("faces")} />
                  <Feature number="03" title="Attendance ready" text="Once a face is registered, the recognition system can identify the employee." onClick={() => navigate("/hr/dashboard")} />
                </div>
              </div>
              <div className="panel">
                <div className="panel-head"><h3>Quick actions</h3></div>
                <button className="quick primary-quick" onClick={openCreate}>＋ Add employee</button>
                <button className="quick" onClick={() => setActiveView("employees")}>◉ Manage employees</button>
                <button className="quick" onClick={() => setActiveView("faces")}>◎ Register face</button>
              </div>
            </div>
          </>
        )}

        {activeView === "employees" && (
          <EmployeeView
            employees={filteredEmployees}
            loading={loading}
            search={search}
            setSearch={setSearch}
            onAdd={openCreate}
            onEdit={openEdit}
            onDelete={removeEmployee}
            onFace={openFaceRegistration}
          />
        )}

        {activeView === "faces" && (
          <FaceView
            employees={employees}
            face={face}
            onSelect={openFaceRegistration}
            onStartCamera={startCamera}
            onStopCamera={stopCamera}
            onCapture={captureSample}
            onFinalize={finalizeFace}
            onReset={resetFace}
            videoRef={videoRef}
          />
        )}
      </section>

      {showEmployeeModal && (
        <div className="modal-backdrop" onMouseDown={() => !saving && setShowEmployeeModal(false)}>
          <section className="staff-modal employee-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowEmployeeModal(false)}>×</button>
            <div className="modal-icon">{editingId ? "✎" : "+"}</div>
            <span className="eyebrow"><span /> HR ONLY</span>
            <h2>{editingId ? "Edit employee" : "Add employee"}</h2>
            <p className="modal-copy">Employee records are scoped to Company ID <strong>{companyId}</strong>.</p>
            <form onSubmit={saveEmployee} className="employee-form-grid">
              <label>Employee Code<input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} placeholder="EMP-001" required /></label>
              <label>Full Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rahul Sharma" required /></label>
              <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="rahul@company.com" /></label>
              <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="9876543210" /></label>
              <label>Department<input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Engineering" /></label>
              <label>Designation<input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Software Engineer" /></label>
              <button className="primary-btn full employee-submit" type="submit" disabled={saving}>{saving ? "Saving..." : editingId ? "Update employee" : "Create employee"}<span>→</span></button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="stat"><small>{label}</small><strong>{value}</strong><span>{note}</span></div>;
}

function Feature({ number, title, text, onClick }: { number: string; title: string; text: string; onClick: () => void }) {
  return <button className="admin-feature" onClick={onClick}><b>{number}</b><div><strong>{title}</strong><p>{text}</p></div></button>;
}

function EmployeeView({ employees, loading, search, setSearch, onAdd, onEdit, onDelete, onFace }: { employees: Employee[]; loading: boolean; search: string; setSearch: (v: string) => void; onAdd: () => void; onEdit: (e: Employee) => void; onDelete: (e: Employee) => void; onFace: (e: Employee) => void }) {
  return <div className="panel table-panel employee-manager-panel">
    <div className="panel-head"><div><h3>Employees</h3><p className="panel-subtitle">Create, edit, delete and register employee faces.</p></div><button className="small-btn" onClick={onAdd}>＋ Add employee</button></div>
    <div className="employee-toolbar"><div className="search-box">⌕<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code or department..." /></div><span>{employees.length} records</span></div>
    <div className="employee-table">
      <div className="employee-table-row employee-table-head"><span>Employee</span><span>Department</span><span>Contact</span><span>Face</span><span>Actions</span></div>
      {loading ? <div className="empty-state">Loading employees...</div> : employees.length === 0 ? <div className="empty-state">No employees found. Create the first employee.</div> : employees.map((employee) => {
        const registered = employee.face_registered || employee.face_enrolled || Number(employee.embedding_count) > 0;
        return <div className="employee-table-row" key={employee.id}>
          <span><b className="row-avatar">{(employee.name || "E").slice(0, 1).toUpperCase()}</b><span><strong>{employee.name || "Unnamed"}</strong><small>{employee.employee_code || "No code"}</small></span></span>
          <span>{employee.department || "—"}<small>{employee.designation || ""}</small></span>
          <span>{employee.email || "—"}<small>{employee.phone || ""}</small></span>
          <span><i className={registered ? "face-dot ready" : "face-dot pending"}></i>{registered ? "Registered" : "Pending"}</span>
          <span className="row-actions"><button onClick={() => onFace(employee)}>Face</button><button onClick={() => onEdit(employee)}>Edit</button><button className="danger" onClick={() => onDelete(employee)}>Delete</button></span>
        </div>;
      })}
    </div>
  </div>;
}

function FaceView({ employees, face, onSelect, onStartCamera, onStopCamera, onCapture, onFinalize, onReset, videoRef }: { employees: Employee[]; face: FaceState; onSelect: (e: Employee) => void; onStartCamera: () => void; onStopCamera: () => void; onCapture: () => void; onFinalize: () => void; onReset: () => void; videoRef: React.RefObject<HTMLVideoElement | null> }) {
  const progress = face.requiredSamples ? Math.min(100, Math.round((face.sampleCount / face.requiredSamples) * 100)) : 0;
  return <div className="face-registration-grid">
    <div className="panel face-panel">
      <div className="panel-head"><div><h3>Employee face enrollment</h3><p className="panel-subtitle">Capture a minimum of 5 samples. 10 samples are recommended.</p></div><span className="live-tag">AI READY</span></div>
      <label className="face-select-label">Select employee<select value={face.employee?.id || ""} onChange={(e) => { const found = employees.find((item) => item.id === Number(e.target.value)); if (found) onSelect(found); }}><option value="">Choose employee...</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_code || `EMP-${employee.id}`} · {employee.name}</option>)}</select></label>

      <div className="camera-stage">
        {!face.cameraOn && <div className="camera-placeholder"><div className="camera-orb">◎</div><strong>{face.completed ? "Registration complete" : "Camera is off"}</strong><span>{face.completed ? face.message : "Start the camera when you are ready."}</span></div>}
        <video ref={videoRef} className={face.cameraOn ? "camera-video" : "camera-video hidden-video"} muted playsInline />
        {face.cameraOn && <><div className="face-frame"></div><div className="camera-status"><span></span> LIVE CAMERA</div></>}
      </div>

      {face.error && <div className="form-error">{face.error}</div>}
      <div className="face-message">{face.message}</div>

      <div className="face-progress"><div><span>Samples captured</span><b>{face.sampleCount} / {face.requiredSamples}</b></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div>

      <div className="camera-actions">
        {!face.cameraOn ? <button className="primary-btn" disabled={!face.employee || !face.started || face.completed} onClick={onStartCamera}>Start camera <span>→</span></button> : <button className="secondary-btn" onClick={onStopCamera}>Stop camera</button>}
        <button className="capture-btn" disabled={!face.cameraOn || face.capturing || face.sampleCount >= face.requiredSamples} onClick={onCapture}>{face.capturing ? "Processing..." : "● Capture sample"}</button>
        <button className="primary-btn" disabled={!face.employee || face.sampleCount < 5 || face.capturing || face.completed} onClick={onFinalize}>Complete registration <span>✓</span></button>
      </div>
      <button className="reset-link" onClick={onReset}>Reset registration</button>
    </div>

    <div className="panel face-guide">
      <span className="eyebrow"><span /> REGISTRATION GUIDE</span>
      <h3>{face.employee ? face.employee.name : "Face registration"}</h3>
      <p>{face.employee ? `${face.employee.employee_code || "Employee"} · ${face.employee.department || "Company employee"}` : "Select an employee from the list to begin."}</p>
      <div className="guide-list"><Guide n="01" text="Face the camera directly with good lighting."/><Guide n="02" text="Keep only one face visible in the frame."/><Guide n="03" text="Capture different natural angles for stronger recognition."/><Guide n="04" text="Complete registration after at least 5 successful samples."/></div>
      <div className="security-card"><span>🔐</span><div><b>Company scoped</b><small>Face data is registered against the selected employee record.</small></div></div>
    </div>
  </div>;
}

function Guide({ n, text }: { n: string; text: string }) {
  return <div className="guide-item"><b>{n}</b><span>{text}</span></div>;
}
