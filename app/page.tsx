import Link from "next/link";
import { AccountForm } from "./components/account-form";

export default function HomePage() {
  return (
    <div className="auth-page">
      <div className="auth-brand">Watch<span>Next</span></div>
      <p className="auth-tagline">Stop scrolling. Pick from what you already wanted to watch.</p>
      <section className="auth-card" aria-labelledby="account-entry">
        <div className="auth-tabs" aria-label="Account choice"><span aria-current="page">Sign in</span><Link href="/register">Create account</Link></div>
        <h1 id="account-entry">WatchNext</h1>
        <p className="page-introduction">Welcome back. Sign in to your private shared watchlist.</p>
        <AccountForm operation="login" />
        <p className="auth-links"><Link href="/recover">Forgot password?</Link> <span aria-hidden="true">·</span> <Link href="/register">Create an account</Link></p>
      </section>
      <p className="auth-footer"><Link href="/group">Open a legacy group</Link> <span aria-hidden="true">·</span> <Link href="/http">HTTP workspace</Link></p>
    </div>
  );
}