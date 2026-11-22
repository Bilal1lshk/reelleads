import { LeadsTableView } from "@/components/leads-table-view";

export default function SavedPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        Saved lists
      </h1>
      <LeadsTableView savedOnly />
    </div>
  );
}
