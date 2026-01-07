"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FiSearch, FiArrowRight, FiLoader, FiPlus, FiShoppingBag, FiCalendar, FiClock } from "react-icons/fi";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "../firebaseConfig";
import debounce from "lodash.debounce";

interface SearchResult {
    id: string;
    name: string;
    code: string;
    imageUrl?: string;
    price: number;
}

export default function GlobalSearch() {
    const [isOpen, setIsOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(false); // For animation
    const [queryText, setQueryText] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const lastSpacePress = useRef<number>(0);

    // Toggle with Double Spacebar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                closeModal();
                return;
            }

            const target = e.target as HTMLElement;
            const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

            if (e.key === " " && !isInput) {
                const now = Date.now();
                if (now - lastSpacePress.current < 300) {
                    e.preventDefault();
                    if (!isOpen) openModal();
                    else closeModal();
                    lastSpacePress.current = 0;
                } else {
                    lastSpacePress.current = now;
                }
            }

            // Cmd+K or Ctrl+K Support
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                if (!isOpen) openModal();
                else closeModal();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen]);

    const openModal = () => {
        setIsOpen(true);
        // Small timeout to allow render before animating in
        setTimeout(() => setIsVisible(true), 10);
        setTimeout(() => inputRef.current?.focus(), 50);
        setQueryText("");
        setResults([]);
        setSelectedIndex(0);
    };

    const closeModal = () => {
        setIsVisible(false);
        setTimeout(() => setIsOpen(false), 300); // Wait for transition
    };

    const performSearch = useCallback(
        debounce(async (term: string) => {
            if (!term.trim()) {
                setResults([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const qTerm = term.toUpperCase();

                // Parallel Search: Code OR Name
                const codeQuery = query(
                    collection(db, "outfits"),
                    where("code", ">=", qTerm),
                    where("code", "<=", qTerm + "\uf8ff"),
                    limit(5)
                );

                const nameQuery = query(
                    collection(db, "outfits"),
                    where("name", ">=", qTerm),
                    where("name", "<=", qTerm + "\uf8ff"),
                    limit(5)
                );

                const [codeSnaps, nameSnaps] = await Promise.all([
                    getDocs(codeQuery),
                    getDocs(nameQuery)
                ]);

                const resultsMap = new Map();
                codeSnaps.docs.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() }));
                nameSnaps.docs.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() }));

                const merged = Array.from(resultsMap.values()) as SearchResult[];
                setResults(merged.slice(0, 10)); // Limit total
                setSelectedIndex(0);
            } catch (err) {
                console.error("Global search error:", err);
            } finally {
                setLoading(false);
            }
        }, 300),
        []
    );

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQueryText(val);
        performSearch(val);
    };

    const handleNavigate = (path: string) => {
        closeModal();
        router.push(path);
    };

    const quickActions = [
        { name: "Create New Order", icon: <FiPlus />, path: "/orders/add", shortcut: "C" },
        { name: "Browse Outfits", icon: <FiSearch />, path: "/outfits", shortcut: "B" },
        { name: "Process Return", icon: <FiClock />, path: "/returns", shortcut: "R" },
        { name: "View All Orders", icon: <FiShoppingBag />, path: "/orders", shortcut: "O" },
    ];

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const list = queryText ? results : quickActions;
        const maxIndex = list.length - 1;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(prev => (prev < maxIndex ? prev + 1 : 0));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : maxIndex));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (queryText && results[selectedIndex]) {
                handleNavigate(`/outfits/${results[selectedIndex].id}`);
            } else if (!queryText && quickActions[selectedIndex]) {
                handleNavigate(quickActions[selectedIndex].path);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className={`fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] transition-all duration-300 ease-out bg-black/40 backdrop-blur-sm px-4
            ${isVisible ? "opacity-100" : "opacity-0"}`}
            onClick={closeModal}
        >
            <div
                className={`w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
                ${isVisible ? "translate-y-0 scale-100 opacity-100" : "-translate-y-4 scale-95 opacity-0"}`}
                onClick={e => e.stopPropagation()}
            >

                {/* Search Header */}
                <div className="flex items-center px-5 py-4 border-b border-gray-100">
                    <FiSearch className="w-5 h-5 text-indigo-500 mr-4" />
                    <input
                        ref={inputRef}
                        type="text"
                        className="flex-1 text-lg font-medium text-gray-800 placeholder-gray-400 focus:outline-none bg-transparent h-10"
                        placeholder="Search outfits or type for actions..."
                        value={queryText}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                    />
                    <div className="flex gap-2">
                        <kbd className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold text-gray-400 bg-gray-100 border border-gray-200 rounded">Esc</kbd>
                    </div>
                </div>

                {/* Content Area */}
                <div className="max-h-[60vh] overflow-y-auto">
                    {loading ? (
                        <div className="py-12 flex justify-center text-indigo-500">
                            <FiLoader className="w-8 h-8 animate-spin" />
                        </div>
                    ) : queryText ? (
                        /* Results */
                        results.length > 0 ? (
                            <div className="py-2">
                                <div className="px-4 pb-2 pt-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Outfits</div>
                                {results.map((item, idx) => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleNavigate(`/outfits/${item.id}`)}
                                        className={`px-5 py-3 flex items-center justify-between cursor-pointer transition-colors ${idx === selectedIndex ? "bg-indigo-50 border-l-4 border-indigo-500 pl-[16px]" : "hover:bg-gray-50 border-l-4 border-transparent"}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden border border-gray-200">
                                                {item.imageUrl && <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-800">{item.name}</div>
                                                <div className="text-xs text-gray-500 font-mono">{item.code}</div>
                                            </div>
                                        </div>
                                        <FiArrowRight className={`w-4 h-4 text-indigo-400 ${idx === selectedIndex ? "opacity-100" : "opacity-0"}`} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 text-center text-gray-500">
                                <p>No outfits found for "{queryText}"</p>
                            </div>
                        )
                    ) : (
                        /* Quick Actions (Default) */
                        <div className="py-2">
                            <div className="px-5 pb-2 pt-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Quick Actions</div>
                            {quickActions.map((action, idx) => (
                                <div
                                    key={action.name}
                                    onClick={() => handleNavigate(action.path)}
                                    className={`px-5 py-3 flex items-center gap-4 cursor-pointer transition-colors ${idx === selectedIndex ? "bg-indigo-50 border-l-4 border-indigo-500 pl-[16px]" : "hover:bg-gray-50 border-l-4 border-transparent"}`}
                                >
                                    <div className={`p-2 rounded-lg ${idx === selectedIndex ? "bg-white text-indigo-600 shadow-sm" : "bg-gray-100 text-gray-500"}`}>
                                        {action.icon}
                                    </div>
                                    <span className="flex-1 text-sm font-semibold text-gray-700">{action.name}</span>
                                    <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded opacity-50">↵</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-400 flex justify-between items-center">
                    <span className="flex items-center gap-2">
                        <span className="font-bold bg-white border border-gray-200 px-1 rounded">↑↓</span> to navigate
                        <span className="font-bold bg-white border border-gray-200 px-1 rounded ml-2">↵</span> to select
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        VastraaOS
                    </span>
                </div>
            </div>
        </div>
    );
}
