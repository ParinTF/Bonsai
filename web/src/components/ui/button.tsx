import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Bonsai button system: every variant has a visible border darker than its
// fill; hover lifts (-2px + shadow, 150ms ease-out); pressed scales to 0.97
// (80ms); focus-visible always shows the golden #C9A876 ring; disabled mutes
// the border and removes motion.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border-[1.5px] bg-clip-padding text-xs font-medium whitespace-nowrap select-none outline-none " +
    "transition-all duration-150 ease-out hover:shadow-md hover:-translate-y-0.5 " +
    "active:scale-[0.97] active:translate-y-0 active:shadow-none active:duration-75 " +
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background " +
    "disabled:pointer-events-none disabled:opacity-50 disabled:border-border/40 disabled:shadow-none " +
    "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border-primary-deep hover:bg-primary/90",
        outline:
          "border-earth bg-card text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground border-input hover:bg-muted",
        accent:
          "bg-accent text-accent-foreground border-accent-deep hover:bg-accent/90",
        ghost:
          "border-border/60 bg-transparent text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "bg-destructive/10 text-destructive border-destructive/40 hover:bg-destructive/20 focus-visible:ring-destructive/30",
        link: "border-transparent text-primary underline-offset-4 hover:underline hover:shadow-none hover:translate-y-0",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-none px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-none px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs": "size-6 rounded-none [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-none",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
