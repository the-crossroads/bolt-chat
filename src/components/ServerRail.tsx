import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Compass, MessageSquare, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Server { id: string; name: string; icon_url: string | null; }

export function ServerRail() {
  const { user } = useAuth();
  const { serverId } = useParams();
  const nav = useNavigate();
  const [servers, setServers] = useState<Server[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [joinId, setJoinId] = useState("");

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("server_members")
      .select("servers(id,name,icon_url)")
      .eq("user_id", user.id);
    setServers((data ?? []).map((r: any) => r.servers).filter(Boolean));
  };

  useEffect(() => { load(); }, [user?.id]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !user) return;
    setCreating(true);
    const { data, error } = await supabase.from("servers").insert({ name: name.trim(), owner_id: user.id }).select().single();
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Server created");
    setName(""); setOpen(false); await load();
    nav(`/servers/${data.id}`);
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinId.trim() || !user) return;
    const { error } = await supabase.from("server_members").insert({ server_id: joinId.trim(), user_id: user.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Joined!"); setJoinId(""); setOpen(false); await load();
    nav(`/servers/${joinId.trim()}`);
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className="w-[72px] bg-sidebar h-full flex flex-col items-center py-3 gap-2 overflow-y-auto scrollbar-thin">
        <RailButton active={!serverId || serverId === "@me"} onClick={() => nav("/")} tip="Direct Messages">
          <MessageSquare className="h-5 w-5" />
        </RailButton>
        <div className="w-8 h-px bg-border my-1" />
        {servers.map((s) => (
          <RailButton key={s.id} active={serverId === s.id} onClick={() => nav(`/servers/${s.id}`)} tip={s.name}>
            {s.icon_url ? <img src={s.icon_url} alt={s.name} className="h-full w-full object-cover rounded-[inherit]" /> : <span className="font-bold text-sm">{s.name.slice(0,2).toUpperCase()}</span>}
          </RailButton>
        ))}
        <Dialog open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <button className="h-12 w-12 rounded-[24px] bg-surface text-success hover:bg-success hover:text-success-foreground hover:rounded-2xl transition-all flex items-center justify-center">
                  <Plus className="h-5 w-5" />
                </button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">Add a server</TooltipContent>
          </Tooltip>
          <DialogContent>
            <DialogHeader><DialogTitle>Add a server</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <Label>Create new server</Label>
              <div className="flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My awesome community" maxLength={50} />
                <Button type="submit" disabled={creating}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}</Button>
              </div>
            </form>
            <div className="border-t border-border my-2" />
            <form onSubmit={join} className="space-y-3">
              <Label>Join with server ID</Label>
              <div className="flex gap-2">
                <Input value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="Server ID (UUID)" />
                <Button type="submit" variant="secondary">Join</Button>
              </div>
              <p className="text-xs text-muted-foreground">Ask a friend to share their server ID from server settings.</p>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function RailButton({ children, active, onClick, tip }: { children: React.ReactNode; active?: boolean; onClick: () => void; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button onClick={onClick} className={cn(
          "h-12 w-12 flex items-center justify-center overflow-hidden transition-all relative group",
          active ? "rounded-2xl bg-primary text-primary-foreground" : "rounded-[24px] bg-surface text-foreground hover:rounded-2xl hover:bg-primary hover:text-primary-foreground"
        )}>
          <span className={cn("absolute -left-3 top-1/2 -translate-y-1/2 w-1 bg-foreground rounded-r-full transition-all", active ? "h-10" : "h-0 group-hover:h-5")} />
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{tip}</TooltipContent>
    </Tooltip>
  );
}
