import { useNavigate } from "react-router-dom";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <main className="landing-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grid-overlay" />

      <nav className="topbar">
        <button className="brand" onClick={() => navigate("/")}>
          <span className="brand-mark">FA</span>
          <span>
            <strong>FaceAttend</strong>
            <small>Smart Attendance</small>
          </span>
        </button>

        <button className="nav-login" onClick={() => navigate("/login")}>
          Sign in
        </button>
      </nav>

      <section className="hero">
        <div className="hero-copy reveal">
          <div className="eyebrow"><span /> AI POWERED ATTENDANCE</div>
          <h1>
            Attendance that
            <span> sees, verifies </span>
            and records.
          </h1>
          <p>
            A professional company attendance platform powered by face
            recognition. Admins manage the company, HR and Managers manage
            employees, and attendance happens automatically.
          </p>

          <div className="hero-actions">
            <button
              className="primary-btn"
              onClick={() => navigate("/admin/register")}
            >
              Register your company <span>→</span>
            </button>
            <button className="ghost-btn" onClick={() => navigate("/login")}>
              Existing user? Sign in
            </button>
          </div>

          <div className="trust-row">
            <div><b>01</b><span>Company scoped access</span></div>
            <div><b>02</b><span>Face based attendance</span></div>
            <div><b>03</b><span>Role based dashboard</span></div>
          </div>
        </div>

        <div className="hero-visual reveal delay-one">
          <div className="scan-card">
            <div className="scan-top">
              <span className="live-dot" /> LIVE CAMERA
              <span className="secure-pill">SECURE</span>
            </div>
            <div className="face-frame">
              <div className="corner c1" /><div className="corner c2" />
              <div className="corner c3" /><div className="corner c4" />
              <div className="face-orb">
                <div className="face-head" />
                <div className="face-body" />
              </div>
              <div className="scan-line" />
            </div>
            <div className="scan-result">
              <div>
                <small>IDENTITY VERIFIED</small>
                <strong>Employee detected</strong>
              </div>
              <span className="check">✓</span>
            </div>
          </div>

          <div className="float-card float-one">
            <span className="mini-icon">✓</span>
            <div><small>Today</small><b>98.4% attendance</b></div>
          </div>

          <div className="float-card float-two">
            <span className="mini-icon purple">◉</span>
            <div><small>Recognition</small><b>Instant verification</b></div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>© 2026 FaceAttend</span>
        <span>Secure • Role based • Automated</span>
      </footer>
    </main>
  );
}
