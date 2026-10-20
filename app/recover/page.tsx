import Link from "next/link";
import { AccountForm } from "../components/account-form";
export const dynamic = "force-dynamic";
export default function RecoveryPage() {
  return <div className="auth-page"><section className="auth-card"><div className="auth-tabs"><Link href="/login">Sign in</Link><Link href="/register">Create account</Link></div><h1>Reset your password</h1><p className="page-introduction">Use your username and the private recovery code you saved.</p><AccountForm operation="recover" /><p className="auth-links">There is no email or support bypass if both secrets are lost. <Link href="/login">Return to sign in</Link></p></section></div>;
}
