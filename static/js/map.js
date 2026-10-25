// ==========================================================================
// SAFEHER AI - LEAFLET MAP & SAFE ROUTE ENGINE
// ==========================================================================

const SafeMap = {
  map: null,
  userMarker: null,
  routePolyline: null,
  accuracyCircle: null,
  currentRouteData: null,

  init() {
    this.initLeaflet();
    this.setupListeners();
  },

  initLeaflet() {
    const mapEl = document.getElementById('leaflet-map');
    if (!mapEl) return;

    // Default center (Pune Tathawade / College area)
    const defaultLat = 18.6186;
    const defaultLng = 73.7482;

    this.map = L.map('leaflet-map', {
      zoomControl: false
    }).setView([defaultLat, defaultLng], 14);

    // CartoDB Dark Matter Tiles (Clean Cyberpunk Dark Theme)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Initial GPS locate
    this.locateUser();
  },

  locateUser() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const userLatLng = [latitude, longitude];

        if (!this.userMarker) {
          // Custom Glowing User Icon
          const userIcon = L.divIcon({
            className: 'custom-pulse-marker',
            html: `<div style="width:16px; height:16px; background:#00f2fe; border-radius:50%; box-shadow:0 0 15px #00f2fe; border:2px solid #fff;"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });

          this.userMarker = L.marker(userLatLng, { icon: userIcon }).addTo(this.map);
          this.userMarker.bindPopup('<b>You are here</b><br>SafeHer Live GPS Active').openPopup();

          this.accuracyCircle = L.circle(userLatLng, {
            radius: accuracy,
            color: '#00f2fe',
            fillColor: '#00f2fe',
            fillOpacity: 0.1,
            weight: 1
          }).addTo(this.map);
        } else {
          this.userMarker.setLatLng(userLatLng);
          if (this.accuracyCircle) {
            this.accuracyCircle.setLatLng(userLatLng);
            this.accuracyCircle.setRadius(accuracy);
          }
        }

        this.map.setView(userLatLng, 15);
      },
      (err) => {
        console.warn('[Map] GPS positioning error:', err.message);
      },
      { enableHighAccuracy: true }
    );
  },

  async calculateRoute(destinationText) {
    if (!destinationText) return;

    try {
      // 1. Geocode destination using Nominatim
      const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destinationText)}`;
      const geoResp = await fetch(geocodeUrl, {
        headers: { 'Accept': 'application/json' }
      });
      const geoData = await geoResp.json();

      if (!geoData || geoData.length === 0) {
        alert('Destination location not found. Please try a different landmark or area.');
        return;
      }

      const destLat = parseFloat(geoData[0].lat);
      const destLng = parseFloat(geoData[0].lon);
      const destName = geoData[0].display_name.split(',')[0];

      // Current location fallback
      const startLat = SOS.currentLocation.lat || 18.6186;
      const startLng = SOS.currentLocation.lng || 73.7482;

      // 2. Fetch walking route from OSRM public API (100% Free)
      const osrmUrl = `https://router.project-osrm.org/route/v1/walking/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`;
      const routeResp = await fetch(osrmUrl);
      const routeData = await routeResp.json();

      if (!routeData.routes || routeData.routes.length === 0) {
        alert('Unable to calculate walking route to this location.');
        return;
      }

      const route = routeData.routes[0];
      const distanceKm = (route.distance / 1000).toFixed(2);
      const durationMin = Math.ceil(route.duration / 60);

      this.currentRouteData = {
        destination: destName,
        distanceKm,
        durationMin,
        startLat,
        startLng,
        destLat,
        destLng
      };

      // 3. Draw route line on Leaflet map
      if (this.routePolyline) {
        this.map.removeLayer(this.routePolyline);
      }

      const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
      this.routePolyline = L.polyline(coords, {
        color: '#00f2fe',
        weight: 5,
        opacity: 0.85,
        dashArray: '1, 8'
      }).addTo(this.map);

      this.map.fitBounds(this.routePolyline.getBounds(), { padding: [50, 50] });

      // Update UI stats
      const distEl = document.getElementById('route-distance');
      const timeEl = document.getElementById('route-time');
      const statsCard = document.getElementById('route-stats-card');

      if (distEl) distEl.innerText = `${distanceKm} km`;
      if (timeEl) timeEl.innerText = `${durationMin} mins`;
      if (statsCard) statsCard.style.display = 'flex';

    } catch (e) {
      console.error('[Map] Route calculation error:', e);
      alert('Could not compute route. Please check your network connection.');
    }
  },

  setupListeners() {
    const btnRecenter = document.getElementById('btn-recenter-map');
    if (btnRecenter) {
      btnRecenter.addEventListener('click', () => this.locateUser());
    }

    const btnSearch = document.getElementById('btn-search-dest');
    const inputSearch = document.getElementById('map-destination-input');

    if (btnSearch && inputSearch) {
      btnSearch.addEventListener('click', () => {
        this.calculateRoute(inputSearch.value.trim());
      });

      inputSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.calculateRoute(inputSearch.value.trim());
        }
      });
    }

    // Share Trip on WhatsApp Button
    const btnShareTrip = document.getElementById('btn-share-trip');
    if (btnShareTrip) {
      btnShareTrip.addEventListener('click', () => {
        if (!this.currentRouteData) {
          alert('Please search a destination first to generate route details.');
          return;
        }

        const { destination, distanceKm, durationMin, startLat, startLng } = this.currentRouteData;
        const msg = 
          `🚶‍♀️ *SafeHer AI - Live Walking Trip Sharing*\n` +
          `Destination: ${destination}\n` +
          `Distance: ${distanceKm} km | Est. Time: ${durationMin} mins\n` +
          `My Starting Location: https://www.google.com/maps?q=${startLat},${startLng}\n` +
          `Please check in on me if I do not reach in ${durationMin + 10} minutes.`;

        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
      });
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  // Leaflet map requires container to be visible for sizing
  const mapNavBtn = document.querySelector('[data-tab="tab-map"]');
  if (mapNavBtn) {
    mapNavBtn.addEventListener('click', () => {
      setTimeout(() => {
        if (!SafeMap.map) {
          SafeMap.init();
        } else {
          SafeMap.map.invalidateSize();
          SafeMap.locateUser();
        }
      }, 150);
    });
  }
});
