/**
 * data.js
 * ------------------------------------------------------------------
 * Mock data layer for the MapPe Crime Detection & Rate Prediction Dashboard.
 * In a production build this file would be replaced by calls to a
 * real API / database. Every other module treats CRIME_DATA as if it
 * came from a network response, so swapping this out later is a
 * drop-in change.
 * ------------------------------------------------------------------
 */

// Indore, Madhya Pradesh, India. Coordinates form a small cluster so
// the map reads naturally at city-district zoom levels.
const CITY_CENTER = { lat: 22.7196, lng: 75.8577 };

const NEIGHBORHOODS = [
  "Vijay Nagar",
  "Palasia",
  "Rajwada",
  "Bhawarkuan",
  "Sudama Nagar",
  "MG Road",
  "Rau"
];

const CRIME_TYPES = ["Theft", "Burglary", "Assault", "Vandalism", "Robbery", "Drug Offense"];

const SEVERITY_LEVELS = ["Low", "Medium", "High"];

// Neighborhood centers used to jitter realistic-looking coordinates.
const NEIGHBORHOOD_CENTERS = {
  "Vijay Nagar": { lat: 22.7532, lng: 75.8937 },
  "Palasia": { lat: 22.7245, lng: 75.8850 },
  "Rajwada": { lat: 22.7196, lng: 75.8577 },
  "Bhawarkuan": { lat: 22.7051, lng: 75.8667 },
  "Sudama Nagar": { lat: 22.6890, lng: 75.8500 },
  "MG Road": { lat: 22.7180, lng: 75.8650 },
  "Rau": { lat: 22.6300, lng: 75.7800 }
};

// ------------------------------------------------------------------
// Live incident templates — hardcoded scenarios used by the live
// alert engine (app.js) to simulate real-time reports. Each time the
// engine "receives" a new report, it clones one of these, stamps it
// with the real current time, and drops it near the tracked user
// (or a random neighborhood if location isn't available yet).
// This list is intentionally separate from CRIME_DATA: CRIME_DATA is
// historical/mock analytics pinned to TODAY, while these represent
// "happening right now" reports on a real clock.
// ------------------------------------------------------------------
const LIVE_INCIDENT_TEMPLATES = [
  { type: "Theft", severity: "Low", blurb: "Phone snatching reported" },
  { type: "Burglary", severity: "Medium", blurb: "Break-in reported at a residence" },
  { type: "Assault", severity: "High", blurb: "Physical altercation reported" },
  { type: "Vandalism", severity: "Low", blurb: "Property damage reported" },
  { type: "Robbery", severity: "High", blurb: "Armed robbery reported" },
  { type: "Drug Offense", severity: "Medium", blurb: "Suspicious activity reported" },
  { type: "Theft", severity: "Medium", blurb: "Vehicle break-in reported" },
  { type: "Assault", severity: "Medium", blurb: "Altercation reported near a public space" }
];

