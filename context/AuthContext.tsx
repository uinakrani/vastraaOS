"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  setPersistence,
  browserLocalPersistence,
  User,
} from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { UserProfile, StudioMember } from "../lib/types/studio";
import { useRouter, usePathname } from "next/navigation";

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  currentStudio: StudioMember | null;
  googleSignIn: () => Promise<void>;
  logOut: () => Promise<void>;
  switchStudio: (studioId: string) => Promise<void>;
  loading: boolean;
  error?: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthContextProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [currentStudio, setCurrentStudio] = useState<StudioMember | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  const googleSignIn = async () => {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Google Sign-In Error:", err);
      setError(err.message || "Failed to sign in.");
      throw err;
    }
  };

  const logOut = async () => {
    await signOut(auth);
    setUser(null);
    setUserProfile(null);
    setCurrentStudio(null);
    localStorage.removeItem("last_studio_id");
  };

  const switchStudio = async (studioId: string) => {
    if (!userProfile) return;
    const target = userProfile.studios.find(s => s.studioId === studioId);
    if (target) {
      setCurrentStudio(target);
      localStorage.setItem("last_studio_id", studioId);
      // Optional: Update preference in Firestore
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      await setPersistence(auth, browserLocalPersistence);

      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        setUser(currentUser); // update raw user immediately

        if (currentUser) {
          // Fetch Extended Profile
          const userRef = doc(db, "users", currentUser.uid);

          // Real-time listener for profile changes (joined new studio, etc.)
          const profileUnsub = onSnapshot(userRef, async (docSnap) => {
            if (docSnap.exists()) {
              const profile = docSnap.data() as UserProfile;
              setUserProfile(profile);

              // Determine Current Studio
              if (profile.studios && profile.studios.length > 0) {
                // 1. Try local storage preference
                const content = localStorage.getItem("last_studio_id");
                const pref = profile.studios.find(s => s.studioId === content);

                // 2. Try Firestore preference
                const cloudPref = profile.studios.find(s => s.studioId === profile.currentStudioId);

                // 3. Fallback to first
                setCurrentStudio(pref || cloudPref || profile.studios[0]);
              } else {
                setCurrentStudio(null);
              }

              // --- REDIRECT LOGIC ---
              // If on a protected route but no studio, go to onboarding
              // Protected routes: everything except /login, /onboarding, /api, /_next
              const isPublic = pathname === '/login' || pathname === '/onboarding' || pathname.startsWith('/api');

              if (!isPublic && (!profile.studios || profile.studios.length === 0)) {
                router.push('/onboarding');
              }
            } else {
              // Profile doesn't exist yet -> Send to Onboarding to create it
              setUserProfile(null);
              setCurrentStudio(null);
              if (pathname !== '/onboarding' && pathname !== '/login') {
                router.push('/onboarding');
              }
            }
            setLoading(false);
          });

          return () => profileUnsub(); // cleanup listener when auth state changes (rare)

        } else {
          // No User
          setLoading(false);
          setUserProfile(null);
          setCurrentStudio(null);
        }
      });
      return unsubscribe;
    };

    initializeAuth();
  }, [pathname, router]); // Dependency on pathname to re-check redirection rules

  return (
    <AuthContext.Provider value={{ user, userProfile, currentStudio, googleSignIn, logOut, switchStudio, loading, error }}>
      {loading ? null : children}
    </AuthContext.Provider>
  );
};

export const UserAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("UserAuth must be used within an AuthContextProvider");
  }
  return context;
};

