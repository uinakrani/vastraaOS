"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { UserAuth } from "../../context/AuthContext";
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import { FiHexagon, FiSmartphone, FiArrowRight, FiCheck } from "react-icons/fi";
import { useToast } from "../../components/ToastProvider";

export default function LoginPage() {
    const { user, googleSignIn, loading, error: authError } = UserAuth();
    const router = useRouter();
    const { showToast } = useToast();

    // UI State
    const [step, setStep] = useState<'phone' | 'otp'>('phone');
    const [isAnimating, setIsAnimating] = useState(false);

    // Data State
    const [phoneNumber, setPhoneNumber] = useState("");
    const [otp, setOtp] = useState(["", "", "", "", "", ""]);
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const [isSigningIn, setIsSigningIn] = useState(false);
    const [localError, setLocalError] = useState("");

    // Setup Recaptcha
    useEffect(() => {
        if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                'size': 'invisible',
                'callback': () => {
                    // reCAPTCHA solved
                },
                'expired-callback': () => {
                    showToast("Recaptcha expired. Please try again.", "error");
                }
            });
        }
    }, [showToast]);

    // Handle Phone Submit
    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError("");

        if (phoneNumber.length < 10) {
            setLocalError("Please enter a valid mobile number");
            return;
        }

        const formattedNumber = phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber}`;
        setIsSigningIn(true);

        try {
            const verifier = window.recaptchaVerifier;
            const confirmation = await signInWithPhoneNumber(auth, formattedNumber, verifier);
            setConfirmationResult(confirmation);
            showToast("OTP sent successfully!", "success");

            // Transition
            setIsAnimating(true);
            setTimeout(() => {
                setStep('otp');
                setIsAnimating(false);
            }, 300);
        } catch (error: any) {
            console.error(error);
            setLocalError(error.message || "Failed to send OTP");
            showToast("Failed to verify/send OTP. Refresh and try again.", "error");
            if (window.recaptchaVerifier) {
                window.recaptchaVerifier.clear();
                window.recaptchaVerifier = undefined;
            }
        } finally {
            setIsSigningIn(false);
        }
    };

    // Handle OTP Submit
    const handleVerifyOtp = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        const code = otp.join("");
        if (code.length !== 6) return;

        setIsSigningIn(true);
        setLocalError("");

        try {
            if (confirmationResult) {
                await confirmationResult.confirm(code);
                showToast("Verified successfully!", "success");
                // AuthContext will pick up the user change and redirect
            }
        } catch (error: any) {
            setLocalError("Invalid OTP. Please try again.");
            showToast("Invalid OTP", "error");
        } finally {
            setIsSigningIn(false);
        }
    };

    const handleOtpChange = (index: number, value: string) => {
        if (isNaN(Number(value))) return;

        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);

        // Auto move focus
        if (value && index < 5) {
            otpInputRefs.current[index + 1]?.focus();
        }

        // Auto submit on fill
        if (newOtp.every(digit => digit !== "") && index === 5) {
            // Optional: trigger verify immediately or let user Click
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === "Backspace" && !otp[index] && index > 0) {
            otpInputRefs.current[index - 1]?.focus();
        }
    };

    const handleGoogleSignIn = async () => {
        setIsSigningIn(true);
        try {
            await googleSignIn();
        } catch (error: any) {
            setLocalError(error.message);
        } finally {
            setIsSigningIn(false);
        }
    };

    useEffect(() => {
        if (user && !loading) {
            router.push("/");
        }
    }, [user, loading, router]);


    if (loading) return null;

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#FDFDFD] relative overflow-hidden font-sans text-slate-800">
            {/* Recaptcha */}
            <div id="recaptcha-container"></div>

            {/* Gradient Blobs Background */}
            <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[60%] bg-purple-200/40 rounded-full blur-[100px] pointer-events-none animate-pulse-slow"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[60%] bg-pink-200/40 rounded-full blur-[100px] pointer-events-none animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

            {/* Main Content Container */}
            <div className={`w-full max-w-md px-6 py-8 relative z-10 flex flex-col items-center justify-center min-h-[600px] transition-all duration-500 ease-in-out ${isAnimating ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>

                {/* Logo / App Icon */}
                <div className="mb-8 relative group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-purple-600 to-pink-500 rounded-[2rem] blur-lg opacity-40 group-hover:opacity-60 transition-opacity"></div>
                    <div className="relative h-24 w-24 bg-gradient-to-tr from-purple-600 to-pink-500 rounded-[2rem] flex items-center justify-center shadow-xl shadow-purple-500/20 transform group-hover:scale-105 transition-transform duration-300">
                        <FiHexagon className="text-white text-4xl stroke-[1.5]" />
                    </div>
                </div>

                {/* Headers */}
                <div className="text-center mb-10">
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">
                        {step === 'phone' ? 'Get Started Today' : 'Verify Identity'}
                    </h1>
                    <p className="text-slate-500 text-sm font-medium">
                        {step === 'phone'
                            ? 'Sign up in just a few steps and take control of your rentals.'
                            : `Enter the code sent to ${phoneNumber}`
                        }
                    </p>
                </div>

                {/* Error Display */}
                {(localError || authError) && (
                    <div className="w-full mb-6 p-4 bg-red-50/80 border border-red-100/50 text-red-500 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-shake">
                        <div className="bg-red-100 p-1 rounded-full"><span className="block h-1.5 w-1.5 rounded-full bg-red-500"></span></div>
                        {localError || authError}
                    </div>
                )}

                {step === 'phone' ? (
                    <form onSubmit={handleSendOtp} className="w-full space-y-6 animate-fade-in">
                        {/* Phone Input */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-700 ml-1">Phone Number</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <FiSmartphone className="text-slate-400 group-focus-within:text-purple-600 transition-colors" />
                                </div>
                                <div className="absolute inset-y-0 left-10 flex items-center pointer-events-none">
                                    <span className="text-slate-500 font-semibold text-sm border-r border-slate-200 pr-3">+91</span>
                                </div>
                                <input
                                    type="tel"
                                    value={phoneNumber}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        if (val.length <= 10) setPhoneNumber(val);
                                    }}
                                    className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-purple-200 hover:bg-white focus:ring-4 focus:ring-purple-500/10 rounded-2xl py-4 pl-24 text-base font-medium text-slate-800 placeholder:text-slate-400 transition-all duration-200 outline-none shadow-sm group-hover:shadow-md"
                                    placeholder="Enter your phone"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Continue Button */}
                        <button
                            type="submit"
                            disabled={isSigningIn || phoneNumber.length < 10}
                            className="w-full bg-[#0F172A] hover:bg-slate-800 text-white font-medium py-4 rounded-2xl shadow-xl shadow-slate-900/10 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                        >
                            {isSigningIn ? (
                                <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    Continue <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>

                        <div className="relative py-2">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-slate-100"></span>
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-[#FDFDFD] px-4 text-slate-400 font-bold tracking-wider">or</span>
                            </div>
                        </div>

                        {/* Google Button */}
                        <button
                            type="button"
                            onClick={handleGoogleSignIn}
                            disabled={isSigningIn}
                            className="w-full bg-white border border-slate-100 hover:border-slate-200 text-slate-600 font-medium py-4 rounded-2xl shadow-sm hover:shadow-md active:scale-95 transition-all duration-200 flex items-center justify-center gap-3"
                        >
                            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="h-5 w-5" />
                            <span>Google</span>
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleVerifyOtp} className="w-full space-y-8 animate-fade-in">
                        {/* OTP Inputs */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-xs font-bold text-slate-700">Enter secure code</label>
                                <button
                                    type="button"
                                    onClick={() => { setStep('phone'); setOtp(["", "", "", "", "", ""]); }}
                                    className="text-[10px] font-bold text-purple-600 hover:text-purple-700 uppercase tracking-wide"
                                >
                                    Change Number
                                </button>
                            </div>
                            <div className="flex justify-between gap-2">
                                {otp.map((digit, idx) => (
                                    <input
                                        key={idx}
                                        ref={(el) => { otpInputRefs.current[idx] = el }}
                                        type="tel"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(idx, e)}
                                        className="w-full aspect-[4/5] text-center text-2xl font-medium bg-slate-50 border-transparent focus:bg-white focus:border-purple-200 rounded-2xl outline-none focus:ring-4 focus:ring-purple-500/10 transition-all shadow-sm focus:shadow-md caret-purple-600 text-slate-800"
                                        autoComplete="one-time-code"
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Verify Button */}
                        <button
                            type="submit"
                            disabled={isSigningIn || otp.join("").length !== 6}
                            className="w-full bg-[#0F172A] hover:bg-slate-800 text-white font-medium py-4 rounded-2xl shadow-xl shadow-slate-900/10 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isSigningIn ? (
                                <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    Verify & Login <FiCheck />
                                </>
                            )}
                        </button>
                    </form>
                )}

                {/* Terms Footer */}
                <div className="mt-12 text-center">
                    <p className="text-[10px] font-medium text-slate-400">
                        By tapping "Continue", you agree to our <br />
                        <span className="text-slate-600 underline decoration-slate-300 cursor-pointer">Privacy Policy</span> & <span className="text-slate-600 underline decoration-slate-300 cursor-pointer">Terms of Service</span>
                    </p>
                </div>
            </div>
        </div>
    );
}

declare global {
    interface Window {
        recaptchaVerifier: RecaptchaVerifier | undefined;
    }
}
