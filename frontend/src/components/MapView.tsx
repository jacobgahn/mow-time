import { Loader } from '@googlemaps/js-api-loader';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Coordinate, Polygon } from '@mow-time/types';

type MapMode = 'draw' | 'view';

interface MapViewProps {
  polygons: Polygon[];
  path: Coordinate[];
  mode: MapMode;
  onPolygonsChange: (polygons: Polygon[]) => void;
}

interface AutocompletePrediction {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text: string;
    secondary_text?: string;
  };
}

interface PlaceDetailsResult {
  place_id: string;
  formatted_address?: string;
  geometry?: {
    location?: { lat: number; lng: number };
    viewport?: {
      northeast: { lat: number; lng: number };
      southwest: { lat: number; lng: number };
    };
  };
}

const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 39.8283, lng: -98.5795 };
const DEFAULT_ZOOM = 4;

export function MapView({ polygons, path, mode, onPolygonsChange }: MapViewProps): JSX.Element {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const googleRef = useRef<typeof google | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const polygonOverlaysRef = useRef<google.maps.Polygon[]>([]);
  const polygonListenersRef = useRef<Map<google.maps.Polygon, google.maps.MapsEventListener[]>>(
    new Map(),
  );
  const pathOverlayRef = useRef<google.maps.Polyline | null>(null);
  const hasFitToPathRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<AutocompletePrediction[]>([]);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const sessionTokenRef = useRef<string>(generateSessionToken());
  const onPolygonsChangeRef = useRef(onPolygonsChange);

  useEffect(() => {
    onPolygonsChangeRef.current = onPolygonsChange;
  }, [onPolygonsChange]);

  const loader = useMemo(() => {
    if (!apiKey) {
      return null;
    }

    return new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['drawing'],
    });
  }, [apiKey]);

  const syncPolygons = useCallback(() => {
    if (!googleRef.current) {
      return;
    }

    const coordinates: Polygon[] = polygonOverlaysRef.current.map((polygon) =>
      polygon
        .getPath()
        .getArray()
        .map((latLng) => [latLng.lat(), latLng.lng()]),
    );

    onPolygonsChangeRef.current(coordinates);
  }, []);

  const clearPolygonOverlays = useCallback(() => {
    polygonOverlaysRef.current.forEach((polygon) => {
      polygon.setMap(null);
      const listeners = polygonListenersRef.current.get(polygon) ?? [];
      listeners.forEach((listener) => listener.remove());
    });

    polygonOverlaysRef.current = [];
    polygonListenersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!loader || !mapContainerRef.current) {
      if (!apiKey) {
        setMapError('VITE_GOOGLE_MAPS_API_KEY is missing.');
      }
      return;
    }

    let isMounted = true;

    loader
      .load()
      .then((google) => {
        if (!isMounted || !mapContainerRef.current) {
          return;
        }

        googleRef.current = google;

        const map = new google.maps.Map(mapContainerRef.current, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          mapTypeId: google.maps.MapTypeId.SATELLITE,
          mapTypeControl: false,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: true,
          cameraControl: false,
          zoomControl: true,
        });

        mapRef.current = map;

        pathOverlayRef.current = new google.maps.Polyline({
          map,
          strokeColor: '#16a34a',
          strokeOpacity: 0.9,
          strokeWeight: 3,
          zIndex: 2,
        });

        const drawingManager = new google.maps.drawing.DrawingManager({
          drawingMode: google.maps.drawing.OverlayType.POLYGON,
          drawingControl: false,
          polygonOptions: {
            fillColor: '#2563eb',
            fillOpacity: 0.18,
            strokeColor: '#2563eb',
            strokeWeight: 2,
            clickable: true,
            editable: true,
          },
        });

        drawingManager.setMap(map);
        drawingManagerRef.current = drawingManager;

        google.maps.event.addListener(
          drawingManager,
          'overlaycomplete',
          (event: google.maps.drawing.OverlayCompleteEvent) => {
            if (event.type !== google.maps.drawing.OverlayType.POLYGON) {
              event.overlay.setMap(null);
              return;
            }

            const polygon = event.overlay as google.maps.Polygon;
            polygon.setEditable(true);
            polygonOverlaysRef.current.push(polygon);
            polygonListenersRef.current.set(
              polygon,
              collectListeners(google, polygon, syncPolygons),
            );
            syncPolygons();
          },
        );

        setIsMapReady(true);
      })
      .catch((error) => {
        setMapError(error instanceof Error ? error.message : 'Failed to load Google Maps');
      });

    return () => {
      isMounted = false;
      clearPolygonOverlays();
      pathOverlayRef.current?.setMap(null);
      drawingManagerRef.current?.setMap(null);
      drawingManagerRef.current = null;
      mapRef.current = null;
      googleRef.current = null;
      setIsMapReady(false);
    };
  }, [apiKey, clearPolygonOverlays, loader, syncPolygons]);

  useEffect(() => {
    if (!googleRef.current || !drawingManagerRef.current) {
      return;
    }

    const google = googleRef.current;

    if (mode === 'draw') {
      drawingManagerRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
      polygonOverlaysRef.current.forEach((polygon) => polygon.setEditable(true));
      hasFitToPathRef.current = false;
    } else {
      drawingManagerRef.current.setDrawingMode(null);
      polygonOverlaysRef.current.forEach((polygon) => polygon.setEditable(false));
    }
  }, [mode]);

  useEffect(() => {
    if (polygons.length === 0) {
      clearPolygonOverlays();
    }
  }, [clearPolygonOverlays, polygons]);

  useEffect(() => {
    if (!googleRef.current || !mapRef.current || !pathOverlayRef.current) {
      return;
    }

    const google = googleRef.current;
    const polyline = pathOverlayRef.current;
    const latLngPath = path.map(([lat, lng]) => ({ lat, lng }));

    polyline.setPath(latLngPath);
    polyline.setOptions({ strokeOpacity: mode === 'view' ? 0.95 : 0.4 });

    if (mode === 'view' && latLngPath.length > 1 && !hasFitToPathRef.current) {
      const bounds = new google.maps.LatLngBounds();
      latLngPath.forEach((point) => bounds.extend(point));
      mapRef.current.fitBounds(bounds, 60);
      hasFitToPathRef.current = true;
    }

    if (latLngPath.length === 0) {
      hasFitToPathRef.current = false;
    }
  }, [mode, path]);

  const handleSearch = async () => {
    if (!addressQuery.trim()) {
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setIsResultsOpen(false);
    setSearchResults([]);

    try {
      const response = await fetch('/api/google/place-autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: addressQuery,
          sessionToken: sessionTokenRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error(`Autocomplete request failed`);
      }

      const data = (await response.json()) as { predictions: AutocompletePrediction[] };

      if (!data.predictions.length) {
        setSearchError('No matching locations were found.');
        return;
      }

      setSearchResults(data.predictions.slice(0, 5));
      setIsResultsOpen(true);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultSelect = async (prediction: AutocompletePrediction) => {
    setIsResultsOpen(false);
    setSearchResults([]);
    setIsSearching(true);

    try {
      const response = await fetch('/api/google/place-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: prediction.place_id,
          sessionToken: sessionTokenRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error('Place details request failed');
      }

      const data = (await response.json()) as { result?: PlaceDetailsResult };

      if (!data.result?.geometry?.location) {
        setSearchError('Location was not found for that address.');
        return;
      }

      const { lat, lng } = data.result.geometry.location;
      const formatted = data.result.formatted_address ?? prediction.description;
      setAddressQuery(formatted);
      sessionTokenRef.current = generateSessionToken();

      if (mapRef.current && googleRef.current) {
        const google = googleRef.current;
        const map = mapRef.current;

        if (data.result.geometry.viewport) {
          const { northeast, southwest } = data.result.geometry.viewport;
          const bounds = new google.maps.LatLngBounds(southwest, northeast);
          map.fitBounds(bounds, 80);
        } else {
          map.panTo({ lat, lng });
          map.setZoom(17);
        }
      }
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Failed to fetch place details');
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    clearPolygonOverlays();
    onPolygonsChangeRef.current([]);
    setIsResultsOpen(false);
    setSearchResults([]);
    setSearchError(null);
  };

  const handleDismissResults = () => {
    setIsResultsOpen(false);
  };

  if (mapError) {
    return (
      <div className="map-panel panel">
        <div className="error-banner">{mapError}</div>
      </div>
    );
  }

  return (
    <div className="map-panel panel">
      <div className="map-toolbar">
        <input
          type="text"
          placeholder="Search for an address"
          value={addressQuery}
          onChange={(event) => setAddressQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleSearch();
            }
          }}
        />
        <button type="button" onClick={handleSearch} disabled={isSearching || !isMapReady}>
          {isSearching ? 'Finding…' : 'Find'}
        </button>
        <button type="button" className="secondary" onClick={handleClear}>
          Clear Map
        </button>
      </div>
      {searchError ? <div className="error-banner">{searchError}</div> : null}
      <div className="map-container" ref={mapContainerRef} />
      {isResultsOpen && searchResults.length > 0 ? (
        <div className="modal-backdrop" role="presentation" onClick={handleDismissResults}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <h3>Select a location</h3>
              <button type="button" className="icon-button" onClick={handleDismissResults}>
                ×
              </button>
            </header>
            <ul className="results-list">
              {searchResults.map((prediction) => (
                <li key={prediction.place_id}>
                  <button type="button" onClick={() => handleResultSelect(prediction)}>
                    <span className="result-name">
                      {prediction.structured_formatting?.main_text ?? prediction.description}
                    </span>
                    {prediction.structured_formatting?.secondary_text ? (
                      <span className="result-type">
                        {prediction.structured_formatting.secondary_text}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function collectListeners(
  google: typeof window.google,
  polygon: google.maps.Polygon,
  onChange: () => void,
): google.maps.MapsEventListener[] {
  const path = polygon.getPath();
  const listeners: google.maps.MapsEventListener[] = [];

  listeners.push(
    google.maps.event.addListener(path, 'set_at', onChange),
    google.maps.event.addListener(path, 'insert_at', onChange),
    google.maps.event.addListener(path, 'remove_at', onChange),
    google.maps.event.addListener(polygon, 'rightclick', (event: google.maps.PolyMouseEvent) => {
      if (event.vertex != null) {
        path.removeAt(event.vertex);
      }
    }),
  );

  return listeners;
}

function generateSessionToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}
