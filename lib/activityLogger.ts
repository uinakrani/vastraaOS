import { db } from "../firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export type ActivityAction = 'CREATED' | 'UPDATED' | 'STATUS_CHANGE' | 'CANCELLED' | 'RETURNED';

export async function logOrderActivity(orderId: string, action: ActivityAction, description: string, metadata: any = {}) {
    try {
        await addDoc(collection(db, "orders", orderId, "activity_logs"), {
            action,
            description,
            metadata,
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error("Failed to log activity:", error);
        // Don't block main flow if logging fails
    }
}
