"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Map as LeafletMap, Marker, LeafletMouseEvent } from "leaflet";

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];

export default function MapLocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const center: [number, number] =
    lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER;

  useEffect(() => {
    let map: LeafletMap;
    let marker: Marker;

    const container = containerRef.current;
    if (!container || container.querySelector(".leaflet-container")) return;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      const icon = L.divIcon({
        html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="#dc3545" stroke="white" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z"/></svg>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        className: "",
      });

      map = L.map(container, { zoomControl: true }).setView(center, 13);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      marker = L.marker(center, { draggable: true, icon }).addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onChange(pos.lat, pos.lng);
      });

      map.on("click", (e: LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        onChange(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
    })();

    return () => {
      if (map) map.remove();
    };
  }, []);

  const handleMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current?.setView([latitude, longitude], 15);
        markerRef.current?.setLatLng([latitude, longitude]);
        onChange(latitude, longitude);
      },
      () => {},
      { enableHighAccuracy: true },
    );
  }, [onChange]);

  const handleSearch = useCallback(() => {
    const q = prompt("Enter a location name:");
    if (!q) return;
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (!data?.length) {
          alert("Location not found");
          return;
        }
        const foundLat = parseFloat(data[0].lat);
        const foundLng = parseFloat(data[0].lon);
        mapRef.current?.setView([foundLat, foundLng], 15);
        markerRef.current?.setLatLng([foundLat, foundLng]);
        onChange(foundLat, foundLng);
      })
      .catch(() => alert("Search failed"));
  }, [onChange]);

  return (
    <div>
      <div className="d-flex gap-2 mb-2">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleMyLocation}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="me-1"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
          My Location
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleSearch}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="me-1"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Search
        </button>
        {lat != null && lng != null && (
          <span className="small text-muted ms-auto">
            {lat.toFixed(6)}, {lng.toFixed(6)}
          </span>
        )}
      </div>
      <div ref={containerRef} style={{ height: 360, borderRadius: 6, zIndex: 0 }} />
    </div>
  );
}
