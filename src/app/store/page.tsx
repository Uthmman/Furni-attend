import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { storeItems } from "@/lib/data";
import { StoreClient } from "./store-client";

function StorePageContent() {
  return (
    <div>
      <PageHeader
        title="Store Inventory"
        description="Manage your items, stock, and measurements."
      >
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Item
        </Button>
      </PageHeader>

      <StoreClient initialItems={storeItems} />
    </div>
  );
}

export default function StorePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <StorePageContent />
    </Suspense>
  );
}
