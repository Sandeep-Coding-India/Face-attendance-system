import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api";

type Method = "email" | "phone";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>("email");
  const [companyId, setCompanyId] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [maskedDestination, setMaskedDestination] = useState("");

  const clearMessages = () => { setError(""); setMessage(""); };

  const requestOtp = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      const data = await apiRequest("/auth/forgot-password/request-otp", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId.trim(),
          recovery_method: method,
          recovery_value: identifier.trim(),
        }),
      });
      setMaskedDestination(data.masked_destination || identifier.trim());
      setMessage(data.message || `OTP sent to your ${method}.`);
      setStep(2);
    } catch (err: any) {
      setError(err?.message || "Unable to send recovery OTP.");
    } finally { setLoading(false); }
  };

  const verifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      const data = await apiRequest("/auth/forgot-password/verify-otp", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId.trim(),
          recovery_method: method,
          recovery_value: identifier.trim(),
          otp: otp.trim(),
        }),
      });
      if (data.reset_token) sessionStorage.setItem("faceattend_reset_token", data.reset_token);
      setMessage(data.message || "OTP verified. Create your new password.");
      setStep(3);
    } catch (err: any) {
      setError(err?.message || "Invalid or expired OTP.");
    } finally { setLoading(false); }
  };

  const resetPassword = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (newPassword.length < 8) { setError("Password must contain at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const resetToken = sessionStorage.getItem("faceattend_reset_token") || "";
      const data = await apiRequest("/auth/forgot-password/reset", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId.trim(),
          recovery_method: method,
          recovery_value: identifier.trim(),
          otp: otp.trim(),
          reset_token: resetToken,
          new_password: newPassword,
        }),
      });
      sessionStorage.removeItem("faceattend_reset_token");
      setMessage(data.message || "Password changed successfully. You can now sign in.");
      setStep(1);
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err?.message || "Unable to reset password.");
    } finally { setLoading(false); }
  };

  return (
    <main className="auth-page">
      <div className="auth-glow" />
      <button className="back-btn" onClick={() => navigate("/login")}>← Back to login</button>
      <div className="login-shell">
        <div className="login-brand">
          <button className="brand light" onClick={() => navigate("/")}>
            <span className="brand-mark">FA</span>
            <span><strong>FaceAttend</strong><small>Account recovery</small></span>
          </button>
        </div>
        <section className="login-card recovery-card">
          <div className="login-icon">🔐</div>
          <div className="eyebrow centered"><span /> ACCOUNT RECOVERY</div>
          <h1>Forgot your password?</h1>
          <p className="login-subtitle">Recover your Admin, HR or Manager account using the verified email address or phone number registered with your company.</p>

          {error && <div className="form-error">{error}</div>}
          {message && <div className="success-box">✓ {message}</div>}

          {step === 1 && <form onSubmit={requestOtp}>
            <label>Company ID<input value={companyId} onChange={e => setCompanyId(e.target.value.toUpperCase())} placeholder="CMP-XXXXXXXX" required /></label>
            <div className="recovery-options">
              <button type="button" className={`recovery-option ${method === "email" ? "active" : ""}`} onClick={() => setMethod("email")}>
                <strong>✉ Email</strong><small>Receive a secure OTP on your registered email.</small>
              </button>
              <button type="button" className={`recovery-option ${method === "phone" ? "active" : ""}`} onClick={() => setMethod("phone")}>
                <strong>📱 Phone</strong><small>Receive a secure OTP on your registered mobile number.</small>
              </button>
            </div>
            <label>{method === "email" ? "Registered Email" : "Registered Phone Number"}
              <input value={identifier} onChange={e => setIdentifier(e.target.value)} type={method === "email" ? "email" : "tel"} placeholder={method === "email" ? "name@company.com" : "+91 9876543210"} required />
            </label>
            <button className="primary-btn full" type="submit" disabled={loading}>{loading ? "Sending OTP..." : "Send verification OTP"}<span>→</span></button>
          </form>}

          {step === 2 && <form onSubmit={verifyOtp}>
            <label>Verification OTP<div className="otp-row"><input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6-digit OTP" required /><button type="button" className="secondary-btn" disabled={loading} onClick={requestOtp as any}>Resend</button></div></label>
            <p className="recovery-note">We sent a one-time verification code to <strong>{maskedDestination}</strong>. The code should expire shortly.</p>
            <button className="primary-btn full" type="submit" disabled={loading || otp.length < 4}>{loading ? "Verifying..." : "Verify OTP"}<span>→</span></button>
            <button type="button" className="back-login" onClick={() => { clearMessages(); setStep(1); }}>Use a different email/phone</button>
          </form>}

          {step === 3 && <form onSubmit={resetPassword}>
            <label>New Password<input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" required /></label>
            <label>Confirm New Password<input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" required /></label>
            <button className="primary-btn full" type="submit" disabled={loading}>{loading ? "Updating..." : "Reset password"}<span>→</span></button>
          </form>}

          <div className="login-help"><span>🛡️</span><div><b>Secure recovery</b><small>Your password is never shown or sent back to you.</small></div></div>
          <button className="register-link" onClick={() => navigate("/login")}>Remembered your password? <strong>Sign in</strong></button>
        </section>
      </div>
    </main>
  );
}
