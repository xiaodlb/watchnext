import Link from "next/link";
import { AccountForm } from "../components/account-form";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  return <div className="auth-page"><section className="auth-card"><div className="auth-tabs" aria-label="Account choice"><span aria-current="page">Sign in</span><Link href="/register">Create account</Link></div><h1>Welcome back</h1><p className="page-introduction">Use your account username and password.</p><AccountForm operation="login" /><p className="auth-links"><Link href="/recover">Forgot password?</Link> <span aria-hidden="true">·</span> <Link href="/register">Create an account</Link></p></section></div>;
}
