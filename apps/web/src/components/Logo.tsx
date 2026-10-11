/** The bite mark: a maize circle with a bite taken out, and a crumb. Decorative. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className={className}>
      <mask id="logo-bite">
        <rect width="100" height="100" fill="#fff" />
        <circle cx="80" cy="24" r="17" fill="#000" />
        <circle cx="61" cy="12" r="10" fill="#000" />
        <circle cx="92" cy="43" r="10" fill="#000" />
      </mask>
      <circle cx="46" cy="54" r="42" className="fill-maize" mask="url(#logo-bite)" />
      <circle cx="87" cy="10" r="5" className="fill-maize" />
    </svg>
  );
}
