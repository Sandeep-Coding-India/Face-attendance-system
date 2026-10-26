import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api";

type FormState = {
  fullName: string; email: string; password: string;
  companyName: string; companyEmail: string; companyPhone: string; companyAddress: string;
};
const initialForm: FormState = { fullName:"", email:"", password:"", companyName:"", companyEmail:"", companyPhone:"", companyAddress:"" };

export default function AdminRegister() {
  const navigate = useNavigate();
  const [form,setForm]=useState(initialForm);
  const [showPassword,setShowPassword]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [result,setResult]=useState<any>(null);
  const update=(key:keyof FormState,value:string)=>setForm(old=>({...old,[key]:value}));

  const submit=async(e:FormEvent)=>{
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const data=await apiRequest("/company/register",{method:"POST",body:JSON.stringify({
        company_name:form.companyName, company_email:form.companyEmail, company_phone:form.companyPhone,
        company_address:form.companyAddress, admin_full_name:form.fullName, admin_email:form.email, admin_password:form.password
      })});
      setResult(data);
    } catch(err:any) { setError(err?.message || "Company registration failed."); }
    finally { setLoading(false); }
  };

  if(result){
    return <main className="auth-page"><div className="auth-glow"/><div className="success-card">
      <div className="success-icon">✓</div><div className="eyebrow centered"><span/> COMPANY READY</div>
      <h1>Company created</h1>
      <p>{result.message || "Company and admin account created successfully."}</p>
      <div className="credential-box"><div><small>COMPANY ID</small><strong>{result.company_id || "Not returned"}</strong></div><div><small>ADMIN LOGIN ID</small><strong>{result.admin_id || "Not returned"}</strong></div><div><small>ADMIN EMAIL</small><strong>{result.admin_email || form.email}</strong></div></div>
      <p className="credential-note">Save the Company ID and Admin Login ID. You will need both to sign in.</p>
      <button className="primary-btn full" onClick={()=>navigate("/login",{state:{companyId:result.company_id || "",loginId:result.admin_id || ""}})}>Continue to login <span>→</span></button>
    </div></main>;
  }

  return <main className="auth-page"><div className="auth-glow"/><button className="back-btn" onClick={()=>navigate("/")}>← Back</button>
    <div className="register-layout"><section className="register-info">
      <button className="brand light" onClick={()=>navigate("/")}><span className="brand-mark">FA</span><span><strong>FaceAttend</strong><small>Smart Attendance</small></span></button>
      <div className="eyebrow"><span/> ADMIN ONBOARDING</div><h1>Create your company workspace.</h1>
      <p>The Admin is the first account. After registration, the Admin can create HR and Manager accounts. Each company stays isolated.</p>
      <div className="steps"><div className="step active"><b>01</b><div><strong>Register company</strong><small>Company and admin details</small></div></div><div className="step"><b>02</b><div><strong>Admin login</strong><small>Secure company access</small></div></div><div className="step"><b>03</b><div><strong>Create HR & Manager</strong><small>Generate unique login IDs</small></div></div></div>
    </section>
    <section className="form-card"><div className="form-heading"><div><span className="mini-logo">FA</span></div><div><h2>Register company</h2><p>Create your admin account and company workspace.</p></div></div>
      {error && <div className="form-error">{error}</div>}
      <form onSubmit={submit}><div className="section-label">ADMIN DETAILS</div><div className="two-col">
        <label>Full name<input value={form.fullName} onChange={e=>update("fullName",e.target.value)} placeholder="Admin full name" required/></label>
        <label>Email<input type="email" value={form.email} onChange={e=>update("email",e.target.value)} placeholder="admin@company.com" required/></label></div>
        <label>Password<div className="password-wrap"><input type={showPassword?"text":"password"} value={form.password} onChange={e=>update("password",e.target.value)} placeholder="Create a strong password" required/><button type="button" onClick={()=>setShowPassword(!showPassword)}>{showPassword?"Hide":"Show"}</button></div></label>
        <div className="section-label">COMPANY DETAILS</div><label>Company name<input value={form.companyName} onChange={e=>update("companyName",e.target.value)} placeholder="e.g. TechVision Solutions" required/></label>
        <div className="two-col"><label>Company email<input type="email" value={form.companyEmail} onChange={e=>update("companyEmail",e.target.value)} placeholder="company@email.com" required/></label><label>Phone<input value={form.companyPhone} onChange={e=>update("companyPhone",e.target.value)} placeholder="9876543210" required/></label></div>
        <label>Address<input value={form.companyAddress} onChange={e=>update("companyAddress",e.target.value)} placeholder="Noida, Uttar Pradesh" required/></label>
        <button className="primary-btn full" type="submit" disabled={loading}>{loading?"Creating company...":"Create company workspace"}<span>{loading?"":"→"}</span></button>
      </form></section></div></main>;
}
