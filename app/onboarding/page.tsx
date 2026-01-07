"use client";

import { useState, useEffect } from "react";
import { UserAuth } from "../../context/AuthContext";
import { createStudio, checkAndAcceptInvitations } from "../../lib/services/studioService";
import { FiHexagon, FiArrowRight, FiCheck } from "react-icons/fi";
import { useRouter } from "next/navigation";
import { useToast } from "../../components/ToastProvider";

export default function OnboardingPage() {
    const { user, userProfile } = UserAuth();
    const router = useRouter();
    const { showToast } = useToast();

    // Steps: 0 = Loading, 1 = Name Check (skipped if google provided), 2 = Studio Setup
    const [step, setStep] = useState(0);
    const [name, setName] = useState("");
    const [studioName, setStudioName] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!user) {
            router.push('/login');
            return;
        }

        const init = async () => {
            // Check for pending invitations first
            await checkAndAcceptInvitations(user);

            // If checking invites added them to a studio, the AuthContext listener will soon trigger 
            // and redirect them if userProfile.studios > 0. 
            // But we might be ahead of that propagation, so we rely on userProfile prop changes.

            if (userProfile?.studios && userProfile.studios.length > 0) {
                router.push('/');
                return;
            }

            if (user.displayName) {
                setName(user.displayName);
                setStep(2); // Skip name input
            } else {
                setStep(1); // Ask name
            }
        };

        init();
    }, [user, userProfile, router]);

    const handleCreateStudio = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!studioName.trim()) return;

        setIsSubmitting(true);
        try {
            await createStudio(studioName, { ...user, displayName: name || user?.phoneNumber });
            showToast("Studio created successfully!", "success");
            router.push('/');
        } catch (error: any) {
            console.error(error);
            showToast("Failed to create studio.", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (step === 0) return <div className="flex bg-[#FDFDFD] h-screen items-center justify-center text-slate-400 font-medium">Setting up...</div>;

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#FDFDFD] relative overflow-hidden font-sans text-slate-800">
            {/* Gradient Blobs Background */}
            <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[60%] bg-purple-200/40 rounded-full blur-[100px] pointer-events-none animate-pulse-slow"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[60%] bg-pink-200/40 rounded-full blur-[100px] pointer-events-none animate-pulse-slow"></div>

            <div className="w-full max-w-md px-6 py-8 relative z-10 flex flex-col items-center justify-center min-h-[500px]">

                {/* Logo */}
                <div className="mb-8 relative">
                    <div className="relative h-20 w-20 bg-gradient-to-tr from-purple-600 to-pink-500 rounded-[1.5rem] flex items-center justify-center shadow-xl shadow-purple-500/20">
                        <FiHexagon className="text-white text-3xl stroke-[1.5]" />
                    </div>
                </div>

                <div className="text-center mb-10">
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">
                        {step === 1 ? "What's your name?" : "Enter studio name"}
                    </h1>
                    <p className="text-slate-500 text-sm font-medium">
                        {step === 1
                            ? "Let's get to know you better."
                            : "Create a space for your team and outfits."
                        }
                    </p>
                </div>

                {step === 1 && (
                    <form onSubmit={(e) => { e.preventDefault(); if (name) setStep(2); }} className="w-full space-y-6 animate-fade-in">
                        <div className="space-y-2">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-purple-200 text-center rounded-2xl py-4 text-xl font-medium text-slate-800 placeholder:text-slate-300 outline-none focus:ring-4 focus:ring-purple-500/10 transition-all shadow-sm"
                                placeholder="Your Name"
                                autoFocus
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!name.trim()}
                            className="w-full bg-[#0F172A] hover:bg-slate-800 text-white font-medium py-4 rounded-2xl shadow-xl shadow-slate-900/10 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2"
                        >
                            Next <FiArrowRight />
                        </button>
                    </form>
                )}

                {step === 2 && (
                    <form onSubmit={handleCreateStudio} className="w-full space-y-6 animate-fade-in">
                        <div className="space-y-2">
                            <input
                                type="text"
                                value={studioName}
                                onChange={(e) => setStudioName(e.target.value)}
                                className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-purple-200 text-center rounded-2xl py-4 text-xl font-medium text-slate-800 placeholder:text-slate-300 outline-none focus:ring-4 focus:ring-purple-500/10 transition-all shadow-sm"
                                placeholder="eg: Vastraa Designs"
                                autoFocus
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!studioName.trim() || isSubmitting}
                            className="w-full bg-[#0F172A] hover:bg-slate-800 text-white font-medium py-4 rounded-2xl shadow-xl shadow-slate-900/10 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    Create Studio <FiCheck />
                                </>
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
