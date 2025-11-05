import { Loader } from '@googlemaps/js-api-loader';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Coordinate, PolygonRings } from '@mow-time/types';

type MapMode = 'draw' | 'view';
type DrawingMode = 'area' | 'obstacle';

interface MapViewProps {
  polygons: PolygonRings[];
  path: Coordinate[];
  mode: MapMode;
  onPolygonsChange: (polygons: PolygonRings[]) => void;
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

// Internal interface for managing Google Maps polygon overlays
interface PolygonOverlayGroup {
  outer: google.maps.Polygon;
  obstacles: google.maps.Polygon[];
}

export function MapView({ polygons, path, mode, onPolygonsChange }: MapViewProps): JSX.Element {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const googleRef = useRef<typeof google | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const polygonGroupsRef = useRef<PolygonOverlayGroup[]>([]);
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
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('area');
  const [selectedOuterIndex, setSelectedOuterIndex] = useState<number | null>(null);
  const drawingModeRef = useRef<DrawingMode>('area');
  const selectedOuterIndexRef = useRef<number | null>(null);
  const sessionTokenRef = useRef<string>(generateSessionToken());
  const onPolygonsChangeRef = useRef(onPolygonsChange);

  useEffect(() => {
    onPolygonsChangeRef.current = onPolygonsChange;
  }, [onPolygonsChange]);

  useEffect(() => {
    drawingModeRef.current = drawingMode;
  }, [drawingMode]);

  useEffect(() => {
    selectedOuterIndexRef.current = selectedOuterIndex;
  }, [selectedOuterIndex]);

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

    const rings: PolygonRings[] = polygonGroupsRef.current.map((group): PolygonRings => {
      const outer: Coordinate[] = group.outer
        .getPath()
        .getArray()
        .map((latLng): Coordinate => [latLng.lat(), latLng.lng()]);

      const holes: Coordinate[][] = group.obstacles.map((obstacle): Coordinate[] =>
        obstacle
          .getPath()
          .getArray()
          .map((latLng): Coordinate => [latLng.lat(), latLng.lng()]),
      );

      return [outer, ...holes];
    });

    onPolygonsChangeRef.current(rings);
  }, []);

  const clearPolygonOverlays = useCallback(() => {
    polygonGroupsRef.current.forEach((group) => {
      group.outer.setMap(null);
      const outerListeners = polygonListenersRef.current.get(group.outer) ?? [];
      outerListeners.forEach((listener) => listener.remove());

      group.obstacles.forEach((obstacle) => {
        obstacle.setMap(null);
        const obstacleListeners = polygonListenersRef.current.get(obstacle) ?? [];
        obstacleListeners.forEach((listener) => listener.remove());
      });
    });

    polygonGroupsRef.current = [];
    polygonListenersRef.current.clear();
  }, []);

  const updatePolygonWithHoles = useCallback((group: PolygonOverlayGroup) => {
    if (!googleRef.current) {
      return;
    }

    const google = googleRef.current;
    const paths = [
      group.outer.getPath(),
      ...group.obstacles.map((obs) => obs.getPath()),
    ];

    group.outer.setPaths(paths);
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

            const currentDrawingMode = drawingModeRef.current;
            const currentSelectedIndex = selectedOuterIndexRef.current;

            if (currentDrawingMode === 'area') {
              // Create new outer polygon group
              const group: PolygonOverlayGroup = {
                outer: polygon,
                obstacles: [],
              };
              const newIndex = polygonGroupsRef.current.length;
              polygonGroupsRef.current.push(group);
              polygon.setOptions({
                fillColor: '#2563eb',
                fillOpacity: 0.18,
                strokeColor: '#2563eb',
                strokeWeight: 2,
              });
              const listeners = collectListeners(google, polygon, syncPolygons);
              listeners.push(
                google.maps.event.addListener(polygon, 'click', () => {
                  if (drawingModeRef.current === 'obstacle') {
                    setSelectedOuterIndex(newIndex);
                    selectedOuterIndexRef.current = newIndex;
                    // Highlight selected polygon
                    polygonGroupsRef.current.forEach((g, idx) => {
                      g.outer.setOptions({
                        strokeWeight: idx === newIndex ? 4 : 2,
                        strokeColor: idx === newIndex ? '#1e40af' : '#2563eb',
                      });
                    });
                  }
                }),
              );
              polygonListenersRef.current.set(polygon, listeners);
              setSelectedOuterIndex(newIndex);
              selectedOuterIndexRef.current = newIndex;
            } else if (currentDrawingMode === 'obstacle' && currentSelectedIndex !== null) {
              // Add obstacle to selected outer polygon
              const group = polygonGroupsRef.current[currentSelectedIndex];
              if (group) {
                group.obstacles.push(polygon);
                polygon.setOptions({
                  fillColor: '#dc2626',
                  fillOpacity: 0.25,
                  strokeColor: '#dc2626',
                  strokeWeight: 2,
                  clickable: true,
                  editable: true,
                });
                polygonListenersRef.current.set(
                  polygon,
                  collectListeners(google, polygon, () => {
                    updatePolygonWithHoles(group);
                    syncPolygons();
                  }),
                );
                updatePolygonWithHoles(group);
              }
            }

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
      polygonGroupsRef.current.forEach((group) => {
        group.outer.setEditable(true);
        group.obstacles.forEach((obs) => obs.setEditable(true));
      });
      hasFitToPathRef.current = false;
    } else {
      drawingManagerRef.current.setDrawingMode(null);
      polygonGroupsRef.current.forEach((group) => {
        group.outer.setEditable(false);
        group.obstacles.forEach((obs) => obs.setEditable(false));
      });
    }
  }, [mode]);

  useEffect(() => {
    if (!googleRef.current || !mapRef.current || polygons.length === 0) {
      if (polygons.length === 0) {
        clearPolygonOverlays();
      }
      return;
    }

    const google = googleRef.current;
    const map = mapRef.current;

    // Clear existing overlays
    clearPolygonOverlays();

    // Rebuild from props
    polygons.forEach((rings) => {
      if (rings.length === 0) return;

      const outerPath = rings[0].map(([lat, lng]) => ({ lat, lng }));
      const outerPolygon = new google.maps.Polygon({
        map,
        paths: outerPath,
        fillColor: '#2563eb',
        fillOpacity: 0.18,
        strokeColor: '#2563eb',
        strokeWeight: 2,
        clickable: true,
        editable: mode === 'draw',
      });

      const holes = rings.slice(1).map((hole) => hole.map(([lat, lng]) => ({ lat, lng })));
      const obstaclePolygons: google.maps.Polygon[] = holes.map((holePath) => {
        const obs = new google.maps.Polygon({
          map,
          paths: holePath,
          fillColor: '#dc2626',
          fillOpacity: 0.25,
          strokeColor: '#dc2626',
          strokeWeight: 2,
          clickable: true,
          editable: mode === 'draw',
        });
        return obs;
      });

      // Create combined polygon with holes
      if (holes.length > 0) {
        outerPolygon.setPaths([outerPath, ...holes]);
      }

      const group: PolygonOverlayGroup = {
        outer: outerPolygon,
        obstacles: obstaclePolygons,
      };
      const groupIndex = polygonGroupsRef.current.length;
      polygonGroupsRef.current.push(group);

      const outerListeners = collectListeners(google, outerPolygon, syncPolygons);
      outerListeners.push(
        google.maps.event.addListener(outerPolygon, 'click', () => {
          if (drawingModeRef.current === 'obstacle') {
            setSelectedOuterIndex(groupIndex);
            selectedOuterIndexRef.current = groupIndex;
            // Highlight selected polygon
            polygonGroupsRef.current.forEach((g, idx) => {
              g.outer.setOptions({
                strokeWeight: idx === groupIndex ? 4 : 2,
                strokeColor: idx === groupIndex ? '#1e40af' : '#2563eb',
              });
            });
          }
        }),
      );
      polygonListenersRef.current.set(outerPolygon, outerListeners);

      obstaclePolygons.forEach((obs) => {
        polygonListenersRef.current.set(
          obs,
          collectListeners(google, obs, () => {
            updatePolygonWithHoles(group);
            syncPolygons();
          }),
        );
      });
    });

    if (polygonGroupsRef.current.length > 0) {
      setSelectedOuterIndex(0);
      selectedOuterIndexRef.current = 0;
    }
  }, [clearPolygonOverlays, mode, polygons, syncPolygons, updatePolygonWithHoles]);

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

  const handleDrawingModeChange = (newMode: DrawingMode) => {
    setDrawingMode(newMode);
    drawingModeRef.current = newMode;
    if (newMode === 'obstacle' && polygonGroupsRef.current.length > 0 && selectedOuterIndex === null) {
      setSelectedOuterIndex(0);
      selectedOuterIndexRef.current = 0;
    } else if (newMode === 'area') {
      // Reset highlighting when switching to area mode
      polygonGroupsRef.current.forEach((g) => {
        g.outer.setOptions({
          strokeWeight: 2,
          strokeColor: '#2563eb',
        });
      });
    }
  };

  const handleOuterPolygonClick = (index: number) => {
    setSelectedOuterIndex(index);
    selectedOuterIndexRef.current = index;
    setDrawingMode('obstacle');
    drawingModeRef.current = 'obstacle';
  };

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
        {mode === 'draw' && (
          <>
            <button
              type="button"
              className={drawingMode === 'area' ? 'primary' : 'secondary'}
              onClick={() => handleDrawingModeChange('area')}
              disabled={!isMapReady}
            >
              Draw Area
            </button>
            <button
              type="button"
              className={drawingMode === 'obstacle' ? 'primary' : 'secondary'}
              onClick={() => handleDrawingModeChange('obstacle')}
              disabled={!isMapReady || polygonGroupsRef.current.length === 0}
            >
              Add Obstacle
            </button>
          </>
        )}
        <button type="button" className="secondary" onClick={handleClear}>
          Clear Map
        </button>
      </div>
      {mode === 'draw' && drawingMode === 'obstacle' && polygonGroupsRef.current.length > 0 && (
        <div style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', color: '#64748b' }}>
          Click on an area (blue) to select it, then draw obstacles (red) inside it.
        </div>
      )}
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
