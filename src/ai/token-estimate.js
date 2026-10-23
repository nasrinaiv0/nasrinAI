// Conservative text-only token estimate used for quota reservation.
// Provider-reported token usage replaces this estimate when available.
export const estimateTokens = (text) => Math.ceil(String(text || '').length / 4);
