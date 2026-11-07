"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowRight, Building2, CheckCircle2, CircleHelp, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Wrench } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { maintenanceRole } from "@/lib/maintenance-role";
import { canUseLocalDemo } from "@/lib/local-demo";

const accessMessage = "Your account needs campus access. Ask your administrator to assign you a reporter or maintenance staff role.";

function signInError(code?: string): string {
  if (code === "invalid_credentials") return "The email or password is incorrect. Please try again.";
  if (code === "email_not_confirmed") return "Please confirm your email address before signing in.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Too many sign-in attempts. Please wait a moment and try again.";
  return "We couldn’t sign you in. Check your connection and try again.";
}

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localDemoAvailable, setLocalDemoAvailable] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    setLocalDemoAvailable(canUseLocalDemo(window.location.hostname));
    let subscription: { unsubscribe(): void } | undefined;
    try {
      const client = createBrowserSupabaseClient();
      subscription = client.auth.onAuthStateChange((event, session) => {
        if (!mounted.current) return;
        if (event === "PASSWORD_RECOVERY") { router.replace("/reset-password"); return; }
        if (maintenanceRole(session?.user)) {
          router.replace("/");
          return;
        }
        if (session) setError(accessMessage);
        setCheckingSession(false);
      }).data.subscription;
    } catch {
      setCheckingSession(false);
      setError("Sign-in is temporarily unavailable. Please contact your campus administrator.");
    }
    return () => { mounted.current = false; subscription?.unsubscribe(); };
  }, [router]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || checkingSession) return;
    inFlight.current = true;
    setSigningIn(true);
    setError(null);
    setShowPassword(false);
    try {
      const client = createBrowserSupabaseClient();
      const { data, error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (!mounted.current) return;
      if (authError) {
        setError(signInError(authError.code));
      } else if (!data.session || !maintenanceRole(data.user)) {
        await client.auth.signOut({ scope: "local" });
        if (mounted.current) setError(accessMessage);
      } else {
        setPassword("");
        router.replace("/");
      }
    } catch {
      if (mounted.current) setError("We couldn’t sign you in. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setSigningIn(false);
    }
  }

  const busy = signingIn || checkingSession;

  return (
    <div className="login-page">
      <header className="login-header">
        <div className="login-brand">
          <span className="login-brand-mark"><Wrench size={22} strokeWidth={1.8} aria-hidden="true" /></span>
          <div className="login-wordmark"><strong>Campus Maintenance</strong><span>MAE FAH LUANG UNIVERSITY</span></div>
        </div>
        <a className="login-help-link" href="#account-access"><CircleHelp size={17} aria-hidden="true" />Account help</a>
      </header>

      <main className="login-main">
        <section className="login-introduction" aria-labelledby="login-introduction-title">
          <p className="login-eyebrow"><span />A CAMPUS WE CARE FOR, TOGETHER</p>
          <h1 id="login-introduction-title">A better campus<span>starts with you.</span></h1>
          <p className="login-introduction-copy">A broken light. A leaking tap. A room that needs attention. Report it, follow its progress, and get back to campus life.</p>

          <div className="login-workflow" aria-label="Work orders move from open to assigned, in progress, resolved and closed">
            <div className="login-workflow-heading">
              <span className="login-building-icon"><Building2 size={27} strokeWidth={1.5} aria-hidden="true" /></span>
              <div><strong>Campus care, connected.</strong><p>Every request follows a clear path.</p></div>
              <span className="login-workflow-tag">HOW IT WORKS</span>
            </div>
            <ol className="login-workflow-steps">
              {["Open", "Assigned", "In progress", "Resolved", "Closed"].map((step, index) => (
                <li key={step}><span>{index + 1}</span><strong>{step}</strong></li>
              ))}
            </ol>
            <p className="login-workflow-note"><CheckCircle2 size={15} aria-hidden="true" />Clear ownership. Updates you can follow.</p>
          </div>
          <div className="login-feature-row"><span><CheckCircle2 size={17} aria-hidden="true" />Report and track repairs</span><span><ShieldCheck size={17} aria-hidden="true" />Campus &amp; staff access</span></div>
        </section>

        <section className="login-card" aria-labelledby="login-title">
          <div className="login-card-heading"><p className="login-card-eyebrow">WELCOME BACK</p><h2 id="login-title">Sign in to your workspace</h2><p>Use your campus maintenance account to continue.</p></div>
          <form className="login-form" onSubmit={handleSignIn} aria-busy={busy} aria-describedby={error ? "login-error" : "login-account-hint"}>
            <fieldset className="login-fields" disabled={busy}>
              <legend className="sr-only">Campus account credentials</legend>
              <div className="login-field">
                <label htmlFor="login-email">Email address</label>
                <div className="login-input-wrap"><Mail size={18} aria-hidden="true" /><input id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" required value={email} onChange={(event) => { setEmail(event.target.value); setError(null); }} /></div>
              </div>
              <div className="login-field">
                <label htmlFor="login-password">Password</label>
                <div className="login-input-wrap"><LockKeyhole size={18} aria-hidden="true" /><input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Enter your password" value={password} onChange={(event) => { setPassword(event.target.value); setError(null); }} /><button className="login-password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-controls="login-password" aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div>
              </div>
              <div className="login-forgot"><Link href="/forgot-password">Forgot password?</Link></div>
              <button className="login-submit" type="submit">{busy ? <><LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{checkingSession ? "Checking session…" : "Signing in…"}</> : <>Sign in<ArrowRight size={18} aria-hidden="true" /></>}</button>
            </fieldset>
          </form>
          <p className="login-progress sr-only" role="status" aria-live="polite">{checkingSession ? "Checking your existing session." : signingIn ? "Signing you in. Please wait." : ""}</p>
          {error && <div className="login-error" id="login-error" ref={errorRef} role="alert" tabIndex={-1}><AlertCircle size={18} aria-hidden="true" /><p>{error}</p></div>}
          {localDemoAvailable && <div className="login-demo-access"><strong>Preview without a password</strong><p>Local demo with sample tickets. Changes are disabled.</p><div><button type="button" onClick={() => router.push("/?demo=reporter")}>Student demo</button><button type="button" onClick={() => router.push("/?demo=staff")}>Staff demo</button></div></div>}
          <div className="login-account-help" id="account-access" tabIndex={-1}><CircleHelp size={19} aria-hidden="true" /><div><strong>Need an account?</strong><p id="login-account-hint">Your campus administrator can arrange access or help you with your sign-in details.</p></div></div>
          <p className="login-role-note"><ShieldCheck size={14} aria-hidden="true" />Your assigned role determines your workspace.</p>
        </section>
      </main>

      <footer className="login-footer"><span>Mae Fah Luang University</span><span>Campus Facility Maintenance · Team 10</span></footer>
    </div>
  );
}
