import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Fix for default marker icons in Leaflet
if (typeof window !== "undefined") {
    const DefaultIcon = L.icon({
        iconUrl: (markerIcon as any).src || markerIcon,
        iconRetinaUrl: (markerIconRetina as any).src || markerIconRetina,
        shadowUrl: (markerShadow as any).src || markerShadow,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
    });

    L.Marker.prototype.options.icon = DefaultIcon;
}

interface MapPickerProps {
    initialLat?: number;
    initialLng?: number;
    onLocationSelect: (lat: number, lng: number) => void;
}

function LocationMarker({ position, setPosition, onLocationSelect }: {
    position: [number, number] | null,
    setPosition: (pos: [number, number]) => void,
    onLocationSelect: (lat: number, lng: number) => void
}) {
    useMapEvents({
        click(e) {
            const { lat, lng } = e.latlng;
            setPosition([lat, lng]);
            onLocationSelect(lat, lng);
        },
    });

    return position === null ? null : (
        <Marker position={position} />
    );
}

export function MapPicker({ initialLat, initialLng, onLocationSelect }: MapPickerProps) {
    const [position, setPosition] = useState<[number, number] | null>(
        initialLat && initialLng ? [initialLat, initialLng] : null
    );

    const defaultCenter: [number, number] = [20.5937, 78.9629]; // Center of India

    return (
        <div className="w-full h-64 rounded-xl overflow-hidden border border-white/10 mt-2">
            <MapContainer
                center={position || defaultCenter}
                zoom={position ? 15 : 5}
                scrollWheelZoom={true}
                style={{ height: "100%", width: "100%" }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationMarker position={position} setPosition={setPosition} onLocationSelect={onLocationSelect} />
            </MapContainer>
        </div>
    );
}
