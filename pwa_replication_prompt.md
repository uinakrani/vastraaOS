# PWA Replication Prompt

**Instructions:** Copy the following text and use it as a prompt for your AI coding assistant to replicate the "Royal Suppliers" PWA experience in your new Next.js application.

---

## **Prompt: Create a Premium, Native-Like PWA Experience**

I want to turn this Next.js application into a high-quality Progressive Web App (PWA) that feels indistinguishable from a native iOS/Android app. Please implement the following "Best Practices" and "Secret Sauce" configurations derived from a proven production app.

### **1. Core Configuration & Dependencies**
*   **Stack:** Next.js (App Router), Tailwind CSS, Lucide React (icons).
*   **Fonts:** Use `Inter` from `next/font/google`.
*   **PWA Plugin:** Install `next-pwa` and configure it in `next.config.js` to output to `public`.
*   **Manifest:** Create a dynamic manifest route at `app/api/manifest/route.ts` that serves the implementation details (name, icons, start_url).
    *   **Theme Color:** `#2e31fb` (Primary Blue).
    *   **Display:** `standalone`.
*   **Meta Tags:** In `app/layout.tsx`, ensure `viewport` is set to `width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover`. Add `appleWebApp` configuration (`capable: true`, `statusBarStyle: 'default'`).

### **2. Global CSS "The Native Feel" (Crucial)**
Update `app/globals.css` with these specific resets to remove "web" behaviors:
*   **Disable Selection:** `user-select: none;` (prevent text highlighting on long press).
*   **Touch Action:** `touch-action: manipulation;`
*   **Overscroll:** `overscroll-behavior: none;` (prevent rubber-banding).
*   **Scrollbars:** Hide ALL scrollbars using `::-webkit-scrollbar { display: none; }` and `.scrollbar-hide` utility.
*   **Full Height:** Force `html, body, #__next` to `height: 100%; min-height: 100dvh;` (use dynamic viewport units).
*   **Safe Areas:** Define CSS variables for `env(safe-area-inset-*)` and create utility classes (`.pt-safe`, `.pb-safe`, `.pl-safe`, `.pr-safe`).
*   **Standalone Overrides:** Use `@media (display-mode: standalone)` and `html.standalone` class to apply specific fixes (e.g., status bar background colors) only when installed.

### **3. UI Components System**
Implement the following custom components to replace browser defaults:

#### **A. `NativePopup` (Modal System)**
*   **Goal:** Replace `window.alert` and `window.confirm` with a custom, promise-based modal system.
*   **Design:**
    *   Backdrop blur (`backdrop-blur-md`).
    *   Smooth entry animation (`scale-90 translate-y-8` -> `scale-100`).
    *   Haptic-like specific types: `success` (Green Check), `error` (Red Alert), `info` (Blue Info), `confirm` (Yes/No).
    *   Render using `createPortal` to `document.body`.
    *   Wait for exit animations before resolving promises.

#### **B. `AndroidFullscreen` (Logic)**
*   **Goal:** Force Android devices into "Kiosk/Immersive Mode" by hiding the navigation/status bars.
*   **Logic:**
    *   Detect Android UA.
    *   Aggressively call `document.documentElement.requestFullscreen()` on user interaction (click/touch).
    *   Check for `display-mode: standalone` to trigger automatically.

#### **C. `PWAInstallPrompt` (Logic)**
*   **Goal:** Custom install UI instead of the browser banner.
*   **Logic:**
    *   Listen for `beforeinstallprompt` event.
    *   Prevent default browser behavior.
    *   Show a custom `NativePopup` asking the user to install (listing benefits: offline, faster).
    *   Call `promptEvent.prompt()` on acceptance.

### **4. Animations & Transitions**
Add these keyframes to `tailwind.config.js` or `globals.css` for smoothness:
*   `button-press`: `transform: scale(0.95)` at 50% (for tactile click feedback).
*   `slide-up`: For bottom sheets/drawers.
*   `slide-in`: For toasts.
*   `fade-in`: General content entry.

### **5. Additional Behaviors**
*   **Toast System:** Use the `NativePopup` system for "Toasts" as well (auto-dismissing top/center notifications) to maintain consistency.
*   **Back Button:** Ensure Android back button closes modals/drawers first before navigating history (if possible via history state hacks, or just rely on React state).

**Final Output Requirement:** The app should not feel like a website. It should not be selectable, zoomable (unless intended), or have rubber-band scrolling. It should feel strictly like a native application app shell.
