export function ShieldIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 2.75l7.25 3.2v5.1c0 5.05-3.1 8.9-7.25 10.2-4.15-1.3-7.25-5.15-7.25-10.2v-5.1L12 2.75z"
        strokeLinejoin="round"
      />
      <path d="M8.75 12.25l2.25 2.25 4.25-4.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
