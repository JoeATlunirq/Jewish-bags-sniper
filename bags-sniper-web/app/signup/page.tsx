import AuthForm from "@/components/AuthForm";

export default function SignupPage() {
    return (
        <main className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
            {/* Background elements */}
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(0,222,0,0.1),transparent_50%)]" />
            <div className="fixed inset-0 opacity-[0.02]" style={{
                backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px),
                                  linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
                backgroundSize: '60px 60px'
            }} />

            <div className="relative z-10 w-full">
                <AuthForm view="signup" />
            </div>
        </main>
    );
}
