import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { apiDelete, apiRequest, apiUpload } from "../api";
import "./HRDashboard.attendance.css";

type Department = {
  department_id: string;
  name: string;
  is_active?: boolean;
};

type Employee = {
  id?: number;
  employee_id: string;
  employee_code: string;
  company_id?: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  designation?: string | null;
  joining_date?: string | null;
  is_active?: boolean;
  face_registered?: boolean;
};

type Attendance = {
  id?: number;
  employee_id: string;
  employee_name: string;
  company_id?: string;
  attendance_date: string;
  check_in?: string | null;
  check_out?: string | null;
  status?: string;
  check_in_confidence?: number | null;
  check_out_confidence?: number | null;
  total_seconds?: number | null;
  total_hours?: number | null;
  message?: string;
};

type DailyAttendanceDay = {
  key: string;
  date: Date;
  present: number;
  absent: number;
  completed: number;
  hours: number;
};

type FaceState = {
  employee: Employee | null;
  sampleCount: number;
  requiredSamples: number;
  cameraOn: boolean;
  capturing: boolean;
  message: string;
  error: string;
  completed: boolean;
};

const emptyFace: FaceState = {
  employee: null,
  sampleCount: 0,
  requiredSamples: 5,
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

  // Attendance camera is separate from face-enrollment camera.
  const attendanceVideoRef = useRef<HTMLVideoElement>(null);
  const attendanceStreamRef = useRef<MediaStream | null>(null);
  const attendanceTimerRef = useRef<number | null>(null);
  const recognitionBusyRef = useRef(false);
  const blockedEmployeeRef = useRef<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);

  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceAction, setAttendanceAction] = useState<string | null>(null);

  // Reports keep a minimum 30-day attendance history.
  const [reportAttendance, setReportAttendance] = useState<Attendance[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  const [attendanceCameraOn, setAttendanceCameraOn] = useState(false);
  const [attendanceScanning, setAttendanceScanning] = useState(false);
  const [attendanceScanMessage, setAttendanceScanMessage] =
    useState("Camera is off. Start the attendance camera to begin scanning.");
  const [recognizedEmployee, setRecognizedEmployee] = useState<{
    employee_id: string;
    employee_name: string;
    confidence: number;
    message: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [activeView, setActiveView] = useState<
    "overview" | "employees" | "faces" | "attendance" | "reports"
  >("overview");

  // Sidebar toggle: visible by default on desktop, closed on smaller screens.
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 900 : true
  );

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 900) {
        setSidebarOpen(true);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [departments, setDepartments] = useState<Department[]>([]);

  const [form, setForm] = useState({
    employee_code: "",
    name: "",
    email: "",
    phone: "",
    department: "",
    designation: "",
  });

  const [face, setFace] = useState<FaceState>(emptyFace);

  // ============================================================
  // CURRENT USER
  // ============================================================

  const user = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem("faceattend_user") || "{}"
      );
    } catch {
      return {};
    }
  }, []);

  const companyId =
    localStorage.getItem("faceattend_company_id") ||
    user.company_id ||
    "";

  // ============================================================
  // INITIAL LOAD
  // ============================================================

  useEffect(() => {
    loadEmployees();
    loadDepartments();

    return () => {
      stopCamera();
      stopAttendanceCamera();
    };
  }, []);

  // ============================================================
  // LOAD EMPLOYEES
  // ============================================================

  async function loadEmployees() {
    setLoading(true);
    setPageError("");

    try {
      const data = await apiRequest("/employees/");

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.employees)
        ? data.employees
        : [];

      setEmployees(list);
    } catch (err: any) {
      setPageError(
        err?.message || "Unable to load employees."
      );
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // LOAD DEPARTMENTS
  // ============================================================

  async function loadDepartments() {
    try {
      const data = await apiRequest("/employees/departments");

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.departments)
        ? data.departments
        : [];

      setDepartments(
        list.filter(
          (department: Department) =>
            department &&
            department.department_id &&
            department.name
        )
      );
    } catch (err) {
      // Do not break Employee Management if the department endpoint
      // is temporarily unavailable. The backend patch supplied with
      // this dashboard adds the company-scoped endpoint.
      console.warn("Unable to load departments:", err);
      setDepartments([]);
    }
  }

  //============================================================
  // ATTENDANCE VIEW
  // ===========================================================
  async function loadAttendance() {
  setAttendanceLoading(true);

  try {
    const data = await apiRequest("/attendance/today");

    const list = Array.isArray(data)
      ? data
      : data?.attendance || data?.items || data?.data || [];

    setAttendance(list);
  } catch (err: any) {
    showToast(
      err?.message || "Unable to load today's attendance."
    );
  } finally {
    setAttendanceLoading(false);
  }
}


async function loadReports() {
  setReportLoading(true);
  setReportError("");

  try {
    // Always load today's attendance first so the Reports page
    // shows the live/current attendance section at the top.
    try {
      const todayData = await apiRequest("/attendance/today");
      const todayList = Array.isArray(todayData)
        ? todayData
        : todayData?.attendance || todayData?.items || todayData?.data || [];
      setAttendance(Array.isArray(todayList) ? todayList : []);
    } catch (todayError: any) {
      // Keep the 30-day report usable even if today's request fails.
      console.warn("Unable to load today's attendance for reports:", todayError);
    }

    if (employees.length === 0) {
      setReportAttendance([]);
      return;
    }

    const historyResults = await Promise.all(
      employees.map(async (employee) => {
        try {
          const data = await apiRequest(
            `/attendance/employee/${encodeURIComponent(
              employee.employee_id
            )}`
          );

          const list = Array.isArray(data)
            ? data
            : data?.attendance ||
              data?.items ||
              data?.data ||
              [];

          return Array.isArray(list) ? list : [];
        } catch {
          return [];
        }
      })
    );

    const allHistory = historyResults.flat() as Attendance[];

    // Keep exactly the latest 30 calendar days including today.
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const startDate = new Date(today);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - 29);

    const filtered = allHistory.filter((record) => {
      const rawDate = record.attendance_date || record.check_in;
      if (!rawDate) return false;

      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return false;

      return date >= startDate && date <= today;
    });

    // Remove duplicate records if the backend returns overlapping data.
    const unique = new Map<string, Attendance>();

    filtered.forEach((record, index) => {
      const key = `${String(record.employee_id).toUpperCase()}-${
        record.attendance_date || record.check_in || index
      }`;
      unique.set(key, record);
    });

    setReportAttendance(Array.from(unique.values()));
  } catch (err: any) {
    setReportError(
      err?.message ||
        "Unable to load the 30-day attendance report."
    );
    setReportAttendance([]);
  } finally {
    setReportLoading(false);
  }
}

