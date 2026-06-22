import React from "react";
import { Label } from "@/components/ui/label";

export const Field = ({ children, orientation, className }: any) => (
  <div className={`flex ${orientation === 'horizontal' ? 'flex-row gap-4' : 'flex-col gap-2'} ${className || ''}`}>
    {children}
  </div>
);

export const FieldGroup = ({ children, className }: any) => (
  <div className={`space-y-4 ${className || ''}`}>
    {children}
  </div>
);

export const FieldSet = ({ children, className }: any) => (
  <div className={`p-4 border rounded-md space-y-4 ${className || ''}`}>
    {children}
  </div>
);

export const FieldLabel = ({ children, htmlFor, className }: any) => (
  <Label htmlFor={htmlFor} className={className}>
    {children}
  </Label>
);

export const FieldLegend = ({ children, className }: any) => (
  <h3 className={`text-sm font-medium leading-none ${className || ''}`}>
    {children}
  </h3>
);

export const FieldDescription = ({ children, className }: any) => (
  <p className={`text-xs text-muted-foreground ${className || ''}`}>
    {children}
  </p>
);

export const FieldSeparator = ({ children }: any) => (
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
