"use client";

import { useEffect, useState } from "react";
import { db } from "../../firebaseConfig";
import { collection, getDocs, limit, query } from "firebase/firestore";

export default function TestFirebase() {
    const [status, setStatus] = useState("Testing...");
    const [logs, setLogs] = useState<string[]>([]);
    const [config, setConfig] = useState<any>(null);

    const addLog = (msg: string) => setLogs(p => [...p, `${new Date().toLocaleTimeString()}: ${msg}`]);

    useEffect(() => {
        // Reveal config (safe parts)
        import("../../firebaseConfig").then(module => {
            // manually inspect the object if possible or just rely on what we see in code
            // We can't easily see the exported config object if it's not exported directly as a value we can read,
            // but we imported 'app', 'auth', 'db'. 
            // We'll just run the test.
        });

        const runTest = async () => {
            try {
                addLog("Starting connection test...");
                addLog("Attempting to fetch 1 outfit...");

                // Timeout race
                const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout (5s)")), 5000));

                const q = query(collection(db, "outfits"), limit(1));
                const snapshot: any = await Promise.race([getDocs(q), timeout]);

                addLog(`Success! Found ${snapshot.size} documents.`);
                setStatus("Connected ✅");
            } catch (e: any) {
                addLog(`Error: ${e.message}`);
                console.error(e);
                setStatus("Failed ❌");
            }
        };

        runTest();
    }, []);

    return (
        <div className="p-10 font-mono">
            <h1 className="text-2xl font-bold mb-4">Firebase Diagnostic</h1>
            <div className={`p-4 rounded border ${status.includes("Connected") ? "bg-green-100 border-green-400" : "bg-red-100 border-red-400"}`}>
                Status: {status}
            </div>
            <div className="mt-4 bg-gray-100 p-4 rounded h-64 overflow-auto">
                {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>
    );
}
