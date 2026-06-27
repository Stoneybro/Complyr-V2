import React from "react";
import { Label } from "@/components/ui/label";

type FieldProps = {
  children?: React.ReactNode;
  className?: string;
  orientation?: "horizontal" | "vertical";
  htmlFor?: string;
  variant?: string;
};

export const Field = ({ children, orientation, className }: FieldProps) => (
  <div className={`flex ${orientation === 'horizontal' ? 'flex-row gap-4' : 'flex-col gap-2'} ${className || ''}`}>
    {children}
  </div>
);

export const FieldGroup = ({ children, className }: FieldProps) => (
  <div className={`space-y-4 ${className || ''}`}>
    {children}
  </div>
);

export const FieldSet = ({ children, className }: FieldProps) => (
  <div className={`p-4 border rounded-md space-y-4 ${className || ''}`}>
    {children}
  </div>
);

export const FieldLabel = ({ children, htmlFor, className }: FieldProps) => (
  <Label htmlFor={htmlFor} className={className}>
    {children}
  </Label>
);

export const FieldLegend = ({ children, className }: FieldProps) => (
  <h3 className={`text-sm font-medium leading-none ${className || ''}`}>
    {children}
  </h3>
);

export const FieldDescription = ({ children, className }: FieldProps) => (
  <p className={`text-xs text-muted-foreground ${className || ''}`}>
    {children}
  </p>
);

export const FieldSeparator = ({ children }: FieldProps) => (
  <div className="relative my-4">
    <div className="absolute inset-0 flex items-center">
      <span className="w-full border-t" />
    </div>
    {children && (
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-background px-2 text-muted-foreground">
          {children}
        </span>
      </div>
    )}
  </div>
);
