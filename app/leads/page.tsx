import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LeadsTableView } from "@/components/leads-table-view";

export default function LeadsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Leads
        </h1>
        <Link href="/search">
          <Button variant="outline" size="sm">
            New search
          </Button>
        </Link>
      </div>

      <LeadsTableView />
    </div>
  );
}
