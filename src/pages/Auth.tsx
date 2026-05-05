import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { MessageSquare, Loader2 } from "lucide-react";

const signupSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "At least 6 characters").max(72),
  username: z.string().trim().min(2).max(24).regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, underscore"),
});
const loginSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(1).max(72),
});

export default function Auth() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = signupSchema.safeParse(data);
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { username: parsed.data.username, display_name: parsed.data.username },
      },
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Welcome to Bolt!");
    nav("/");
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    nav("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center mb-3 shadow-[var(--shadow-elegant)]">
            <MessageSquare className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Bolt</h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time chat for your community</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-6 shadow-xl">
          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-2 w-full mb-6 bg-surface-2">
              <TabsTrigger value="login">Log in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" required /></div>
                <div className="space-y-2"><Label>Password</Label><Input name="password" type="password" required /></div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Log in
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2"><Label>Username</Label><Input name="username" required placeholder="cool_user" /></div>
                <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" required /></div>
                <div className="space-y-2"><Label>Password</Label><Input name="password" type="password" required minLength={6} /></div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
