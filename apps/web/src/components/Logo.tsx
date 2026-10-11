/** The bite mark: a maize circle with a bite taken out, on a navy tile. Decorative. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className={className}>
      <rect width="100" height="100" rx="26" className="fill-[#0b1f3a] dark:fill-[#081830]" />
      <mask id="logo-bite">
        <rect width="100" height="100" fill="#fff" />
        <circle cx="76" cy="29" r="13" fill="#000" />
        <circle cx="62" cy="20" r="8" fill="#000" />
        <circle cx="85" cy="43" r="8" fill="#000" />
      </mask>
      <circle cx="50" cy="53" r="30" fill="#ffcb05" mask="url(#logo-bite)" />
      <circle cx="80" cy="18" r="3.5" fill="#ffcb05" />
    </svg>
  );
}
