"use client";

import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

type CopiedValue = string | null;
type CopyFn = (text: string) => Promise<boolean>;

export function useCopyToClipboard(): [CopiedValue, CopyFn] {
  const [copiedText, setCopiedText] = useState<CopiedValue>(null);
  const { toast } = useToast();

  const copy: CopyFn = useCallback(async (text) => {
    if (!navigator?.clipboard) {
      console.warn("Clipboard not supported");
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Clipboard access is not supported or not enabled.",
      });
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      toast({
        title: "Copied to Clipboard",
        description: "The account number has been copied.",
      });
      return true;
    } catch (error) {
      console.warn("Copy failed", error);
      setCopiedText(null);
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Could not copy to clipboard.",
      });
      return false;
    }
  }, [toast]);

  return [copiedText, copy];
}
