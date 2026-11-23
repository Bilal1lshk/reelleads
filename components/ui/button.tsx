import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500",
        secondary:
          "border border-gray-200 bg-white text-gray-900 hover:bg-gray-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-100 dark:hover:bg-neutral-800",
        outline:
          "border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800",
        ghost:
          "hover:bg-gray-100 text-gray-700 dark:text-gray-300 dark:hover:bg-neutral-800",
        destructive:
          "border border-gray-200 bg-white text-red-600 hover:bg-gray-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-red-400 dark:hover:bg-neutral-800",
      },
      size: {
        default: "h-9 px-3.5 py-1.5",
        sm: "h-8 rounded-lg px-2.5 text-xs",
        lg: "h-10 rounded-lg px-5 text-sm",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
);
Button.displayName = "Button";