async function markAttendance(
    employee: Employee,
    confidence = 0
  ) {
    if (!employee.employee_id) {
      showToast("Employee ID is missing.");
      return;
    }

    if (!Number.isFinite(confidence) || confidence <= 0) {
      showToast("Face scan is required. Please scan the employee's face first.");
      return;
    }

    setAttendanceAction(employee.employee_id);

    try {
      const confidenceValue = Number.isFinite(confidence)
        ? confidence
        : 0;

      const data = await apiRequest(
        `/attendance/mark/${encodeURIComponent(
          employee.employee_id
        )}?confidence=${encodeURIComponent(confidenceValue)}`,
        {
          method: "POST",
        }
      );

      showToast(
        data?.message ||
          "Attendance updated successfully."
      );

      await loadAttendance();

      return data;
    } catch (err: any) {
      showToast(
        err?.message ||
          "Unable to mark attendance."
      );
    } finally {
      setAttendanceAction(null);
    }
  }

  // ============================================================
  // ATTENDANCE CAMERA
  // LIVE CAMERA -> /faces/recognize -> /attendance/mark
  // ============================================================

  function extractRecognition(data: any) {
    const employee = data?.employee || data?.recognized_employee || data?.result || {};

    const employeeId = String(
      data?.employee_id ??
        employee?.employee_id ??
        employee?.id ??
        ""
    ).trim();

    const employeeName = String(
      data?.employee_name ??
        employee?.full_name ??
        employee?.name ??
        "Employee"
    ).trim();

    const rawConfidence =
      data?.confidence ??
      data?.match_confidence ??
      data?.recognition_confidence ??
      data?.score ??
      employee?.confidence ??
      0;

    const confidence = Number(rawConfidence);

    const recognized =
      Boolean(employeeId) &&
      (
        data?.recognized !== false &&
        data?.match !== false &&
        data?.success !== false
      );

    return {
      recognized,
      employeeId,
      employeeName,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      message: String(
        data?.message ||
          (recognized
            ? "Employee recognized."
            : "Face not recognized.")
      ),
    };
  }

  async function startAttendanceCamera() {
    if (attendanceCameraOn) return;

    setAttendanceScanMessage("Requesting camera access...");
    setRecognizedEmployee(null);

    try {
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        throw new Error(
          "Camera access is not supported by this browser."
        );
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

      attendanceStreamRef.current = stream;

      if (attendanceVideoRef.current) {
        attendanceVideoRef.current.srcObject = stream;
        await attendanceVideoRef.current.play();
      }

      blockedEmployeeRef.current = null;
      setAttendanceCameraOn(true);
      setAttendanceScanning(true);
      setAttendanceScanMessage(
        "Camera is live. Looking for a registered employee..."
      );

      if (attendanceTimerRef.current) {
        window.clearInterval(attendanceTimerRef.current);
      }

      // Scan roughly every 2.5 seconds. A locked employee is not
      // processed again until the camera sees no face.
      await scanAttendanceFrame();

      attendanceTimerRef.current = window.setInterval(() => {
        scanAttendanceFrame();
      }, 2500);
    } catch (err: any) {
      stopAttendanceCamera();
      setAttendanceScanMessage(
        err?.message ||
          "Unable to open the attendance camera."
      );
    }
  }

  function stopAttendanceCamera() {
    if (attendanceTimerRef.current) {
      window.clearInterval(attendanceTimerRef.current);
      attendanceTimerRef.current = null;
    }

    if (attendanceStreamRef.current) {
      attendanceStreamRef.current
        .getTracks()
        .forEach((track) => track.stop());

      attendanceStreamRef.current = null;
    }

    if (attendanceVideoRef.current) {
      attendanceVideoRef.current.srcObject = null;
    }

    recognitionBusyRef.current = false;
    blockedEmployeeRef.current = null;

    setAttendanceCameraOn(false);
    setAttendanceScanning(false);
    setRecognizedEmployee(null);
    setAttendanceScanMessage(
      "Camera is off. Start the attendance camera to begin scanning."
    );
  }

  async function scanAttendanceFrame() {
    if (
      !attendanceCameraOn &&
      !attendanceStreamRef.current
    ) {
      return;
    }

    if (
      recognitionBusyRef.current ||
      !attendanceVideoRef.current
    ) {
      return;
    }

    const video = attendanceVideoRef.current;

    if (
      video.readyState <
      HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return;
    }

    recognitionBusyRef.current = true;
    setAttendanceScanning(true);
    setAttendanceScanMessage(
      "Scanning face..."
    );

    try {
      const canvas =
        document.createElement("canvas");

      canvas.width =
        video.videoWidth || 640;

      canvas.height =
        video.videoHeight || 480;

      const context =
        canvas.getContext("2d");

      if (!context) {
        throw new Error(
          "Unable to capture camera frame."
        );
      }

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const blob =
        await new Promise<Blob>(
          (resolve, reject) => {
            canvas.toBlob(
              (value) => {
                if (value) {
                  resolve(value);
                } else {
                  reject(
                    new Error(
                      "Could not capture camera frame."
                    )
                  );
                }
              },
              "image/jpeg",
              0.88
            );
          }
        );

      const formData =
        new FormData();

      formData.append(
        "file",
        blob,
        "attendance-scan.jpg"
      );

      let data: any;

      try {
        data = await apiUpload(
          "/faces/recognize",
          formData
        );
      } catch (firstError: any) {
        // Keep the current documented endpoint as primary.
        // The fallback is only for older backend builds.
        try {
          data = await apiUpload(
            "/face/recognize",
            formData
          );
        } catch {
          throw firstError;
        }
      }

      const result =
        extractRecognition(data);

      if (
        !result.recognized ||
        !result.employeeId
      ) {
        // No face / unknown face means the employee is
        // allowed to be recognized again when they return.
        blockedEmployeeRef.current = null;
        setRecognizedEmployee(null);
        setAttendanceScanMessage(
          result.message ||
            "No registered employee recognized."
        );
        return;
      }

      const employeeId =
        result.employeeId.toUpperCase();

      const employee =
        employees.find(
          (item) =>
            String(
              item.employee_id
            ).toUpperCase() === employeeId
        );

      if (!employee) {
        setAttendanceScanMessage(
          "Face recognized, but the employee is not available in this company."
        );
        return;
      }

      setRecognizedEmployee({
        employee_id:
          employee.employee_id,
        employee_name:
          employee.full_name ||
          result.employeeName,
        confidence:
          result.confidence,
        message:
          result.message,
      });

      // Anti-duplicate: same continuous face is processed only once.
      if (
        blockedEmployeeRef.current ===
        employeeId
      ) {
        setAttendanceScanMessage(
          `${employee.full_name} is already processed. Please step away from the camera and return for the next attendance event.`
        );
        return;
      }

      blockedEmployeeRef.current = employeeId;

      setAttendanceScanMessage(
        `Recognized ${employee.full_name}. Updating attendance...`
      );

      const attendanceResult =
        await markAttendance(
          employee,
          result.confidence
        );

      const responseStatus =
        String(
          attendanceResult?.status ||
            attendanceResult?.attendance?.status ||
            ""
        ).toLowerCase();

      const responseMessage = String(
        attendanceResult?.message || ""
      );

      if (
        responseStatus === "completed" ||
        responseMessage.toLowerCase().includes("completed")
      ) {
        setAttendanceScanMessage(
          `${employee.full_name} attendance is completed for today.`
        );
      } else if (
        responseStatus === "present" ||
        responseMessage.toLowerCase().includes("checked in")
      ) {
        setAttendanceScanMessage(
          `${employee.full_name} checked in successfully.`
        );
      } else if (
        responseMessage.toLowerCase().includes("already")
      ) {
        setAttendanceScanMessage(
          `${employee.full_name} has already completed today's attendance.`
        );
      } else {
        setAttendanceScanMessage(
          responseMessage ||
            `${employee.full_name} attendance updated successfully.`
        );
      }
    } catch (err: any) {
      const message = String(
        err?.message || ""
      );

      // Recognition can legitimately fail while there is
      // no face in the frame. Do not stop the camera.
      blockedEmployeeRef.current = null;
      setRecognizedEmployee(null);
      setAttendanceScanMessage(
        message.toLowerCase().includes("face") ||
        message.toLowerCase().includes("not found") ||
        message.toLowerCase().includes("recogn")
          ? "No registered employee recognized. Keep your face inside the frame."
          : message ||
            "Recognition request failed. Camera will keep scanning."
      );
    } finally {
      recognitionBusyRef.current = false;
      setAttendanceScanning(false);
    }
  }

  // ============================================================
  // CREATE EMPLOYEE
  // ============================================================

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

  // ============================================================
  // EDIT EMPLOYEE
  // ============================================================

  function openEdit(employee: Employee) {
    setEditingId(employee.employee_id);

    setForm({
      employee_code: employee.employee_code || "",
      name: employee.full_name || "",
      email: employee.email || "",
      phone: employee.phone || "",
      department: employee.department_id || "",
      designation: employee.designation || "",
    });

    setShowEmployeeModal(true);
  }

  // ============================================================
  // SAVE EMPLOYEE
  // ============================================================

  async function saveEmployee(e: FormEvent) {
    e.preventDefault();

    if (!form.employee_code.trim()) {
      showToast("Employee Code is required.");
      return;
    }

    if (!form.name.trim()) {
      showToast("Full Name is required.");
      return;
    }

    setSaving(true);
    setToast("");

    try {
      const payload = {
        employee_code: form.employee_code
          .trim()
          .toUpperCase(),

        full_name: form.name.trim(),

        email: form.email.trim() || null,

        phone: form.phone.trim() || null,

        department_id: form.department.trim() || null,

        designation: form.designation.trim() || null,
      };

      if (editingId) {
        await apiRequest(
          `/employees/${encodeURIComponent(editingId)}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );

        showToast("Employee updated successfully.");
      } else {
        await apiRequest("/employees/", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        showToast("Employee created successfully.");
      }

      setShowEmployeeModal(false);

      await loadEmployees();
    } catch (err: any) {
      showToast(
        err?.message || "Unable to save employee."
      );
    } finally {
      setSaving(false);
    }
  }

  // ============================================================
  // DELETE EMPLOYEE
  // ============================================================

  async function removeEmployee(employee: Employee) {
    const confirmed = window.confirm(
      `Delete ${employee.full_name || "this employee"}?`
    );

    if (!confirmed) return;

    try {
      await apiDelete(
        `/employees/${encodeURIComponent(
          employee.employee_id
        )}`
      );

      showToast("Employee deleted successfully.");

      await loadEmployees();
    } catch (err: any) {
      showToast(
        err?.message || "Unable to delete employee."
      );
    }
  }

  // ============================================================
  // ACTIVATE / DEACTIVATE EMPLOYEE
  // ============================================================

  async function toggleEmployeeStatus(employee: Employee) {
    const currentlyActive = employee.is_active !== false;
    const nextActive = !currentlyActive;

    const confirmed = window.confirm(
      nextActive
        ? `Activate ${employee.full_name || "this employee"} again?`
        : `Put ${employee.full_name || "this employee"} on leave?\n\nAttendance and face recognition will remain disabled while the employee is inactive.`
    );

    if (!confirmed) return;

    try {
      await apiRequest(
        `/employees/${encodeURIComponent(employee.employee_id)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            is_active: nextActive,
          }),
        }
      );

      if (
        !nextActive &&
        face.employee?.employee_id === employee.employee_id
      ) {
        stopCamera();
        setFace(emptyFace);
      }

      showToast(
        nextActive
          ? `${employee.full_name} is active again.`
          : `${employee.full_name} has been marked On Leave.`
      );

      await loadEmployees();
    } catch (err: any) {
      showToast(
        err?.message ||
          (nextActive
            ? "Unable to activate employee."
            : "Unable to put employee on leave.")
      );
    }
  }

  // ============================================================
  // TOAST
  // ============================================================

  function showToast(message: string) {
    setToast(message);

    window.setTimeout(() => {
      setToast("");
    }, 3200);
  }

  // ============================================================
  // OPEN FACE REGISTRATION
  // ============================================================

  function openFaceRegistration(employee: Employee) {
    if (employee.is_active === false) {
      showToast(
        `${employee.full_name || "This employee"} is on leave. Activate the employee before registering a face.`
      );
      return;
    }

    stopCamera();

    setFace({
      ...emptyFace,
      employee,
      message:
        `Ready to register face for ${employee.full_name}.`,
    });

    setActiveView("faces");
  }

  // ============================================================
  // START CAMERA
  // ============================================================

  async function startCamera() {
    if (!face.employee) {
      setFace((current) => ({
        ...current,
        error: "Please select an employee first.",
      }));

      return;
    }

    if (!face.employee.employee_id) {
      setFace((current) => ({
        ...current,
        error: "Employee ID is missing.",
      }));

      return;
    }

    setFace((current) => ({
      ...current,
      error: "",
      message: "Requesting camera access...",
    }));

    try {
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        throw new Error(
          "Camera access is not supported by this browser."
        );
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: {
              ideal: 1280,
            },
            height: {
              ideal: 720,
            },
          },
          audio: false,
        });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        await videoRef.current.play();
      }

      setFace((current) => ({
        ...current,
        cameraOn: true,
        error: "",
        message:
          "Camera is ready. Keep one face inside the frame.",
      }));
    } catch (err: any) {
      setFace((current) => ({
        ...current,
        cameraOn: false,
        error:
          err?.message ||
          "Camera permission was denied.",
        message:
          "Unable to open the camera.",
      }));
    }
  }

  // ============================================================
  // STOP CAMERA
  // ============================================================

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => track.stop());

      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setFace((current) => ({
      ...current,
      cameraOn: false,
    }));
  }

  // ============================================================
  // CAPTURE SAMPLE
  // ============================================================

  async function captureSample() {
    if (
      !face.employee ||
      !face.employee.employee_id ||
      !videoRef.current ||
      !face.cameraOn ||
      face.capturing
    ) {
      return;
    }

    if (face.sampleCount >= 5) {
      return;
    }

    setFace((current) => ({
      ...current,
      capturing: true,
      error: "",
      message: "Capturing and analyzing face...",
    }));

    try {
      const video = videoRef.current;

      if (
        video.readyState <
        HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        throw new Error(
          "Camera is not ready yet. Please wait a moment."
        );
      }

      const canvas =
        document.createElement("canvas");

      canvas.width =
        video.videoWidth || 640;

      canvas.height =
        video.videoHeight || 480;

      const context =
        canvas.getContext("2d");

      if (!context) {
        throw new Error(
          "Unable to access camera frame."
        );
      }

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const blob =
        await new Promise<Blob>(
          (resolve, reject) => {
            canvas.toBlob(
              (value) => {
                if (value) {
                  resolve(value);
                } else {
                  reject(
                    new Error(
                      "Could not capture image."
                    )
                  );
                }
              },
              "image/jpeg",
              0.92
            );
          }
        );

      const formData =
        new FormData();

      formData.append(
        "file",
        blob,
        `employee-${face.employee?.employee_id}-sample.jpg`
      );

      /*
       * CURRENT BACKEND ENDPOINT
       *
       * POST /faces/enroll/{employee_id}
       *
       * IMPORTANT:
       * employee_id here means the backend's
       * string employee_id, e.g. EMPLOYEE-ABC123.
       *
       * It is NOT the numeric database id.
       */

      const data = await apiUpload(
        `/faces/enroll/${encodeURIComponent(
          face.employee.employee_id
        )}`,
        formData
      );

      const sampleNumber = Number(
        data?.sample_number ??
          face.sampleCount + 1
      );

      const registered =
        Boolean(data?.face_registered) ||
        sampleNumber >= 5;

      setFace((current) => ({
        ...current,

        sampleCount: sampleNumber,

        requiredSamples: 5,

        capturing: false,

        message: registered
          ? "Face sample saved. Maximum registration samples reached."
          : `Sample ${sampleNumber} saved successfully. Capture the next sample.`,
      }));

      /*
       * Backend automatically sets face_registered=true
       * after successful enrollment.
       */
      if (registered) {
        stopCamera();

        setFace((current) => ({
          ...current,
          completed: true,
          capturing: false,
          cameraOn: false,
          message:
            data?.message ||
            "Face registration completed successfully.",
        }));

        await loadEmployees();
      }
    } catch (err: any) {
      setFace((current) => ({
        ...current,
        capturing: false,
        error:
          err?.message ||
          "Face enrollment failed.",
        message:
          "Try again with your face clearly visible and good lighting.",
      }));
    }
  }

  // ============================================================
  // RESET FACE
  // ============================================================

  function resetFace() {
    stopCamera();

    setFace(emptyFace);
  }

  // ============================================================
  // LOGOUT
  // ============================================================

  function logout() {
    stopCamera();

    localStorage.removeItem(
      "access_token"
    );

    localStorage.removeItem(
      "faceattend_user"
    );

    localStorage.removeItem(
      "faceattend_company_id"
    );

    navigate("/login", {
      replace: true,
    });
  }

  // ============================================================
  // SEARCH
  // ============================================================

  const activeEmployeeCount = employees.filter(
    (employee) => employee.is_active !== false
  ).length;

  const inactiveEmployeeCount = Math.max(
    employees.length - activeEmployeeCount,
    0
  );

  const filteredEmployees =
    employees.filter((employee) => {
      const q = search.trim().toLowerCase();
      const isActive = employee.is_active !== false;

      if (
        employeeStatusFilter === "active" &&
        !isActive
      ) {
        return false;
      }

      if (
        employeeStatusFilter === "inactive" &&
        isActive
      ) {
        return false;
      }

      if (!q) return true;

      return [
        employee.full_name,
        employee.employee_code,
        employee.employee_id,
        employee.department_name,
        employee.designation,
        employee.email,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(q)
        );
    });

  const faceRegisteredCount =
    employees.filter(
      (employee) =>
        employee.face_registered
    ).length;

  // ============================================================
  // RETURN
  // ============================================================

  return (
    <main className="dashboard-page">

      {/* SIDEBAR */}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}> 

        <button
          className="brand light"
          onClick={() => navigate("/")}
        >
          <span className="brand-mark">
            FA
          </span>

          <span>
            <strong>
              FaceAttend
            </strong>

            <small>
              HR workspace
            </small>
          </span>
        </button>

        <div className="side-nav">

          <button
            className={
              activeView === "overview"
                ? "active"
                : ""
            }
            onClick={() =>
              setActiveView("overview")
            }
          >
            ⌂ Dashboard
          </button>

          <button
            className={
              activeView === "employees"
                ? "active"
                : ""
            }
            onClick={() =>
              setActiveView("employees")
            }
          >
            ◉ Employees
          </button>

          <button
            className={
              activeView === "faces"
                ? "active"
                : ""
            }
            onClick={() =>
              setActiveView("faces")
            }
          >
            ◎ Face Registration
          </button>

          <button
  className={
    activeView === "attendance"
      ? "active"
      : ""
  }
  onClick={() => {
    setActiveView("attendance");
    loadAttendance();
  }}
