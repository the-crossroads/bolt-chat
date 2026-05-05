import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ServerRail } from "@/components/ServerRail";
import { ChannelSidebar } from "@/components/ChannelSidebar";
import { ChatArea } from "@/components/ChatArea";
import { MemberList } from "@/components/MemberList";

export default function AppShell() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="h-screen w-screen flex bg-background overflow-hidden">
      <ServerRail />
      <ChannelSidebar />
      <ChatArea />
      <MemberList />
    </div>
  );
}
