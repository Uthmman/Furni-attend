
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/logo";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleSignIn = async () => {
    if (!auth) return;
    setIsLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: "Signed in successfully!" });
      router.push("/");
    } catch (err: any) {
      setError(err.message);
      toast({
        variant: "destructive",
        title: "Sign-in Failed",
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!auth) return;
    setIsCreatingAccount(true);
    setError(null);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      toast({ title: "Account created successfully!" });
      router.push("/");
    } catch (err: any) {
      setError(err.message);
      toast({
        variant: "destructive",
        title: "Account Creation Failed",
        description: err.message,
      });
    } finally {
      setIsCreatingAccount(false);
    }
  };

  return (
    <div className="w-full lg:grid lg:min-h-screen lg:grid-cols-2">
      <div className="hidden bg-muted lg:block">
        <Image
          src="https://picsum.photos/seed/furnishwise/1200/1800"
          alt="A stylish modern chair in a well-lit room"
          width="1200"
          height="1800"
          className="h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
          data-ai-hint="modern furniture"
          priority
        />
      </div>
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto grid w-[400px] gap-8 p-6">
          <div className="grid gap-4 text-center">
            <div className="flex justify-center items-center gap-3">
              <Logo className="h-10 w-10 text-primary" />
              <h1 className="text-3xl font-bold tracking-tight">FurnishWise</h1>
            </div>
            <p className="text-balance text-muted-foreground">
              Log in to manage your furniture business with ease.
            </p>
          </div>
          <div className="grid gap-6">
            <div className="grid gap-3">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading || isCreatingAccount}
              />
            </div>
            <div className="grid gap-3">
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
                <Button
                  variant="link"
                  className="ml-auto inline-block text-sm underline p-0 h-auto"
                  onClick={(e) => {
                    e.preventDefault();
                    toast({
                      title: "Feature not available",
                      description: "Password recovery is not yet implemented.",
                    });
                  }}
                >
                  Forgot your password?
                </Button>
              </div>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading || isCreatingAccount}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoading && !isCreatingAccount) {
                    handleSignIn();
                  }
                }}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              onClick={handleSignIn}
              disabled={isLoading || isCreatingAccount}
              className="w-full"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Login
            </Button>
          </div>
          <div className="mt-4 text-center text-sm">
            Don&apos;t have an account?{" "}
            <Button
              variant="link"
              className="p-0 h-auto"
              onClick={handleCreateAccount}
              disabled={isLoading || isCreatingAccount}
            >
              {isCreatingAccount && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Sign up
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
