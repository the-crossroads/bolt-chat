import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "./UserAvatar";
import { Crown, Shield } from "lucide-react";

interface Member { user_id: string; role: "admin" | "moderator" | "member"; profiles: { username: string; avatar_url: string | null; status: string } }

export function MemberList() {
  const { serverId } = useParams();
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (!serverId || serverId === "@me") { setMembers([]); return; }
    (async () => {
      const { data } = await supabase
        .from("server_members")
        .select("user_id,role,profiles(username,avatar_url,status)")
        .eq("server_id", serverId);
      setMembers((data ?? []) as any);
    })();
  }, [serverId]);

  if (!serverId || serverId === "@me") return null;

  const groups = {
    admin: members.filter(m => m.role === "admin"),
    moderator: members.filter(m => m.role === "moderator"),
    member: members.filter(m => m.role === "member"),
  };

  return (
    <div className="hidden lg:flex w-60 bg-surface flex-col py-4 overflow-y-auto scrollbar-thin">
      {(["admin", "moderator", "member"] as const).map(role => groups[role].length > 0 && (
        <div key={role} className="mb-4">
          <div className="px-4 text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-1">
            {role === "admin" ? "Admins" : role === "moderator" ? "Moderators" : "Members"} — {groups[role].length}
          </div>
          {groups[role].map(m => (
            <div key={m.user_id} className="px-2 mx-2 py-1.5 rounded flex items-center gap-2 hover:bg-surface-3 cursor-pointer">
              <UserAvatar src={m.profiles?.avatar_url} name={m.profiles?.username} size="sm" status="online" />
              <span className="text-sm truncate flex-1">{m.profiles?.username}</span>
              {role === "admin" && <Crown className="h-3.5 w-3.5 text-warning" />}
              {role === "moderator" && <Shield className="h-3.5 w-3.5 text-primary" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
