import { LeadSearchForm } from "@/components/lead-search-form";

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-[1072px] space-y-6 pb-24 lg:pb-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Find Leads
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Configure your target audience and sources to discover and add new leads to your CRM.
        </p>
      </div>

      <LeadSearchForm />
    </div>
  );
}
