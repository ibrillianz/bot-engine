// bot-engine/src/utils.js

import { CLIENT_LOCATION } from "../../deco-bot/config.js"; 

/**
 * Check if a given 6-digit Indian pincode falls within the
 * specified radius of the client’s configured city center
 * using OpenStreetMap’s Nominatim API.
 *
 * @param {string} pincode  – 6-digit postal code to validate
 * @returns {Promise<boolean>} – true if within CLIENT_LOCATION.radiusKm
 */
export async function isWithinRadius(pincode) {
  // 1) Validate format
  const pinRe = /^[0-9]{6}$/;
  if (!pinRe.test(pincode)) return false;

  // 2) Geocode pincode via Nominatim
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(pincode)}&country=India&format=json`
  );
  const places = await response.json();
  if (!places.length) return false;

  // 3) Parse latitude/longitude of first match
  const { lat, lon } = places[0];
  const lat1 = parseFloat(lat);
  const lon1 = parseFloat(lon);

  // 4) Retrieve client’s center and radius
  const {
    center: { lat: lat2, lon: lon2 },
    radiusKm
  } = CLIENT_LOCATION;

  // 5) Haversine formula to compute distance (in km)
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = 6371 * c;  // Earth’s radius ≈ 6371 km

  return distanceKm <= radiusKm;
}
