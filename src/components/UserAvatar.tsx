import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Props {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  status?: "online" | "idle" | "offline" | null;
  className?: string;
}

const sizes = { sm: "h-6 w-6 text-xs", md: "h-9 w-9 text-sm", lg: "h-12 w-12 text-base", xl: "h-20 w-20 text-2xl" };
const dot = { sm: "h-2 w-2", md: "h-2.5 w-2.5", lg: "h-3 w-3", xl: "h-4 w-4" };

export function UserAvatar({ src, name, size = "md", status, className }: Props) {
  const initials = (name || "?").slice(0, 2).toUpperCase();
  const statusColor = status === "online" ? "bg-success" : status === "idle" ? "bg-idle" : "bg-offline";
  return (
    <div className={cn("relative inline-block", className)}>
      <Avatar className={cn(sizes[size], "ring-1 ring-background")}>
        {src && <AvatarImage src={src} alt={name ?? ""} />}
        <AvatarFallback className="bg-primary/20 text-primary-foreground font-semibold">{initials}</AvatarFallback>
      </Avatar>
      {status && (
        <span className={cn("absolute bottom-0 right-0 rounded-full ring-2 ring-surface", dot[size], statusColor)} />
      )}
    </div>
  );
}
