"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, LoaderCircle, Wrench } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

export default function PasswordRecoveryScreen({ update = false }: { update?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(update);
  const [canUpdate, setCanUpdate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    if (!update) return () => { mounted.current = false; };
    let subscription: { unsubscribe(): void } | undefined;
    try {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const invalidLink = params.has("error") || new URLSearchParams(window.location.search).has("error");
      subscription = createBrowserSupabaseClient().auth.onAuthStateChange((_event, session) => {
        if (!mounted.current) return;
        setChecking(false);
        setCanUpdate(!!session && !invalidLink);
        if (!session || invalidLink) setError("This reset link is invalid or has expired. Request a new link to continue.");
        else setError(null);
      }).data.subscription;
    } catch { setChecking(false); setError("Password recovery is unavailable. Please try again later or contact your administrator."); }
    return () => { mounted.current = false; subscription?.unsubscribe(); };
  }, [update]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || (update && !canUpdate)) return;
    if (update && password !== confirmation) { setError("The passwords don’t match. Please enter them again."); return; }
    lock.current = true; setBusy(true); setError(null); setShow(false);
    try {
      const client = createBrowserSupabaseClient();
      if (update) {
        const { error: failure } = await client.auth.updateUser({ password });
        if (failure) { setError(failure.code === "weak_password" ? "Choose a stronger password. Your administrator may require numbers, symbols or mixed case." : failure.code === "same_password" ? "Choose a password you haven’t used before." : "Your password couldn’t be updated. Try again, or request a new reset link."); return; }
        setPassword(""); setConfirmation("");
        await client.auth.signOut({ scope: "local" });
      } else {
        const { error: failure } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (failure) { setError(failure.status === 429 ? "Too many requests. Please wait a few minutes before trying again." : "We couldn’t send a reset link. Please try again later or contact your administrator."); return; }
      }
      if (mounted.current) setSuccess(true);
    } catch { if (mounted.current) setError("Check your connection and try again."); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }

  return <main className="login-page recovery-page"><Link href="/login" className="recovery-brand"><span className="login-brand-mark"><Wrench size={22} aria-hidden="true" /></span>Campus Maintenance</Link><section className="login-card recovery-card" aria-labelledby="recovery-title"><p className="login-card-eyebrow">ACCOUNT RECOVERY</p><div className="login-card-heading"><h1 id="recovery-title">{success ? update ? "Password updated" : "Check your email" : update ? "Set a new password" : "Forgot your password?"}</h1><p>{success ? update ? "You can now sign in with your new password." : "If an account exists for that address, you’ll receive a reset link. Check your spam folder too." : update ? "Choose a new password to regain access to your account." : "Enter your account email and we’ll send a password reset link."}</p></div>
    {success ? <div className="recovery-success" role="status"><CheckCircle2 size={24} aria-hidden="true" /><Link href="/login">Back to sign in</Link>{!update && <button className="text-button" onClick={() => setSuccess(false)}>Use another email</button>}</div> : <>
      <form className="login-form" onSubmit={submit} aria-busy={busy || checking}>
        <fieldset className="login-fields" disabled={busy || checking || (update && !canUpdate)}>
          <legend className="sr-only">{update ? "New password" : "Recovery email"}</legend>
          {!update ? <div className="login-field"><label htmlFor="recovery-email">Email address</label><input id="recovery-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} /></div> : <>
            <div className="login-field"><label htmlFor="new-password">New password</label><div className="recovery-password-wrap"><input id="new-password" name="new-password" type={show ? "text" : "password"} autoComplete="new-password" required minLength={8} aria-describedby="password-hint" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="login-password-toggle" aria-label={show ? "Hide passwords" : "Show passwords"} aria-pressed={show} onClick={() => setShow((value) => !value)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><p id="password-hint" className="field-help">Use at least 8 characters. A long, unique password is best.</p></div>
            <div className="login-field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" name="confirm-password" type={show ? "text" : "password"} autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
          </>}
          <button type="submit" className="login-submit">{(busy || checking) && <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}{checking ? "Checking reset link…" : busy ? update ? "Updating password…" : "Sending reset link…" : update ? "Update password" : "Send reset link"}</button>
        </fieldset>
      </form>
      <p className="sr-only" role="status">{busy ? "Please wait. Your request is being processed." : checking ? "Checking your reset link." : ""}</p>
      {error && <div id="recovery-error" className="login-error" role="alert" ref={errorRef} tabIndex={-1}><AlertCircle size={18} aria-hidden="true" /><p>{error}</p></div>}
      <div className="recovery-links"><Link href="/login">Back to sign in</Link>{update && <Link href="/forgot-password">Request a new reset link</Link>}</div>
    </>}
  </section></main>;
}
