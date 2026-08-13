import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSignIn, useSignUp, useUser } from "@clerk/clerk-react";
import { GraduationCap, Loader2, Shield, LogIn } from "lucide-react";
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
  const [selectedBranch, setSelectedBranch] = useState("mechanical");
  const [selectedYear, setSelectedYear] = useState("second_year");
  const [busy, setBusy] = useState(false);

  // Auto-redirect if logged in via Clerk or Local Auth
  useEffect(() => {
    if (isSignedIn && clerkUser) {
      localAuth
        .signUp(
          clerkUser.firstName || "User",
          clerkUser.lastName || "",
          clerkUser.primaryEmailAddress?.emailAddress || "user@campus.edu",
          null,
          "clerk_google_auth",
          selectedRole,
        )
        .then(() => refresh())
        .then(() => navigate({ to: "/dashboard", replace: true }))
        .catch(() => {
          // Already exists — just sign in
          localAuth
            .signIn(
              clerkUser.primaryEmailAddress?.emailAddress || "user@campus.edu",
              "clerk_google_auth",
            )
            .then(() => refresh())
            .then(() => navigate({ to: "/dashboard", replace: true }));
        });
    }
  }, [isSignedIn, clerkUser]);

  useEffect(() => {
    if (!loading && session) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, session]);

  // Email/Password Sign In
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

  // Local Direct Registration
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
    const result = await localAuth.signUp(firstName, lastName, email, null, password, selectedRole);
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
      {/* Left Panel — Branding */}
      <div className="gradient-hero hidden flex-col justify-between p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground/15">
            <GraduationCap className="size-5" />
          </div>
          <span className="font-display font-semibold">Campus ERP</span>
        </div>
        <div>
          <h2 className="max-w-sm text-3xl font-bold leading-snug">
            Smart Attendance, Timetable & Campus Management.
          </h2>
          <p className="mt-4 max-w-sm text-primary-foreground/75">
            Sign in with Google or Email. Admin, Teacher, and Student — all in one platform.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">
          Powered by Clerk Authentication & Local PWA Engine.
        </p>
      </div>

      {/* Right Panel — Auth Form */}
      <div className="flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-md space-y-5">
          {/* Mobile Logo */}
          <div className="mb-4 lg:hidden text-center">
            <div className="flex items-center justify-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <GraduationCap className="size-5" />
              </div>
              <span className="font-display text-xl font-bold">Campus ERP</span>
            </div>
          </div>

          {/* ─── Google / GitHub / Apple OAuth ─── */}
          <div className="space-y-2.5">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 gap-3 text-sm font-medium border-slate-300 hover:bg-slate-50 shadow-sm"
              onClick={() => {
                if (signInLoaded && signIn) {
                  signIn.authenticateWithRedirect({
                    strategy: "oauth_google",
                    redirectUrl: `${window.location.origin}/auth`,
                    redirectUrlComplete: `${window.location.origin}/dashboard`,
                  });
                }
              }}
            >
              <svg className="size-4" viewBox="0 0 24 24">
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

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 text-xs font-medium border-slate-300 hover:bg-slate-50"
                onClick={() => {
                  if (signInLoaded && signIn) {
                    signIn.authenticateWithRedirect({
                      strategy: "oauth_github",
                      redirectUrl: `${window.location.origin}/auth`,
                      redirectUrlComplete: `${window.location.origin}/dashboard`,
                    });
                  }
                }}
              >
                <svg className="size-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                GitHub
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 text-xs font-medium border-slate-300 hover:bg-slate-50"
                onClick={() => {
                  if (signInLoaded && signIn) {
                    signIn.authenticateWithRedirect({
                      strategy: "oauth_apple",
                      redirectUrl: `${window.location.origin}/auth`,
                      redirectUrlComplete: `${window.location.origin}/dashboard`,
                    });
                  }
                }}
              >
                <svg className="size-4 fill-current" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.32c.67-.82 1.13-1.97.99-3.12-1 .04-2.2.67-2.92 1.51-.64.74-1.2 1.93-1.05 3.06 1.12.09 2.25-.56 2.98-1.45z" />
                </svg>
                Apple
              </Button>
            </div>
          </div>

          {/* ─── Divider ─── */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <span className="relative bg-background px-3 text-xs text-muted-foreground uppercase font-medium">
              Or continue with Email
            </span>
          </div>

          {/* ─── Sign In / Create Account Tabs ─── */}
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>

            {/* Sign In Tab */}
            <TabsContent value="signin" className="mt-4 space-y-4">
              <form onSubmit={handleLocalSignIn} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="user@campus.edu"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" name="password" type="password" required />
                </div>
                <Button type="submit" className="w-full h-11" disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <LogIn className="size-4 mr-2" />
                  )}
                  Sign In
                </Button>
              </form>
            </TabsContent>

            {/* Create Account Tab */}
            <TabsContent value="signup" className="mt-4 space-y-4">
              <form onSubmit={handleLocalSignUp} className="space-y-3">
                {/* Role Selection */}
                <div className="space-y-1">
                  <Label htmlFor="role-select">Select Your Role</Label>
                  <Select
                    value={selectedRole}
                    onValueChange={(val) => setSelectedRole(val as AppRole)}
                  >
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
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    placeholder="rahul@campus.edu"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    name="password"
                    type="password"
                    minLength={6}
                    required
                  />
                </div>

                {/* Branch & Year Selection */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="branch">Engineering Branch</Label>
                    <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                      <SelectTrigger id="branch" className="w-full">
                        <SelectValue placeholder="Select Branch" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="computer">Computer Engg</SelectItem>
                        <SelectItem value="mechanical">Mechanical Engg</SelectItem>
                        <SelectItem value="electrical">Electrical Engg</SelectItem>
                        <SelectItem value="civil">Civil Engg</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="year">Academic Year</Label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger id="year" className="w-full">
                        <SelectValue placeholder="Select Year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first_year">First Year (FE)</SelectItem>
                        <SelectItem value="second_year">Second Year (SE)</SelectItem>
                        <SelectItem value="third_year">Third Year (TE)</SelectItem>
                        <SelectItem value="final_year">Final Year (BE)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button type="submit" className="w-full h-11" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  Create Account & Sign In
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* ─── Quick Demo Access (bottom) ─── */}
          <div className="pt-3 border-t space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">
              Quick Demo Access
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-9 justify-center gap-2"
                onClick={() => handleDemoLogin("teacher", "Demo Teacher")}
              >
                👨‍🏫 Demo Teacher
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-9 justify-center gap-2"
                onClick={() => handleDemoLogin("student", "Demo Student")}
              >
                👤 Demo Student
              </Button>
            </div>
          </div>

          <p className="text-center text-[10px] text-muted-foreground pt-2">
            By continuing, you agree to the Campus ERP Terms of Service.
          </p>
        </div>
      </div>
    </div>
  );
}
