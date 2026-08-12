import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSignIn, useSignUp, useUser } from "@clerk/clerk-react";
import { GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
          "Sign in with Google or email to access attendance, timetables and role dashboards.",
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

const ALLOWED_ROLES: { value: AppRole; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "teacher", label: "Teacher" },
];

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading, refresh } = useAuth();
  const { isLoaded: clerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const { signIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();

  const [selectedRole, setSelectedRole] = useState<AppRole>("student");
  const [busy, setBusy] = useState(false);

  // Auto-redirect if logged in via Clerk or Local Auth
  useEffect(() => {
    if (isSignedIn && clerkUser) {
      localAuth
        .signUp(
          clerkUser.firstName || "User",
          clerkUser.lastName || "",
          clerkUser.primaryEmailAddress?.emailAddress || "user@campus.edu",
          null, // Do NOT send phone to Clerk — keeps it 100% local to bypass SMS block!
          "clerk_google_auth",
          selectedRole,
        )
        .then(() => {
          refresh();
          navigate({ to: "/dashboard", replace: true });
        });
    } else if (!loading && session) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isSignedIn, clerkUser, loading, session, navigate, selectedRole, refresh]);

  // Google OAuth button handler
  async function handleGoogleSignIn() {
    if (!signInLoaded || !signIn) {
      toast.error("Authentication engine loading...");
      return;
    }
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: `${window.location.origin}/auth`,
        redirectUrlComplete: `${window.location.origin}/dashboard`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign in failed";
      toast.error(msg);
    }
  }

  // Local Direct Email/Pass Sign In
  async function handleLocalSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");

    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    setBusy(true);
    const result = await localAuth.signIn(email, password);
    setBusy(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    await refresh();
    toast.success(`Welcome back, ${result.user.first_name}!`);
    navigate({ to: "/dashboard", replace: true });
  }

  // Local Direct Registration (Accepts any 10-digit phone number locally without sending SMS to Clerk!)
  async function handleLocalSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const firstName = String(form.get("firstName") || "");
    const lastName = String(form.get("lastName") || "");
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");

    if (!firstName || !lastName || !email || !password) {
      toast.error("Please fill in all required fields");
      return;
    }

    setBusy(true);
    const result = await localAuth.signUp(
      firstName,
      lastName,
      email,
      null, // No phone number required during auth
      password,
      selectedRole,
    );
    setBusy(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    await refresh();
    toast.success(`Account created! Welcome, ${result.user.first_name}!`);
    navigate({ to: "/dashboard", replace: true });
  }


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
          Powered by Clerk Authentication & Local PWA Engine.
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

          {/* Role Selection */}
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

          {/* Direct Google Sign In Button */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 gap-3 text-sm font-medium border-slate-300 hover:bg-slate-50 shadow-sm"
            onClick={handleGoogleSignIn}
          >
            <svg className="size-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.28v3.15C3.26 21.3 7.37 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.28C.46 8.2.0 10.05.0 12s.46 3.8 1.28 5.42l4-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.7 1.28 6.58l4 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            Continue with Google
          </Button>

          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <span className="relative bg-background px-3 text-xs text-muted-foreground uppercase font-medium">Or continue with Email</span>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-4 space-y-4">
              <form onSubmit={handleLocalSignIn} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="email">Email address</Label>
                  <Input id="email" name="email" type="email" placeholder="name@campus.edu" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" name="password" type="password" required />
                </div>
                <Button type="submit" className="w-full h-11" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  Sign In
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-4 space-y-4">
              <form onSubmit={handleLocalSignUp} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="firstName">First name</Label>
                    <Input id="firstName" name="firstName" placeholder="Rahul" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input id="lastName" name="lastName" placeholder="Sharma" required />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signup-email">Email address</Label>
                  <Input id="signup-email" name="email" type="email" placeholder="rahul@campus.edu" required />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input id="signup-password" name="password" type="password" minLength={6} required />
                </div>


                <Button type="submit" className="w-full h-11" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  Create Account & Sign In
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Quick Demo Access */}
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
