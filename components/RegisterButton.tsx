import { Button } from "@/components/ui/button";
import { ButtonHTMLAttributes, ReactNode } from "react";

interface RegisterButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export default function RegisterButton({ children, className = "", ...props }: RegisterButtonProps) {
  return (
    <Button
      {...props}
      className={`text-base font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={{
        backgroundColor: '#39a845',
        borderRadius: '5px',
        width: '343px',
        height: '50px',
        ...props.style,
      }}
      onMouseEnter={(e) => {
        if (!e.currentTarget.disabled && !props.disabled) {
          e.currentTarget.style.backgroundColor = '#2d7f38';
        }
      }}
      onMouseLeave={(e) => {
        if (!e.currentTarget.disabled && !props.disabled) {
          e.currentTarget.style.backgroundColor = '#39a845';
        }
      }}
    >
      {children}
    </Button>
  );
}
