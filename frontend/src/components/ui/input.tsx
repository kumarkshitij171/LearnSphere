import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-[10px] border border-transparent bg-surface px-3 py-2 text-sm text-foreground transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-subtle hover:bg-foreground/[0.06] focus-visible:border-foreground/25 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/10 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger/60",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