>
  ◷ Attendance
</button> 

          <button
            className={
              activeView === "reports"
                ? "active"
                : ""
            }
            onClick={() => {
              setActiveView("reports");
              loadReports();
            }}
          >
            ▣ Reports
          </button>

        </div>

        <button
          className="logout"
          onClick={logout}
        >
          ↪ Sign out
        </button>

      </aside>

      {/* MAIN */}

      <section className="dash-main">

        <button
          type="button"
          className="sidebar-menu-button"
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>

        {sidebarOpen && (
          <button
            type="button"
            className="sidebar-overlay"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="dash-header">

          <div>

            <span className="eyebrow">
              <span />
              HR WORKSPACE
            </span>

            <h1>
              {activeView === "faces"
                ? "Face Registration"
                : activeView === "employees"
                ? "Employee Management"
                : activeView === "attendance"
                ? "Attendance Management"
                : activeView === "reports"
                ? "HR Reports"
                : "HR Dashboard"}
            </h1>

            <p>
              Company ID:{" "}
              <strong>
                {companyId ||
                  "Not available"}
              </strong>
            </p>

          </div>

          <div className="avatar">
            HR
          </div>

        </div>

        {toast && (
          <div className="dashboard-toast">
            ✓ {toast}
          </div>
        )}

        {pageError && (
          <div className="form-error">
            {pageError}
          </div>
        )}

        {/* ======================================================
            OVERVIEW
        ====================================================== */}

        {activeView === "overview" && (
          <>
            <div className="stat-grid">

              <Stat
                label="Employees"
                value={
                  loading
                    ? "..."
                    : String(
                        employees.length
                      )
                }
                note="Company total"
              />

              <Stat
                label="Face registered"
                value={
                  loading
                    ? "..."
                    : String(
                        faceRegisteredCount
                      )
                }
                note={`${
                  employees.length
                    ? Math.round(
                        (faceRegisteredCount /
                          employees.length) *
                          100
                      )
                    : 0
                }% complete`}
              />

              <Stat
                label="Face pending"
                value={
                  loading
                    ? "..."
                    : String(
                        Math.max(
                          employees.length -
                            faceRegisteredCount,
                          0
                        )
                      )
                }
                note="Ready for registration"
              />

              <Stat
                label="Workspace"
                value="LIVE"
                note="HR company scoped"
              />

            </div>

            <div className="dash-grid">

              <div className="panel large">

                <div className="panel-head">

                  <div>
                    <h3>
                      HR operations
                    </h3>

                    <p className="panel-subtitle">
                      Manage employees and
                      prepare face recognition.
                    </p>
                  </div>

                  <span className="live-tag">
                    ● LIVE
                  </span>

                </div>

                <div className="admin-feature-grid">

                  <Feature
                    number="01"
                    title="Add employees"
                    text="Create employee records with code, department and designation."
                    onClick={
                      openCreate
                    }
                  />

                  <Feature
                    number="02"
                    title="Register faces"
                    text="Use the live camera to capture multiple samples."
                    onClick={() =>
                      setActiveView(
                        "faces"
                      )
                    }
                  />

                  <Feature
                    number="03"
                    title="Attendance ready"
                    text="Open the live attendance scanner and automatically mark check-in and check-out."
                    onClick={() => {
                      setActiveView("attendance");
                      loadAttendance();
                    }}
                  />

                </div>

              </div>

              <div className="panel">

                <div className="panel-head">
                  <h3>
                    Quick actions
                  </h3>
                </div>

                <button
                  className="quick primary-quick"
                  onClick={
                    openCreate
                  }
                >
                  ＋ Add employee
                </button>

                <button
                  className="quick"
                  onClick={() =>
                    setActiveView(
                      "employees"
                    )
                  }
                >
                  ◉ Manage employees
                </button>

                <button
                  className="quick"
                  onClick={() =>
                    setActiveView(
                      "faces"
                    )
                  }
                >
                  ◎ Register face
                </button>

              </div>

            </div>
          </>
        )}

        {/* ======================================================
            EMPLOYEES
        ====================================================== */}

        {activeView === "employees" && (
          <EmployeeView
            employees={
              filteredEmployees
            }
            loading={loading}
            search={search}
            setSearch={setSearch}
            statusFilter={employeeStatusFilter}
            setStatusFilter={setEmployeeStatusFilter}
            activeCount={activeEmployeeCount}
            inactiveCount={inactiveEmployeeCount}
            onAdd={openCreate}
            onEdit={openEdit}
            onDelete={
              removeEmployee
            }
            onFace={
              openFaceRegistration
            }
            onToggleStatus={
              toggleEmployeeStatus
            }
          />
        )}

        {/* ======================================================
            FACE REGISTRATION
        ====================================================== */}

        {activeView === "faces" && (
          <FaceView
            employees={employees}
            face={face}
            onSelect={
              openFaceRegistration
            }
            onStartCamera={
              startCamera
            }
            onStopCamera={
              stopCamera
            }
            onCapture={
              captureSample
            }
            onReset={resetFace}
            videoRef={videoRef}
          />
        )}
        {activeView === "attendance" && (
          <AttendanceView
            employees={employees}
            attendance={attendance}
            loading={attendanceLoading}
            actionLoading={attendanceAction}
            cameraOn={attendanceCameraOn}
            scanning={attendanceScanning}
            scanMessage={attendanceScanMessage}
            recognizedEmployee={recognizedEmployee}
            videoRef={attendanceVideoRef}
            onStartCamera={startAttendanceCamera}
            onStopCamera={stopAttendanceCamera}
            onScanNow={scanAttendanceFrame}
            onFaceAction={() => {
              if (attendanceCameraOn) {
                scanAttendanceFrame();
              } else {
                startAttendanceCamera();
              }
            }}
            onRefresh={loadAttendance}
          />
        )}

        {activeView === "reports" && (
          <ReportsView
            employees={employees}
            attendance={attendance}
            reportAttendance={reportAttendance}
            loading={reportLoading}
            error={reportError}
            onRefresh={loadReports}
          />
        )}


      </section>

      {/* ========================================================
          EMPLOYEE MODAL
      ======================================================== */}

      {showEmployeeModal && (
        <div
          className="modal-backdrop"
          onMouseDown={() =>
            !saving &&
            setShowEmployeeModal(
              false
            )
          }
        >

          <section
            className="staff-modal employee-modal"
            onMouseDown={(e) =>
              e.stopPropagation()
            }
          >

            <button
              className="modal-close"
              onClick={() =>
                !saving &&
                setShowEmployeeModal(
                  false
                )
              }
            >
              ×
            </button>

            <div className="modal-icon">
              {editingId
                ? "✎"
                : "+"}
            </div>

            <span className="eyebrow">
              <span />
              HR ONLY
            </span>

            <h2>
              {editingId
                ? "Edit employee"
                : "Add employee"}
            </h2>

            <p className="modal-copy">
              Employee records are scoped
              to Company ID{" "}
              <strong>
                {companyId}
              </strong>
              .
            </p>

            <form
              onSubmit={
                saveEmployee
              }
              className="employee-form-grid"
            >

              <label>
                Employee Code

                <input
                  value={
                    form.employee_code
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      employee_code:
                        e.target.value,
                    })
                  }
                  placeholder="EMP-001"
                  required
                />
              </label>

              <label>
                Full Name

                <input
                  value={
                    form.name
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      name:
                        e.target.value,
                    })
                  }
                  placeholder="Rahul Sharma"
                  required
                />
              </label>

              <label>
                Email

                <input
                  type="email"
                  value={
                    form.email
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      email:
                        e.target.value,
                    })
                  }
                  placeholder="rahul@company.com"
                />
              </label>

              <label>
                Phone

                <input
                  value={
                    form.phone
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      phone:
                        e.target.value,
                    })
                  }
                  placeholder="9876543210"
                />
              </label>

              <label>
                Department

                <select
                  value={form.department}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      department: e.target.value,
                    })
                  }
                  className="employee-department-select"
                >
                  <option value="">Select department</option>
                  {departments.map((department) => (
                    <option
                      key={department.department_id}
                      value={department.department_id}
                    >
                      {department.name} ({department.department_id})
                    </option>
                  ))}
                </select>
                {departments.length === 0 && (
                  <small className="employee-department-hint">
                    No active departments found. Create an active department first.
                  </small>
                )}
              </label>

              <label>
                Designation

                <input
                  value={
                    form.designation
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      designation:
                        e.target.value,
                    })
                  }
                  placeholder="Software Engineer"
                />
              </label>

              <button
                className="primary-btn full employee-submit"
                type="submit"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editingId
                  ? "Update employee"
                  : "Create employee"}

                <span>
                  →
                </span>
              </button>

            </form>

          </section>

        </div>
      )}

    </main>
  );
}

