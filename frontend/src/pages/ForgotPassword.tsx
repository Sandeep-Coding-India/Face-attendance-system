import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api";

type RecoveryMode = "password" | "login_id";
type RecoveryMethod = "email" | "phone";

type Step = 1 | 2 | 3;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialMode =
    searchParams.get("mode") === "login-id"
      ? "login_id"
      : "password";

  const [mode, setMode] =
    useState<RecoveryMode>(initialMode);

  const [step, setStep] =
    useState<Step>(1);

  const [companyId, setCompanyId] =
    useState("");

  const [recoveryMethod, setRecoveryMethod] =
    useState<RecoveryMethod>("email");

  const [recoveryValue, setRecoveryValue] =
    useState("");

  const [otp, setOtp] =
    useState("");

  const [resetToken, setResetToken] =
    useState("");

  const [newPassword, setNewPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [verifiedLoginId, setVerifiedLoginId] =
    useState("");

  const [resendSeconds, setResendSeconds] =
    useState(0);


  // ============================================================
  // HELPERS
  // ============================================================

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };


  const getErrorMessage = (err: any) => {
    if (!err) {
      return "Something went wrong.";
    }

    if (typeof err.message === "string") {
      return err.message;
    }

    return "Something went wrong. Please try again.";
  };


  const normalizePhone = (value: string) => {
    return value
      .trim()
      .replace(/\s+/g, "")
      .replace(/-/g, "");
  };


  const validateContact = () => {
    if (!companyId.trim()) {
      setError("Please enter your Company ID.");
      return false;
    }

    if (!recoveryValue.trim()) {
      setError(
        recoveryMethod === "email"
          ? "Please enter your registered email."
          : "Please enter your registered phone number."
      );
      return false;
    }

    if (recoveryMethod === "email") {
      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(recoveryValue.trim())) {
        setError("Please enter a valid email address.");
        return false;
      }
    }

    if (recoveryMethod === "phone") {
      const phone = normalizePhone(recoveryValue);

      if (phone.length < 10) {
        setError("Please enter a valid phone number.");
        return false;
      }
    }

    return true;
  };


  // ============================================================
  // REQUEST OTP
  // ============================================================

  const requestOTP = async (
    event?: FormEvent
  ) => {
    event?.preventDefault();

    clearMessages();

    if (!validateContact()) {
      return;
    }

    setLoading(true);

    try {
      const payload = {
        company_id: companyId.trim().toUpperCase(),
        recovery_method: recoveryMethod,
        recovery_value:
          recoveryMethod === "phone"
            ? normalizePhone(recoveryValue)
            : recoveryValue.trim().toLowerCase(),
      };

      const endpoint =
        mode === "password"
          ? "/auth/forgot-password/request-otp"
          : "/auth/forgot-password/login-id/request-otp";

      const data = await apiRequest(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      setSuccess(
        data?.message ||
          "OTP has been sent successfully."
      );

      setStep(2);

      setResendSeconds(60);

      startResendTimer();

    } catch (err: any) {
      setError(
        getErrorMessage(err)
      );
    } finally {
      setLoading(false);
    }
  };


  // ============================================================
  // RESEND TIMER
  // ============================================================

  const startResendTimer = () => {
    let seconds = 60;

    const timer = window.setInterval(() => {
      seconds -= 1;

      setResendSeconds(seconds);

      if (seconds <= 0) {
        window.clearInterval(timer);
      }
    }, 1000);
  };


  // ============================================================
  // VERIFY OTP
  // ============================================================

  const verifyOTP = async (
    event?: FormEvent
  ) => {
    event?.preventDefault();

    clearMessages();

    if (!otp.trim()) {
      setError("Please enter the OTP.");
      return;
    }

    if (!/^\d{6}$/.test(otp.trim())) {
      setError("OTP must contain 6 digits.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        company_id:
          companyId.trim().toUpperCase(),

        recovery_method:
          recoveryMethod,

        recovery_value:
          recoveryMethod === "phone"
            ? normalizePhone(recoveryValue)
            : recoveryValue.trim().toLowerCase(),

        otp: otp.trim(),
      };

      const endpoint =
        mode === "password"
          ? "/auth/forgot-password/verify-otp"
          : "/auth/forgot-password/login-id/verify-otp";

      const data = await apiRequest(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      // --------------------------------------------------------
      // PASSWORD RECOVERY
      // --------------------------------------------------------

      if (mode === "password") {
        const token =
          data?.reset_token ||
          data?.token ||
          "";

        if (!token) {
          throw new Error(
            "OTP verified, but reset token was not received from the server."
          );
        }

        setResetToken(token);

        setSuccess(
          "OTP verified successfully. You can now create a new password."
        );

        setStep(3);
      }

      // --------------------------------------------------------
      // LOGIN ID RECOVERY
      // --------------------------------------------------------

      else {
        const loginId =
          data?.login_id ||
          data?.unique_login_id ||
          data?.user?.login_id ||
          "";

        if (loginId) {
          setVerifiedLoginId(loginId);
        }

        setSuccess(
          data?.message ||
            "OTP verified successfully."
        );

        /*
         * Login ID recovery does not need password reset.
         * We keep the user on step 2 and show the recovered ID.
         */
      }

    } catch (err: any) {
      setError(
        getErrorMessage(err)
      );
    } finally {
      setLoading(false);
    }
  };


  // ============================================================
  // RESET PASSWORD
  // ============================================================

  const resetPassword = async (
    event: FormEvent
  ) => {
    event.preventDefault();

    clearMessages();

    if (!newPassword) {
      setError("Please enter a new password.");
      return;
    }

    if (newPassword.length < 8) {
      setError(
        "Password must be at least 8 characters long."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(
        "New password and confirm password do not match."
      );
      return;
    }

    if (!resetToken) {
      setError(
        "Reset token is missing. Please verify the OTP again."
      );
      return;
    }

    setLoading(true);

    try {
      /*
       * IMPORTANT:
       *
       * Backend requires ALL of these fields:
       *
       * company_id
       * recovery_method
       * recovery_value
       * otp
       * reset_token
       * new_password
       *
       * Earlier frontend was only sending:
       * reset_token + new_password
       *
       * That was causing HTTP 422.
       */

      const payload = {
        company_id:
          companyId.trim().toUpperCase(),

        recovery_method:
          recoveryMethod,

        recovery_value:
          recoveryMethod === "phone"
            ? normalizePhone(recoveryValue)
            : recoveryValue.trim().toLowerCase(),

        otp: otp.trim(),

        reset_token:
          resetToken,

        new_password:
          newPassword,
      };

      const data = await apiRequest(
        "/auth/forgot-password/reset",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      setSuccess(
        data?.message ||
          "Password reset successfully."
      );

      setNewPassword("");
      setConfirmPassword("");

      /*
       * Give the user a moment to see the success message,
       * then return to login.
       */

      window.setTimeout(() => {
        navigate("/login", {
          state: {
            companyId:
              companyId.trim().toUpperCase(),
          },
        });
      }, 1500);

    } catch (err: any) {
      setError(
        getErrorMessage(err)
      );
    } finally {
      setLoading(false);
    }
  };


  // ============================================================
  // SWITCH MODE
  // ============================================================

  const switchMode = (
    nextMode: RecoveryMode
  ) => {
    setMode(nextMode);

    setStep(1);

    clearMessages();

    setOtp("");
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setVerifiedLoginId("");

    const url =
      nextMode === "login_id"
        ? "/forgot-password?mode=login-id"
        : "/forgot-password";

    window.history.replaceState(
      {},
      "",
      url
    );
  };


  // ============================================================
  // BACK
  // ============================================================

  const goBack = () => {
    if (step === 1) {
      navigate("/login");
      return;
    }

    if (step === 2) {
      setStep(1);
      setOtp("");
      clearMessages();
      return;
    }

    if (step === 3) {
      setStep(2);
      setResetToken("");
      clearMessages();
    }
  };


  // ============================================================
  // UI
  // ============================================================

  return (
    <main className="auth-page">

      <div className="auth-glow" />

      {/* BACK BUTTON */}

      <button
        className="back-btn"
        onClick={goBack}
        type="button"
      >
        ← Back
      </button>


      <div className="login-shell">

        {/* BRAND */}

        <div className="login-brand">

          <button
            className="brand light"
            onClick={() => navigate("/")}
            type="button"
          >
            <span className="brand-mark">
              FA
            </span>

            <span>
              <strong>
                FaceAttend
              </strong>

              <small>
                Secure workspace
              </small>
            </span>

          </button>

        </div>


        {/* CARD */}

        <section className="login-card recovery-card">

          {/* ICON */}

          <div className="login-icon">
            {mode === "password"
              ? "🔒"
              : "🔑"}
          </div>


          {/* EYEBROW */}

          <div className="eyebrow centered">
            <span />
            ACCOUNT RECOVERY
          </div>


          {/* TITLE */}

          <h1>
            {mode === "password"
              ? "Forgot Password?"
              : "Forgot Login ID?"}
          </h1>


          <p className="login-subtitle">
            {mode === "password"
              ? "Recover your account securely using your registered email or phone."
              : "Recover your unique Login ID using your registered email or phone."}
          </p>


          {/* MODE SWITCH */}

          <div
            className="recovery-mode-switch"
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: "10px",
              marginBottom: "28px",
            }}
          >

            <button
              type="button"
              onClick={() =>
                switchMode("password")
              }
              className={
                mode === "password"
                  ? "primary-btn"
                  : "secondary-btn"
              }
            >
              🔒 Forgot Password
            </button>

            <button
              type="button"
              onClick={() =>
                switchMode("login_id")
              }
              className={
                mode === "login_id"
                  ? "primary-btn"
                  : "secondary-btn"
              }
            >
              🔑 Forgot Login ID
            </button>

          </div>


          {/* STEPS */}

          <div className="recovery-steps">

            <div
              className={
                step >= 1
                  ? "recovery-step active"
                  : "recovery-step"
              }
            >
              <span>1</span>
              <small>Contact</small>
            </div>

            <div
              className={
                step >= 2
                  ? "recovery-step active"
                  : "recovery-step"
              }
            >
              <span>2</span>
              <small>OTP</small>
            </div>

            <div
              className={
                step >= 3
                  ? "recovery-step active"
                  : "recovery-step"
              }
            >
              <span>3</span>

              <small>
                {mode === "password"
                  ? "Password"
                  : "Login ID"}
              </small>

            </div>

          </div>


          {/* ERROR */}

          {error && (
            <div className="form-error">
              {error}
            </div>
          )}


          {/* SUCCESS */}

          {success && (
            <div
              className="form-success"
              style={{
                marginBottom: "20px",
              }}
            >
              {success}
            </div>
          )}


          {/* ====================================================
              STEP 1
          ==================================================== */}

          {step === 1 && (

            <form onSubmit={requestOTP}>

              <label>
                Company ID

                <input
                  value={companyId}
                  onChange={(e) =>
                    setCompanyId(
                      e.target.value.toUpperCase()
                    )
                  }
                  placeholder="CMP-XXXXXXXX"
                  required
                />

              </label>


              {/* METHOD */}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: "12px",
                  marginBottom: "18px",
                }}
              >

                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMethod("email");
                    setRecoveryValue("");
                    clearMessages();
                  }}
                  className={
                    recoveryMethod === "email"
                      ? "primary-btn"
                      : "secondary-btn"
                  }
                >
                  Email
                </button>


                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMethod("phone");
                    setRecoveryValue("");
                    clearMessages();
                  }}
                  className={
                    recoveryMethod === "phone"
                      ? "primary-btn"
                      : "secondary-btn"
                  }
                >
                  Phone
                </button>

              </div>


              {/* CONTACT */}

              <label>

                {recoveryMethod === "email"
                  ? "Registered Email"
                  : "Registered Phone Number"}

                <input
                  type={
                    recoveryMethod === "email"
                      ? "email"
                      : "tel"
                  }
                  value={recoveryValue}
                  onChange={(e) =>
                    setRecoveryValue(
                      e.target.value
                    )
                  }
                  placeholder={
                    recoveryMethod === "email"
                      ? "your@email.com"
                      : "9876543210"
                  }
                  required
                />

              </label>


              {/* SEND OTP */}

              <button
                className="primary-btn full"
                type="submit"
                disabled={
                  loading ||
                  resendSeconds > 0
                }
              >

                {loading
                  ? "Sending OTP..."
                  : resendSeconds > 0
                  ? `Resend in ${resendSeconds}s`
                  : "Send OTP"}

                {!loading &&
                  resendSeconds === 0 && (
                    <span>→</span>
                  )}

              </button>


              {/* INFO */}

              <div className="login-help">

                <span>🔐</span>

                <div>
                  <b>
                    Secure recovery
                  </b>

                  <small>
                    OTP is valid for a limited
                    time and can only be used
                    for this account.
                  </small>
                </div>

              </div>

            </form>
          )}


          {/* ====================================================
              STEP 2
          ==================================================== */}

          {step === 2 && (

            <form onSubmit={verifyOTP}>

              <div className="otp-contact-info">

                <span>
                  OTP sent to
                </span>

                <strong>
                  {recoveryMethod === "email"
                    ? recoveryValue
                    : recoveryValue}
                </strong>

              </div>


              <label>

                Verification OTP

                <input
                  value={otp}
                  onChange={(e) =>
                    setOtp(
                      e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6)
                    )
                  }
                  placeholder="Enter 6-digit OTP"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  required
                />

              </label>


              <button
                className="primary-btn full"
                type="submit"
                disabled={loading}
              >

                {loading
                  ? "Verifying..."
                  : "Verify OTP"}

                {!loading && (
                  <span>→</span>
                )}

              </button>


              <button
                type="button"
                className="register-link"
                disabled={
                  loading ||
                  resendSeconds > 0
                }
                onClick={() =>
                  requestOTP()
                }
              >

                {resendSeconds > 0
                  ? `Resend OTP in ${resendSeconds}s`
                  : "Didn't receive OTP? Resend"}

              </button>

            </form>
          )}


          {/* ====================================================
              LOGIN ID RESULT
          ==================================================== */}

          {step === 2 &&
            mode === "login_id" &&
            verifiedLoginId && (

              <div
                style={{
                  marginTop: "24px",
                  padding: "22px",
                  borderRadius: "16px",
                  background:
                    "rgba(30, 120, 255, 0.10)",
                  border:
                    "1px solid rgba(80, 150, 255, 0.30)",
                  textAlign: "center",
                }}
              >

                <div
                  style={{
                    fontSize: "14px",
                    opacity: 0.7,
                    marginBottom: "8px",
                  }}
                >
                  Your Unique Login ID
                </div>

                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 800,
                    letterSpacing: "1px",
                  }}
                >
                  {verifiedLoginId}
                </div>

                <button
                  type="button"
                  className="primary-btn full"
                  style={{
                    marginTop: "20px",
                  }}
                  onClick={() =>
                    navigate("/login", {
                      state: {
                        companyId:
                          companyId
                            .trim()
                            .toUpperCase(),
                        loginId:
                          verifiedLoginId,
                      },
                    })
                  }
                >
                  Continue to Login →
                </button>

              </div>
            )}


          {/* ====================================================
              STEP 3 PASSWORD
          ==================================================== */}

          {step === 3 &&
            mode === "password" && (

              <form onSubmit={resetPassword}>

                <div
                  className="otp-contact-info"
                  style={{
                    marginBottom: "22px",
                  }}
                >

                  <span>
                    Identity verified
                  </span>

                  <strong>
                    Create a new password
                    for your account.
                  </strong>

                </div>


                {/* NEW PASSWORD */}

                <label>

                  New Password

                  <div className="password-wrap">

                    <input
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      value={newPassword}
                      onChange={(e) =>
                        setNewPassword(
                          e.target.value
                        )
                      }
                      placeholder="Enter new password"
                      required
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          !showPassword
                        )
                      }
                    >
                      {showPassword
                        ? "Hide"
                        : "Show"}
                    </button>

                  </div>

                </label>


                {/* CONFIRM PASSWORD */}

                <label>

                  Confirm New Password

                  <div className="password-wrap">

                    <input
                      type={
                        showConfirmPassword
                          ? "text"
                          : "password"
                      }
                      value={confirmPassword}
                      onChange={(e) =>
                        setConfirmPassword(
                          e.target.value
                        )
                      }
                      placeholder="Confirm new password"
                      required
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(
                          !showConfirmPassword
                        )
                      }
                    >
                      {showConfirmPassword
                        ? "Hide"
                        : "Show"}
                    </button>

                  </div>

                </label>


                {/* PASSWORD RULE */}

                <div
                  className="login-help"
                  style={{
                    marginBottom: "20px",
                  }}
                >

                  <span>🔐</span>

                  <div>

                    <b>
                      Password security
                    </b>

                    <small>
                      Use at least 8 characters.
                      Avoid using easily
                      guessable information.
                    </small>

                  </div>

                </div>


                {/* RESET */}

                <button
                  className="primary-btn full"
                  type="submit"
                  disabled={loading}
                >

                  {loading
                    ? "Resetting Password..."
                    : "Reset Password"}

                  {!loading && (
                    <span>→</span>
                  )}

                </button>

              </form>
            )}


          {/* FOOTER */}

          <button
            className="register-link"
            type="button"
            onClick={() =>
              navigate("/login")
            }
            style={{
              marginTop: "24px",
            }}
          >
            Remember your credentials?
            <strong>
              {" "}
              Sign in
            </strong>
          </button>

        </section>

      </div>

    </main>
  );
}