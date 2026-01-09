"use client";

import { usePathname } from "next/navigation";
import { AuthContextProvider } from "../context/AuthContext";
import { ToastProvider } from "../components/ToastProvider";
import { PWAInitialize } from "./PWAInitialize";
import { NativePopupSystem } from "./NativePopupSystem";
import DashboardLayout from "./DashboardLayout";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLoginPage = pathname === "/login";

    return (
        <AuthContextProvider>
            <ToastProvider>
                <PWAInitialize />
                <NativePopupSystem />
                {isLoginPage ? (
                    children
                ) : (
                    <DashboardLayout>{children}</DashboardLayout>
                )}
                <div id="root-portal" />
            </ToastProvider>
        </AuthContextProvider>
    );
}
