'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapCompany {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  domain?: string | null;
}

interface Props {
  companies: MapCompany[];
  onMarkerClick?: (id: number) => void;
  onMarkerHover?: (id: number | null) => void;
  highlightedId?: number | null;
}

// Default center: roughly the center of the contiguous US.
const DEFAULT_CENTER: LatLngTuple = [39.5, -98.35];
const DEFAULT_ZOOM = 4;

function FitBounds({ companies }: { companies: MapCompany[] }) {
  const map = useMap();
  useEffect(() => {
    if (companies.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    if (companies.length === 1) {
      map.setView([companies[0].latitude, companies[0].longitude], 10);
      return;
    }
    const bounds: LatLngBoundsExpression = companies.map(
      (c) => [c.latitude, c.longitude] as LatLngTuple,
    );
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
  }, [companies, map]);
  return null;
}

export default function CompanyMapImpl({
  companies,
  onMarkerClick,
  onMarkerHover,
  highlightedId,
}: Props) {
  const points = useMemo(
    () => companies.filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude)),
    [companies],
  );

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      style={{ height: '100%', width: '100%', borderRadius: '0.75rem' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds companies={points} />
      {points.map((c) => {
        const isHi = highlightedId === c.id;
        return (
          <CircleMarker
            key={c.id}
            center={[c.latitude, c.longitude]}
            radius={isHi ? 11 : 6}
            // bumpPane: when highlighted, render last so it sits on top of overlapping markers
            pane={isHi ? 'markerPane' : undefined}
            pathOptions={{
              color: isHi ? '#f97316' : '#0ea5e9',
              weight: isHi ? 3 : 2,
              fillColor: isHi ? '#fb923c' : '#0ea5e9',
              fillOpacity: isHi ? 0.9 : 0.6,
            }}
            eventHandlers={{
              ...(onMarkerClick ? { click: () => onMarkerClick(c.id) } : {}),
              ...(onMarkerHover
                ? {
                    mouseover: () => onMarkerHover(c.id),
                    mouseout: () => onMarkerHover(null),
                  }
                : {}),
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{c.name}</div>
                {c.domain && <div className="text-xs text-gray-500">{c.domain}</div>}
                {onMarkerClick && (
                  <button
                    type="button"
                    onClick={() => onMarkerClick(c.id)}
                    className="mt-1 text-xs text-sky-600 hover:underline"
                  >
                    Open →
                  </button>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
