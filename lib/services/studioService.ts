
import { db } from "../../firebaseConfig";
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    addDoc,
    query,
    where,
    getDocs,
    serverTimestamp,
    arrayUnion
} from "firebase/firestore";
import { Studio, UserProfile, Invitation } from "../types/studio";

// --- Studio Management ---

export const createStudio = async (studioName: string, user: any): Promise<Studio> => {
    // 1. Create Studio Doc
    const studioRef = doc(collection(db, "studios"));
    const newStudio: Studio = {
        id: studioRef.id,
        name: studioName,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        members: [user.uid]
    };
    await setDoc(studioRef, newStudio);

    // 2. Update User Profile to link this studio
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        await updateDoc(userRef, {
            studios: arrayUnion({
                studioId: newStudio.id,
                studioName: newStudio.name,
                role: 'owner'
            }),
            currentStudioId: newStudio.id
        });
    } else {
        // Should exist if onboarding flow is correct, but safe fallback:
        await setDoc(userRef, {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            createdAt: serverTimestamp(),
            studios: [{
                studioId: newStudio.id,
                studioName: newStudio.name,
                role: 'owner'
            }],
            currentStudioId: newStudio.id
        });
    }

    return newStudio;
};

// --- Invitation System ---

export const inviteUserByPhone = async (phoneNumber: string, studioId: string, studioName: string, inviterUser: any) => {
    // Check if already invited
    const invQuery = query(
        collection(db, "invitations"),
        where("phoneNumber", "==", phoneNumber),
        where("studioId", "==", studioId),
        where("status", "==", "pending")
    );
    const existingWithSame = await getDocs(invQuery);
    if (!existingWithSame.empty) {
        throw new Error("User already has a pending invitation to this studio.");
    }

    // Create Invitation
    const invitation: Omit<Invitation, 'id'> = {
        phoneNumber,
        studioId,
        studioName,
        invitedBy: inviterUser.displayName || "A Team Member",
        invitedByUid: inviterUser.uid,
        status: 'pending',
        createdAt: serverTimestamp()
    };

    await addDoc(collection(db, "invitations"), invitation);
};

export const checkAndAcceptInvitations = async (user: any) => {
    if (!user.phoneNumber) return;

    const invQuery = query(
        collection(db, "invitations"),
        where("phoneNumber", "==", user.phoneNumber),
        where("status", "==", "pending")
    );

    const snapshot = await getDocs(invQuery);

    if (snapshot.empty) return;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    // If user profile doesn't exist yet (very first login), we create it momentarily in Onboarding, 
    // but if we call this during AuthContext load, we might need to handle creation.
    // For now, assume this runs AFTER profile existence check or during Onboarding.

    const batchUpdates = [];

    for (const invDoc of snapshot.docs) {
        const invData = invDoc.data() as Invitation;

        // 1. Add user to Studio members
        const studioRef = doc(db, "studios", invData.studioId);
        await updateDoc(studioRef, {
            members: arrayUnion(user.uid)
        });

        // 2. Add studio to User profile
        await updateDoc(userRef, {
            studios: arrayUnion({
                studioId: invData.studioId,
                studioName: invData.studioName,
                role: 'member'
            }),
            // If no current studio, set this one? Handled by UI logic usually.
        });

        // 3. Mark invitation accepted
        await updateDoc(doc(db, "invitations", invDoc.id), {
            status: 'accepted'
        });
    }
};