// ============================================================
// STAT
// ============================================================

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
      <small>
        {label}
      </small>

      <strong>
        {value}
      </strong>

      <span>
        {note}
      </span>
    </div>
  );
}

// ============================================================
// FEATURE
// ============================================================

function Feature({
  number,
  title,
  text,
  onClick,
}: {
  number: string;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      className="admin-feature"
      onClick={onClick}
    >
      <b>{number}</b>

      <div>
        <strong>
          {title}
        </strong>

        <p>
          {text}
        </p>
      </div>
    </button>
  );
}

// ============================================================
// EMPLOYEE VIEW
// ============================================================

function EmployeeView({
  employees,
  loading,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  activeCount,
  inactiveCount,
  onAdd,
  onEdit,
  onDelete,
  onFace,
  onToggleStatus,
}: {
  employees: Employee[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  statusFilter: "all" | "active" | "inactive";
  setStatusFilter: (v: "all" | "active" | "inactive") => void;
  activeCount: number;
  inactiveCount: number;
  onAdd: () => void;
  onEdit: (e: Employee) => void;
  onDelete: (e: Employee) => void;
  onFace: (e: Employee) => void;
  onToggleStatus: (e: Employee) => void;
}) {
  return (
    <div className="panel table-panel employee-manager-panel">

      <div className="panel-head">
        <div>
          <h3>Employees</h3>
          <p className="panel-subtitle">
            Create, edit, delete, manage leave status and
            register employee faces.
          </p>
        </div>

        <button
          className="small-btn"
          onClick={onAdd}
        >
          ＋ Add employee
        </button>
      </div>

      <div className="employee-toolbar employee-status-toolbar">
        <div className="search-box">
          ⌕
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, code or department..."
          />
        </div>

        <select
          className="employee-status-filter"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value as "all" | "active" | "inactive"
            )
          }
        >
          <option value="all">All employees</option>
          <option value="active">Active only</option>
          <option value="inactive">On Leave / Inactive</option>
        </select>

        <div className="employee-status-summary">
          <span className="employee-summary-active">
            ● {activeCount} Active
          </span>
          <span className="employee-summary-inactive">
            ● {inactiveCount} On Leave
          </span>
          <span>{employees.length} records</span>
        </div>
      </div>

      <div className="employee-table">

        <div className="employee-table-row employee-table-head">
          <span>Employee</span>
          <span>Department</span>
          <span>Contact</span>
          <span>Face</span>
          <span>Status</span>
          <span className="employee-head-actions">Actions</span>
        </div>

        {loading ? (
          <div className="empty-state">
            Loading employees...
          </div>
        ) : employees.length === 0 ? (
          <div className="empty-state">
            No employees found.
            Create the first employee.
          </div>
        ) : (
          employees.map((employee) => {
            const registered =
              Boolean(employee.face_registered);
            const active =
              employee.is_active !== false;

            return (
              <div
                className={`employee-table-row ${
                  active
                    ? "employee-row-active"
                    : "employee-row-inactive"
                }`}
                key={employee.employee_id}
              >

                <span>
                  <b className="row-avatar">
                    {(employee.full_name || "E")
                      .slice(0, 1)
                      .toUpperCase()}
                  </b>

                  <span>
                    <strong>
                      {employee.full_name || "Unnamed"}
                    </strong>
                    <small>
                      {employee.employee_code ||
                        employee.employee_id}
                    </small>
                  </span>
                </span>

                <span>
                  {employee.department_name || employee.department_id || "—"}
                  <small>
                    {employee.designation || ""}
                  </small>
                </span>

                <span>
                  {employee.email || "—"}
                  <small>{employee.phone || ""}</small>
                </span>

                <span>
                  <i
                    className={
                      registered
                        ? "face-dot ready"
                        : "face-dot pending"
                    }
                  />
                  {registered ? "Registered" : "Pending"}
                </span>

                <span>
                  <span
                    className={`employee-status-badge ${
                      active ? "active" : "inactive"
                    }`}
                  >
                    <i />
                    {active ? "Active" : "On Leave"}
                  </span>
                </span>

                <span className="row-actions employee-row-actions">
                  <button
                    disabled={!active}
                    title={
                      active
                        ? "Register face"
                        : "Activate employee before face registration"
                    }
                    onClick={() => onFace(employee)}
                  >
                    Face
                  </button>

                  <button
                    onClick={() => onEdit(employee)}
                  >
                    Edit
                  </button>

                  <button
                    className={
                      active
                        ? "leave-action"
                        : "activate-action"
                    }
                    onClick={() =>
                      onToggleStatus(employee)
                    }
                  >
                    {active ? "Leave" : "Activate"}
                  </button>

                  <button
                    className="danger"
                    onClick={() => onDelete(employee)}
                  >
                    Delete
                  </button>
                </span>

              </div>
            );
          })
        )}

      </div>
    </div>
  );
}

