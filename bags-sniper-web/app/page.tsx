"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-pulse text-[#00de00] text-lg">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,222,0,0.15),transparent_50%)]" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(0,222,0,0.08),transparent_40%)]" />

      {/* Grid Pattern */}
      <div className="fixed inset-0 opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px),
                                  linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
        backgroundSize: '60px 60px'
      }} />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-20">
        {/* Hero */}
        <div className="text-center pt-16 pb-24">
          {/* Logo with Glow */}
          <div className="flex justify-center mb-10">
            <div className="relative">
              <div className="absolute inset-0 blur-3xl bg-[#00de00]/20 rounded-full scale-150" />
              <div className="relative w-28 h-28 drop-shadow-[0_0_30px_rgba(0,222,0,0.4)]">
                <Image src="/logo.png" alt="Bags Sniper" fill style={{ objectFit: "contain" }} priority />
              </div>
            </div>
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#00de00]/5 border border-[#00de00]/20 rounded-full mb-8">
            <span className="w-2 h-2 bg-[#00de00] rounded-full animate-pulse" />
            <span className="text-sm text-[#00de00]/80">Auto-Snipe on Claim</span>
          </div>

          {/* Title */}
          <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
            <span className="text-white">Buy the</span>
            <br />
            <span className="text-[#00de00] drop-shadow-[0_0_20px_rgba(0,222,0,0.5)]">Moment</span>
            <span className="text-white"> They Claim</span>
          </h1>

          {/* Subtitle */}
          <p className="text-gray-400 text-lg md:text-xl mb-12 max-w-lg mx-auto leading-relaxed">
            Snipe Bags.fm tokens the <span className="text-white">instant</span> creators claim their earnings.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => router.push("/signup")}
              className="group relative inline-flex items-center justify-center gap-3 bg-[#00de00] text-black font-bold text-lg px-8 py-4 rounded-xl 
                                           hover:bg-[#00ff00] transition-all duration-300 w-full sm:w-auto min-w-[200px]
                                           shadow-[0_0_40px_rgba(0,222,0,0.3)] hover:shadow-[0_0_60px_rgba(0,222,0,0.5)]"
            >
              <span>Get Started</span>
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>

            <button
              onClick={() => router.push("/login")}
              className="inline-flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white font-semibold text-lg px-8 py-4 rounded-xl 
                                           hover:bg-white/10 hover:border-white/20 transition-all duration-300 w-full sm:w-auto min-w-[200px]"
            >
              <span>Login</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
