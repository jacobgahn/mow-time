import { useCallback, useMemo, useState } from 'react';
import type { Coordinate, Polygon } from '@mow-time/types';
import { MapView } from './components/MapView';
import { MowerSetupForm } from './components/MowerSetupForm';
import './App.css';

type Mode = 'draw' | 'view';

const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL as string | undefined);

function App(): JSX.Element {
  const [deckWidth, setDeckWidth] = useState<number | undefined>();
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [mode, setMode] = useState<Mode>('draw');
  const [path, setPath] = useState<Coordinate[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const polygonsCount = polygons.length;

  const canSubmit = useMemo(() => {
    return Boolean(deckWidth && deckWidth > 0 && polygonsCount > 0 && !isSubmitting);
  }, [deckWidth, polygonsCount, isSubmitting]);

  const handlePolygonsChange = useCallback(
    (nextPolygons: Polygon[]) => {
      setPolygons(nextPolygons);
      setError(null);
      if (mode === 'view') {
        setMode('draw');
        setPath([]);
      }
    },
    [mode]
  );

  const handleDeckWidthChange = useCallback(
    (value: number | undefined) => {
      const sanitized = value && Number.isFinite(value) && value > 0 ? value : undefined;
      setDeckWidth(sanitized);
      setError(null);
      if (mode === 'view') {
        setMode('draw');
        setPath([]);
      }
    },
    [mode]
  );

  const handleSubmit = useCallback(async () => {
    if (!deckWidth || polygons.length === 0) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/mow-time`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deckWidthInches: deckWidth,
          polygons
        })
      });

      const text = await response.text();
      const payload = text ? (JSON.parse(text) as { path?: Coordinate[]; error?: string }) : {};

      if (!response.ok || !payload.path) {
        throw new Error(payload.error ?? 'Unable to calculate mow path');
      }

      const result = payload as { path: Coordinate[] };
      setPath(result.path);
      setMode('view');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Request failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [deckWidth, polygons]);

  const handleReset = useCallback(() => {
    setMode('draw');
    setPath([]);
    setError(null);
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Mow Time</h1>
        <p>
          Stake out your yard, enter your mower width, and let the planner generate an efficient
          mowing pattern.
        </p>
      </header>
      <div className="app-content">
        <MowerSetupForm
          deckWidth={deckWidth}
          onDeckWidthChange={handleDeckWidthChange}
          polygonsCount={polygonsCount}
          path={path}
          mode={mode}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onReset={handleReset}
          canSubmit={canSubmit}
          error={error}
        />
        <MapView polygons={polygons} path={path} mode={mode} onPolygonsChange={handlePolygonsChange} />
      </div>
    </div>
  );
}

function normalizeBaseUrl(value: string | undefined): string {
  if (!value) {
    return '';
  }

  return value.replace(/\/$/, '');
}

export default App;

