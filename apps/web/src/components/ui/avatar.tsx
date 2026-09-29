import * as Avatar from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

export function UserAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <Avatar.Root className={cn("inline-flex h-10 w-10 overflow-hidden rounded-full bg-secondary", className)}>
      {src ? <Avatar.Image src={src} alt="" className="h-full w-full object-cover" /> : null}
      <Avatar.Fallback className="flex h-full w-full items-center justify-center text-xs font-semibold">
        {initials}
      </Avatar.Fallback>
    </Avatar.Root>
  );
}
