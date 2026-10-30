// ==========================================================================
// SAFEHER AI - LEAFLET MAP & SAFE ROUTE ENGINE (PRODUCTION GRADE)
// ==========================================================================

const SafeMap = {
  map: null,
  userMarker: null,
  destMarker: null,
  routePolyline: null,
  accuracyCircle: null,
  currentRouteData: null,
  isFullscreen: false,

  init() {
    if (this.map) return;
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
      zoomControl: false,
      attributionControl: false
    }).setView([defaultLat, defaultLng], 14);

    // OpenStreetMap Standard Tiles (100% Free, Zero API Key Required)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(this.map);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Initial GPS locate & size calculation
    this.locateUser();
    this.triggerMultiInvalidate();
  },

  triggerMultiInvalidate() {
    if (!this.map) return;
    const delays = [50, 150, 350, 600];
    delays.forEach(d => {
      setTimeout(() => {
        if (this.map) {
          this.map.invalidateSize(true);
        }
      }, d);
    });
  },

  refreshMap() {
    if (!this.map) {
      this.init();
    } else {
      this.triggerMultiInvalidate();
      this.locateUser();
    }
  },

  locateUser() {
    // If SOS already has a location, display immediately
    if (typeof SOS !== 'undefined' && SOS.currentLocation && SOS.currentLocation.lat) {
      this.updateUserMarker(SOS.currentLocation.lat, SOS.currentLocation.lng, SOS.currentLocation.accuracy || 15);
      if (!this.routePolyline && this.map) {
        this.map.setView([SOS.currentLocation.lat, SOS.currentLocation.lng], 15);
      }
      this.updateStatusPill(`GPS Active • Accurate to ±${Math.round(SOS.currentLocation.accuracy || 15)}m`);
    }

    if (!navigator.geolocation) {
      this.updateStatusPill('GPS not supported on this browser');
      return;
    }

    this.updateStatusPill('Locating live GPS coordinates...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const userLatLng = [latitude, longitude];

        // Store globally in SOS object as well
        if (typeof SOS !== 'undefined') {
          SOS.currentLocation = { lat: latitude, lng: longitude, accuracy };
        }

        if (!this.userMarker) {
          // Custom Glowing User Icon (Indigo SaaS Pin)
          const userIcon = L.divIcon({
            className: 'custom-pulse-marker',
            html: `<div style="width:18px; height:18px; background:#4f46e5; border-radius:50%; box-shadow:0 3px 12px rgba(79,70,229,0.5); border:3px solid #ffffff;"></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          });

          this.userMarker = L.marker(userLatLng, { icon: userIcon }).addTo(this.map);
          this.userMarker.bindPopup('<b>You are here</b><br>SafeHer Live GPS Active');

          this.accuracyCircle = L.circle(userLatLng, {
            radius: Math.max(accuracy, 20),
            color: '#4f46e5',
            fillColor: '#4f46e5',
            fillOpacity: 0.12,
            weight: 1.5
          }).addTo(this.map);
        } else {
          this.userMarker.setLatLng(userLatLng);
          if (this.accuracyCircle) {
            this.accuracyCircle.setLatLng(userLatLng);
            this.accuracyCircle.setRadius(Math.max(accuracy, 20));
          }
        }

        if (!this.routePolyline) {
          this.map.setView(userLatLng, 15);
        }

        this.updateStatusPill(`GPS Active • Accurate to ±${Math.round(accuracy)}m`);
      },
      (err) => {
        console.warn('[Map] GPS positioning error:', err.message);
        this.updateStatusPill('Default Area: JSPM RSCOE Tathawade');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  },

  updateStatusPill(text) {
    const pill = document.getElementById('map-status-pill');
    if (!pill) return;
    const textSpan = pill.querySelector('span:not(.live-pulse-dot)') || pill;
    textSpan.innerText = text;
  },

  updateUserMarker(latitude, longitude, accuracy) {
    if (!this.map) return;
    const userLatLng = [latitude, longitude];
    if (!this.userMarker) {
      const userIcon = L.divIcon({
        className: 'custom-pulse-marker',
        html: `<div style="width:18px; height:18px; background:#4f46e5; border-radius:50%; box-shadow:0 3px 12px rgba(79,70,229,0.5); border:3px solid #ffffff;"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      this.userMarker = L.marker(userLatLng, { icon: userIcon }).addTo(this.map);
      this.userMarker.bindPopup('<b>You are here</b><br>SafeHer Live GPS Active');
      this.accuracyCircle = L.circle(userLatLng, {
        radius: Math.max(accuracy || 20, 20),
        color: '#4f46e5',
        fillColor: '#4f46e5',
        fillOpacity: 0.12,
        weight: 1.5
      }).addTo(this.map);
    } else {
      this.userMarker.setLatLng(userLatLng);
      if (this.accuracyCircle) {
        this.accuracyCircle.setLatLng(userLatLng);
        this.accuracyCircle.setRadius(Math.max(accuracy || 20, 20));
      }
    }
  },

  async calculateRoute(destinationText) {
    if (!destinationText) return;

    const btnSearch = document.getElementById('btn-search-dest');
    const originalBtnContent = btnSearch ? btnSearch.innerHTML : '🔍';
    if (btnSearch) btnSearch.innerHTML = '⏳';
    this.updateStatusPill(`Calculating route to "${destinationText}"...`);

    try {
      // 1. Geocode destination using Nominatim
      const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destinationText)}`;
      const geoResp = await fetch(geocodeUrl, {
        headers: { 'Accept': 'application/json' }
      });
      const geoData = await geoResp.json();

      if (!geoData || geoData.length === 0) {
        alert('Destination location not found. Please try a different landmark or area.');
        this.updateStatusPill('Location not found');
        return;
      }

      const destLat = parseFloat(geoData[0].lat);
      const destLng = parseFloat(geoData[0].lon);
      const destName = geoData[0].display_name.split(',').slice(0, 2).join(',');

      // Current location fallback
      const startLat = (typeof SOS !== 'undefined' && SOS.currentLocation.lat) ? SOS.currentLocation.lat : 18.6186;
      const startLng = (typeof SOS !== 'undefined' && SOS.currentLocation.lng) ? SOS.currentLocation.lng : 73.7482;

      // 2. Fetch walking route from OSRM public API (100% Free)
      const osrmUrl = `https://router.project-osrm.org/route/v1/walking/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`;
      const routeResp = await fetch(osrmUrl);
      const routeData = await routeResp.json();

      if (!routeData.routes || routeData.routes.length === 0) {
        alert('Unable to calculate walking route to this location.');
        this.updateStatusPill('Walking route unavailable');
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

      // 3. Clear previous route polyline and destination marker
      if (this.routePolyline) {
        this.map.removeLayer(this.routePolyline);
      }
      if (this.destMarker) {
        this.map.removeLayer(this.destMarker);
      }

      // Add Destination Marker (Glowing Coral Pin)
      const destIcon = L.divIcon({
        className: 'custom-dest-marker',
        html: `<div style="width:24px; height:24px; background:#ef4444; border-radius:50%; box-shadow:0 3px 14px rgba(239,68,68,0.4); border:3px solid #ffffff; display:flex; align-items:center; justify-content:center; font-size:11px; color:#fff;">📍</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      this.destMarker = L.marker([destLat, destLng], { icon: destIcon }).addTo(this.map);
      this.destMarker.bindPopup(`<b>Destination:</b><br>${destName}<br><b>ETA:</b> ${durationMin} mins (${distanceKm} km)`).openPopup();

      // Draw route line on Leaflet map
      const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
      this.routePolyline = L.polyline(coords, {
        color: '#4f46e5',
        weight: 6,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);

      // Fit map to show both start and end completely
      this.map.fitBounds(this.routePolyline.getBounds(), { padding: [60, 60], maxZoom: 17 });

      // Update UI stats
      const distEl = document.getElementById('route-distance');
      const timeEl = document.getElementById('route-time');
      const statsCard = document.getElementById('route-stats-card');

      if (distEl) distEl.innerText = `${distanceKm} km`;
      if (timeEl) timeEl.innerText = `${durationMin} mins`;
      if (statsCard) statsCard.style.display = 'flex';

      this.updateStatusPill(`Route Active • ${distanceKm} km (${durationMin} min walk)`);

    } catch (e) {
      console.error('[Map] Route calculation error:', e);
      alert('Could not compute route. Please check your network connection.');
      this.updateStatusPill('Route computation error');
    } finally {
      if (btnSearch) btnSearch.innerHTML = originalBtnContent;
    }
  },

  setupListeners() {
    const btnRecenter = document.getElementById('btn-recenter-map');
    if (btnRecenter) {
      btnRecenter.addEventListener('click', () => {
        this.locateUser();
        if (this.userMarker) {
          this.map.setView(this.userMarker.getLatLng(), 16);
        }
      });
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

    // Fullscreen Toggle Button
    const btnFullscreen = document.getElementById('btn-toggle-fullscreen-map');
    const mapWrapper = document.getElementById('map-wrapper-box');
    if (btnFullscreen && mapWrapper) {
      btnFullscreen.addEventListener('click', () => {
        this.isFullscreen = !this.isFullscreen;
        if (this.isFullscreen) {
          mapWrapper.classList.add('map-fullscreen');
          btnFullscreen.innerHTML = '✕';
          btnFullscreen.title = 'Exit Fullscreen';
        } else {
          mapWrapper.classList.remove('map-fullscreen');
          btnFullscreen.innerHTML = '⛶';
          btnFullscreen.title = 'Full Screen View';
        }
        this.triggerMultiInvalidate();
      });
    }

    // Landmark Preset Chips
    document.querySelectorAll('.map-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const dest = e.currentTarget.getAttribute('data-dest');
        if (inputSearch && dest) {
          inputSearch.value = dest;
          this.calculateRoute(dest);
        }
      });
    });

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

    // Window resize handler
    window.addEventListener('resize', () => {
      if (this.map) {
        this.map.invalidateSize();
      }
    });
  }
};

window.addEventListener('DOMContentLoaded', () => {
  // Auto-init or refresh map when tab is selected
  const mapNavBtn = document.querySelector('[data-tab="tab-map"]');
  if (mapNavBtn) {
    mapNavBtn.addEventListener('click', () => {
      SafeMap.refreshMap();
    });
  }
});