// ============================================================
// FACE VIEW
// ============================================================

function FaceView({
  employees,
  face,
  onSelect,
  onStartCamera,
  onStopCamera,
  onCapture,
  onReset,
  videoRef,
}: {
  employees: Employee[];
  face: FaceState;
  onSelect: (e: Employee) => void;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onCapture: () => void;
  onReset: () => void;
  videoRef: React.RefObject<
    HTMLVideoElement | null
  >;
}) {
  const progress = Math.min(
    100,
    Math.round(
      (face.sampleCount / 5) * 100
    )
  );

  return (
    <div className="face-registration-grid">

      {/* ======================================================
          CAMERA PANEL
      ====================================================== */}

      <div className="panel face-panel">

        <div className="panel-head">

          <div>

            <h3>
              Employee face enrollment
            </h3>

            <p className="panel-subtitle">
              Capture 5 high-quality face
              samples for recognition.
            </p>

          </div>

          <span className="live-tag">
            AI READY
          </span>

        </div>

        {/* EMPLOYEE SELECT */}

        <label className="face-select-label">
             Select employee

  <select
    value={face.employee?.employee_id || ""}
    onChange={(e) => {
      const selectedId = e.target.value;

      const found = employees.find(
        (employee) =>
          employee.employee_id === selectedId
      );

      if (found) {
        onSelect(found);
      }
    }}
  >
    <option value="">
      Choose employee...
    </option>

    {employees.map((employee) => (
      <option
        key={employee.employee_id}
        value={employee.employee_id}
        disabled={employee.is_active === false}
      >
        {employee.employee_code || employee.employee_id}
        {" · "}
        {employee.full_name}
        {employee.is_active === false ? " · On Leave" : ""}
      </option>
    ))}
  </select>
</label>

        {/* SELECTED EMPLOYEE */}

        {face.employee && (
          <div className="selected-employee-card">

            <div className="selected-employee-avatar">

              {(
                face.employee.full_name ||
                "E"
              )
                .slice(0, 1)
                .toUpperCase()}

            </div>

            <div>

              <strong>
                {face.employee.full_name}
              </strong>

              <span>
                {face.employee.employee_code ||
                  face.employee.employee_id}
                {" · "}
                {face.employee.designation ||
                  "Employee"}
              </span>

            </div>

            <div className="selected-status">

              {face.completed
                ? "✓ Registered"
                : face.cameraOn
                ? "● Camera Active"
                : "○ Ready"}

            </div>

          </div>
        )}

        {/* CAMERA STAGE */}

        <div className="camera-stage">

          {!face.cameraOn && (
            <div className="camera-placeholder">

              <div className="camera-orb">
                ◎
              </div>

              <strong>
                {face.completed
                  ? "Registration complete"
                  : "Camera is off"}
              </strong>

              <span>
                {face.completed
                  ? face.message
                  : face.employee
                  ? "Start the camera when you are ready."
                  : "Select an employee first."}
              </span>

            </div>
          )}

          <video
            ref={videoRef}
            className={
              face.cameraOn
                ? "camera-video"
                : "camera-video hidden-video"
            }
            muted
            playsInline
          />

          {face.cameraOn && (
            <>
              <div className="face-frame" />

              <div className="camera-status">
                <span />
                LIVE CAMERA
              </div>
            </>
          )}

        </div>

        {/* ERROR */}

        {face.error && (
          <div className="form-error">
            {face.error}
          </div>
        )}

        {/* MESSAGE */}

        <div className="face-message">
          {face.message}
        </div>

        {/* PROGRESS */}

        <div className="face-progress">

          <div>

            <span>
              Samples captured
            </span>

            <b>
              {face.sampleCount} / 5
            </b>

          </div>

          <div className="progress-track">

            <i
              style={{
                width: `${progress}%`,
              }}
            />

          </div>

        </div>

        {/* ACTIONS */}

        <div className="camera-actions">

          {!face.cameraOn ? (
            <button
              className="primary-btn"
              disabled={
                !face.employee ||
                face.completed ||
                face.employee.is_active === false
              }
              onClick={
                onStartCamera
              }
            >
              Start camera
              <span>
                →
              </span>
            </button>
          ) : (
            <button
              className="secondary-btn"
              onClick={
                onStopCamera
              }
            >
              Stop camera
            </button>
          )}

          <button
            className="capture-btn"
            disabled={
              !face.cameraOn ||
              face.capturing ||
              face.completed ||
              face.sampleCount >= 5
            }
            onClick={
              onCapture
            }
          >
            {face.capturing
              ? "Processing..."
              : "● Capture sample"}
          </button>

        </div>

        {/* RESET */}

        <button
          className="reset-link"
          onClick={onReset}
        >
          Reset registration
        </button>

      </div>

      {/* ======================================================
          GUIDE
      ====================================================== */}

      <div className="panel face-guide">

        <span className="eyebrow">
          <span />
          REGISTRATION GUIDE
        </span>

        <h3>
          {face.employee
            ? face.employee.full_name
            : "Face registration"}
        </h3>

        <p>
          {face.employee
            ? `${
                face.employee.employee_code ||
                face.employee.employee_id
              } · ${
                face.employee.department_name ||
                "Company employee"
              }`
            : "Select an employee from the list to begin."}
        </p>

        <div className="guide-list">

          <Guide
            n="01"
            text="Face the camera directly with good lighting."
          />

          <Guide
            n="02"
            text="Keep only one face visible in the frame."
          />

          <Guide
            n="03"
            text="Capture different natural angles for stronger recognition."
          />

          <Guide
            n="04"
            text="Capture all 5 samples successfully."
          />

        </div>

        <div className="security-card">

          <span>
            🔐
          </span>

          <div>

            <b>
              Company scoped
            </b>

            <small>
              Face data is registered
              against the selected
              employee within the
              logged-in company.
            </small>

          </div>

        </div>

      </div>

    </div>
  );
}

function Guide({
  n,
  text,
}: {
  n: string;
  text: string;
}) {
  return (
    <div className="guide-item">
      <b>{n}</b>
      <span>{text}</span>
    </div>
  );
}

