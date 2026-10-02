"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * DADS のボタン。hover は色の変化に下線を重ね、無効は不透明度ではなく灰色で示す。
 * 高さは入力欄（h-10）と横に並べたときに揃うよう、DADS の sm〜md の間に置いている。
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-base font-bold underline-offset-[3px] transition-colors disabled:pointer-events-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary-500 text-white hover:bg-primary-700 hover:underline active:bg-primary-900 disabled:bg-slate-300 disabled:text-slate-50",
        outline:
          "border border-current bg-white text-primary-500 hover:bg-primary-200 hover:text-primary-700 hover:underline active:bg-primary-300 disabled:bg-white disabled:text-slate-300",
        ghost:
          "text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:text-slate-300",
        destructive:
          "bg-red-500 text-white hover:bg-red-600 hover:underline active:bg-red-700 disabled:bg-slate-300 disabled:text-slate-50",
        link: "text-primary-500 underline hover:bg-primary-50 hover:decoration-[3px] active:bg-primary-100 disabled:text-slate-300",
      },
      size: {
        sm: "h-8 px-3 text-sm gap-1.5 rounded-md",
        md: "h-10 px-4",
        lg: "h-12 px-6",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
