import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api";
import "./ManagerDashboard.css";

type Employee = {
  id?: number;
  employee_id?: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  designation?: string | null;
  department_id?: number | null;
  department_name?: string | null;
  is_active?: boolean;
  face_registered?: boolean;
};

type Attendance = {
  id?: number;
  employee_id?: string;
  employee_name?: string;
  company_id?: string;
  attendance_date?: string;
  check_in?: string | null;
  check_out?: string | null;
  status?: string;
  check_in_confidence?: number | null;
  check_out_confidence?: number | null;
  total_seconds?: number | null;
  total_hours?: number | null;
};

type User = {
  id?: number;
  user_id?: string;
  login_id?: string;
  full_name?: string;
  email?: string;
  role?: string;
};

type Tab =
  | "overview"
  | "live"
  | "attendance"
  | "employees"
  | "reports";

export default function ManagerDashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User>({});
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [activeTab, setActiveTab] =
    useState<Tab>("overview");

  const [search, setSearch] = useState("");
  const [attendanceSearch, setAttendanceSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [departmentFilter, setDepartmentFilter] =
    useState("all");

  const [dateFilter, setDateFilter] =
    useState("");

  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null);

  const [employeeHistory, setEmployeeHistory] =
    useState<Attendance[]>([]);

  const [historyLoading, setHistoryLoading] =
    useState(false);

  const [showHistory, setShowHistory] =
    useState(false);

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  // ============================================================
  // LIVE FACE RECOGNITION
  // ============================================================

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const recognitionTimerRef = useRef<number | null>(null);
  const recognizingRef = useRef(false);
  const lastSessionEmployeeRef = useRef<string | null>(null);
  const missedFaceCountRef = useRef(0);

  const [cameraActive, setCameraActive] = useState(false);
  const [recognitionRunning, setRecognitionRunning] = useState(false);
  const [recognitionStatus, setRecognitionStatus] = useState(
    "Camera is ready to start."
  );
  const [recognitionTone, setRecognitionTone] = useState<
    "idle" | "success" | "warning" | "error" | "processing"
  >("idle");
  const [recognizedEmployee, setRecognizedEmployee] =
    useState<{
      employee_id: string;
      name: string;
      confidence: number;
      attendanceMessage?: string;
      attendanceStatus?: string;
      check_in?: string | null;
      check_out?: string | null;
      total_hours?: number | null;
    } | null>(null);

  const API_BASE_URL =
    (import.meta as any).env?.VITE_API_BASE_URL ||
    "http://127.0.0.1:8000";


  // ============================================================
  // AUTH + INITIAL LOAD
  // ============================================================

  useEffect(() => {
    const token =
      localStorage.getItem("access_token");

    const storedUser =
      localStorage.getItem("faceattend_user");

    if (!token || !storedUser) {
      navigate("/login");
      return;
    }

    try {
      const parsedUser: User =
        JSON.parse(storedUser);

      const role = String(
        parsedUser?.role || ""
      ).toLowerCase();

      if (role !== "manager") {
        if (role === "admin") {
          navigate("/admin/dashboard");
        } else if (role === "hr") {
          navigate("/hr/dashboard");
        } else {
          navigate("/login");
        }

        return;
      }

      setUser(parsedUser);

      loadDashboard();
    } catch {
      localStorage.removeItem(
        "access_token"
      );

      localStorage.removeItem(
        "faceattend_user"
      );

      navigate("/login");
    }
  }, [navigate]);

  // ============================================================
  // LOAD DATA
  // ============================================================

  async function loadDashboard(
    silent = false
  ) {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const employeeResponse =
        await apiRequest("/employees/");

      const employeeData =
        Array.isArray(employeeResponse)
          ? employeeResponse
          : employeeResponse?.items ||
            employeeResponse?.employees ||
            employeeResponse?.data ||
            [];

      setEmployees(employeeData);

      const attendanceResponse =
        await apiRequest(
          "/attendance/today"
        );

      const attendanceData =
        Array.isArray(attendanceResponse)
          ? attendanceResponse
          : attendanceResponse?.items ||
            attendanceResponse?.attendance ||
            attendanceResponse?.data ||
            [];

      setAttendance(attendanceData);
    } catch (err: any) {
      console.error(
        "MANAGER DASHBOARD ERROR:",
        err
      );

      setError(
        err?.message ||
          "Unable to load Manager Dashboard."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // ============================================================
  // ACTIVATE / DEACTIVATE EMPLOYEE
  // ============================================================

  async function toggleEmployeeStatus(
    employee: Employee
  ) {
    const isActive = employee.is_active !== false;

    const confirmed = window.confirm(
      isActive
        ? `Put ${employee.full_name} on leave and deactivate them?\n\nTheir face will no longer be allowed to mark attendance while inactive.`
        : `Activate ${employee.full_name} again?\n\nTheir registered face can be used for attendance again.`
    );

    if (!confirmed) return;

    try {
      await apiRequest(
        `/employees/${encodeURIComponent(
          String(employee.employee_id || "")
        )}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            is_active: !isActive,
          }),
        }
      );

      setSelectedEmployee(null);

      await loadDashboard(true);
    } catch (err: any) {
      setError(
        err?.message ||
          "Unable to update employee status."
      );
    }
  }

  // ============================================================
  // LOGOUT
  // ============================================================

  function logout() {
    localStorage.removeItem(
      "access_token"
    );

    localStorage.removeItem(
      "faceattend_user"
    );

    localStorage.removeItem(
      "faceattend_company_id"
    );

    navigate("/login");
  }

  // ============================================================
  // LIVE CAMERA HELPERS
  // ============================================================

  function stopRecognitionTimer() {
    if (recognitionTimerRef.current !== null) {
      window.clearInterval(recognitionTimerRef.current);
      recognitionTimerRef.current = null;
    }
  }

  function stopCamera() {
    stopRecognitionTimer();
    setRecognitionRunning(false);

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    recognizingRef.current = false;
    lastSessionEmployeeRef.current = null;
    missedFaceCountRef.current = 0;
  }

  async function startCamera() {
    if (cameraStreamRef.current) {
      return;
    }

    setRecognitionStatus("Requesting camera permission...");
    setRecognitionTone("processing");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      cameraStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);
      setRecognitionStatus("Camera active. Position one face inside the frame.");
      setRecognitionTone("idle");
    } catch (error) {
      console.error("CAMERA ERROR:", error);
      setRecognitionStatus(
        "Camera access was blocked. Allow camera permission and try again."
      );
      setRecognitionTone("error");
    }
  }

  function captureCameraFrame(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const video = videoRef.current;

      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        reject(new Error("Camera is not ready yet."));
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Unable to capture camera frame."));
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Unable to create camera image."));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        0.85
      );
    });
  }

  function getRecognitionEmployee(data: any) {
    const employee = data?.employee || {};
    const employeeId =
      data?.employee_id ||
      data?.employee_code ||
      employee?.employee_id ||
      employee?.employee_code ||
      data?.employee?.id;

    const name =
      data?.name ||
      data?.employee_name ||
      employee?.name ||
      employee?.full_name;

    const rawConfidence =
      data?.confidence ??
      data?.attendance?.confidence ??
      0;

    const numericConfidence = Number(rawConfidence) || 0;
    const confidencePercent =
      numericConfidence <= 1
        ? numericConfidence * 100
        : numericConfidence;

    return {
      employeeId: employeeId ? String(employeeId) : "",
      name: name ? String(name) : "Employee",
      confidence: Math.max(0, Math.min(100, confidencePercent)),
    };
  }

  async function recognizeCurrentFrame() {
    if (recognizingRef.current || !cameraStreamRef.current) {
      return;
    }

    recognizingRef.current = true;

    try {
      const blob = await captureCameraFrame();
      const formData = new FormData();
      formData.append("file", blob, "camera.jpg");

      const token = localStorage.getItem("access_token");
      if (!token) {
        throw new Error("Login session expired. Please login again.");
      }

      const response = await fetch(
        `${API_BASE_URL}/faces/recognize`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        stopCamera();
        navigate("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(data?.detail || "Face recognition request failed.");
      }

      if (data?.recognized !== true) {
        missedFaceCountRef.current += 1;

        if (missedFaceCountRef.current >= 3) {
          lastSessionEmployeeRef.current = null;
          setRecognizedEmployee(null);
        }

        setRecognitionTone("warning");
        setRecognitionStatus(
          data?.message ||
            "No recognized employee. Keep one registered face in the frame."
        );
        return;
      }

      const result = getRecognitionEmployee(data);

      if (!result.employeeId) {
        throw new Error("Recognition succeeded but employee ID was not returned.");
      }

      missedFaceCountRef.current = 0;

      // Anti-duplicate: do not send the same continuous camera presence
      // to attendance repeatedly. The session resets after the face leaves.
      if (lastSessionEmployeeRef.current === result.employeeId) {
        setRecognizedEmployee((previous) =>
          previous
            ? { ...previous, confidence: result.confidence }
            : previous
        );
        setRecognitionTone("success");
        setRecognitionStatus(`${result.name} is already being tracked.`);
        return;
      }

      lastSessionEmployeeRef.current = result.employeeId;
      setRecognitionTone("processing");
      setRecognitionStatus(`Recognized ${result.name}. Marking attendance...`);

      const attendanceResponse = await fetch(
        `${API_BASE_URL}/attendance/mark/${encodeURIComponent(
          result.employeeId
        )}?confidence=${encodeURIComponent(result.confidence.toFixed(2))}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const attendanceData = await attendanceResponse
        .json()
        .catch(() => ({}));

      if (attendanceResponse.status === 401) {
        stopCamera();
        navigate("/login");
        return;
      }

      if (!attendanceResponse.ok) {
        lastSessionEmployeeRef.current = null;
        throw new Error(
          attendanceData?.detail ||
            "Attendance could not be marked."
        );
      }

      const attendanceMessage =
        attendanceData?.message ||
        "Attendance marked successfully.";

      setRecognizedEmployee({
        employee_id: result.employeeId,
        name: result.name,
        confidence: result.confidence,
        attendanceMessage,
        attendanceStatus: attendanceData?.status,
        check_in: attendanceData?.check_in || null,
        check_out: attendanceData?.check_out || null,
        total_hours: attendanceData?.total_hours ?? null,
      });

      setRecognitionTone("success");
      setRecognitionStatus(attendanceMessage);

      await loadDashboard(true);
    } catch (error: any) {
      console.error("FACE RECOGNITION ERROR:", error);
      setRecognitionTone("error");
      setRecognitionStatus(
        error?.message || "Face recognition failed. Please try again."
      );
    } finally {
      recognizingRef.current = false;
    }
  }

  function startRecognition() {
    if (!cameraStreamRef.current) {
      setRecognitionStatus("Start the camera first.");
      setRecognitionTone("warning");
      return;
    }

    if (recognitionTimerRef.current !== null) {
      return;
    }

    setRecognitionRunning(true);
    setRecognitionStatus("Face recognition is running...");
    setRecognitionTone("processing");

    void recognizeCurrentFrame();
    recognitionTimerRef.current = window.setInterval(() => {
      void recognizeCurrentFrame();
    }, 2500);
  }

  function stopRecognition() {
    stopRecognitionTimer();
    setRecognitionRunning(false);
    recognizingRef.current = false;
    setRecognitionTone("idle");
    setRecognitionStatus(
      cameraStreamRef.current
        ? "Camera active. Recognition is paused."
        : "Camera is ready to start."
    );
  }

  useEffect(() => {
    if (activeTab !== "live") {
      stopCamera();
    }
  }, [activeTab]);

  useEffect(() => {
    return () => {
      stopRecognitionTimer();
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // ============================================================
  // TODAY
  // ============================================================

  const today =
    new Date()
      .toISOString()
      .split("T")[0];

  const todayAttendance =
    attendance.filter(
      (record) =>
        !record.attendance_date ||
        record.attendance_date === today
    );

  const activeEmployees =
    employees.filter(
      (employee) =>
        employee.is_active !== false
    );

  const presentToday =
    todayAttendance.filter(
      (record) => {
        const status =
          String(
            record.status || ""
          ).toLowerCase();

        return (
          status === "present" ||
          status === "completed"
        );
      }
    ).length;

  const completedToday =
    todayAttendance.filter(
      (record) =>
        String(
          record.status || ""
        ).toLowerCase() ===
        "completed"
    ).length;

  const LATE_AFTER_HOUR = 10;

  const isLateRecord = (record: Attendance) => {
    const status = String(record.status || "").toLowerCase();
    if (status === "late") return true;
    if (!record.check_in) return false;
    const checkIn = new Date(record.check_in);
    return !Number.isNaN(checkIn.getTime()) && checkIn.getHours() >= LATE_AFTER_HOUR;
  };

  const lateToday = todayAttendance.filter(isLateRecord).length;

  const attendanceEmployeeIds = new Set(
    todayAttendance.map((record) => String(record.employee_id || "").toUpperCase())
  );

  const absentEmployees = activeEmployees.filter((employee) =>
    !attendanceEmployeeIds.has(String(employee.employee_id || "").toUpperCase())
  );

  const absentToday = absentEmployees.length;

  const attendancePercentage =
    activeEmployees.length > 0
      ? Math.round(
          (todayAttendance.length /
            activeEmployees.length) *
            100
        )
      : 0;

  const totalHoursToday =
    todayAttendance.reduce(
      (sum, record) =>
        sum +
        Number(
          record.total_hours || 0
        ),
      0
    );

  const averageHoursToday =
    todayAttendance.length > 0
      ? (
          totalHoursToday /
          todayAttendance.length
        ).toFixed(2)
      : "0.00";

  // ============================================================
  // DEPARTMENTS
  // ============================================================

  const departments = useMemo(() => {
    const values =
      employees
        .map(
          (employee) =>
            employee.department_name
        )
        .filter(Boolean) as string[];

    return Array.from(
      new Set(values)
    ).sort();
  }, [employees]);

  // ============================================================
  // EMPLOYEE SEARCH
  // ============================================================

  const filteredEmployees =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      return employees.filter(
        (employee) => {
          const matchesSearch =
            !query ||
            employee.full_name
              ?.toLowerCase()
              .includes(query) ||
            employee.employee_id
              ?.toLowerCase()
              .includes(query) ||
            employee.email
              ?.toLowerCase()
              .includes(query) ||
            employee.phone
              ?.toLowerCase()
              .includes(query) ||
            employee.designation
              ?.toLowerCase()
              .includes(query);

          const matchesDepartment =
            departmentFilter === "all" ||
            employee.department_name ===
              departmentFilter;

          return (
            matchesSearch &&
            matchesDepartment
          );
        }
      );
    }, [
      employees,
      search,
      departmentFilter,
    ]);

  // ============================================================
  // ATTENDANCE FILTER
  // ============================================================

  const filteredAttendance =
    useMemo(() => {
      const query =
        attendanceSearch
          .trim()
          .toLowerCase();

      return todayAttendance.filter(
        (record) => {
          const matchesSearch =
            !query ||
            record.employee_name
              ?.toLowerCase()
              .includes(query) ||
            record.employee_id
              ?.toLowerCase()
              .includes(query);

          const matchesStatus =
            statusFilter === "all" ||
            String(
              record.status || ""
            ).toLowerCase() ===
              statusFilter;

          return (
            matchesSearch &&
            matchesStatus
          );
        }
      );
    }, [
      todayAttendance,
      attendanceSearch,
      statusFilter,
    ]);

  // ============================================================
  // REPORT DATA
  // ============================================================

  const reportRows = useMemo(() => {
    return activeEmployees.map((employee) => {
      const record = todayAttendance.find(
        (item) => String(item.employee_id || "").toUpperCase() === String(employee.employee_id || "").toUpperCase()
      );
      const late = record ? isLateRecord(record) : false;
      return { employee, record, late, present: Boolean(record), absent: !record };
    });
  }, [activeEmployees, todayAttendance]);

  // ============================================================
  // EMPLOYEE HISTORY
  // ============================================================

  async function openHistory(
    employee: Employee
  ) {
    if (!employee.employee_id) {
      return;
    }

    setSelectedEmployee(employee);
    setShowHistory(true);
    setHistoryLoading(true);
    setEmployeeHistory([]);

    try {
      const response =
        await apiRequest(
          `/attendance/employee/${encodeURIComponent(
            employee.employee_id
          )}`
        );

      const data =
        Array.isArray(response)
          ? response
          : response?.items ||
            response?.attendance ||
            response?.data ||
            [];

      setEmployeeHistory(data);
    } catch (err: any) {
      console.error(
        "HISTORY ERROR:",
        err
      );

      setEmployeeHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  // ============================================================
  // HISTORY FILTER
  // ============================================================

  const filteredHistory =
    useMemo(() => {
      if (!dateFilter) {
        return employeeHistory;
      }

      return employeeHistory.filter(
        (record) =>
          record.attendance_date ===
          dateFilter
      );
    }, [
      employeeHistory,
      dateFilter,
    ]);

  // ============================================================
  // FORMAT TIME
  // ============================================================

  function formatTime(
    value?: string | null
  ) {
    if (!value) {
      return "--";
    }

    try {
      return new Date(
        value
      ).toLocaleTimeString(
        "en-IN",
        {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }
      );
    } catch {
      return "--";
    }
  }

  // ============================================================
  // FORMAT DATE
  // ============================================================

  function formatDate(
    value?: string
  ) {
    if (!value) {
      return "--";
    }

    try {
      return new Date(
        `${value}T00:00:00`
      ).toLocaleDateString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }
      );
    } catch {
      return value;
    }
  }

  // ============================================================
  // STATUS
  // ============================================================

  function statusClass(
    status?: string
  ) {
    const value =
      String(
        status || ""
      ).toLowerCase();

    if (value === "completed") {
      return "manager-status completed";
    }

    if (value === "present") {
      return "manager-status present";
    }

    if (value === "late") {
      return "manager-status late";
    }

    if (value === "absent") {
      return "manager-status absent";
    }

    return "manager-status";
  }

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <main className="manager-page">
        <div className="manager-loading">

          <div className="manager-loading-logo">
            FA
          </div>

          <div className="manager-spinner" />

          <h2>
            Loading Manager Workspace
          </h2>

          <p>
            Preparing your team and
            attendance data...
          </p>

        </div>
      </main>
    );
  }

  // ============================================================
  // UI
  // ============================================================

  return (
    <main className="manager-page">

      {/* BACKGROUND */}

      <div className="manager-orb orb-one" />
      <div className="manager-orb orb-two" />

      {/* SIDEBAR OVERLAY */}

      {sidebarOpen && (
        <div
          className="manager-sidebar-overlay"
          onClick={() =>
            setSidebarOpen(false)
          }
        />
      )}

      {/* ======================================================
          SIDEBAR
          ====================================================== */}

      <aside
        className={`manager-sidebar ${
          sidebarOpen
            ? "sidebar-open"
            : ""
        }`}
      >

        <div className="manager-logo">

          <div className="manager-logo-icon">
            FA
          </div>

          <div>
            <strong>
              FaceAttend
            </strong>

            <span>
              Manager Console
            </span>
          </div>

        </div>

        <div className="manager-company-card">

          <div className="company-mini-icon">
            ◉
          </div>

          <div>

            <span>
              WORKSPACE
            </span>

            <strong>
              Company Workspace
            </strong>

          </div>

        </div>

        <nav className="manager-nav">

          <span className="manager-nav-title">
            MAIN MENU
          </span>

          <button
            className={
              activeTab === "overview"
                ? "manager-nav-item active"
                : "manager-nav-item"
            }
            onClick={() => {
              setActiveTab("overview");
              setSidebarOpen(false);
            }}
          >
            <span>⌂</span>
            <span>Overview</span>
          </button>

          <button
            className={
              activeTab === "live"
                ? "manager-nav-item active"
                : "manager-nav-item"
            }
            onClick={() => {
              setActiveTab("live");
              setSidebarOpen(false);
            }}
          >
            <span>◉</span>
            <span>Live Attendance</span>
          </button>

          <button
            className={
              activeTab === "attendance"
                ? "manager-nav-item active"
                : "manager-nav-item"
            }
            onClick={() => {
              setActiveTab("attendance");
              setSidebarOpen(false);
            }}
          >
            <span>◷</span>
            <span>Attendance</span>
            <b>
              {todayAttendance.length}
            </b>
          </button>

          <button
            className={
              activeTab === "employees"
                ? "manager-nav-item active"
                : "manager-nav-item"
            }
            onClick={() => {
              setActiveTab("employees");
              setSidebarOpen(false);
            }}
          >
            <span>♙</span>
            <span>Employees</span>
            <b>
              {activeEmployees.length}
            </b>
          </button>

          <button
            className={
              activeTab === "reports"
                ? "manager-nav-item active"
                : "manager-nav-item"
            }
            onClick={() => {
              setActiveTab("reports");
              setSidebarOpen(false);
            }}
          >
            <span>▥</span>
            <span>Reports</span>
          </button>

        </nav>

        <div className="manager-sidebar-bottom">

          <div className="manager-security-card">

            <span>
              ●
            </span>

            <div>
              <strong>
                Secure workspace
              </strong>

              <small>
                Company data protected
              </small>
            </div>

          </div>

          <button
            className="manager-logout"
            onClick={logout}
          >
            <span>↪</span>
            Logout
          </button>

        </div>

      </aside>

      {/* ======================================================
          MAIN AREA
          ====================================================== */}

      <section className="manager-main">

        {/* TOPBAR */}

        <header className="manager-topbar">

          <button
            className="manager-menu-button"
            onClick={() =>
              setSidebarOpen(true)
            }
          >
            ☰
          </button>

          <div className="manager-breadcrumb">

            <span>
              FaceAttend
            </span>

            <b>
              /
            </b>

            <strong>
              Manager
            </strong>

          </div>

          <div className="manager-top-actions">

            <button
              className="manager-refresh"
              onClick={() =>
                loadDashboard(true)
              }
              disabled={refreshing}
            >
              <span
                className={
                  refreshing
                    ? "refresh-spin"
                    : ""
                }
              >
                ↻
              </span>

              {refreshing
                ? "Refreshing"
                : "Refresh"}
            </button>

            <div className="manager-profile">

              <div className="manager-avatar">
                {(user.full_name ||
                  "M")
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div>

                <strong>
                  {user.full_name ||
                    "Manager"}
                </strong>

                <span>
                  Manager
                </span>

              </div>

            </div>

          </div>

        </header>

        {/* CONTENT */}

        <div className="manager-content">

          {/* HERO */}

          <section className="manager-hero">

            <div>

              <span className="manager-eyebrow">
                MANAGER CONTROL CENTER
              </span>

              <h1>
                Good to see you,
                <br />
                <span>
                  {user.full_name ||
                    "Manager"}
                </span>
              </h1>

              <p>
                Monitor your team,
                attendance and workforce
                performance from one
                secure workspace.
              </p>

            </div>

            <div className="manager-date-card">

              <div className="manager-date-icon">
                ◷
              </div>

              <div>

                <span>
                  TODAY
                </span>

                <strong>
                  {new Date().toLocaleDateString(
                    "en-IN",
                    {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    }
                  )}
                </strong>

              </div>

            </div>

          </section>

          {/* ERROR */}

          {error && (
            <div className="manager-error">

              <span>!</span>

              <div>

                <strong>
                  Something needs attention
                </strong>

                <p>
                  {error}
                </p>

              </div>

            </div>
          )}

          {/* ==================================================
              STAT CARDS
              ================================================== */}

          <section className="manager-stats">

            <div className="manager-stat-card">

              <div className="manager-stat-top">
                <span>
                  TOTAL EMPLOYEES
                </span>

                <div className="manager-stat-icon blue">
                  ♙
                </div>
              </div>

              <strong>
                {activeEmployees.length}
              </strong>

              <small>
                Active team members
              </small>

              <div className="stat-line">
                <span
                  style={{
                    width: "100%",
                  }}
                />
              </div>

            </div>

            <div className="manager-stat-card">

              <div className="manager-stat-top">
                <span>
                  PRESENT TODAY
                </span>

                <div className="manager-stat-icon green">
                  ✓
                </div>
              </div>

              <strong>
                {presentToday}
              </strong>

              <small>
                Employees marked present
              </small>

              <div className="stat-line green">
                <span
                  style={{
                    width: `${Math.min(
                      attendancePercentage,
                      100
                    )}%`,
                  }}
                />
              </div>

            </div>

            <div className="manager-stat-card">

              <div className="manager-stat-top">
                <span>
                  ABSENT TODAY
                </span>

                <div className="manager-stat-icon red">
                  !
                </div>
              </div>

              <strong>
                {absentToday}
              </strong>

              <small>
                Employees not marked
              </small>

              <div className="stat-line red">
                <span
                  style={{
                    width: `${Math.min(
                      absentToday *
                        10,
                      100
                    )}%`,
                  }}
                />
              </div>

            </div>

            <div className="manager-stat-card">

              <div className="manager-stat-top">
                <span>
                  ATTENDANCE RATE
                </span>

                <div className="manager-stat-icon cyan">
                  %
                </div>
              </div>

              <strong>
                {attendancePercentage}%
              </strong>

              <small>
                Today's workforce coverage
              </small>

              <div className="stat-line cyan">
                <span
                  style={{
                    width: `${Math.min(
                      attendancePercentage,
                      100
                    )}%`,
                  }}
                />
              </div>

            </div>

          </section>

          {/* ==================================================
              OVERVIEW
              ================================================== */}

          {activeTab === "overview" && (
            <>

              <section className="manager-grid-two">

                {/* ATTENDANCE SUMMARY */}

                <div className="manager-panel">

                  <div className="manager-panel-header">

                    <div>

                      <span>
                        TODAY'S PERFORMANCE
                      </span>

                      <h2>
                        Attendance overview
                      </h2>

                    </div>

                    <button
                      onClick={() =>
                        setActiveTab(
                          "attendance"
                        )
                      }
                    >
                      View details →
                    </button>

                  </div>

                  <div className="attendance-summary">

                    <div className="summary-circle">

                      <div>
                        <strong>
                          {attendancePercentage}%
                        </strong>

                        <span>
                          Attendance
                        </span>
                      </div>

                    </div>

                    <div className="summary-details">

                      <div>
                        <span>
                          <i className="dot green-dot" />
                          Present
                        </span>

                        <strong>
                          {presentToday}
                        </strong>
                      </div>

                      <div>
                        <span>
                          <i className="dot red-dot" />
                          Absent
                        </span>

                        <strong>
                          {absentToday}
                        </strong>
                      </div>

                      <div>
                        <span>
                          <i className="dot yellow-dot" />
                          Late
                        </span>

                        <strong>
                          {lateToday}
                        </strong>
                      </div>

                      <div>
                        <span>
                          <i className="dot blue-dot" />
                          Completed
                        </span>

                        <strong>
                          {completedToday}
                        </strong>
                      </div>

                    </div>

                  </div>

                </div>

                {/* WORKING HOURS */}

                <div className="manager-panel">

                  <div className="manager-panel-header">

                    <div>

                      <span>
                        WORKFORCE HOURS
                      </span>

                      <h2>
                        Productivity snapshot
                      </h2>

                    </div>

                    <div className="hours-icon">
                      ◷
                    </div>

                  </div>

                  <div className="hours-big">
                    <strong>
                      {totalHoursToday.toFixed(
                        2
                      )}
                    </strong>

                    <span>
                      total hours
                    </span>
                  </div>

                  <div className="hours-divider" />

                  <div className="hours-stats">

                    <div>
                      <span>
                        Average / employee
                      </span>

                      <strong>
                        {averageHoursToday}
                        {" "}
                        hrs
                      </strong>
                    </div>

                    <div>
                      <span>
                        Completed shifts
                      </span>

                      <strong>
                        {completedToday}
                      </strong>
                    </div>

                  </div>

                </div>

              </section>

              {/* RECENT ATTENDANCE */}

              <section className="manager-panel">

                <div className="manager-panel-header">

                  <div>

                    <span>
                      LIVE ATTENDANCE
                    </span>

                    <h2>
                      Today's activity
                    </h2>

                  </div>

                  <button
                    onClick={() =>
                      setActiveTab(
                        "attendance"
                      )
                    }
                  >
                    Open attendance →
                  </button>

                </div>

                {todayAttendance.length ===
                0 ? (

                  <div className="manager-empty">

                    <div>
                      ◷
                    </div>

                    <h3>
                      No attendance yet
                    </h3>

                    <p>
                      Attendance records will
                      appear here when employees
                      check in.
                    </p>

                  </div>

                ) : (

                  <div className="activity-list">

                    {todayAttendance
                      .slice(0, 6)
                      .map(
                        (
                          record,
                          index
                        ) => (

                          <div
                            className="activity-row"
                            key={
                              record.id ||
                              index
                            }
                          >

                            <div className="activity-avatar">
                              {(
                                record.employee_name ||
                                "E"
                              )
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <div className="activity-info">

                              <strong>
                                {
                                  record.employee_name ||
                                  record.employee_id ||
                                  "Employee"
                                }
                              </strong>

                              <span>
                                {
                                  record.employee_id
                                }
                              </span>

                            </div>

                            <div className="activity-time">

                              <strong>
                                {formatTime(
                                  record.check_in
                                )}
                              </strong>

                              <span>
                                Check-in
                              </span>

                            </div>

                            <span
                              className={statusClass(
                                record.status
                              )}
                            >
                              {
                                record.status ||
                                "Present"
                              }
                            </span>

                          </div>

                        )
                      )}

                  </div>

                )}

              </section>

            </>
          )}

          {/* ==================================================
              LIVE ATTENDANCE TAB
              ================================================== */}

          {activeTab === "live" && (
            <section className="manager-live-section">

              <div className="manager-live-header">
                <div>
                  <span className="manager-eyebrow">LIVE BIOMETRIC ATTENDANCE</span>
                  <h2>Face Recognition Center</h2>
                  <p>Recognize a registered employee and automatically record check-in or check-out.</p>
                </div>

                <div className={`manager-live-indicator ${cameraActive ? "online" : ""}`}>
                  <span />
                  {cameraActive ? "Camera connected" : "Camera offline"}
                </div>
              </div>

              <div className="manager-live-grid">
                <div className="manager-camera-card">
                  <div className="manager-camera-topbar">
                    <div>
                      <strong>Live camera</strong>
                      <span>Keep one registered face inside the frame</span>
                    </div>
                    <span className={`manager-camera-badge ${recognitionRunning ? "active" : ""}`}>
                      {recognitionRunning ? "SCANNING" : "STANDBY"}
                    </span>
                  </div>

                  <div className="manager-camera-frame">
                    <video
                      ref={videoRef}
                      className="manager-camera-video"
                      autoPlay
                      muted
                      playsInline
                    />

                    {!cameraActive && (
                      <div className="manager-camera-placeholder">
                        <div className="manager-camera-placeholder-icon">◉</div>
                        <strong>Camera is off</strong>
                        <span>Start the camera to begin face recognition.</span>
                      </div>
                    )}

                    {cameraActive && (
                      <div className="manager-face-guide">
                        <span />
                      </div>
                    )}

                    <div className="manager-camera-corner top-left" />
                    <div className="manager-camera-corner top-right" />
                    <div className="manager-camera-corner bottom-left" />
                    <div className="manager-camera-corner bottom-right" />
                  </div>

                  <div className="manager-camera-actions">
                    {!cameraActive ? (
                      <button
                        className="manager-primary-button"
                        type="button"
                        onClick={startCamera}
                      >
                        ◉ Start Camera
                      </button>
                    ) : (
                      <button
                        className="manager-secondary-button danger"
                        type="button"
                        onClick={stopCamera}
                      >
                        ■ Stop Camera
                      </button>
                    )}

                    {cameraActive && (
                      <button
                        className={
                          recognitionRunning
                            ? "manager-secondary-button"
                            : "manager-primary-button"
                        }
                        type="button"
                        onClick={
                          recognitionRunning
                            ? stopRecognition
                            : startRecognition
                        }
                      >
                        {recognitionRunning ? "Ⅱ Pause Recognition" : "▶ Start Recognition"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="manager-recognition-card">
                  <div className="manager-recognition-status-head">
                    <div className={`manager-recognition-dot ${recognitionTone}`} />
                    <div>
                      <span>RECOGNITION STATUS</span>
                      <strong>{
                        recognitionRunning
                          ? "Scanning for employee"
                          : cameraActive
                            ? "Camera ready"
                            : "Waiting for camera"
                      }</strong>
                    </div>
                  </div>

                  <div className={`manager-recognition-message ${recognitionTone}`}>
                    {recognitionStatus}
                  </div>

                  {recognizedEmployee ? (
                    <div className="manager-recognized-employee">
                      <div className="manager-recognized-avatar">
                        {recognizedEmployee.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="manager-recognized-main">
                        <span>RECOGNIZED EMPLOYEE</span>
                        <strong>{recognizedEmployee.name}</strong>
                        <small>{recognizedEmployee.employee_id}</small>
                      </div>
                    </div>
                  ) : (
                    <div className="manager-recognition-empty">
                      <div>⌁</div>
                      <strong>No employee recognized yet</strong>
                      <span>The employee details will appear here after a successful match.</span>
                    </div>
                  )}

                  {recognizedEmployee && (
                    <div className="manager-recognition-metrics">
                      <div>
                        <span>Confidence</span>
                        <strong>{recognizedEmployee.confidence.toFixed(1)}%</strong>
                      </div>
                      <div>
                        <span>Attendance</span>
                        <strong>{recognizedEmployee.attendanceStatus || "Recorded"}</strong>
                      </div>
                      <div>
                        <span>Check-in</span>
                        <strong>{formatTime(recognizedEmployee.check_in)}</strong>
                      </div>
                      <div>
                        <span>Check-out</span>
                        <strong>{formatTime(recognizedEmployee.check_out)}</strong>
                      </div>
                    </div>
                  )}

                  <div className="manager-recognition-info">
                    <span>✓</span>
                    <p>Attendance is company-scoped and uses the authenticated Manager session.</p>
                  </div>
                </div>
              </div>

              <div className="manager-live-how">
                <div>
                  <span>01</span>
                  <strong>Detect</strong>
                  <small>Capture a live frame</small>
                </div>
                <div>
                  <span>02</span>
                  <strong>Recognize</strong>
                  <small>Match registered face</small>
                </div>
                <div>
                  <span>03</span>
                  <strong>Verify</strong>
                  <small>Check recognition confidence</small>
                </div>
                <div>
                  <span>04</span>
                  <strong>Record</strong>
                  <small>Check-in / check-out automatically</small>
                </div>
              </div>

            </section>
          )}

          {/* ==================================================
              ATTENDANCE TAB
              ================================================== */}

          {activeTab === "attendance" && (
            <section className="manager-panel">

              <div className="manager-panel-header">

                <div>

                  <span>
                    ATTENDANCE MANAGEMENT
                  </span>

                  <h2>
                    Today's attendance
                  </h2>

                  <p className="panel-description">
                    Monitor employee check-in,
                    check-out and attendance
                    status.
                  </p>

                </div>

                <div className="attendance-count">
                  {filteredAttendance.length}
                  {" "}
                  records
                </div>

              </div>

              <div className="advanced-toolbar">

                <div className="manager-search">

                  <span>
                    ⌕
                  </span>

                  <input
                    value={
                      attendanceSearch
                    }
                    onChange={(e) =>
                      setAttendanceSearch(
                        e.target.value
                      )
                    }
                    placeholder="Search employee or ID..."
                  />

                </div>

                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(
                      e.target.value
                    )
                  }
                >

                  <option value="all">
                    All statuses
                  </option>

                  <option value="present">
                    Present
                  </option>

                  <option value="completed">
                    Completed
                  </option>

                  <option value="late">
                    Late
                  </option>

                  <option value="absent">
                    Absent
                  </option>

                </select>

                <button
                  className="clear-filter"
                  onClick={() => {
                    setAttendanceSearch(
                      ""
                    );
                    setStatusFilter(
                      "all"
                    );
                  }}
                >
                  Clear
                </button>

              </div>

              {filteredAttendance.length ===
              0 ? (

                <div className="manager-empty">

                  <div>
                    ◷
                  </div>

                  <h3>
                    No matching attendance
                  </h3>

                  <p>
                    There are no attendance
                    records matching your
                    current filters.
                  </p>

                </div>

              ) : (

                <div className="manager-table-wrap">

                  <table className="manager-table">

                    <thead>

                      <tr>

                        <th>
                          Employee
                        </th>

                        <th>
                          Check in
                        </th>

                        <th>
                          Check out
                        </th>

                        <th>
                          Working hours
                        </th>

                        <th>
                          Confidence
                        </th>

                        <th>
                          Status
                        </th>

                      </tr>

                    </thead>

                    <tbody>

                      {filteredAttendance.map(
                        (
                          record,
                          index
                        ) => (

                          <tr
                            key={
                              record.id ||
                              index
                            }
                          >

                            <td>

                              <div className="table-person">

                                <div className="table-avatar">
                                  {(
                                    record.employee_name ||
                                    "E"
                                  )
                                    .charAt(
                                      0
                                    )
                                    .toUpperCase()}
                                </div>

                                <div>

                                  <strong>
                                    {
                                      record.employee_name ||
                                      "Employee"
                                    }
                                  </strong>

                                  <span>
                                    {
                                      record.employee_id
                                    }
                                  </span>

                                </div>

                              </div>

                            </td>

                            <td>
                              {formatTime(
                                record.check_in
                              )}
                            </td>

                            <td>
                              {formatTime(
                                record.check_out
                              )}
                            </td>

                            <td>
                              {record.total_hours !==
                              null &&
                              record.total_hours !==
                                undefined
                                ? `${record.total_hours} hrs`
                                : "--"}
                            </td>

                            <td>

                              {record.check_in_confidence !==
                              null &&
                              record.check_in_confidence !==
                                undefined
                                ? `${Number(
                                    record.check_in_confidence
                                  ).toFixed(
                                    1
                                  )}%`
                                : "--"}

                            </td>

                            <td>

                              <span
                                className={statusClass(
                                  record.status
                                )}
                              >
                                {
                                  record.status ||
                                  "Present"
                                }
                              </span>

                            </td>

                          </tr>

                        )
                      )}

                    </tbody>

                  </table>

                </div>

              )}

            </section>
          )}

          {/* ==================================================
              EMPLOYEES TAB
              ================================================== */}

          {activeTab === "employees" && (
            <section className="manager-panel">

              <div className="manager-panel-header">

                <div>

                  <span>
                    TEAM DIRECTORY
                  </span>

                  <h2>
                    Employees
                  </h2>

                  <p className="panel-description">
                    View your company's employee
                    directory and attendance
                    history.
                  </p>

                </div>

                <div className="attendance-count">
                  {filteredEmployees.length}
                  {" "}
                  employees
                </div>

              </div>

              <div className="advanced-toolbar">

                <div className="manager-search">

                  <span>
                    ⌕
                  </span>

                  <input
                    value={search}
                    onChange={(e) =>
                      setSearch(
                        e.target.value
                      )
                    }
                    placeholder="Search employee, ID, email..."
                  />

                </div>

                <select
                  value={departmentFilter}
                  onChange={(e) =>
                    setDepartmentFilter(
                      e.target.value
                    )
                  }
                >

                  <option value="all">
                    All departments
                  </option>

                  {departments.map(
                    (department) => (
                      <option
                        key={department}
                        value={department}
                      >
                        {department}
                      </option>
                    )
                  )}

                </select>

                <button
                  className="clear-filter"
                  onClick={() => {
                    setSearch("");
                    setDepartmentFilter(
                      "all"
                    );
                  }}
                >
                  Clear
                </button>

              </div>

              {filteredEmployees.length ===
              0 ? (

                <div className="manager-empty">

                  <div>
                    ♙
                  </div>

                  <h3>
                    No employees found
                  </h3>

                  <p>
                    Try changing your search
                    or department filter.
                  </p>

                </div>

              ) : (

                <div className="manager-table-wrap">

                  <table className="manager-table">

                    <thead>

                      <tr>

                        <th>
                          Employee
                        </th>

                        <th>
                          Department
                        </th>

                        <th>
                          Designation
                        </th>

                        <th>
                          Face status
                        </th>

                        <th>
                          Account
                        </th>

                        <th>
                          Action
                        </th>

                      </tr>

                    </thead>

                    <tbody>

                      {filteredEmployees.map(
                        (employee) => (

                          <tr
                            key={
                              employee.id ||
                              employee.employee_id
                            }
                          >

                            <td>

                              <div className="table-person">

                                <div className="table-avatar">
                                  {employee.full_name
                                    .charAt(
                                      0
                                    )
                                    .toUpperCase()}
                                </div>

                                <div>

                                  <strong>
                                    {
                                      employee.full_name
                                    }
                                  </strong>

                                  <span>
                                    {
                                      employee.employee_id
                                    }
                                  </span>

                                </div>

                              </div>

                            </td>

                            <td>
                              {
                                employee.department_name ||
                                "--"
                              }
                            </td>

                            <td>
                              {
                                employee.designation ||
                                "--"
                              }
                            </td>

                            <td>

                              <span
                                className={
                                  employee.face_registered
                                    ? "manager-status completed"
                                    : "manager-status late"
                                }
                              >
                                {employee.face_registered
                                  ? "Registered"
                                  : "Pending"}
                              </span>

                            </td>

                            <td>

                              <span
                                className={
                                  employee.is_active ===
                                  false
                                    ? "manager-status absent"
                                    : "manager-status present"
                                }
                              >
                                {employee.is_active ===
                                false
                                  ? "Inactive"
                                  : "Active"}
                              </span>

                            </td>

                            <td>

                              <div className="manager-employee-actions">

                                <button
                                  className={
                                    employee.is_active === false
                                      ? "history-action manager-status-action activate"
                                      : "history-action manager-status-action leave"
                                  }
                                  onClick={() =>
                                    toggleEmployeeStatus(
                                      employee
                                    )
                                  }
                                >
                                  {employee.is_active === false
                                    ? "Activate"
                                    : "Leave"}
                                </button>

                                <button
                                  className="history-action"
                                  onClick={() =>
                                    openHistory(
                                      employee
                                    )
                                  }
                                >
                                  View history
                                </button>

                              </div>

                            </td>

                          </tr>

                        )
                      )}

                    </tbody>

                  </table>

                </div>

              )}

            </section>
          )}

          {/* ==================================================
              REPORTS TAB
              ================================================== */}

          {activeTab === "reports" && (
            <section className="manager-panel">

              <div className="manager-panel-header">
                <div>
                  <span>WORKFORCE REPORTS</span>
                  <h2>Attendance analytics</h2>
                  <p className="panel-description">
                    Live report calculated from the employees and attendance returned by the current company APIs.
                  </p>
                </div>
                <button
                  className="manager-refresh"
                  onClick={() => loadDashboard(true)}
                  disabled={refreshing}
                >
                  ↻ {refreshing ? "Refreshing" : "Refresh report"}
                </button>
              </div>

              <div className="report-grid">
                <div className="report-card">
                  <span>Attendance rate</span>
                  <strong>{attendancePercentage}%</strong>
                  <small>{presentToday} of {activeEmployees.length} employees marked today</small>
                </div>
                <div className="report-card">
                  <span>Present</span>
                  <strong>{presentToday}</strong>
                  <small>Check-in recorded</small>
                </div>
                <div className="report-card">
                  <span>Absent</span>
                  <strong>{absentToday}</strong>
                  <small>No attendance record today</small>
                </div>
                <div className="report-card">
                  <span>Late</span>
                  <strong>{lateToday}</strong>
                  <small>Check-in at or after 10:00 AM</small>
                </div>
                <div className="report-card">
                  <span>Working hours</span>
                  <strong>{totalHoursToday.toFixed(2)}</strong>
                  <small>Total recorded today</small>
                </div>
                <div className="report-card">
                  <span>Completed shifts</span>
                  <strong>{completedToday}</strong>
                  <small>Check-out recorded</small>
                </div>
              </div>

              <div className="report-chart-card">
                <div className="report-chart-header">
                  <div>
                    <span>DAILY DISTRIBUTION</span>
                    <h3>Today's workforce status</h3>
                  </div>
                </div>
                <div className="bar-chart">
                  {[
                    ["Present", presentToday, "green"],
                    ["Absent", absentToday, "red"],
                    ["Late", lateToday, "yellow"],
                    ["Completed", completedToday, "blue"],
                  ].map(([label, value, cls]) => (
                    <div className="chart-item" key={label}>
                      <div className="chart-label">
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                      <div className="chart-track">
                        <span
                          className={`chart-bar ${cls}`}
                          style={{
                            width: `${activeEmployees.length ? Math.min((Number(value) / activeEmployees.length) * 100, 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="manager-panel report-detail-panel">
                <div className="manager-panel-header">
                  <div>
                    <span>EMPLOYEE REPORT</span>
                    <h2>Today's team status</h2>
                  </div>
                  <div className="attendance-count">{reportRows.length} employees</div>
                </div>

                <div className="manager-table-wrap">
                  <table className="manager-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Department</th>
                        <th>Check in</th>
                        <th>Check out</th>
                        <th>Hours</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportRows.map(({ employee, record, late }) => (
                        <tr key={employee.id || employee.employee_id}>
                          <td>
                            <div className="table-person">
                              <div className="table-avatar">{employee.full_name.charAt(0).toUpperCase()}</div>
                              <div>
                                <strong>{employee.full_name}</strong>
                                <span>{employee.employee_id}</span>
                              </div>
                            </div>
                          </td>
                          <td>{employee.department_name || "--"}</td>
                          <td>{formatTime(record?.check_in)}</td>
                          <td>{formatTime(record?.check_out)}</td>
                          <td>{record?.total_hours != null ? `${record.total_hours} hrs` : "--"}</td>
                          <td>
                            <span className={statusClass(record ? (late ? "late" : record.status) : "absent")}>
                              {record ? (late ? "Late" : (record.status || "Present")) : "Absent"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </section>
          )}

        </div>

      </section>

      {/* ======================================================
          HISTORY MODAL
          ====================================================== */}

      {showHistory && (
        <div
          className="manager-modal-overlay"
          onClick={() =>
            setShowHistory(false)
          }
        >

          <div
            className="manager-history-modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div className="history-header">

              <div>

                <span>
                  ATTENDANCE HISTORY
                </span>

                <h2>
                  {selectedEmployee?.full_name ||
                    "Employee"}
                </h2>

                <small>
                  {
                    selectedEmployee?.employee_id
                  }
                </small>

              </div>

              <button
                onClick={() =>
                  setShowHistory(false)
                }
              >
                ×
              </button>

            </div>

            <div className="history-filter">

              <label>
                Filter by date
              </label>

              <input
                type="date"
                value={dateFilter}
                onChange={(e) =>
                  setDateFilter(
                    e.target.value
                  )
                }
              />

              {dateFilter && (
                <button
                  onClick={() =>
                    setDateFilter("")
                  }
                >
                  Clear
                </button>
              )}

            </div>

            {historyLoading ? (

              <div className="manager-empty">

                <div className="manager-spinner" />

                <h3>
                  Loading history...
                </h3>

              </div>

            ) : filteredHistory.length ===
              0 ? (

              <div className="manager-empty">

                <div>
                  ◷
                </div>

                <h3>
                  No attendance records
                </h3>

                <p>
                  No attendance records are
                  available for the selected
                  period.
                </p>

              </div>

            ) : (

              <div className="manager-table-wrap">

                <table className="manager-table">

                  <thead>

                    <tr>

                      <th>
                        Date
                      </th>

                      <th>
                        Check in
                      </th>

                      <th>
                        Check out
                      </th>

                      <th>
                        Hours
                      </th>

                      <th>
                        Status
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {filteredHistory.map(
                      (
                        record,
                        index
                      ) => (

                        <tr
                          key={
                            record.id ||
                            index
                          }
                        >

                          <td>
                            {formatDate(
                              record.attendance_date
                            )}
                          </td>

                          <td>
                            {formatTime(
                              record.check_in
                            )}
                          </td>

                          <td>
                            {formatTime(
                              record.check_out
                            )}
                          </td>

                          <td>
                            {record.total_hours !==
                            null &&
                            record.total_hours !==
                              undefined
                              ? `${record.total_hours} hrs`
                              : "--"}
                          </td>

                          <td>

                            <span
                              className={statusClass(
                                record.status
                              )}
                            >
                              {
                                record.status ||
                                "Present"
                              }
                            </span>

                          </td>

                        </tr>

                      )
                    )}

                  </tbody>

                </table>

              </div>

            )}

          </div>

        </div>
      )}

    </main>
  );
}