function AttendanceView({
  employees,
  attendance,
  loading,
  actionLoading,
  cameraOn,
  scanning,
  scanMessage,
  recognizedEmployee,
  videoRef,
  onStartCamera,
  onStopCamera,
  onScanNow,
  onFaceAction,
  onRefresh,
}: {
  employees: Employee[];
  attendance: Attendance[];
  loading: boolean;
  actionLoading: string | null;
  cameraOn: boolean;
  scanning: boolean;
  scanMessage: string;
  recognizedEmployee: {
    employee_id: string;
    employee_name: string;
    confidence: number;
    message: string;
  } | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onScanNow: () => void;
  onFaceAction: () => void;
  onRefresh: () => void;
}) {
  const getAttendance = (
    employeeId: string
  ) => {
    return attendance.find(
      (record) =>
        String(record.employee_id).toUpperCase() ===
        String(employeeId).toUpperCase()
    );
  };

  const presentCount =
    employees.filter((employee) =>
      Boolean(
        getAttendance(employee.employee_id)
      )
    ).length;

  const completedCount =
    attendance.filter(
      (record) =>
        String(record.status).toLowerCase() ===
        "completed"
    ).length;

  const checkedInCount =
    attendance.filter(
      (record) =>
        record.check_in &&
        !record.check_out
    ).length;

  const absentCount = Math.max(
    employees.length - presentCount,
    0
  );

  return (
    <div className="attendance-page">

      <div className="attendance-hero">
        <div>
          <span className="eyebrow">
            <span />
            LIVE ATTENDANCE
          </span>

          <h2>
            Smart Attendance Center
          </h2>

          <p>
            Start the camera. FaceAttend will recognize
            the employee and automatically perform
            check-in or check-out.
          </p>
        </div>

        <div className="attendance-hero-actions">
          <button
            className={
              cameraOn
                ? "attendance-camera-stop"
                : "attendance-camera-start"
            }
            onClick={
              cameraOn
                ? onStopCamera
                : onStartCamera
            }
          >
            {cameraOn
              ? "■ Stop Camera"
              : "● Start Attendance Camera"}
          </button>

          <button
            className="attendance-refresh-btn"
            onClick={onRefresh}
            disabled={loading}
          >
            ↻ {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="attendance-stat-grid">
        <div className="attendance-stat-card">
          <span>Total Employees</span>
          <strong>{employees.length}</strong>
          <small>Company employees</small>
        </div>

        <div className="attendance-stat-card present-card">
          <span>Present Today</span>
          <strong>{presentCount}</strong>
          <small>Attendance marked</small>
        </div>

        <div className="attendance-stat-card checked-card">
          <span>Currently Working</span>
          <strong>{checkedInCount}</strong>
          <small>Checked in, not out</small>
        </div>

        <div className="attendance-stat-card completed-card">
          <span>Completed</span>
          <strong>{completedCount}</strong>
          <small>Check-out completed</small>
        </div>

        <div className="attendance-stat-card absent-card">
          <span>Not Marked</span>
          <strong>{absentCount}</strong>
          <small>Waiting for recognition</small>
        </div>
      </div>

      <div className="attendance-main-grid">

        <section className="attendance-camera-card">
          <div className="attendance-card-header">
            <div>
              <span className="camera-kicker">
                CAMERA SCANNER
              </span>
              <h3>
                Automatic Face Recognition
              </h3>
              <p>
                Keep one registered employee in front
                of the camera.
              </p>
            </div>

            <span
              className={
                cameraOn
                  ? "camera-live-pill"
                  : "camera-off-pill"
              }
            >
              <i />
              {cameraOn
                ? "LIVE"
                : "OFFLINE"}
            </span>
          </div>

          <div className="attendance-camera-stage">
            {!cameraOn && (
              <div className="attendance-camera-placeholder">
                <div className="attendance-camera-icon">
                  ◎
                </div>

                <h3>
                  Attendance camera is off
                </h3>

                <p>
                  Click <b>Start Attendance Camera</b>
                  to open the webcam and start automatic
                  face scanning.
                </p>

                <button
                  className="attendance-big-start"
                  onClick={onStartCamera}
                >
                  Start Camera
                  <span>→</span>
                </button>
              </div>
            )}

            <video
              ref={videoRef}
              className={
                cameraOn
                  ? "attendance-live-video"
                  : "attendance-live-video hidden"
              }
              muted
              playsInline
            />

            {cameraOn && (
              <>
                <div className="attendance-face-frame">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>

                <div className="attendance-scan-line" />

                <div className="attendance-live-label">
                  <i />
                  LIVE SCANNING
                </div>
              </>
            )}
          </div>

          <div
            className={
              scanning
                ? "attendance-scan-status scanning"
                : "attendance-scan-status"
            }
          >
            <span>
              {scanning ? "◌" : "✓"}
            </span>
            {scanMessage}
          </div>

          {recognizedEmployee && (
            <div className="recognized-employee-card">
              <div className="recognized-avatar">
                {recognizedEmployee.employee_name
                  .slice(0, 1)
                  .toUpperCase()}
              </div>

              <div className="recognized-details">
                <small>
                  EMPLOYEE RECOGNIZED
                </small>

                <strong>
                  {recognizedEmployee.employee_name}
                </strong>

                <span>
                  {recognizedEmployee.employee_id}
                </span>
              </div>

              <div className="confidence-box">
                <strong>
                  {recognizedEmployee.confidence > 0
                    ? `${recognizedEmployee.confidence.toFixed(1)}%`
                    : "MATCH"}
                </strong>
                <small>
                  Confidence
                </small>
              </div>
            </div>
          )}

          <div className="attendance-camera-controls">
            {!cameraOn ? (
              <button
                className="attendance-control-primary"
                onClick={onStartCamera}
              >
                ● Start Camera
              </button>
            ) : (
              <>
                <button
                  className="attendance-control-primary"
                  onClick={onScanNow}
                  disabled={scanning}
                >
                  {scanning
                    ? "Scanning..."
                    : "⌕ Scan Now"}
                </button>

                <button
                  className="attendance-control-secondary"
                  onClick={onStopCamera}
                >
                  Stop Camera
                </button>
              </>
            )}
          </div>

          <div className="attendance-flow">
            <div className="flow-step active">
              <b>01</b>
              <span>Camera</span>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <b>02</b>
              <span>Recognize</span>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <b>03</b>
              <span>Attendance</span>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <b>04</b>
              <span>Done</span>
            </div>
          </div>
        </section>

        <aside className="attendance-side-card">
          <div className="attendance-side-header">
            <div>
              <span className="camera-kicker">
                TODAY
              </span>
              <h3>
                Recognition Status
              </h3>
            </div>

            <span className="live-dot">
              ● LIVE
            </span>
          </div>

          <div className="attendance-status-big">
            <div className="status-ring">
              <span>
                {cameraOn ? "AI" : "—"}
              </span>
            </div>

            <strong>
              {cameraOn
                ? "Scanner Ready"
                : "Scanner Offline"}
            </strong>

            <p>
              {cameraOn
                ? "The system is continuously checking camera frames for registered employees."
                : "Start the camera to enable automatic recognition."}
            </p>
          </div>

          <div className="attendance-rules">
            <div>
              <b>01</b>
              <span>
                First recognition creates
                <strong> Check-In</strong>.
              </span>
            </div>

            <div>
              <b>02</b>
              <span>
                Next recognition after the
                employee leaves creates
                <strong> Check-Out</strong>.
              </span>
            </div>

            <div>
              <b>03</b>
              <span>
                Repeated frames of the same
                person are blocked to prevent
                duplicate attendance.
              </span>
            </div>
          </div>

          <div className="attendance-security">
            <span>🔐</span>
            <div>
              <strong>
                Company scoped
              </strong>
              <small>
                Recognition and attendance are
                processed for the logged-in company.
              </small>
            </div>
          </div>
        </aside>
      </div>

      <section className="panel attendance-panel professional-attendance-table">

        <div className="panel-head">
          <div>
            <h3>
              Today's Attendance Records
            </h3>

            <p className="panel-subtitle">
              Live records from the company attendance engine.
            </p>
          </div>

          <span className="live-tag">
            ● TODAY
          </span>
        </div>

        {loading ? (
          <div className="attendance-loading">
            Loading today's attendance...
          </div>
        ) : employees.length === 0 ? (
          <div className="empty-state">
            No employees available.
          </div>
        ) : (
          <div className="attendance-table">

            <div className="attendance-row attendance-head">
              <span>Employee</span>
              <span>Status</span>
              <span>Check In</span>
              <span>Check Out</span>
              <span>Hours</span>
              <span>Action</span>
            </div>

            {employees.map((employee) => {
              const record =
                getAttendance(
                  employee.employee_id
                );

              const isCompleted =
                Boolean(record?.check_out);

              const isCheckedIn =
                Boolean(
                  record?.check_in &&
                  !record?.check_out
                );

              const isLoading =
                actionLoading ===
                employee.employee_id;

              return (
                <div
                  className="attendance-row"
                  key={employee.employee_id}
                >
                  <span className="attendance-employee">
                    <b className="attendance-avatar">
                      {(employee.full_name || "E")
                        .slice(0, 1)
                        .toUpperCase()}
                    </b>

                    <span>
                      <strong>
                        {employee.full_name}
                      </strong>

                      <small>
                        {employee.employee_code ||
                          employee.employee_id}
                      </small>
                    </span>
                  </span>

                  <span>
                    {isCompleted ? (
                      <span className="attendance-badge completed">
                        ✓ Completed
                      </span>
                    ) : isCheckedIn ? (
                      <span className="attendance-badge checked-in">
                        ● Checked In
                      </span>
                    ) : (
                      <span className="attendance-badge absent">
                        ○ Not Marked
                      </span>
                    )}
                  </span>

                  <span>
                    {record?.check_in
                      ? formatAttendanceTime(
                          record.check_in
                        )
                      : "—"}
                  </span>

                  <span>
                    {record?.check_out
                      ? formatAttendanceTime(
                          record.check_out
                        )
                      : "—"}
                  </span>

                  <span>
                    {record?.total_hours !==
                      null &&
                    record?.total_hours !==
                      undefined
                      ? `${Number(
                          record.total_hours
                        ).toFixed(2)} hrs`
                      : isCheckedIn
                      ? "Working..."
                      : "—"}
                  </span>

                  <span className="attendance-action">
                    {isCompleted ? (
                      <span className="completed-label">
                        Complete
                      </span>
                    ) : (
                      <button
                        className={
                          isCheckedIn
                            ? "checkout-btn"
                            : "checkin-btn"
                        }
                        disabled={isLoading}
                        onClick={onFaceAction}
                        title={
                          isCheckedIn
                            ? "Scan the employee's face to check out"
                            : "Scan the employee's face to check in"
                        }
                      >
                        {isLoading
                          ? "Processing..."
                          : isCheckedIn
                          ? "Scan Face • Check Out"
                          : "Scan Face • Check In"}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="attendance-info-card">
        <div className="attendance-info-icon">
          ⏱
        </div>

        <div>
          <strong>
            Automatic attendance
          </strong>

          <p>
            The camera sends a frame to the face
            recognition API. When a registered employee
            is recognized, the frontend automatically
            calls the attendance API with the recognition
            confidence. The backend decides whether the
            event is Check-In, Check-Out or already
            completed for today.
          </p>
        </div>
      </div>
    </div>
  );
}

function ReportsView({
  employees,
  attendance,
  reportAttendance,
  loading,
  error,
  onRefresh,
}: {
  employees: Employee[];
  attendance: Attendance[];
  reportAttendance: Attendance[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const startDate = new Date(today);
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - 29);

  const employeeKey = (value: string) =>
    String(value || "").toUpperCase();

  const getDateKey = (record: Attendance) => {
    const raw = record.attendance_date || record.check_in;
    if (!raw) return "";

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "";

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  };

  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  // ============================================================
  // 1. TODAY ATTENDANCE
  // ============================================================

  const todayRecords = attendance.filter(
    (record) => getDateKey(record) === todayKey
  );

  const todayEmployeeIds = new Set(
    todayRecords.map((record) => employeeKey(record.employee_id))
  );

  const todayPresent = todayEmployeeIds.size;
  const todayAbsent = Math.max(
    employees.length - todayPresent,
    0
  );

  const todayWorking = todayRecords.filter(
    (record) => Boolean(record.check_in && !record.check_out)
  ).length;

  const todayCompleted = todayRecords.filter(
    (record) =>
      Boolean(record.check_out) ||
      String(record.status || "").toLowerCase() === "completed"
  ).length;

  const todayHours = todayRecords.reduce(
    (sum, record) =>
      sum + Number(record.total_hours || 0),
    0
  );

  // ============================================================
  // 2. LAST 30 DAYS
  // ============================================================

  const presentEntries = reportAttendance.filter((record) =>
    Boolean(record.employee_id && getDateKey(record))
  );

  const presentDays = new Set(
    presentEntries.map(
      (record) =>
        `${employeeKey(record.employee_id)}-${getDateKey(record)}`
    )
  );

  const completed30 = reportAttendance.filter(
    (record) =>
      Boolean(record.check_out) ||
      String(record.status || "").toLowerCase() === "completed"
  ).length;

  const totalEmployeeDays = employees.length * 30;
  const presentCount = presentDays.size;
  const absentCount = Math.max(
    totalEmployeeDays - presentCount,
    0
  );

  const rate = totalEmployeeDays
    ? Math.round(
        (presentCount / totalEmployeeDays) * 100
      )
    : 0;

  const totalHours30 = reportAttendance.reduce(
    (sum, record) =>
      sum + Number(record.total_hours || 0),
    0
  );

  const averageHours = completed30
    ? totalHours30 / completed30
    : 0;

  const dailyRows = Array.from(
    { length: 30 },
    (_, index) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);

      const key = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");

      const dayAttendance = reportAttendance.filter(
        (record) => getDateKey(record) === key
      );

      const uniqueEmployees = new Set(
        dayAttendance.map((record) =>
          employeeKey(record.employee_id)
        )
      );

      const completedDay = dayAttendance.filter(
        (record) => Boolean(record.check_out)
      ).length;

      const hours = dayAttendance.reduce(
        (sum, record) =>
          sum + Number(record.total_hours || 0),
        0
      );

      return {
        key,
        date,
        present: uniqueEmployees.size,
        absent: Math.max(
          employees.length - uniqueEmployees.size,
          0
        ),
        completed: completedDay,
        hours,
      };
    }
  ).reverse();

  // ============================================================
  // 3. COMPANY EMPLOYEE DATA
  // ============================================================

  const activeEmployees = employees.filter(
    (employee) => employee.is_active !== false
  );

  // ============================================================
  // REPORT SEARCH + VIEW MORE
  // ============================================================

  const [todaySearch, setTodaySearch] = useState("");
  const [thirtyDaySearch, setThirtyDaySearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");

  const [showMoreToday, setShowMoreToday] = useState(false);
  const [showMoreHistory, setShowMoreHistory] = useState(false);
  const [showMoreCompany, setShowMoreCompany] = useState(false);

  const matchesEmployee = (employee: Employee, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [
      employee.full_name,
      employee.employee_code,
      employee.employee_id,
      employee.email,
      employee.phone,
      employee.department_name,
      employee.designation,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
  };

  const filteredTodayEmployees = employees.filter((employee) => matchesEmployee(employee, todaySearch));
  const filteredCompanyEmployees = employees.filter((employee) => matchesEmployee(employee, companySearch));

  const filteredThirtyDayHistory = presentEntries.filter((record) => {
    const q = thirtyDaySearch.trim().toLowerCase();
    if (!q) return true;
    return [record.employee_name, record.employee_id, record.attendance_date, record.status]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
  });

  const visibleTodayEmployees = todaySearch.trim() || showMoreToday ? filteredTodayEmployees : filteredTodayEmployees.slice(0, 2);
  const visibleThirtyDayHistory = thirtyDaySearch.trim() || showMoreHistory ? filteredThirtyDayHistory : filteredThirtyDayHistory.slice(0, 2);
  const visibleCompanyEmployees = companySearch.trim() || showMoreCompany ? filteredCompanyEmployees : filteredCompanyEmployees.slice(0, 2);

  const faceRegistered = activeEmployees.filter(
    (employee) => Boolean(employee.face_registered)
  ).length;

  const facePending = Math.max(
    activeEmployees.length - faceRegistered,
    0
  );

  return (
    <div className="reports-page">

      {/* ====================================================== */}
      {/* REPORT HEADER */}
      {/* ====================================================== */}

      <div className="reports-header">
        <div>
          <span className="eyebrow">
            <span />
            HR REPORTS
          </span>

          <h2>
            Workforce & Attendance Reports
          </h2>

          <p>
            Today's live attendance, 30-day attendance history,
            and complete company employee information.
          </p>
        </div>

        <button
          className="small-btn"
          onClick={onRefresh}
          disabled={loading}
        >
          ↻ {loading ? "Loading..." : "Refresh Reports"}
        </button>
      </div>

      {error && (
        <div className="form-error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="panel">
          <div className="empty-state">
            Loading HR reports...
          </div>
        </div>
      ) : (
        <>

          {/* ================================================== */}
          {/* 1. TODAY'S ATTENDANCE */}
          {/* ================================================== */}

          <section className="report-section">
            <div className="report-section-heading">
              <div>
                <span className="eyebrow">
                  <span />
                  01 · TODAY
                </span>
                <h3>
                  Today's Attendance
                </h3>
                <p>
                  Current attendance status of every employee in the company.
                </p>
              </div>

              <span className="live-tag">
                ● LIVE
              </span>
            </div>

            <div className="report-grid">
              <Stat
                label="Total Employees"
                value={String(employees.length)}
                note="Company employees"
              />
              <Stat
                label="Present Today"
                value={String(todayPresent)}
                note="Attendance marked"
              />
              <Stat
                label="Absent Today"
                value={String(todayAbsent)}
                note="Not marked today"
              />
              <Stat
                label="Working Now"
                value={String(todayWorking)}
                note="Checked in"
              />
              <Stat
                label="Completed"
                value={String(todayCompleted)}
                note="Checked out"
              />
              <Stat
                label="Today's Hours"
                value={todayHours.toFixed(2)}
                note="Completed shift hours"
              />
            </div>

            <div className="panel reports-table-panel">
              <div className="panel-head">
                <div>
                  <h3>
                    Today's Employee Status
                  </h3>
                  <p className="panel-subtitle">
                    Check-in, check-out and current working status.
                  </p>
                </div>
              </div>


              <ReportSearch
                value={todaySearch}
                onChange={setTodaySearch}
                placeholder="Search today's employee..."
              />

              <div className="reports-table">
                <div className="reports-row reports-head">
                  <span>Employee</span>
                  <span>Status</span>
                  <span>Check In</span>
                  <span>Check Out</span>
                  <span>Hours</span>
                </div>

                {employees.length === 0 ? (
                  <div className="empty-state">
                    No employees found.
                  </div>
                ) : (
                  visibleTodayEmployees.map((employee) => {
                    const record = todayRecords.find(
                      (item) =>
                        employeeKey(item.employee_id) ===
                        employeeKey(employee.employee_id)
                    );

                    const status = record?.check_out
                      ? "Completed"
                      : record?.check_in
                      ? "Working"
                      : "Absent";

                    return (
                      <div
                        className="reports-row"
                        key={`today-${employee.employee_id}`}
                      >
                        <span>
                          <strong>
                            {employee.full_name}
                          </strong>
                          <small>
                            {employee.employee_code ||
                              employee.employee_id}
                          </small>
                        </span>

                        <span>
                          {status}
                        </span>

                        <span>
                          {record?.check_in
                            ? formatAttendanceTime(
                                record.check_in
                              )
                            : "—"}
                        </span>

                        <span>
                          {record?.check_out
                            ? formatAttendanceTime(
                                record.check_out
                              )
                            : "—"}
                        </span>

                        <span>
                          {record?.total_hours != null
                            ? `${Number(
                                record.total_hours
                              ).toFixed(2)} hrs`
                            : record?.check_in
                            ? "Working..."
                            : "—"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <ReportViewMore
                shown={visibleTodayEmployees.length}
                total={filteredTodayEmployees.length}
                expanded={showMoreToday}
                onClick={() => setShowMoreToday((value) => !value)}
              />
            </div>
          </section>

          {/* ================================================== */}
          {/* 2. 30-DAY DATA */}
          {/* ================================================== */}

          <section className="report-section">
            <div className="report-section-heading">
              <div>
                <span className="eyebrow">
                  <span />
                  02 · LAST 30 DAYS
                </span>
                <h3>
                  30-Day Attendance Data
                </h3>
                <p>
                  Employee attendance history for the latest 30 calendar days, including today.
                </p>
              </div>
            </div>

            <div className="report-grid">
              <Stat
                label="Attendance Rate"
                value={`${rate}%`}
                note="Last 30 days"
              />
              <Stat
                label="Present Entries"
                value={String(presentCount)}
                note="Employee-days marked"
              />
              <Stat
                label="Absent Entries"
                value={String(absentCount)}
                note="Employee-days not marked"
              />
              <Stat
                label="Completed Shifts"
                value={String(completed30)}
                note="Check-out completed"
              />
              <Stat
                label="Total Hours"
                value={totalHours30.toFixed(2)}
                note="Last 30 days"
              />
              <Stat
                label="Average Hours"
                value={averageHours.toFixed(2)}
                note="Per completed shift"
              />
            </div>

            <div className="panel reports-table-panel">
              <div className="panel-head">
                <div>
                  <h3>
                    Daily Attendance — Last 30 Days
                  </h3>
                  <p className="panel-subtitle">
                    Daily present, absent, completed and working-hour totals.
                  </p>
                </div>
              </div>


              <DailyAttendanceChart days={dailyRows} />
            </div>

            <div className="panel reports-table-panel">
              <div className="panel-head">
                <div>
                  <h3>
                    Employee 30-Day History
                  </h3>
                  <p className="panel-subtitle">
                    Every attendance record received during the 30-day period.
                  </p>
                </div>
              </div>


              <ReportSearch
                value={thirtyDaySearch}
                onChange={setThirtyDaySearch}
                placeholder="Search employee in 30-day history..."
              />

              <div className="reports-table">
                <div className="reports-row reports-head employee-history-row">
                  <span>Employee</span>
                  <span>Date</span>
                  <span>Check In</span>
                  <span>Check Out</span>
                  <span>Status</span>
                  <span>Hours</span>
                </div>

                {presentEntries.length === 0 ? (
                  <div className="empty-state">
                    No attendance records found in the last 30 days.
                  </div>
                ) : (
                  visibleThirtyDayHistory
                    .slice()
                    .sort((a, b) => {
                      const da = new Date(
                        a.attendance_date ||
                          a.check_in ||
                          0
                      ).getTime();
                      const db = new Date(
                        b.attendance_date ||
                          b.check_in ||
                          0
                      ).getTime();
                      return db - da;
                    })
                    .map((record, index) => (
                      <div
                        className="reports-row employee-history-row"
                        key={`${employeeKey(
                          record.employee_id
                        )}-${getDateKey(
                          record
                        )}-${index}`}
                      >
                        <span>
                          <strong>
                            {record.employee_name ||
                              record.employee_id}
                          </strong>
                          <small>
                            {record.employee_id}
                          </small>
                        </span>
                        <span>
                          {record.attendance_date
                            ? new Date(
                                record.attendance_date
                              ).toLocaleDateString()
                            : record.check_in
                            ? new Date(
                                record.check_in
                              ).toLocaleDateString()
                            : "—"}
                        </span>
                        <span>
                          {record.check_in
                            ? formatAttendanceTime(
                                record.check_in
                              )
                            : "—"}
                        </span>
                        <span>
                          {record.check_out
                            ? formatAttendanceTime(
                                record.check_out
                              )
                            : "—"}
                        </span>
                        <span>
                          {record.check_out
                            ? "Completed"
                            : record.check_in
                            ? "Checked In"
                            : "Absent"}
                        </span>
                        <span>
                          {record.total_hours != null
                            ? `${Number(
                                record.total_hours
                              ).toFixed(2)} hrs`
                            : record.check_in
                            ? "Working..."
                            : "—"}
                        </span>
                      </div>
                    ))
                )}
              </div>

              <ReportViewMore
                shown={visibleThirtyDayHistory.length}
                total={filteredThirtyDayHistory.length}
                expanded={showMoreHistory}
                onClick={() => setShowMoreHistory((value) => !value)}
              />
            </div>
          </section>

          {/* ================================================== */}
          {/* 3. COMPANY EMPLOYEE DATA */}
          {/* ================================================== */}

          <section className="report-section">
            <div className="report-section-heading">
              <div>
                <span className="eyebrow">
                  <span />
                  03 · COMPANY
                </span>
                <h3>
                  Company Employee Directory
                </h3>
                <p>
                  Complete employee information for this company.
                </p>
              </div>
            </div>

            <div className="report-grid">
              <Stat
                label="Total Employees"
                value={String(employees.length)}
                note="Company total"
              />
              <Stat
                label="Active Employees"
                value={String(activeEmployees.length)}
                note="Currently active"
              />
              <Stat
                label="Inactive Employees"
                value={String(
                  Math.max(
                    employees.length - activeEmployees.length,
                    0
                  )
                )}
                note="Not active"
              />
              <Stat
                label="Face Registered"
                value={String(faceRegistered)}
                note="Ready for recognition"
              />
              <Stat
                label="Face Pending"
                value={String(facePending)}
                note="Needs registration"
              />
            </div>

            <div className="panel reports-table-panel">
              <div className="panel-head">
                <div>
                  <h3>
                    All Company Employees
                  </h3>
                  <p className="panel-subtitle">
                    Employee profile, department, designation and face-registration status.
                  </p>
                </div>
              </div>


              <ReportSearch
                value={companySearch}
                onChange={setCompanySearch}
                placeholder="Search employee, department, email or phone..."
              />

              <div className="reports-table">
                <div className="reports-row reports-head company-directory-row">
                  <span>Employee</span>
                  <span>Department</span>
                  <span>Designation</span>
                  <span>Email</span>
                  <span>Phone</span>
                  <span>Face</span>
                </div>

                {employees.length === 0 ? (
                  <div className="empty-state">
                    No company employees found.
                  </div>
                ) : (
                  visibleCompanyEmployees.map((employee) => (
                    <div
                      className="reports-row company-directory-row"
                      key={`company-${employee.employee_id}`}
                    >
                      <span>
                        <strong>
                          {employee.full_name}
                        </strong>
                        <small>
                          {employee.employee_code ||
                            employee.employee_id}
                        </small>
                      </span>
                      <span>
                        {employee.department_name ||
                          "—"}
                      </span>
                      <span>
                        {employee.designation ||
                          "—"}
                      </span>
                      <span>
                        {employee.email || "—"}
                      </span>
                      <span>
                        {employee.phone || "—"}
                      </span>
                      <span>
                        {employee.face_registered
                          ? "✓ Registered"
                          : "○ Pending"}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <ReportViewMore
                shown={visibleCompanyEmployees.length}
                total={filteredCompanyEmployees.length}
                expanded={showMoreCompany}
                onClick={() => setShowMoreCompany((value) => !value)}
              />
            </div>
          </section>

        </>
      )}
    </div>
  );
}

function DailyAttendanceChart({ days }: { days: DailyAttendanceDay[] }) {
  const [showAllDays, setShowAllDays] = useState(false);
  const visibleDays = showAllDays ? days : days.slice(0, 2);

  const width = 1000;
  const height = 340;
  const left = 54;
  const right = 20;
  const top = 28;
  const bottom = 54;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  const maxCount = Math.max(
    ...days.map((day) => Math.max(day.present, day.absent, day.completed)),
    1
  );
  const maxHours = Math.max(...days.map((day) => Number(day.hours || 0)), 1);
  const countStep = maxCount <= 5 ? 1 : Math.ceil(maxCount / 5);
  const countMax = Math.max(countStep * 5, 5);

  const x = (index: number) =>
    left + (days.length <= 1 ? chartWidth / 2 : (index / (days.length - 1)) * chartWidth);
  const yCount = (value: number) =>
    top + chartHeight - (value / countMax) * chartHeight;
  const yHours = (value: number) =>
    top + chartHeight - (value / maxHours) * chartHeight;

  const makePath = (key: "present" | "absent" | "completed") =>
    days
      .map((day, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${yCount(Number(day[key] || 0)).toFixed(2)}`)
      .join(" ");

  const hoursPath = days
    .map((day, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${yHours(Number(day.hours || 0)).toFixed(2)}`)
    .join(" ");

  const labelIndexes = days.length
    ? Array.from(new Set([0, Math.floor((days.length - 1) / 4), Math.floor((days.length - 1) / 2), Math.floor(((days.length - 1) * 3) / 4), days.length - 1]))
    : [];

  return (
    <div className="daily-attendance-chart">
      <div className="daily-chart-legend">
        <span><i className="chart-dot chart-present" /> Present</span>
        <span><i className="chart-dot chart-absent" /> Absent</span>
        <span><i className="chart-dot chart-completed" /> Completed</span>
        <span><i className="chart-dot chart-hours" /> Working hours</span>
      </div>

      <div className="daily-chart-scroll">
        <svg
          className="daily-chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Daily attendance trend for the last 30 days"
          preserveAspectRatio="none"
        >
          {Array.from({ length: 6 }, (_, index) => {
            const value = countMax - index * countStep;
            const y = yCount(value);
            return (
              <g key={`grid-${value}`}>
                <line x1={left} y1={y} x2={width - right} y2={y} className="chart-grid-line" />
                <text x={left - 10} y={y + 4} textAnchor="end" className="chart-axis-label">
                  {Math.max(value, 0)}
                </text>
              </g>
            );
          })}

          <path d={makePath("present")} className="chart-line chart-present-line" />
          <path d={makePath("absent")} className="chart-line chart-absent-line" />
          <path d={makePath("completed")} className="chart-line chart-completed-line" />
          <path d={hoursPath} className="chart-line chart-hours-line" />

          {days.map((day, index) => (
            <g key={day.key}>
              <circle cx={x(index)} cy={yCount(day.present)} r="3.2" className="chart-point chart-present-point" />
              <circle cx={x(index)} cy={yCount(day.absent)} r="3.2" className="chart-point chart-absent-point" />
              <circle cx={x(index)} cy={yCount(day.completed)} r="3.2" className="chart-point chart-completed-point" />
              <circle cx={x(index)} cy={yHours(Number(day.hours || 0))} r="3.2" className="chart-point chart-hours-point" />
            </g>
          ))}

          {labelIndexes.map((index) => (
            <text key={`label-${index}`} x={x(index)} y={height - 20} textAnchor="middle" className="chart-date-label">
              {days[index].date.toLocaleDateString([], { day: "2-digit", month: "short" })}
            </text>
          ))}
        </svg>
      </div>

      <div className="daily-chart-summary">
        {visibleDays.map((day) => (
          <div className="daily-chart-summary-item" key={`summary-${day.key}`}>
            <strong>{day.date.toLocaleDateString([], { day: "2-digit", month: "short" })}</strong>
            <span>{day.present} present</span>
            <span>{day.absent} absent</span>
            <span>{day.completed} completed</span>
            <span>{Number(day.hours || 0).toFixed(2)} hrs</span>
          </div>
        ))}
      </div>

      {days.length > 2 && (
        <div className="report-view-more-wrap daily-chart-view-more">
          <button
            type="button"
            className="report-view-more"
            onClick={() => setShowAllDays((value) => !value)}
          >
            {showAllDays ? "Show less ↑" : `View more (${days.length - 2} more) ↓`}
          </button>
        </div>
      )}
    </div>
  );
}

function ReportSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="report-search-bar">
      <span>⌕</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button type="button" onClick={() => onChange("")}>
          ×
        </button>
      )}
    </div>
  );
}

function ReportViewMore({
  shown,
  total,
  expanded,
  onClick,
}: {
  shown: number;
  total: number;
  expanded: boolean;
  onClick: () => void;
}) {
  if (total <= 2) return null;

  return (
    <div className="report-view-more-wrap">
      <button
        type="button"
        className="report-view-more"
        onClick={onClick}
      >
        {expanded ? "Show less ↑" : `View more (${total - shown} more) ↓`}
      </button>
    </div>
  );
}

function formatAttendanceTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
