import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SignIn, SignUp, useUser } from "@clerk/clerk-react";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth, type AppRole } from "@/lib/auth";
import { localAuth } from "@/lib/local-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Campus ERP" },
      {
        name: "description",
        content:
          "Sign in with Google or email via Clerk to access attendance, timetables and role dashboards.",
      },
      { property: "og:title", content: "Sign in — Campus ERP" },
      {
        property: "og:description",
        content: "Access your Campus ERP dashboard for attendance, timetables and reports.",
      },
    ],
  }),
  component: AuthPage,
});

// User role options: Only Teacher and Student (CR, HOD, Admin removed per user instruction)
const ALLOWED_ROLES: { value: AppRole; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "teacher", label: "Teacher" },
];

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading, refresh } = useAuth();
  const { isLoaded, isSignedIn, user } = useUser();
  const [selectedRole, setSelectedRole] = useState<AppRole>("student");

  // Auto-redirect if already logged in via Clerk or Local Auth
  useEffect(() => {
    if (isSignedIn && user) {
      // Sync Clerk user with localAuth session
      localAuth.signUp(
        user.firstName || "User",
        user.lastName || "",
        user.primaryEmailAddress?.emailAddress || "user@campus.edu",
        user.primaryPhoneNumber?.phoneNumber || null,
        "clerk_google_auth",
        selectedRole,
      ).then(() => {
        refresh();
        navigate({ to: "/dashboard", replace: true });
      });
    } else if (!loading && session) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isLoaded, isSignedIn, user, loading, session, navigate, selectedRole, refresh]);

  function handleDemoLogin(demoRole: AppRole, label: string) {
    localAuth.loginAsDemo(demoRole);
    refresh();
    toast.success(`Signed in as ${label}`);
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="gradient-hero hidden flex-col justify-between p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground/15">
            <GraduationCap className="size-5" />
          </div>
          <span className="font-display font-semibold">Campus ERP</span>
        </div>
        <div>
          <h2 className="max-w-sm text-3xl font-bold leading-snug">
            One account for attendance, timetables and reports.
          </h2>
          <p className="mt-4 max-w-sm text-primary-foreground/75">
            Sign in with Google or Email. Select your role as Student or Teacher to access your campus dashboard.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">
          Powered by Clerk Authentication & Local PWA Storage.
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-md space-y-6">
          <div className="mb-4 lg:hidden text-center">
            <div className="flex items-center justify-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <GraduationCap className="size-5" />
              </div>
              <span className="font-display text-xl font-bold">Campus ERP</span>
            </div>
          </div>

          {/* Role Selection Header */}
          <div className="surface-card p-4 rounded-xl border space-y-2">
            <Label htmlFor="role-select" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Select Your Role
            </Label>
            <Select value={selectedRole} onValueChange={(val) => setSelectedRole(val as AppRole)}>
              <SelectTrigger id="role-select" className="w-full">
                <SelectValue placeholder="Select your role" />
              </SelectTrigger>
              <SelectContent>
                {ALLOWED_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="clerk-signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="clerk-signin">Sign In</TabsTrigger>
              <TabsTrigger value="clerk-signup">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="clerk-signin" className="mt-6 flex justify-center">
              <SignIn
                routing="virtual"
                signUpUrl="/auth"
                fallbackRedirectUrl="/dashboard"
                appearance={{
                  elements: {
                    rootBox: "w-full flex justify-center",
                    card: "shadow-none border border-border w-full",
                  },
                }}
              />
            </TabsContent>

            <TabsContent value="clerk-signup" className="mt-6 flex justify-center">
              <SignUp
                routing="virtual"
                signInUrl="/auth"
                fallbackRedirectUrl="/dashboard"
                appearance={{
                  elements: {
                    rootBox: "w-full flex justify-center",
                    card: "shadow-none border border-border w-full",
                  },
                }}
              />
            </TabsContent>
          </Tabs>

          {/* Quick Demo Login Fallback */}
          <div className="pt-4 border-t space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
              Instant Demo Access
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs justify-center gap-1.5"
                onClick={() => handleDemoLogin("teacher", "Demo Teacher")}
              >
                👨‍🏫 Demo Teacher
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs justify-center gap-1.5"
                onClick={() => handleDemoLogin("student", "Demo Student")}
              >
                👤 Demo Student
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
