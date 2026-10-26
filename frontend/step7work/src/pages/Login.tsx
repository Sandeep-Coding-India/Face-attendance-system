import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiRequest } from "../api";

export default function Login() {
  const navigate=useNavigate(); const location=useLocation();
  const state=(location.state || {}) as {companyId?:string;loginId?:string};
  const [companyId,setCompanyId]=useState(state.companyId || "");
  const [loginId,setLoginId]=useState(state.loginId || "");
  const [password,setPassword]=useState(""); const [showPassword,setShowPassword]=useState(false);
  const [loading,setLoading]=useState(false); const [error,setError]=useState("");

  const submit=async(e:FormEvent)=>{
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const data=await apiRequest("/auth/login",{method:"POST",body:JSON.stringify({company_id:companyId.trim(),login_id:loginId.trim(),password})});
      const token=data.access_token;
      if(token) localStorage.setItem("access_token",token);
      const user=data.user || data; const role=String(user.role || data.role || "").toLowerCase();
      localStorage.setItem("faceattend_user",JSON.stringify(user));
      localStorage.setItem("faceattend_company_id",companyId.trim());
      if(role === "hr") navigate("/hr/dashboard");
      else if(role === "manager") navigate("/manager/dashboard");
      else navigate("/admin/dashboard");
    } catch(err:any) { setError(err?.message || "Invalid Company ID, Login ID or password."); }
    finally { setLoading(false); }
  };

  return <main className="auth-page"><div className="auth-glow"/><button className="back-btn" onClick={()=>navigate("/")}>← Back</button>
    <div className="login-shell"><div className="login-brand"><button className="brand light" onClick={()=>navigate("/")}><span className="brand-mark">FA</span><span><strong>FaceAttend</strong><small>Secure workspace</small></span></button></div>
      <section className="login-card"><div className="login-icon">FA</div><div className="eyebrow centered"><span/> SECURE ACCESS</div><h1>Welcome back</h1><p className="login-subtitle">Sign in to your company workspace.</p>
        {error && <div className="form-error">{error}</div>}
        <form onSubmit={submit}><label>Company ID<input value={companyId} onChange={e=>setCompanyId(e.target.value.toUpperCase())} placeholder="CMP-XXXXXXXX" required/></label>
          <label>Unique Login ID<input value={loginId} onChange={e=>setLoginId(e.target.value.toUpperCase())} placeholder="ADM-XXXXXXXX / HR-XXXXXXXX" required/></label>
          <label>Password<div className="password-wrap"><input type={showPassword?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" required/><button type="button" onClick={()=>setShowPassword(!showPassword)}>{showPassword?"Hide":"Show"}</button></div></label>
          <button className="primary-btn full" type="submit" disabled={loading}>{loading?"Signing in...":"Sign in"}<span>{loading?"":"→"}</span></button>
        </form>

        <button className="forgot-login-btn" type="button" onClick={()=>navigate("/forgot-password")}>
          <span>Forgot ID or Password?</span>
          <strong>Recover account →</strong>
        </button>

        <div className="login-help"><span>🔒</span><div><b>Protected workspace</b><small>Employees do not require login.</small></div></div>
        <button className="register-link" type="button" onClick={()=>navigate("/admin/register")}>New company? <strong>Register here</strong></button>
      </section></div></main>;
}
