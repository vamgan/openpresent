/**
 * Small provider marks for the agent picker. Simplified glyphs in each vendor's
 * colour, used only to identify which local CLI a profile launches.
 */
export function AgentLogo({ profileId, className }: { profileId: string; className?: string }) {
  const shared = { className: className ?? 'agent-logo', viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  if (profileId.startsWith('claude')) {
    return (
      <svg {...shared} fill="#D97757">
        <path d="M4.7 15.5 9.4 4.2h2.5l4.7 11.3h-2.4l-1-2.5H8.1l-1 2.5H4.7Zm4.1-4.4h3.9l-1.9-4.8-2 4.8Z" />
        <path d="M17.6 15.5V4.2h2.2v11.3h-2.2Z" opacity=".65" />
      </svg>
    );
  }
  if (profileId.startsWith('gemini')) {
    return (
      <svg {...shared} fill="#4285F4">
        <path d="M12 2c.3 4.9 5.1 9.7 10 10-4.9.3-9.7 5.1-10 10-.3-4.9-5.1-9.7-10-10 4.9-.3 9.7-5.1 10-10Z" />
      </svg>
    );
  }
  if (profileId.startsWith('codex') || profileId.startsWith('openai')) {
    return (
      <svg {...shared} fill="none" stroke="#0f0f10" strokeWidth="1.7">
        <path d="M12 3.4 19 7.4v9.2l-7 4-7-4V7.4l7-4Z" strokeLinejoin="round" />
        <path d="M12 8.1v7.8M8.4 10.2l7.2 3.6M15.6 10.2l-7.2 3.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (profileId.startsWith('kiro')) {
    return (
      <svg {...shared} fill="#7B5CF0">
        <path d="M5 4h2.6v6.4L14 4h3.3l-5.5 5.7 5.9 10.3H14.6l-4.4-7.9-2.6 2.6V20H5V4Z" />
      </svg>
    );
  }
  return (
    <svg {...shared} fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
