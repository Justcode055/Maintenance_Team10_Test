import type { Metadata } from "next";
import PasswordRecoveryScreen from "@/components/password-recovery-screen";
import "../login/login.css";
export const metadata: Metadata = { title: "Reset password | Campus Maintenance" };
export default function ResetPasswordPage() { return <PasswordRecoveryScreen update />; }
