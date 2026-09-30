import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { User, Phone, MapPin, Camera, Save, Check, Cloud, Database } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { displayName, useAuth } from "@/lib/auth";
import { localAuth } from "@/lib/local-auth";
import { toast } from "sonner";
import {
  getAppwriteConfig,
  saveAppwriteConfig,
  type AppwriteConfig,
} from "@/integrations/appwrite/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Profile & Settings — Campus ERP" },
      {
        name: "description",
        content: "Manage your profile, phone number, picture, and address settings.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, user, refresh } = useAuth();

  const [firstName, setFirstName] = useState(profile?.first_name || "");
  const [lastName, setLastName] = useState(profile?.last_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [address, setAddress] = useState(profile?.address || "");
  const [photoUrl, setPhotoUrl] = useState(profile?.photo_url || "");
  const [saving, setSaving] = useState(false);

  // Appwrite config state
  const appwriteConfig = getAppwriteConfig();
  const [awEndpoint, setAwEndpoint] = useState(appwriteConfig.endpoint);
  const [awProjectId, setAwProjectId] = useState(appwriteConfig.projectId);
  const [awApiKey, setAwApiKey] = useState(appwriteConfig.apiKey);
  const [awDatabaseId, setAwDatabaseId] = useState(appwriteConfig.databaseId);
  const [awBucketId, setAwBucketId] = useState(appwriteConfig.storageBucketId);
  const [savingAppwrite, setSavingAppwrite] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) return;

    setSaving(true);
    const updated = localAuth.updateUserProfile(user.id, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      photo_url: photoUrl.trim() || null,
    });
    setSaving(false);

    if (updated) {
      refresh();
      toast.success("Profile settings updated successfully!");
    } else {
      toast.error("Failed to update profile.");
    }
  }

  // Handle local image file upload preview
  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      toast.error("Image file size should be less than 3MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPhotoUrl(reader.result);
        toast.success("Profile picture preview loaded.");
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <AppShell
      title="Profile & Settings"
      description="Update your personal details, profile picture, phone number, and address"
    >
      <div className="max-w-2xl space-y-6">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Avatar Section */}
          <div className="surface-card p-6 rounded-2xl border flex flex-col sm:flex-row items-center gap-6">
            <div className="relative group">
              <Avatar className="size-24 border-2 border-primary/20 shadow-md">
                <AvatarImage src={photoUrl || profile?.photo_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                  {displayName(profile).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <label
                htmlFor="avatar-upload"
                className="absolute bottom-0 right-0 flex size-8 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-110"
              >
                <Camera className="size-4" />
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </label>
            </div>
            <div className="space-y-1.5 text-center sm:text-left flex-1">
              <h3 className="font-display font-semibold text-lg">{displayName(profile)}</h3>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
              <div className="pt-1 flex flex-wrap gap-2 justify-center sm:justify-start">
                <Label
                  htmlFor="avatar-upload"
                  className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-accent"
                >
                  <Camera className="size-3.5" />
                  Change Picture
                </Label>
                {photoUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive hover:text-destructive"
                    onClick={() => setPhotoUrl("")}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Personal Information */}
          <div className="surface-card p-6 rounded-2xl border space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
              <User className="size-4 text-primary" />
              <h3 className="font-semibold text-sm">Personal Details</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Rahul"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Sharma"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" value={profile?.email || ""} disabled className="bg-muted" />
              <p className="text-[11px] text-muted-foreground">
                Email is linked to your account identity.
              </p>
            </div>
          </div>

          {/* Contact Details */}
          <div className="surface-card p-6 rounded-2xl border space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
              <Phone className="size-4 text-primary" />
              <h3 className="font-semibold text-sm">Contact Information</h3>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Mobile Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                maxLength={15}
              />
              <p className="text-[11px] text-emerald-600 font-medium">
                Saved locally on device without SMS verification checks.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <MapPin className="size-3.5 text-muted-foreground" />
                <Label htmlFor="address">Address</Label>
              </div>
              <Textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 College Road, Campus Hostel, Block A, New Delhi - 110001"
                rows={3}
              />
            </div>
          </div>

          {/* Appwrite Database & Storage Settings */}
          <div className="surface-card p-6 rounded-2xl border space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
              <Cloud className="size-4 text-blue-600" />
              <h3 className="font-semibold text-sm">Appwrite Database & Storage</h3>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="awEndpoint">Appwrite Endpoint</Label>
              <Input
                id="awEndpoint"
                value={awEndpoint}
                onChange={(e) => setAwEndpoint(e.target.value)}
                placeholder="https://cloud.appwrite.io/v1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="awProjectId">Project ID</Label>
                <Input
                  id="awProjectId"
                  value={awProjectId}
                  onChange={(e) => setAwProjectId(e.target.value)}
                  placeholder="your-project-id"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="awDatabaseId">Database ID</Label>
                <Input
                  id="awDatabaseId"
                  value={awDatabaseId}
                  onChange={(e) => setAwDatabaseId(e.target.value)}
                  placeholder="campus_erp_db"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="awApiKey">API Key</Label>
              <Input
                id="awApiKey"
                type="password"
                value={awApiKey}
                onChange={(e) => setAwApiKey(e.target.value)}
                placeholder="standard_…"
              />
              <p className="text-[11px] text-muted-foreground">
                Your Appwrite API key for storing attendance data and report files.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="awBucketId">Storage Bucket ID</Label>
              <Input
                id="awBucketId"
                value={awBucketId}
                onChange={(e) => setAwBucketId(e.target.value)}
                placeholder="attendance_reports"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={savingAppwrite}
              onClick={() => {
                setSavingAppwrite(true);
                saveAppwriteConfig({
                  endpoint: awEndpoint.trim(),
                  projectId: awProjectId.trim(),
                  apiKey: awApiKey.trim(),
                  databaseId: awDatabaseId.trim(),
                  storageBucketId: awBucketId.trim(),
                });
                setSavingAppwrite(false);
                toast.success("Appwrite configuration saved!");
              }}
            >
              <Database className="size-3.5" />
              Save Appwrite Settings
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="submit" size="lg" className="gap-2" disabled={saving}>
              {saving ? <Save className="size-4 animate-spin" /> : <Check className="size-4" />}
              Save Profile Settings
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
