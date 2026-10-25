// Runtime billing adapter: provider-reported cost is authoritative.
// The application deliberately does not load a local per-model price registry
// or reserve estimated USD. Unknown provider cost is represented as null.
export function createProviderSpendHooks({ config }) {
  return {
    async reserve({ provider, model }) {
      if (provider === 'fake' && !config?.isProduction) return null;
      return { provider, model, providerBilling: true };
    },
    async settle(reservation, result) {
      if (!reservation) return { costUsd: null, spendReservationId: null };
      const raw = result?.actualCostUsd ?? result?.costUsd;
      return {
        costUsd: Number.isFinite(raw) && raw >= 0 && raw <= 100000 ? raw : null,
        spendReservationId: null
      };
    },
    async release() {
      // There is no local USD reservation to release.
    }
  };
}
