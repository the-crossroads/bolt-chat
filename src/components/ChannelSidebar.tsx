import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Hash, Volume2, Plus, Settings, LogOut, Mic, Headphones, Copy, ChevronDown } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Channel { id: string; name: string; type: "text" | "voice"; }
interface Server { id: string; name: string; }

export function ChannelSidebar() {
  const { serverId, channelId } = useParams();
  const nav = useNavigate();
  const { user, signOut } = useAuth();
  const [server, setServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [profile, setProfile] = useState<{ username: string; avatar_url: string | null; status: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"text" | "voice">("text");
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    if (!serverId || !user) return;
    (async () => {
      const { data: s } = await supabase.from("servers").select("id,name").eq("id", serverId).maybeSingle();
      setServer(s);
      const { data: cs } = await supabase.from("channels").select("id,name,type").eq("server_id", serverId).order("position");
      setChannels((cs ?? []) as Channel[]);
      const { data: m } = await supabase.from("server_members").select("role").eq("server_id", serverId).eq("user_id", user.id).maybeSingle();
      setIsStaff(m?.role === "admin" || m?.role === "moderator");
      if (cs && cs.length && !channelId) nav(`/servers/${serverId}/channels/${cs[0].id}`, { replace: true });
    })();

    const ch = supabase.channel(`channels-${serverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "channels", filter: `server_id=eq.${serverId}` }, async () => {
        const { data: cs } = await supabase.from("channels").select("id,name,type").eq("server_id", serverId).order("position");
        setChannels((cs ?? []) as Channel[]);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [serverId, user?.id]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("username,avatar_url,status").eq("id", user.id).maybeSingle()
      .then(({ data }) => data && setProfile(data as any));
  }, [user?.id]);

  const createChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !serverId) return;
    const slug = newName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const { error } = await supabase.from("channels").insert({ server_id: serverId, name: slug, type: newType, position: channels.length });
    if (error) { toast.error(error.message); return; }
    toast.success("Channel created");
    setNewName(""); setOpen(false);
  };

  const copyId = () => { if (serverId) { navigator.clipboard.writeText(serverId); toast.success("Server ID copied"); } };

  if (!serverId || serverId === "@me") return <DMSidebar profile={profile} signOut={signOut} />;

  return (
    <div className="w-60 bg-surface h-full flex flex-col">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="h-12 px-4 border-b border-border shadow-sm flex items-center justify-between hover:bg-surface-3 transition-colors">
            <span className="font-semibold truncate">{server?.name ?? "..."}</span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuItem onClick={copyId}><Copy className="h-4 w-4 mr-2" />Copy server ID</DropdownMenuItem>
          {isStaff && <DropdownMenuItem onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Create channel</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={async () => {
            await supabase.from("server_members").delete().eq("server_id", serverId).eq("user_id", user!.id);
            toast.success("Left server"); nav("/");
          }}><LogOut className="h-4 w-4 mr-2" />Leave server</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1 overflow-y-auto scrollbar-thin py-3">
        <div className="px-2 flex items-center justify-between mb-1">
          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider px-2">Channels</span>
          {isStaff && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground p-1"><Plus className="h-4 w-4" /></button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create channel</DialogTitle></DialogHeader>
                <form onSubmit={createChannel} className="space-y-3">
                  <div><Label>Type</Label>
                    <Select value={newType} onValueChange={(v) => setNewType(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="voice">Voice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="new-channel" maxLength={32} /></div>
                  <Button type="submit" className="w-full">Create</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
        {channels.map((c) => (
          <button
            key={c.id}
            onClick={() => c.type === "text" ? nav(`/servers/${serverId}/channels/${c.id}`) : toast.info("Voice channels coming soon")}
            className={cn(
              "w-full mx-2 px-2 py-1.5 rounded flex items-center gap-2 text-sm group",
              channelId === c.id ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
            )}
            style={{ width: "calc(100% - 1rem)" }}
          >
            {c.type === "text" ? <Hash className="h-4 w-4 shrink-0" /> : <Volume2 className="h-4 w-4 shrink-0" />}
            <span className="truncate">{c.name}</span>
          </button>
        ))}
      </div>

      <UserPanel profile={profile} signOut={signOut} />
    </div>
  );
}

function DMSidebar({ profile, signOut }: any) {
  return (
    <div className="w-60 bg-surface h-full flex flex-col">
      <div className="h-12 px-4 border-b border-border flex items-center font-semibold">Direct Messages</div>
      <div className="flex-1 p-3 text-sm text-muted-foreground">
        Open a server from the left to start chatting.
      </div>
      <UserPanel profile={profile} signOut={signOut} />
    </div>
  );
}

function UserPanel({ profile, signOut }: { profile: any; signOut: () => void }) {
  return (
    <div className="h-14 px-2 bg-sidebar flex items-center gap-2">
      <UserAvatar src={profile?.avatar_url} name={profile?.username} status="online" size="md" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{profile?.username ?? "..."}</div>
        <div className="text-xs text-success">Online</div>
      </div>
      <button className="p-2 text-muted-foreground hover:text-foreground rounded hover:bg-surface-3"><Mic className="h-4 w-4" /></button>
      <button className="p-2 text-muted-foreground hover:text-foreground rounded hover:bg-surface-3"><Headphones className="h-4 w-4" /></button>
      <button onClick={signOut} className="p-2 text-muted-foreground hover:text-foreground rounded hover:bg-surface-3"><LogOut className="h-4 w-4" /></button>
    </div>
  );
}
