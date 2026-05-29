import type { ReactNode } from "react";

interface ConfigGroupProps {
  children: ReactNode;
  className?: string;
  title: string;
}

export const ConfigGroup = ({
  children,
  className = "",
  title,
}: ConfigGroupProps) => {
  return (
    <fieldset className={`control-group ${className}`}>
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
};
