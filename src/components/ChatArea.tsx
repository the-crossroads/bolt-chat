import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Hash, Pin, Search, Smile, Paperclip, Send, Pencil, Trash2, X } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";

interface Profile { id: string; username: string; avatar_url: string | null; }
interface Reaction { message_id: string; user_id: string; emoji: string; }
interface Message {
  id: string; channel_id: string | null; dm_id: string | null;
  author_id: string; content: string; attachment_url: string | null; attachment_type: string | null;
  pinned: boolean; edited_at: string | null; created_at: string;
}

const EMOJIS = ["👍","❤️","😂","🔥","🎉","😮","😢","🙏","👀","💯","✨","🚀"];

export function ChatArea() {
  const { channelId } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [channelName, setChannelName] = useState("");
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingChannel = useRef<any>(null);

  // Load channel + messages
  useEffect(() => {
    if (!channelId) return;
    setMessages([]); setReactions([]); setEditingId(null); setShowPins(false); setSearch("");
    (async () => {
      const { data: c } = await supabase.from("channels").select("name").eq("id", channelId).maybeSingle();
      setChannelName(c?.name ?? "");
      const { data } = await supabase.from("messages").select("*").eq("channel_id", channelId)
        .order("created_at", { ascending: true }).limit(100);
      const msgs = (data ?? []) as Message[];
      setMessages(msgs);
      await loadProfilesAndReactions(msgs);
      setTimeout(scrollToBottom, 50);
    })();

    const ch = supabase.channel(`messages-${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, async (p) => {
        const m = p.new as Message;
        setMessages((prev) => prev.find(x => x.id === m.id) ? prev : [...prev, m]);
        await ensureProfile(m.author_id);
        setTimeout(scrollToBottom, 50);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, (p) => {
        setMessages((prev) => prev.map(x => x.id === (p.new as any).id ? (p.new as Message) : x));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, (p) => {
        setMessages((prev) => prev.filter(x => x.id !== (p.old as any).id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, async () => {
        const ids = (await supabase.from("messages").select("id").eq("channel_id", channelId)).data?.map((m: any) => m.id) ?? [];
        if (ids.length) {
          const { data } = await supabase.from("reactions").select("*").in("message_id", ids);
          setReactions((data ?? []) as Reaction[]);
        }
      })
      .subscribe();

    // Typing presence
    const t = supabase.channel(`typing-${channelId}`, { config: { presence: { key: user?.id ?? "anon" } } })
      .on("presence", { event: "sync" }, () => {
        const state = t.presenceState() as Record<string, any[]>;
        const names: string[] = [];
        Object.entries(state).forEach(([uid, arr]) => {
          if (uid !== user?.id && arr[0]?.typing) names.push(arr[0].username);
        });
        setTyping(names);
      })
      .subscribe(async (s) => {
        if (s === "SUBSCRIBED" && user) {
          const { data: p } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
          await t.track({ typing: false, username: p?.username ?? "user" });
        }
      });
    typingChannel.current = t;

    return () => { supabase.removeChannel(ch); supabase.removeChannel(t); };
  }, [channelId, user?.id]);

  const ensureProfile = async (id: string) => {
    if (profiles[id]) return;
    const { data } = await supabase.from("profiles").select("id,username,avatar_url").eq("id", id).maybeSingle();
    if (data) setProfiles(p => ({ ...p, [id]: data as Profile }));
  };

  const loadProfilesAndReactions = async (msgs: Message[]) => {
    const ids = [...new Set(msgs.map(m => m.author_id))];
    if (ids.length) {
      const { data } = await supabase.from("profiles").select("id,username,avatar_url").in("id", ids);
      const map: Record<string, Profile> = {};
      (data ?? []).forEach((p: any) => { map[p.id] = p; });
      setProfiles(map);
    }
    const mids = msgs.map(m => m.id);
    if (mids.length) {
      const { data: r } = await supabase.from("reactions").select("*").in("message_id", mids);
      setReactions((r ?? []) as Reaction[]);
    }
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user || !channelId) return;
    const content = text.trim();
    setText("");
    typingChannel.current?.track({ typing: false });
    const { error } = await supabase.from("messages").insert({ channel_id: channelId, author_id: user.id, content });
    if (error) toast.error(error.message);
  };

  const upload = async (file: File) => {
    if (!user || !channelId) return;
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("chat-uploads").upload(path, file);
    if (error) { toast.error(error.message); return; }
    const { data: { publicUrl } } = supabase.storage.from("chat-uploads").getPublicUrl(path);
    await supabase.from("messages").insert({
      channel_id: channelId, author_id: user.id, content: "",
      attachment_url: publicUrl, attachment_type: file.type,
    });
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = reactions.find(r => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await supabase.from("reactions").delete().match({ message_id: messageId, user_id: user.id, emoji });
    } else {
      await supabase.from("reactions").insert({ message_id: messageId, user_id: user.id, emoji });
    }
  };

  const togglePin = async (m: Message) => {
    const { error } = await supabase.from("messages").update({ pinned: !m.pinned }).eq("id", m.id);
    if (error) toast.error(error.message);
  };
  const saveEdit = async (id: string) => {
    const { error } = await supabase.from("messages").update({ content: editText, edited_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditingId(null);
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  const handleTyping = (v: string) => {
    setText(v);
    if (typingChannel.current && user) {
      typingChannel.current.track({ typing: true, username: profiles[user.id]?.username ?? "user" });
      clearTimeout((typingChannel.current as any)._t);
      (typingChannel.current as any)._t = setTimeout(() => typingChannel.current.track({ typing: false }), 2000);
    }
  };

  const visible = search ? messages.filter(m => m.content.toLowerCase().includes(search.toLowerCase())) : messages;
  const pinned = messages.filter(m => m.pinned);

  if (!channelId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center"><Hash className="h-12 w-12 mx-auto mb-3 opacity-50" /><p>Select a channel to start chatting</p></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-surface-2 min-w-0">
      <div className="h-12 px-4 border-b border-border flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Hash className="h-5 w-5 text-muted-foreground shrink-0" />
          <span className="font-semibold truncate">{channelName}</span>
        </div>
        <div className="flex items-center gap-1">
          <Popover open={showPins} onOpenChange={setShowPins}>
            <PopoverTrigger asChild>
              <button className="p-2 text-muted-foreground hover:text-foreground rounded"><Pin className="h-5 w-5" /></button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="p-3 border-b border-border font-semibold">Pinned messages</div>
              <ScrollArea className="max-h-80">
                {pinned.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No pinned messages.</div> :
                  pinned.map(m => (
                    <div key={m.id} className="p-3 border-b border-border text-sm">
                      <div className="text-xs font-semibold text-foreground">{profiles[m.author_id]?.username ?? "user"}</div>
                      <div className="text-muted-foreground mt-1">{m.content}</div>
                    </div>
                  ))}
              </ScrollArea>
            </PopoverContent>
          </Popover>
          <button onClick={() => setShowSearch(s => !s)} className="p-2 text-muted-foreground hover:text-foreground rounded"><Search className="h-5 w-5" /></button>
        </div>
      </div>

      {showSearch && (
        <div className="px-4 py-2 border-b border-border bg-surface flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages…" className="border-0 bg-transparent focus-visible:ring-0 h-8" />
          <button onClick={() => { setShowSearch(false); setSearch(""); }}><X className="h-4 w-4" /></button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-1">
        {visible.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <Hash className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="font-semibold text-foreground">Welcome to #{channelName}</p>
            <p className="text-sm">This is the start of the channel.</p>
          </div>
        )}
        {visible.map((m, i) => {
          const prev = visible[i - 1];
          const grouped = prev && prev.author_id === m.author_id && (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000);
          const author = profiles[m.author_id];
          const msgRx = reactions.filter(r => r.message_id === m.id);
          const grouped_rx: Record<string, string[]> = {};
          msgRx.forEach(r => { (grouped_rx[r.emoji] ||= []).push(r.user_id); });

          return (
            <div key={m.id} className={cn("group relative px-2 py-0.5 rounded hover:bg-surface-3/40 animate-fade-in", grouped ? "" : "mt-3")}>
              {!grouped && (
                <div className="flex items-baseline gap-2 mb-0.5">
                  <UserAvatar src={author?.avatar_url} name={author?.username} size="md" className="absolute -ml-12 mt-0.5" />
                  <span className="font-semibold text-foreground">{author?.username ?? "user"}</span>
                  <span className="text-xs text-muted-foreground">{formatTs(m.created_at)}</span>
                </div>
              )}
              <div className="pl-10 -ml-10">
                {editingId === m.id ? (
                  <div className="flex gap-2">
                    <Input value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit(m.id)} autoFocus />
                    <Button size="sm" onClick={() => saveEdit(m.id)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    {m.content && <div className="text-foreground/90 break-words whitespace-pre-wrap">{m.content}{m.edited_at && <span className="text-[10px] text-muted-foreground ml-1">(edited)</span>}</div>}
                    {m.attachment_url && (
                      m.attachment_type?.startsWith("image/") ? (
                        <img src={m.attachment_url} alt="attachment" className="mt-1 max-w-sm max-h-80 rounded-lg border border-border" />
                      ) : (
                        <a href={m.attachment_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm mt-1 inline-block">📎 Attachment</a>
                      )
                    )}
                  </>
                )}
                {Object.keys(grouped_rx).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(grouped_rx).map(([emoji, users]) => (
                      <button key={emoji} onClick={() => toggleReaction(m.id, emoji)}
                        className={cn("text-xs px-2 py-0.5 rounded border flex items-center gap-1",
                          users.includes(user?.id ?? "") ? "bg-primary/20 border-primary" : "bg-surface border-border hover:border-muted-foreground")}>
                        <span>{emoji}</span><span>{users.length}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="absolute -top-3 right-3 hidden group-hover:flex bg-surface border border-border rounded-md shadow-lg">
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="p-1.5 text-muted-foreground hover:text-foreground"><Smile className="h-4 w-4" /></button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2"><div className="flex gap-1 flex-wrap max-w-[200px]">
                    {EMOJIS.map(e => <button key={e} onClick={() => toggleReaction(m.id, e)} className="text-lg hover:bg-surface-3 rounded p-1">{e}</button>)}
                  </div></PopoverContent>
                </Popover>
                <button onClick={() => togglePin(m)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pin className={cn("h-4 w-4", m.pinned && "text-primary fill-primary")} /></button>
                {m.author_id === user?.id && (
                  <>
                    <button onClick={() => { setEditingId(m.id); setEditText(m.content); }} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => remove(m.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 pb-4">
        <form onSubmit={send} className="bg-surface-3 rounded-lg flex items-center px-3 py-2 gap-2">
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" onClick={() => fileRef.current?.click()} className="text-muted-foreground hover:text-foreground"><Paperclip className="h-5 w-5" /></button>
          <Input value={text} onChange={(e) => handleTyping(e.target.value)} placeholder={`Message #${channelName}`}
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 px-0" maxLength={2000} />
          <Popover>
            <PopoverTrigger asChild><button type="button" className="text-muted-foreground hover:text-foreground"><Smile className="h-5 w-5" /></button></PopoverTrigger>
            <PopoverContent className="w-auto p-2"><div className="flex gap-1 flex-wrap max-w-[200px]">
              {EMOJIS.map(e => <button key={e} type="button" onClick={() => setText(t => t + e)} className="text-lg hover:bg-surface-3 rounded p-1">{e}</button>)}
            </div></PopoverContent>
          </Popover>
          <button type="submit" disabled={!text.trim()} className="text-primary disabled:text-muted-foreground"><Send className="h-5 w-5" /></button>
        </form>
        <div className="h-5 px-2 text-xs text-muted-foreground italic mt-1">
          {typing.length > 0 && `${typing.join(", ")} ${typing.length === 1 ? "is" : "are"} typing…`}
        </div>
      </div>
    </div>
  );
}

function formatTs(s: string) {
  const d = new Date(s);
  if (isToday(d)) return `Today at ${format(d, "p")}`;
  if (isYesterday(d)) return `Yesterday at ${format(d, "p")}`;
  return format(d, "MMM d, yyyy 'at' p");
}
