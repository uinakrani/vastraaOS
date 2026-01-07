
// Types for Studio Multi-tenancy

export interface Studio {
    id: string;
    name: string;
    ownerId: string;
    createdAt: any; // Firestore Timestamp
    members: string[]; // List of user UIDs for security rules
}

export interface StudioMember {
    studioId: string;
    studioName: string;
    role: 'owner' | 'admin' | 'member';
}

export interface UserProfile {
    uid: string;
    displayName: string | null;
    email: string | null;
    phoneNumber: string | null;
    photoURL: string | null;
    createdAt: any;

    // Studio associations
    studios: StudioMember[];
    currentStudioId: string | null; // Preference for last used studio
}

export interface Invitation {
    id?: string;
    phoneNumber: string;
    studioId: string;
    studioName: string;
    invitedBy: string; // Name of inviter
    invitedByUid: string;
    status: 'pending' | 'accepted' | 'declined';
    createdAt: any;
}
