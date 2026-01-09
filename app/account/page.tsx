"use client";

import React, { useEffect, useState } from "react";
import { UserAuth } from "../../context/AuthContext";
import { FiUser, FiLogOut, FiSettings, FiHelpCircle, FiChevronRight, FiBriefcase, FiPlus, FiCheck } from "react-icons/fi";
import { useRouter } from "next/navigation";
import { useToast } from "../../components/ToastProvider";

export default function AccountPage() {
    const { user, userProfile, currentStudio, switchStudio, logOut } = UserAuth();
    const [mounted, setMounted] = useState(false);
    const router = useRouter();
    const { showToast } = useToast();

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleSignOut = async () => {
        try {
            await logOut();
        } catch (error) {
            console.error(error);
        }
    };

    const handleSwitchStudio = async (studioId: string) => {
        if (currentStudio?.studioId === studioId) return;
        await switchStudio(studioId);
        showToast("Switched studio successfully", "success");
        router.refresh(); // Refresh to ensure data re-fetch if needed
    };

    if (!mounted) return null;

    return (
        <>


            <div className="w-full px-5 md:px-8 lg:px-12 pt-6 pb-8 min-h-full">

                {/* Profile Card */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 flex items-center gap-5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>

                    <div className="relative h-16 w-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-xl font-medium">
                        {user?.displayName ? user.displayName.charAt(0).toUpperCase() : <FiUser className="text-2xl" />}
                    </div>

                    <div className="relative z-10 flex flex-col items-start">
                        <h2 className="text-lg font-medium text-gray-900 leading-tight">
                            {user?.displayName || "Fashion Designer"}
                        </h2>
                        <p className="text-sm text-gray-500 font-medium mt-0.5">
                            {user?.phoneNumber || user?.email || "No contact info"}
                        </p>
                        <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-medium uppercase tracking-wider">
                            Pro Member
                        </div>
                    </div>
                </div>

                {/* Studios Section */}
                <div className="mb-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
                    <div className="flex items-center justify-between mb-3 px-1">
                        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">My Studios</h3>
                        <button
                            onClick={() => router.push('/onboarding')} // Reuse onboarding for new studio
                            className="text-indigo-600 text-xs font-medium bg-indigo-50 px-2 py-1 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1"
                        >
                            <FiPlus /> New
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                        {userProfile?.studios?.map((studio) => {
                            const isActive = currentStudio?.studioId === studio.studioId;
                            return (
                                <button
                                    key={studio.studioId}
                                    onClick={() => handleSwitchStudio(studio.studioId)}
                                    className={`w-full flex items-center justify-between p-4 transition-all duration-200 
                                        ${isActive ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors
                                            ${isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                                            <FiBriefcase className="text-lg" />
                                        </div>
                                        <div className="flex flex-col items-start">
                                            <span className={`text-sm font-medium ${isActive ? 'text-indigo-900' : 'text-gray-700'}`}>
                                                {studio.studioName}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-medium capitalize">
                                                {studio.role}
                                            </span>
                                        </div>
                                    </div>
                                    {isActive && (
                                        <div className="h-6 w-6 bg-indigo-600 rounded-full flex items-center justify-center">
                                            <FiCheck className="text-white text-xs" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}

                        {(!userProfile?.studios || userProfile.studios.length === 0) && (
                            <div className="p-6 text-center text-gray-400 text-sm">
                                No studios found. Join or create one.
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-b border-gray-50">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 bg-gray-50 rounded-lg flex items-center justify-center text-gray-600">
                                    <FiSettings className="text-lg" />
                                </div>
                                <span className="text-sm font-medium text-gray-700">App Settings</span>
                            </div>
                            <FiChevronRight className="text-gray-400" />
                        </button>
                        <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 bg-gray-50 rounded-lg flex items-center justify-center text-gray-600">
                                    <FiHelpCircle className="text-lg" />
                                </div>
                                <span className="text-sm font-medium text-gray-700">Help & Support</span>
                            </div>
                            <FiChevronRight className="text-gray-400" />
                        </button>
                    </div>

                    <button
                        onClick={handleSignOut}
                        className="w-full bg-white rounded-2xl p-4 border border-red-100 flex items-center justify-between text-red-600 hover:bg-red-50 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 bg-red-50 rounded-lg flex items-center justify-center text-red-500 group-hover:bg-red-100 transition-colors">
                                <FiLogOut className="text-lg" />
                            </div>
                            <span className="text-sm font-medium">Sign Out</span>
                        </div>
                    </button>

                    <div className="text-center pt-8 pb-4">
                        <p className="text-xs text-gray-300 font-medium">VastraaOS v1.1.0 • Built for Creators</p>
                    </div>
                </div>
            </div>
        </>
    );
}
