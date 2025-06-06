// src/components/ui/Badge.tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { clsx } from "clsx"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        claude: "border-transparent bg-gradient-to-r from-orange-100 to-amber-100 text-orange-800 shadow hover:from-orange-200 hover:to-amber-200",
        gpt: "border-transparent bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-800 shadow hover:from-emerald-200 hover:to-teal-200",
        active: "border-transparent bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 shadow animate-pulse",
        thinking: "border-transparent bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 shadow",
        error: "border-transparent bg-gradient-to-r from-red-100 to-rose-100 text-red-800 shadow",
        moderator: "border-transparent bg-gradient-to-r from-purple-100 to-violet-100 text-purple-800 shadow",
        idle: "border-transparent bg-gray-100 text-gray-600 shadow",
        disconnected: "border-transparent bg-red-50 text-red-600 shadow",
        human: "border-transparent bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800 shadow",
        completed: "border-transparent bg-green-50 text-green-600 shadow",
        paused: "border-transparent bg-yellow-50 text-yellow-600 shadow"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={clsx(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }