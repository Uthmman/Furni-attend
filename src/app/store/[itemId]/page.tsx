"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ItemProfilePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect back to store as the profile feature has been removed
    router.replace("/store");
  }, [router]);

  return (
    <div className="flex h-[400px] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" />
        <p className="text-sm font-medium text-muted-foreground">Redirecting to store...</p>
      </div>
    </div>
  );
}
