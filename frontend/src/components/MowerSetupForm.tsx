import { useMemo } from 'react';
import type { Coordinate } from '@mow-time/types';

type Mode = 'draw' | 'view';

interface MowerSetupFormProps {
  deckWidth: number | undefined;
  onDeckWidthChange: (value: number | undefined) => void;
  polygonsCount: number;
  path: Coordinate[];
  mode: Mode;
  isSubmitting: boolean;
  onSubmit: () => void;
  onReset: () => void;
  canSubmit: boolean;
  error: string | null;
}

export function MowerSetupForm({
  deckWidth,
  onDeckWidthChange,
  polygonsCount,
  path,
  mode,
  isSubmitting,
  onSubmit,
  onReset,
  canSubmit,
  error,
}: MowerSetupFormProps): JSX.Element {
  const distanceStats = useMemo(() => formatPathStats(path), [path]);

  return (
    <div className="panel">
      <h2>Mower setup</h2>

      <label htmlFor="deck-width-input" className="status-pill">
        <span>Deck width</span>
      </label>
      <input
        id="deck-width-input"
        type="number"
        min={16}
        max={240}
        step={1}
        value={deckWidth ?? ''}
        placeholder="Enter width in inches"
        onChange={(event) => {
          const value = event.currentTarget.value;
          onDeckWidthChange(value ? Number.parseFloat(value) : undefined);
        }}
        style={{
          width: '100%',
          marginTop: '0.75rem',
          height: '48px',
          borderRadius: '12px',
          border: '1px solid rgba(15, 23, 42, 0.12)',
          padding: '0 1rem',
          fontSize: '1rem',
        }}
      />

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <span className="status-pill">
          {mode === 'view' ? 'Viewing plan' : 'Drawing yard'} · {polygonsCount} area
          {polygonsCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="metrics-grid">
        <Metric label="Path length" value={distanceStats.formattedDistance} />
        <Metric label="Estimated mow time" value={distanceStats.formattedDuration} />
      </div>

      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={!canSubmit || isSubmitting}
          onClick={onSubmit}
        >
          {isSubmitting ? 'Calculating…' : 'Mow Time!'}
        </button>
        {mode === 'view' ? (
          <button type="button" className="secondary" onClick={onReset}>
            Edit Area
          </button>
        ) : null}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string;
}

function Metric({ label, value }: MetricProps): JSX.Element {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function formatPathStats(path: Coordinate[]) {
  if (path.length < 2) {
    return {
      formattedDistance: '—',
      formattedDuration: '—',
    };
  }

  const totalMeters = sumPathDistance(path);
  const totalMiles = totalMeters / 1609.344;

  const formattedDistance = `${totalMiles.toFixed(2)} mi`;

  const walkingSpeedMps = 1.4; // ~3.1 mph
  const durationSeconds = totalMeters / walkingSpeedMps;
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);
  const formattedDuration = `${minutes}m ${seconds}s`;

  return { formattedDistance, formattedDuration };
}

function sumPathDistance(path: Coordinate[]): number {
  let total = 0;

  for (let index = 1; index < path.length; index += 1) {
    total += haversineDistance(path[index - 1], path[index]);
  }

  return total;
}

function haversineDistance([lon1, lat1]: Coordinate, [lon2, lat2]: Coordinate): number {
  const R = 6371_000; // meters
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
