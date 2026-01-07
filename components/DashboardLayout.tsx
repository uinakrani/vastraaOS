"use client";

import Link from "next/link";
import React, { ReactNode, useState } from "react";
import {
    FiHome,
    FiGitMerge,
    FiChevronRight,
    FiMenu,
    FiLogOut,
    FiShoppingBag,
    FiCalendar
} from "react-icons/fi";
import { usePathname } from "next/navigation";
import { UserAuth } from "../context/AuthContext";
import GlobalSearch from "./GlobalSearch";

interface DashboardLayoutProps {
    children: ReactNode;
}

interface NavSubItem {
    name: string;
    href: string;
}

interface NavItem {
    name: string;
    href?: string;
    icon: ReactNode;
    subItems?: NavSubItem[];
}

interface NavSection {
    header: string;
    items: NavItem[];
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [expandedMenus, setExpandedMenus] = useState<string[]>(["Outfits", "Orders"]);
    const pathname = usePathname();
    const { user, logOut, currentStudio } = UserAuth();

    const handleSignOut = async () => {
        try {
            await logOut();
        } catch (error) {
            console.error(error);
        }
    };

    const navSections: NavSection[] = [
        {
            header: "MENU",
            items: [
                { name: "Overview", href: "/", icon: <FiHome className="h-4 w-4" /> },
                {
                    name: "Outfits",
                    href: "/outfits",
                    icon: <FiGitMerge className="h-4 w-4" />
                },
                {
                    name: "Orders",
                    href: "/orders",
                    icon: <FiShoppingBag className="w-4 h-4" />
                },
                {
                    name: "Returns",
                    href: "/returns",
                    icon: <FiShoppingBag className="w-4 h-4" />
                },
            ]
        }
    ];

    const handleMenuClick = (itemName: string, hasSubItems: boolean) => {
        if (hasSubItems) {
            setExpandedMenus(prev =>
                prev.includes(itemName)
                    ? prev.filter(n => n !== itemName)
                    : [...prev, itemName]
            );
        }
    };

