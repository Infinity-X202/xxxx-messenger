import { FormEvent } from "react";
import { toast } from "sonner";
import type { Me } from "@/App";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ProfilePage({ me }: { me: Me }) {
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/api/v1/users/me", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: String(fd.get("displayName")),
        bio: String(fd.get("bio")),
      }),
    });
    toast.success("Profile updated");
  }
  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={me.username} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" name="displayName" defaultValue={me.displayName} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" name="bio" defaultValue={me.bio ?? ""} />
            </div>
            <Button>Save</Button>
          </form>
          <a className="mt-4 inline-block text-sm text-pink-300 underline" href="/app/access">
            Permessi e accesso
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
