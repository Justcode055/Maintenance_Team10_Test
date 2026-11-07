import type { Metadata } from "next";
import LoginScreen from "@/components/login-screen";
import "./login.css";

export const metadata: Metadata = {
  title: "Sign in | MFU Campus Maintenance",
  description: "Sign in to report campus repairs, track work orders, and manage facility maintenance.",
};

export default function LoginPage() {
  return <LoginScreen />;
}