    return (
        <div className="flex h-screen bg-[#F5F8FA] font-sans text-[#181C32]">
            {/* Desktop Sidebar - Hidden on Mobile */}
            <aside
                className="hidden lg:flex lg:flex-col w-[240px] bg-[#1e1e2d] z-40"
            >
                {/* Brand/Logo Area */}
                <div className="flex items-center justify-between h-[60px] px-5 bg-[#1b1b28]">
                    <Link href="/" className="flex items-center space-x-2">
                        <div className="h-7 w-7 bg-indigo-500 rounded flex items-center justify-center text-white font-medium text-sm">V</div>
                        <span className="text-white font-medium text-base tracking-wide">VastraaOS</span>
                    </Link>
                </div>

                {/* Studio Context Banner */}
                {currentStudio && (
                    <div className="px-5 py-2 bg-[#1b1b28] border-b border-[#2b2b40]">
                        <div className="text-[10px] uppercase text-[#6D6F86] font-medium tracking-wider mb-0.5">Current Studio</div>
                        <div className="text-white text-sm font-medium truncate flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            {currentStudio.studioName}
                        </div>
                    </div>
                )}

                {/* Primary Action Button (Compact) */}
                <div className="px-4 py-4">
                    <Link
                        href="/orders/add"
                        className="flex items-center justify-center w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] group"
                    >
                        <FiShoppingBag className="w-4 h-4 mr-2" />
                        <span className="text-sm">Create Order</span>
                    </Link>
                </div>

                {/* Navigation Menu */}
                <div className="flex-1 overflow-y-auto py-2 px-3 space-y-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                    {navSections.map((section, idx) => (
                        <div key={idx}>
                            {/* Section Header */}
                            <div className="px-3 mb-1 text-[10px] font-bold text-[#6D6F86] uppercase tracking-wider">
                                {section.header}
                            </div>

                            <div className="space-y-0.5">
                                {section.items.map((item) => {
                                    const isActive = pathname === item.href || (item.subItems && item.subItems.some(sub => pathname === sub.href));
                                    const isExpanded = expandedMenus.includes(item.name);

                                    return (
                                        <div key={item.name} className="flex flex-col">
                                            {item.subItems ? (
                                                <div
                                                    onClick={() => handleMenuClick(item.name, true)}
                                                    className={`group flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-all duration-200
                                  ${isActive
                                                            ? "bg-[#2b2b40] text-indigo-400"
                                                            : "text-[#9899ac] hover:text-white hover:bg-[#2b2b40]/50"}`
                                                    }
                                                >
                                                    <div className="flex items-center space-x-3">
                                                        <span className={`transition-colors ${isActive ? "text-indigo-400" : "text-[#5E6278] group-hover:text-indigo-400"}`}>
                                                            {item.icon}
                                                        </span>
                                                        <span className="text-[14px] flex-1 text-[#9899ac] group-hover:text-white">{item.name}</span>
                                                    </div>
                                                    <FiChevronRight className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? "rotate-90 text-indigo-400" : "text-gray-600"}`} />
                                                </div>
                                            ) : (
                                                <Link
                                                    href={item.href || "#"}
                                                    className={`group flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-all duration-200
                                  ${isActive
                                                            ? "bg-[#2b2b40] text-indigo-400"
                                                            : "text-[#9899ac] hover:text-white hover:bg-[#2b2b40]/50"}`
                                                    }
                                                >
                                                    <div className="flex items-center space-x-3">
                                                        <span className={`transition-colors ${isActive ? "text-indigo-400" : "text-[#5E6278] group-hover:text-indigo-400"}`}>
                                                            {item.icon}
                                                        </span>
                                                        <span className="font-medium text-[13px] flex-1">
                                                            {item.name}
                                                        </span>
                                                    </div>
                                                </Link>
                                            )}

                                            {/* Submenu */}
                                            {item.subItems && (
                                                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? "max-h-60 opacity-100" : "max-h-0 opacity-0"}`}>
                                                    <div className="mt-0.5 space-y-0.5 pl-4">
                                                        {item.subItems.map(subItem => (
                                                            <Link key={subItem.name} href={subItem.href}>
                                                                <div className={`flex items-center my-0.5 px-3 py-1.5 rounded text-[12px] font-medium transition-colors
                                              ${pathname === subItem.href
                                                                        ? "text-indigo-400 bg-[#2b2b40]"
                                                                        : "text-[#888c9f] hover:text-white hover:bg-[#2b2b40]/50"}`
                                                                }>
                                                                    <span className="w-1 h-1 rounded-full bg-current mr-2 opacity-50"></span>
                                                                    {subItem.name}
                                                                </div>
                                                            </Link>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* User Footer (Compact) */}
                <div className="p-3 border-t border-[#2b2b40] bg-[#1b1b28]">
                    <div className="flex items-center space-x-3 mb-3 px-2">
                        <div className="h-8 w-8 bg-[#2b2b40] rounded-lg text-indigo-400 flex items-center justify-center font-bold text-sm">
                            {user?.displayName ? user.displayName.charAt(0).toUpperCase() : "A"}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-white text-xs font-bold leading-tight truncate">{user?.displayName || "Admin"}</span>
                            <span className="text-[#9899ac] text-[10px] leading-tight truncate">{user?.email || "admin@vastraaos.com"}</span>
                        </div>
                    </div>

                    <button onClick={handleSignOut} className="w-full flex items-center justify-center space-x-2 bg-[#2b2b40] hover:bg-[#323248] text-[#9899ac] hover:text-white py-1.5 rounded-md transition-colors text-xs font-medium">
                        <FiLogOut className="h-3.5 w-3.5" />
                        <span>Sign Out</span>
                    </button>
                </div>
            </aside>

            {/* Main Wrapper */}
            <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#F5F8FA]">
                {/* Content Viewport */}
                <main className="flex-1 overflow-y-auto pb-24 lg:pb-6">
                    {children}
                </main>
            </div>

            {/* Global Search Overlay */}
            <GlobalSearch />

            {/* Mobile Bottom Navigation - Floating Dock Style */}
            <div className="lg:hidden fixed bottom-6 left-6 right-6 bg-white/95 backdrop-blur-2xl border border-gray-200 z-50 rounded-[2rem]">
                <div className="flex justify-between items-center h-[64px] px-6">
                    {/* Home */}
                    <Link href="/" className="flex flex-col items-center justify-center group">
                        <div className={`p-2 rounded-2xl transition-all duration-300 ${pathname === "/" ? "bg-indigo-50 text-indigo-600 scale-110" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
                            <FiHome className="w-6 h-6 stroke-2" />
                        </div>
                    </Link>

                    {/* Outfits */}
                    <Link href="/outfits" className="flex flex-col items-center justify-center group">
                        <div className={`p-2 rounded-2xl transition-all duration-300 ${pathname.startsWith("/outfits") ? "bg-indigo-50 text-indigo-600 scale-110" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
                            <FiGitMerge className="w-6 h-6 stroke-2" />
                        </div>
                    </Link>

                    {/* Check Availability */}
                    <Link href="/availability" className="flex flex-col items-center justify-center group">
                        <div className={`p-2 rounded-2xl transition-all duration-300 ${pathname === "/availability" ? "bg-indigo-50 text-indigo-600 scale-110" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
                            <FiCalendar className="w-6 h-6 stroke-2" />
                        </div>
                    </Link>

                    {/* Orders */}
                    <Link href="/orders" className="flex flex-col items-center justify-center group">
                        <div className={`p-2 rounded-2xl transition-all duration-300 ${pathname.startsWith("/orders") ? "bg-indigo-50 text-indigo-600 scale-110" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
                            <FiShoppingBag className="w-6 h-6 stroke-2" />
                        </div>
                    </Link>

                    {/* Account */}
                    <Link href="/account" className="flex flex-col items-center justify-center group">
                        <div className={`p-0.5 rounded-full transition-all duration-300 border-2 ${pathname === "/account" ? "border-indigo-600 scale-110" : "border-transparent"}`}>
                            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                                {user?.photoURL ? (
                                    <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-xs font-bold text-gray-500">{user?.displayName?.charAt(0) || "A"}</span>
                                )}
                            </div>
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    );
}
