'use client';

import { useEffect } from 'react';

export const PWAInitialize = () => {
    useEffect(() => {
        // ANDROID FULLSCREEN LOGIC (IMMERISVE MODE ATTEMPT)
        const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
        const isStandalone = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;

        if (isAndroid && !isStandalone) {
            const enterFullscreen = () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const docEl = document.documentElement as any;
                if (docEl.requestFullscreen) {
                    docEl.requestFullscreen().catch(() => { });
                } else if (docEl.webkitRequestFullscreen) {
                    docEl.webkitRequestFullscreen();
                }
            };

            // Try on interactions to force immersive mode
            document.addEventListener('click', enterFullscreen, { once: true });
            document.addEventListener('touchstart', enterFullscreen, { once: true });
        }
    }, []);

    // INSTALL PROMPT LOGIC
    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handleBeforeInstallPrompt = (e: any) => {
            e.preventDefault();

            // Check if we should prompt (session storage to avoid spam)
            if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pwa_prompt_shown')) return;

            // Use the global nativePopup if available
            // @ts-expect-error - Custom window property
            if (window.nativePopup) {
                // @ts-expect-error - Custom window property
                window.nativePopup('confirm', 'Install VastraaOS for a faster, offline-ready experience?')
                    .then((confirmed: boolean) => {
                        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('pwa_prompt_shown', 'true');
                        if (confirmed) {
                            e.prompt();
                        }
                    });
            }
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    return null;
}
