import type { Metadata } from "next";
import PasswordRecoveryScreen from "@/components/password-recovery-screen";
import "../login/login.css";
export const metadata: Metadata = { title: "Forgot password | Campus Maintenance" };
export default function ForgotPasswordPage() { return <PasswordRecoveryScreen />; }
