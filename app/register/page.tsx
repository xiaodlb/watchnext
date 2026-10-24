import Link from "next/link";
import { AccountForm } from "../components/account-form";
export const dynamic = "force-dynamic";
export default function RegisterPage() {
  return <div className="auth-page"><section className="auth-card"><div className="auth-tabs" aria-label="Account choice"><Link href="/login">Sign in</Link><span aria-current="page">Create account</span></div><h1>Create an account</h1><p className="page-introduction">Keep a private account with a username and password. No email needed.</p><AccountForm operation="register" /><p className="auth-links">Already registered? <Link href="/login">Sign in</Link>.</p></section></div>;
}
