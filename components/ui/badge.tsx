import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default:
          "border-gray-200 bg-gray-100 text-gray-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200",
        secondary:
          "border-gray-200 bg-white text-gray-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-300",
        warning:
          "border-gray-200 bg-white text-gray-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-300",
        muted:
          "border-gray-200 bg-gray-50 text-gray-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-400",
        info:
          "border-gray-200 bg-white text-gray-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-300",
        outline:
          "border-gray-200 text-gray-700 dark:border-neutral-800 dark:text-gray-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
