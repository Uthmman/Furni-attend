import type { SVGProps } from "react";

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M20 17l-1.09-4.38a1 1 0 00-.94-.62h-6.14a1 1 0 00-.94.62L10 17" />
      <path d="M4 17h16" />
      <path d="M4 12h.01" />
      <path d="M20 12h.01" />
      <path d="M14 12v-2a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    </svg>
  );
}
