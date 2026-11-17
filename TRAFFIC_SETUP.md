# Connect live traffic

1. Create a free TomTom developer account at https://developer.tomtom.com/ and obtain a browser API key with Routing and Traffic access. Account setup and accepting provider terms are done by the account owner.
2. Start the dashboard using the Windows or Mac instructions in README.md, choose Route alerts, and expand Traffic connection. Paste the key and click Connect traffic. It stays in page memory only; reloading clears it. Do not add the key to files or the sharing ZIP.
3. Plan a route. A successful response shows “TomTom · traffic-aware driving estimate,” traffic delay and calculation time. “Key configured” alone does not mean it has been verified.
4. Enable Show traffic on map for congestion colors. Incident reports appear separately from historical sample warnings. No reports does not establish that a road is clear.

Routing uses TomTom's returned geometry AND duration together, with traffic=true and departAt=now. GPS refreshes are limited to one route attempt per two minutes; while visible, an active journey also refreshes after three minutes. Incidents refresh at most every three minutes in a roughly 34-by-34-km box centered on the starting/current position. This intentionally does not scan the entire Indore–Delhi journey. Reports within 300 m of the route are listed; GPS proximity triggers in-tab alerts within 500 m. Point/line vertices are used for approximate matching; parallel roads and unsampled line crossings can affect matches.

OSRM remains the fallback when no key is configured or TomTom fails. Its estimate is explicitly labeled without traffic. No fabricated time multiplier is applied. Tile overlay errors disable the overlay. Incidents are cleared on request failure or navigation stop. Provider reports can be incomplete; crime data remains simulated.

The normal street background uses the original Leaflet/OpenStreetMap raster map. Use the launcher for your operating system to open it through localhost. No basemap key is needed. TomTom supplies traffic features after a key is connected.

The prototype calls TomTom directly from the browser, so use provider-supported browser key restrictions. For deployment use HTTPS, verify allowed origins and attribution/licensing, and place secret credentials and shared quota controls in a backend. Page timers are not reliable background Android services. Traffic tile requests occur while panning/zooming; the overlay is off by default to limit usage. Raster tile refresh follows normal requests/cache behavior rather than a forced refresh timer.

The automated tests use mocked responses for adapter/fallback behavior. Successful tests do not establish current account access, live coverage or GPS accuracy; test those with your own key and device.

Official references:
https://docs.tomtom.com/pricing
https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route
https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-incidents/incident-details
https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/raster-flow-tiles