const CRIME_DATA = [
  { id: 1, type: "Theft", location_name: "Vijay Nagar", latitude: 22.7541, longitude: 75.8921, timestamp: "2026-07-03T21:14:00", severity: "Low" },
  { id: 2, type: "Assault", location_name: "Sudama Nagar", latitude: 22.6882, longitude: 75.8484, timestamp: "2026-07-02T23:40:00", severity: "High" },
  { id: 3, type: "Vandalism", location_name: "MG Road", latitude: 22.7191, longitude: 75.8672, timestamp: "2026-07-02T15:05:00", severity: "Low" },
  { id: 4, type: "Burglary", location_name: "Rau", latitude: 22.6318, longitude: 75.7823, timestamp: "2026-07-01T03:22:00", severity: "Medium" },
  { id: 5, type: "Robbery", location_name: "Bhawarkuan", latitude: 22.7038, longitude: 75.8651, timestamp: "2026-06-30T22:10:00", severity: "High" },
  { id: 6, type: "Theft", location_name: "Palasia", latitude: 22.7261, longitude: 75.8869, timestamp: "2026-06-29T13:47:00", severity: "Low" },
  { id: 7, type: "Drug Offense", location_name: "Rajwada", latitude: 22.7211, longitude: 75.8560, timestamp: "2026-06-28T19:30:00", severity: "Medium" },
  { id: 8, type: "Assault", location_name: "Vijay Nagar", latitude: 22.7519, longitude: 75.8955, timestamp: "2026-06-27T02:15:00", severity: "High" },
  { id: 9, type: "Vandalism", location_name: "Bhawarkuan", latitude: 22.7063, longitude: 75.8680, timestamp: "2026-06-26T17:55:00", severity: "Low" },
  { id: 10, type: "Theft", location_name: "Rau", latitude: 22.6285, longitude: 75.7776, timestamp: "2026-06-25T11:12:00", severity: "Medium" },
  { id: 11, type: "Burglary", location_name: "Sudama Nagar", latitude: 22.6905, longitude: 75.8523, timestamp: "2026-06-24T04:05:00", severity: "High" },
  { id: 12, type: "Robbery", location_name: "Rajwada", latitude: 22.7178, longitude: 75.8592, timestamp: "2026-06-22T22:48:00", severity: "High" },
  { id: 13, type: "Theft", location_name: "MG Road", latitude: 22.7167, longitude: 75.8630, timestamp: "2026-06-21T09:33:00", severity: "Low" },
  { id: 14, type: "Drug Offense", location_name: "Palasia", latitude: 22.7228, longitude: 75.8831, timestamp: "2026-06-19T20:02:00", severity: "Low" },
  { id: 15, type: "Vandalism", location_name: "Rau", latitude: 22.6342, longitude: 75.7815, timestamp: "2026-06-18T14:27:00", severity: "Medium" },
  { id: 16, type: "Assault", location_name: "Bhawarkuan", latitude: 22.7027, longitude: 75.8639, timestamp: "2026-06-16T23:58:00", severity: "High" },
  { id: 17, type: "Theft", location_name: "Rajwada", latitude: 22.7204, longitude: 75.8601, timestamp: "2026-06-14T16:41:00", severity: "Low" },
  { id: 18, type: "Burglary", location_name: "Vijay Nagar", latitude: 22.7556, longitude: 75.8908, timestamp: "2026-06-12T02:50:00", severity: "Medium" },
  { id: 19, type: "Robbery", location_name: "Sudama Nagar", latitude: 22.6862, longitude: 75.8478, timestamp: "2026-06-10T21:19:00", severity: "High" },
  { id: 20, type: "Vandalism", location_name: "MG Road", latitude: 22.7199, longitude: 75.8613, timestamp: "2026-06-08T18:07:00", severity: "Low" },
  { id: 21, type: "Theft", location_name: "Palasia", latitude: 22.7266, longitude: 75.8815, timestamp: "2026-06-06T12:36:00", severity: "Medium" },
  { id: 22, type: "Drug Offense", location_name: "Rau", latitude: 22.6274, longitude: 75.7841, timestamp: "2026-06-04T20:44:00", severity: "Medium" },
  { id: 23, type: "Assault", location_name: "Vijay Nagar", latitude: 22.7508, longitude: 75.8969, timestamp: "2026-06-02T23:12:00", severity: "High" },
  { id: 24, type: "Theft", location_name: "Rajwada", latitude: 22.7222, longitude: 75.8547, timestamp: "2026-05-29T10:25:00", severity: "Low" },
  { id: 25, type: "Burglary", location_name: "MG Road", latitude: 22.7145, longitude: 75.8674, timestamp: "2026-05-24T03:41:00", severity: "Medium" },
  { id: 26, type: "Robbery", location_name: "Sudama Nagar", latitude: 22.6919, longitude: 75.8462, timestamp: "2026-05-19T22:59:00", severity: "High" },
  { id: 27, type: "Vandalism", location_name: "Bhawarkuan", latitude: 22.7079, longitude: 75.8619, timestamp: "2026-05-14T15:18:00", severity: "Low" },
  { id: 28, type: "Theft", location_name: "Palasia", latitude: 22.7203, longitude: 75.8896, timestamp: "2026-05-08T13:02:00", severity: "Low" },
  { id: 29, type: "Assault", location_name: "Rau", latitude: 22.6329, longitude: 75.7767, timestamp: "2026-04-27T22:33:00", severity: "High" },
  { id: 30, type: "Drug Offense", location_name: "Rajwada", latitude: 22.7189, longitude: 75.8534, timestamp: "2026-04-15T19:47:00", severity: "Low" }
];