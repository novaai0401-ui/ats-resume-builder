// Centralised tokens so screens stay visually consistent and the same
// palette is used in tab bars, headers, and cards.
export const theme = {
  colors: {
    primary: '#1a3a5c',
    primaryHover: '#2a5a8a',
    accent: '#2f5f8f',
    bg: '#f2f5f8',
    card: '#ffffff',
    border: '#d0dbe7',
    text: '#1a3a5c',
    muted: '#5a6778',
    danger: '#c53030',
    success: '#2f855a',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { sm: 6, md: 10, lg: 16 },
};

export type Theme = typeof theme;
