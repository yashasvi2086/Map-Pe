# MapPe — Crime & Accident Detector

## Mac

Extract the ZIP first. You need Python 3.9 or newer; no pip packages or Node.js are needed to run the dashboard.

Open Terminal, type `cd ` (with a space), drag the extracted project folder into Terminal, and press Return. Then run:

```sh
python3 serve.py
```

Keep Terminal open while using the dashboard. The server opens the login page in your default browser. If it does not, open the `http://localhost:.../login-story.html` address printed in Terminal. Do not open the HTML file directly or use the Windows `.vbs` launchers on Mac.

Stop using **Stop local server** in the dashboard, or press Control+C in Terminal. If `python3` is missing or older than 3.9, install a current Python 3 release before starting.

## Sending the project and datasets separately

The two root files `India_Crime_Accident_Dataset.xlsx` and `India_Crime_Accident_News_2021-2026.csv` are optional research/training exports. The current app never reads them, and `serve.py` does not expose them. You can exclude them from the shared folder and send them later for backend work. Keep a separate copy before deleting your originals.

**Keep `datasss.js` and `dataset-analysis.js`.** The dashboard uses the sample records in `datasss.js`; its analysis charts use those same samples. Receiving the Excel/CSV files later does not automatically connect them: backend import, validation, and frontend integration still need to be implemented.

## Windows

Extract the ZIP first, then double-click **Start Dashboard.vbs**.
It opens the dashboard in your browser with **no CMD window**. Python runs quietly in the background. The launcher finds the Python installation on this computer automatically.

To stop it, click **Stop local server** in the dashboard header, or double-click **Stop Dashboard.vbs**. Closing a browser tab leaves the local server available for reopening. It does not start automatically when Windows starts.

Opening the launcher again reuses the running server. The normal address is http://localhost:8765/login-story.html; if another program or an older server occupies that port, the launcher opens an available port from 8766–8775. Use the address it opens instead of a stale bookmark.

Python 3.9 or newer and Windows Script Host are required. Startup errors appear in a message box.

The server only listens on this computer, not the local network.

## Opening the dashboard

Use the launcher or `python3 serve.py` instead of double-clicking the HTML file. Opening indexxx.html directly now shows launch instructions because an HTML file cannot start Python or create a localhost server.
Internet access is still needed for map tiles, optional fonts, searches, and routes. Map/chart libraries and the compiled stylesheet are included locally in `vendor/`.
Python serves the local files; it does not replace those external services.

## Quick check

- Switch between Area forecasts and Route alerts; scroll the sidebar.
- Select an area and switch between Markers and Heatmap.
- Expand historical sample data and change a filter.
- In Route alerts, choose a manual start or use Try Medicaps → Patalpani.
- Allow location access only when using GPS features. Live traffic requires your own TomTom key in Traffic connection; it clears on reload.

Forecasts and crime records are demo data. OSRM route estimates exclude live traffic. See TRAFFIC_SETUP.md for traffic setup.

## Files

Keep the root HTML, JavaScript and CSS files, `serve.py`, and the entire `vendor/` directory together. Their original names are intentional, including `style - Copy.css`, which is the active stylesheet. Keep the Windows launchers for Windows users. `tests/` contains the development check (`node tests/dataset-analysis.cjs`); Node.js is only needed to run that check. The Excel/CSV exports are optional as explained above.
## Place search and route panel

Place searches use Nominatim with structured address details, limited to Indore and its surroundings by default. Choose **All India** for destinations elsewhere. Search runs only when submitted, is paced to at least 1.1 seconds between requests, and caches up to 60 queries for the page session. No additional installation or API key is needed.

Results distinguish broad area centres, streets, and mapped places. PINs are displayed only when returned by OpenStreetMap and are labelled unverified; an entered PIN that differs from the result is flagged. The full provider address remains available on hover. Administrative names such as Juni Indore Tahsil are not used as the primary place label. Confirm the selected pin, or use **Place or adjust a pin on the map** for the destination. Search cannot repair missing or incorrect upstream postal data.

Route summaries appear before nearby sample records. Directions, optional traffic settings, and demo tools expand on demand.

## Map rendering


Leaflet continues to manage the dashboard's map interactions and overlays. It uses Canvas for map shapes, reuses historical markers and the chart, defers chart creation until historical data is expanded, and caps simulated markers at 60. The browser no longer compiles Tailwind CSS while the interface changes. The original raster background loads new tiles after panning finishes.

The default background uses free, keyless OpenFreeMap with muted rose **H** medical markers and labels. **Map style → Original map** restores the previous OpenStreetMap background. It also falls back automatically if the optional background cannot load. The existing Leaflet routes, heatmap and alerts are unchanged. Internet access is required for map data.

## Login and profile

The launcher opens `login-story.html`. Sign in or create an account using Firebase email/password or Google. Open **Profile** for your email, sign-in method, editable display name, and **Sign out**. Guest access remains available explicitly from the login page.

Use the top-left menu button to slide the sidebar in or out. The map fills the available space; desktop open/closed preference is remembered in this browser. Choosing a dashboard tab reopens its panel. On smaller screens, the panel starts closed and can also be dismissed by tapping the backdrop or pressing Escape.

**FAQ** answers common questions about the demo data, forecasts, route warnings, searches, GPS, traffic, and account controls. **Emergency**, beside Profile, lists India's 112 service and police, ambulance, fire, women, children, cyber financial fraud, and local Indore contacts. Contacts appear in a plain list and numbers link to the device's calling app. Start loud beeping plays a repeating local alarm at the device volume; Stop beeping, closing the dialog, or leaving the tab stops it. No sound plays just from opening Emergency. The directory includes official source links checked on 6 October 2026; this website does not dispatch help or report incidents.

Firebase must load before account buttons become available. Accounts are no longer silently created in browser storage. Enable Email/Password and Google in Firebase Authentication, and authorize `localhost` for local testing. The launcher uses this hostname; older 127.0.0.1 page links redirect to localhost. The Firebase project configuration is retained.

The profile name is saved with Firebase Authentication. Dashboard filters and areas are not saved to a cloud database. This is a local dashboard UI gate; protect future private remote data with Firebase security rules or a backend.

The connected login page is `login-story.html`.


Map modes use an explicit zoom range so marker clusters can return after changing the basemap. Heatmap updates run only while its layer is attached, and pending redraws are cancelled on removal. Heatmap mode hides forecast circles and shows a concentration legend; selecting a forecast area returns to Markers.
