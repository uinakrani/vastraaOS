"use client";

import Link from "next/link";
import DashboardLayout from "../../components/DashboardLayout";
import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "../../components/ToastProvider";
import { collection, getDocs, query, orderBy, limit, startAfter, QueryDocumentSnapshot } from "firebase/firestore";
import Image from "next/image";
import { db } from "../../firebaseConfig";
import { formatINR } from "../../utils/format";
import { UserAuth } from "../../context/AuthContext";
import { FiRefreshCw, FiSearch, FiPlus } from "react-icons/fi";

export default function OutfitsList() {
  const { user, loading: authLoading } = UserAuth();
  const [outfits, setOutfits] = useState<any[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();


  const fetchOutfits = useCallback(async (isLoadMore = false) => {
    // Prevent duplicate calls
    if (loadingMore || (!isLoadMore && !loading && outfits.length > 0)) return;
    // ^ Logic: If loading more, stop. If initial load but we already have outfits (and not forced reload), stop.
    // Actually, simple lock is better inside.

    try {
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        const cached = typeof window !== 'undefined' ? localStorage.getItem("outfits_list_cache") : null;
        if (!cached) {
          setLoading(true);
        }
      }

      // LIMIT 50
      const outfitsCollectionRef = collection(db, "outfits");
      let q = query(outfitsCollectionRef, orderBy("createdAt", "desc"), limit(50));

      if (isLoadMore && lastDoc) {
        q = query(outfitsCollectionRef, orderBy("createdAt", "desc"), startAfter(lastDoc), limit(50));
      }

      const querySnapshot = await getDocs(q);
      const newOutfits = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      if (querySnapshot.docs.length < 50) {
        setHasMore(false);
      }

      if (isLoadMore) {
        setOutfits((prev) => {
          // Dedupe just in case
          const existingIds = new Set(prev.map(o => o.id));
          const uniqueNew = newOutfits.filter(o => !existingIds.has(o.id));
          return [...prev, ...uniqueNew];
        });
      } else {
        setOutfits(newOutfits);
        // Only cache first page or reasonable amount
        localStorage.setItem("outfits_list_cache", JSON.stringify(newOutfits));
      }

    } catch (err: any) {
      console.error("Error fetching outfits: ", err);
      let errorMessage = "Failed to load outfits: Unknown error";
      if (err.message) errorMessage = `Error: ${err.message}`;
      showToast(errorMessage, "error");
    } finally {
      if (isLoadMore) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, [lastDoc, loadingMore, loading, outfits.length]); // Dependencies for callback

  // Observer Effect
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !searchTerm) {
          fetchOutfits(true);
        }
      },
      { threshold: 1.0 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMore, loadingMore, fetchOutfits, searchTerm]);

  useEffect(() => {
    // 1. Instant Load from Cache
    const cached = localStorage.getItem("outfits_list_cache");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOutfits(parsed);
          setLoading(false);
        }
      } catch (e) {
        console.error("Cache parsing error", e);
      }
    }

    // 2. Fetch fresh data when Auth is ready
    if (!authLoading && user) {
      fetchOutfits().catch(e => console.warn("Fetch interrupted", e));
    }
  }, [user, authLoading]);

  // Client-side filtering for Search AND Archive status
  // We filter out 'Archived' items from the main list view unless specifically searching for them (optional, but keep it simple: hide archived)
  const finalOutfits = outfits.filter(
    (outfit) => {
      const isArchived = outfit.status === 'Archived';
      if (isArchived) return false; // Hide archived by default for cleaner UI

      const matchesSearch = outfit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        outfit.code.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    }
  );

  return (
    <DashboardLayout>

      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight leading-tight">Outfits</h1>
              <p className="text-xs text-gray-500 font-medium">Collection</p>
            </div>
          </div>

          <Link
            href="/outfits/add"
            className="flex items-center justify-center w-9 h-9 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all font-bold text-xl flex-shrink-0"
            title="Add Outfit"
          >
            <span>+</span>
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        {/* Search Bar */}
        <div className="mb-6 relative h-10">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <FiSearch className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-white placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm transition-colors"
          />
        </div>



        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse bg-white rounded-xl h-64 border border-gray-100"></div>
            ))}
          </div>
        ) : finalOutfits.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <p className="text-gray-500 text-sm">No outfits found matching your criteria.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 md:gap-4">
              {finalOutfits.map((outfit) => (
                <div key={outfit.id} className="group flex flex-col bg-white rounded-xl border border-gray-100 transition-all duration-300 overflow-hidden">
                  <div className="aspect-[3/4] w-full bg-gray-50 relative overflow-hidden">
                    {outfit.imageUrl ? (
                      <Image
                        src={outfit.imageUrl}
                        alt={outfit.name}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 768px) 33vw, 20vw"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-50 text-gray-300">
                        <span className="text-xl font-bold tracking-widest">{outfit.code ? outfit.code.slice(0, 2) : "NA"}</span>
                      </div>
                    )}
                    <Link href={`/outfits/${outfit.id}`} className="absolute inset-0 z-10" />
                  </div>

                  <div className="p-2 text-center">
                    <Link href={`/outfits/${outfit.id}`} className="text-xs font-medium text-gray-900 line-clamp-1 hover:text-indigo-600 transition-colors">
                      {outfit.name}
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {!searchTerm && hasMore && (
              <div ref={observerTarget} className="mt-10 flex justify-center py-4">
                {loadingMore && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <FiRefreshCw className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">Loading more outfits...</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
