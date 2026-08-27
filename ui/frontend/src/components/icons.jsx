function Icon({ className = 'h-5 w-5', children, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconGauge = (p) => (
  <Icon {...p}>
    <path d="m12 14 4-4" />
    <path d="M3.34 19a10 10 0 1 1 17.32 0" />
  </Icon>
)

export const IconChip = (p) => (
  <Icon {...p}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
    <rect x="9.5" y="9.5" width="5" height="5" />
    <path d="M9 2.5v2.5M15 2.5v2.5M9 19v2.5M15 19v2.5M2.5 9H5M2.5 15H5M19 9h2.5M19 15h2.5" />
  </Icon>
)

export const IconFlask = (p) => (
  <Icon {...p}>
    <path d="M10 2.5v6.8a2 2 0 0 1-.2.9L4.9 19.6a1 1 0 0 0 .9 1.4h12.4a1 1 0 0 0 .9-1.4L14.2 10.2a2 2 0 0 1-.2-.9V2.5" />
    <path d="M8.5 2.5h7" />
    <path d="M7 16h10" />
  </Icon>
)

export const IconHash = (p) => (
  <Icon {...p}>
    <path d="M5 9h14M5 15h14" />
    <path d="M10 3.5 8 20.5M16 3.5l-2 17" />
  </Icon>
)

export const IconDna = (p) => (
  <Icon {...p}>
    <path d="M8 3c0 5 8 5 8 9s-8 4-8 9" />
    <path d="M16 3c0 5-8 5-8 9s8 4 8 9" />
    <path d="M8.6 6.5h6.8M8.6 17.5h6.8M10.5 12h3" />
  </Icon>
)

export const IconSparkle = (p) => (
  <Icon {...p}>
    <path d="M12 3l1.7 4.9L18.5 9.5l-4.8 1.6L12 16l-1.7-4.9L5.5 9.5l4.8-1.6z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
  </Icon>
)

export const IconTerminal = (p) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="m7 9 3 3-3 3" />
    <path d="M13 15h4" />
  </Icon>
)

export const IconNote = (p) => (
  <Icon {...p}>
    <path d="M16 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
    <path d="M15 3v5h5" />
    <path d="M8 13h8M8 17h5" />
  </Icon>
)

export const IconSun = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
  </Icon>
)

export const IconArrow = (p) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
)

export const IconRefresh = (p) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.3-5.7" />
    <path d="M20 4v4h-4" />
  </Icon>
)

export const IconPlay = (p) => (
  <Icon {...p}>
    <path d="M7 5.5v13l11-6.5z" />
  </Icon>
)

export const IconPulse = (p) => (
  <Icon {...p}>
    <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
  </Icon>
)

export const IconServer = (p) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="7" rx="2" />
    <rect x="3" y="13" width="18" height="7" rx="2" />
    <path d="M7 7.5h.01M7 16.5h.01" />
  </Icon>
)

export const IconTag = (p) => (
  <Icon {...p}>
    <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" />
    <circle cx="8" cy="8" r="1.3" />
  </Icon>
)

export const IconCog = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
  </Icon>
)

export const IconFire = (p) => (
  <Icon {...p}>
    <path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.5 1-2.5 1.5-3.5.5 1 1.5 1.5 2.5 1.5C12 7 12 5 12 3z" />
    <path d="M12 21a4.5 4.5 0 0 0 4.5-4.5c0-2.5-2-4-3.5-5.5" />
  </Icon>
)

export const IconList = (p) => (
  <Icon {...p}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M3 6h.01M3 12h.01M3 18h.01" />
  </Icon>
)

export const IconPercent = (p) => (
  <Icon {...p}>
    <path d="M19 5 5 19" />
    <circle cx="7" cy="7" r="2.5" />
    <circle cx="17" cy="17" r="2.5" />
  </Icon>
)

export const IconRuler = (p) => (
  <Icon {...p}>
    <path d="M21 8 8 21l-5-5L16 3z" />
    <path d="M12 9l1.5 1.5M9.5 11.5 11 13M7 14l1.5 1.5" />
  </Icon>
)

export const IconStar = (p) => (
  <Icon {...p}>
    <path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.1l1-5.8L3.5 9.2l5.9-.9z" />
  </Icon>
)

export const IconStack = (p) => (
  <Icon {...p}>
    <path d="M12 3 3 8l9 5 9-5z" />
    <path d="M3 13l9 5 9-5" />
    <path d="M3 17l9 5 9-5" />
  </Icon>
)

export const IconGlobe = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
  </Icon>
)

export const IconType = (p) => (
  <Icon {...p}>
    <path d="M6 5h12M6 9h2M6 13h1M6 17h1" />
    <path d="M4.5 21h15" />
  </Icon>
)

export const IconTarget = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.2" />
  </Icon>
)

export const IconScissors = (p) => (
  <Icon {...p}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <path d="M8.2 7.8 20 19M8.2 16.2 20 5" />
  </Icon>
)

export const IconChart = (p) => (
  <Icon {...p}>
    <path d="M4 20V10M10 20V4M16 20v-8M21 20H3" />
  </Icon>
)
