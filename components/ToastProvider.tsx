"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Check, AlertCircle, X, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);

        // Haptic on toast
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(10);
        }
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed top-0 left-0 right-0 z-[9999] flex flex-col items-center pointer-events-none p-4 pt-safe gap-3">
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsExiting(true);
        }, 3000);

        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (isExiting) {
            const timer = setTimeout(() => {
                onRemove(toast.id);
            }, 300); // Animation duration
            return () => clearTimeout(timer);
        }
    }, [isExiting, onRemove, toast.id]);

    const handleDismiss = () => setIsExiting(true);

    return (
        <div
            className={`
                pointer-events-auto
                relative w-full max-w-[90vw] md:max-w-md
                flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl backdrop-blur-xl border border-white/20
                transition-all duration-300 transform
                ${toast.type === 'success' ? 'bg-white/90 text-gray-900' : ''}
                ${toast.type === 'error' ? 'bg-white/90 text-gray-900' : ''}
                ${toast.type === 'info' ? 'bg-white/90 text-gray-900' : ''}
                ${isExiting ? 'opacity-0 scale-95 -translate-y-4' : 'opacity-100 scale-100 translate-y-0 animate-fade-in'}
            `}
            style={{
                animation: !isExiting ? 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse' : '' // Fake slide down
            }}
            onClick={handleDismiss}
        >
            <div className={`
                flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center 
                ${toast.type === 'success' ? 'bg-green-100' : ''}
                ${toast.type === 'error' ? 'bg-red-100' : ''}
                ${toast.type === 'info' ? 'bg-blue-100' : ''}
            `}>
                {toast.type === 'success' && <Check className="w-5 h-5 text-green-600" />}
                {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
                {toast.type === 'info' && <Info className="w-5 h-5 text-blue-600" />}
            </div>

            <div className="flex-1">
                <h4 className="text-sm font-bold capitalize">{toast.type}</h4>
                <p className="text-xs text-gray-600 leading-tight">{toast.message}</p>
            </div>
        </div>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
