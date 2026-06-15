import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MapPin,
  Search,
  SlidersHorizontal,
  Compass,
  Star,
  DollarSign,
  Heart,
  Loader2,
  ExternalLink,
  Navigation,
  Sparkles,
  Info,
  Calendar,
  AlertCircle,
  HelpCircle,
  BookmarkCheck,
  CheckCircle2,
  Activity
} from "lucide-react";
import Markdown from "react-markdown";
import {
  HotelFilters,
  Coordinates,
  GroundingChunk,
  SearchResult,
  COMMONLY_REQUESTED_AMENITIES,
  REASSURANCE_MESSAGES
} from "./types";

export default function App() {
  // Query & Location state
  const [searchQuery, setSearchQuery] = useState("");
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "requesting" | "success" | "error" | "manual">("idle");
  const [locationName, setLocationName] = useState("");
  const [isGPSEnabled, setIsGPSEnabled] = useState(false);

  // Filter conditions
  const [filters, setFilters] = useState<HotelFilters>({
    price: "any",
    rating: "any",
    amenities: [],
  });
  const [showFilters, setShowFilters] = useState(false);

  // Manual Coordinates override inputs (for testing/developer convenience)
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [showManualCoords, setShowManualCoords] = useState(false);

  // App UI & Search cycle states
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ai-guide" | "verified-maps">("ai-guide");

  // Bookmarked stays stored locally
  const [savedHotels, setSavedHotels] = useState<any[]>([]);

  // Carousel ref for typing feedback messages
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load bookmarked items from localStorage on initial render
  useEffect(() => {
    const saved = localStorage.getItem("local_hotel_bookmarks");
    if (saved) {
      try {
        setSavedHotels(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved hotels", e);
      }
    }
  }, []);

  // Sync reassuring load message rotation
  useEffect(() => {
    if (isLoading) {
      setLoadingMsgIndex(0);
      intervalRef.current = setInterval(() => {
        setLoadingMsgIndex((prev) => (prev + 1) % REASSURANCE_MESSAGES.length);
      }, 2500);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLoading]);

  // Handle GPS location query
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("error");
      setErrorMsg("Geolocation is not supported by your browser.");
      return;
    }

    setGeoStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newCoords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCoords(newCoords);
        setGeoStatus("success");
        setIsGPSEnabled(true);
        // Feed into manual input placeholders
        setManualLat(position.coords.latitude.toFixed(5));
        setManualLng(position.coords.longitude.toFixed(5));
        setErrorMsg(null);
      },
      (error) => {
        console.error("Geolocation error:", error);
        setGeoStatus("error");
        setIsGPSEnabled(false);
        if (error.code === error.PERMISSION_DENIED) {
          setErrorMsg("Location access was denied. If on an iframe, open the app in a new tab or use coordinates override below.");
        } else {
          setErrorMsg("Could not retrieve GPS coordinates. Feel free to search directly or key coordinates manually.");
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Toggle amenities filter checkboxes
  const handleToggleAmenity = (amenity: string) => {
    setFilters((prev) => {
      const isSelected = prev.amenities.includes(amenity);
      return {
        ...prev,
        amenities: isSelected
          ? prev.amenities.filter((a) => a !== amenity)
          : [...prev.amenities, amenity],
      };
    });
  };

  // Preset Searches
  const handleQuickPreset = (query: string, customLocation?: string, customFilters?: any) => {
    setSearchQuery(query);
    if (customLocation) {
      setLocationName(customLocation);
    }
    if (customFilters) {
      setFilters({ ...filters, ...customFilters });
    }
    triggerHotelSearch(query, customLocation);
  };

  // Trigger search handler
  const triggerHotelSearch = async (overrideQuery?: string, overrideLocationName?: string) => {
    const activeQuery = overrideQuery || searchQuery;
    const activeLocation = overrideLocationName !== undefined ? overrideLocationName : locationName;

    if (!activeQuery.trim()) {
      setErrorMsg("Please enter a destination, hotel type, or query first.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setResult(null);

    // Build the query parameter combining input and search logic
    let formattedQuery = activeQuery;
    if (activeLocation.trim()) {
      formattedQuery += ` in ${activeLocation}`;
    } else if (coords) {
      formattedQuery += ` near current user coordinates`;
    }

    try {
      const payload: any = {
        query: formattedQuery,
        filters: filters,
      };

      // Handle custom or detected latLng
      if (coords) {
        payload.latitude = coords.latitude;
        payload.longitude = coords.longitude;
      }

      const response = await fetch("/api/hotels/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to retrieve grounded hotel results.");
      }

      if (data.success) {
        setResult({
          text: data.text,
          groundingChunks: data.groundingChunks || [],
        });
      } else {
        throw new Error(data.error || "An unknown error returned from backend.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An error occurred. Check your API settings.");
    } finally {
      setIsLoading(false);
    }
  };

  // Apply coordinates override manually
  const handleApplyCoordinates = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) {
      setErrorMsg("Please key in valid numerical coordinates.");
      return;
    }
    setCoords({ latitude: lat, longitude: lng });
    setGeoStatus("manual");
    setErrorMsg(null);
  };

  // Bookmark toggler
  const handleToggleBookmark = (chunk: GroundingChunk) => {
    const isWeb = !!chunk.web;
    const title = chunk.web?.title || chunk.maps?.title || "Verfied Stay Option";
    const uri = chunk.web?.uri || chunk.maps?.uri || "#";

    const isExisting = savedHotels.some((item) => item.uri === uri);
    let updated;
    if (isExisting) {
      updated = savedHotels.filter((item) => item.uri !== uri);
    } else {
      updated = [
        ...savedHotels,
        {
          title,
          uri,
          isWeb,
          savedAt: new Date().toLocaleDateString(),
        },
      ];
    }
    setSavedHotels(updated);
    localStorage.setItem("local_hotel_bookmarks", JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Main Header navigation */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40 shadow-xs" id="app-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
              StayVault
              <span className="text-blue-600 text-[11px] uppercase tracking-wider font-extrabold bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full leading-none flex items-center gap-1">
                Local Hotel Finder
                <Sparkles className="h-3 w-3 text-blue-500 animate-pulse" />
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Display active Geolocation Info */}
            <div className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-all">
              <Activity className={`h-3 w-3 ${geoStatus === "success" || geoStatus === "manual" ? "text-emerald-500 animate-pulse" : "text-slate-400"}`} />
              {coords ? (
                <span>
                  Coords: {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
                </span>
              ) : (
                <span>No Location Set</span>
              )}
            </div>

            <button
              onClick={() => setShowManualCoords(!showManualCoords)}
              className="text-xs font-semibold text-slate-600 hover:text-blue-600 transition"
              id="btn-coordinates-toggle"
            >
              Coordinates Setup
            </button>
          </div>
        </div>
      </header>

      {/* Manual coordinates config block */}
      <AnimatePresence>
        {showManualCoords && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-slate-100 border-b border-slate-200 overflow-hidden"
            id="coordinates-sandbox"
          >
            <div className="max-w-3xl mx-auto px-4 py-3 text-xs text-slate-650">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Navigation className="h-3.5 w-3.5 text-blue-600" />
                    Coordinate Context Overrides
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Configure coordinates to let Gemini restrict maps results by specific localities.
                  </p>
                </div>
                <form onSubmit={handleApplyCoordinates} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={manualLat}
                    onChange={(e) => setManualLat(e.target.value)}
                    placeholder="Latitude (e.g. 37.78)"
                    className="bg-white border border-slate-300 rounded px-2.5 py-1 text-[11px] w-28 focus:outline-none focus:ring-2 focus:ring-blue-150 focus:border-blue-600"
                    id="input-manual-lat"
                  />
                  <input
                    type="text"
                    value={manualLng}
                    onChange={(e) => setManualLng(e.target.value)}
                    placeholder="Longitude (e.g. -122.4)"
                    className="bg-white border border-slate-300 rounded px-2.5 py-1 text-[11px] w-28 focus:outline-none focus:ring-2 focus:ring-blue-150 focus:border-blue-600"
                    id="input-manual-lng"
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg px-3 py-1 text-[11px] transition-all cursor-pointer shadow-xs"
                    id="btn-manual-coordinates-submit"
                  >
                    Apply Coordinates
                  </button>
                  {coords && (
                    <button
                      type="button"
                      onClick={() => {
                        setCoords(null);
                        setGeoStatus("idle");
                        setManualLat("");
                        setManualLng("");
                      }}
                      className="bg-slate-300 hover:bg-slate-400 text-slate-700 font-semibold rounded px-2.5 py-1 text-[11px] cursor-pointer"
                      id="btn-coordinates-clear"
                    >
                      Clear
                    </button>
                  )}
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5" id="main-content">
        {/* Dynamic Warning Alert */}
        {errorMsg && (
          <div
            className="mb-4 bg-red-50 border-l-4 border-red-500 p-3.5 rounded-r-lg flex items-start gap-2.5 text-xs text-red-800"
            id="error-banner"
          >
            <AlertCircle className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Attention needed:</span> {errorMsg}
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-red-400 hover:text-red-600 font-semibold text-xs ml-auto"
            >
              Close
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT COLUMN: Search settings & Form parameters */}
          <div className="lg:col-span-4 space-y-5">
            {/* Target panel for controls */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm" id="control-panel">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-5 flex items-center justify-between">
                <span>Find Stays Nearby</span>
                <Compass className="h-4 w-4 text-blue-600" />
              </h2>

              <div className="space-y-4">
                {/* Geolocation Button Hub */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Location Grounding
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={handleDetectLocation}
                      disabled={geoStatus === "requesting"}
                      className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer ${
                        geoStatus === "success"
                          ? "bg-blue-50 border-blue-200 text-blue-755 hover:bg-blue-100"
                          : geoStatus === "requesting"
                          ? "bg-slate-50 border-slate-200 text-slate-400"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs"
                      }`}
                      id="btn-detect-gps"
                    >
                      {geoStatus === "requesting" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                          <span>Detecting Location...</span>
                        </>
                      ) : geoStatus === "success" ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                          <span>GPS Location Active</span>
                        </>
                      ) : (
                        <>
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          <span>Use My Location (GPS)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* City Lookup Input */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Target City or Landmark (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      placeholder="e.g. San Francisco, CA"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-8 py-2.5 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-150 focus:border-blue-600 transition-all text-slate-800 font-semibold"
                      id="input-city-landmark"
                    />
                    {locationName && (
                      <button
                        onClick={() => setLocationName("")}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-655 text-xs font-bold"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {/* Core Search input */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    What stay are you looking for?
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") triggerHotelSearch();
                      }}
                      placeholder="e.g. Boutique hotels with rooftop pool"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-10 py-3 text-xs font-extrabold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-150 focus:border-blue-600 transition-all text-slate-800 placeholder:font-medium"
                      id="input-hotel-search-query"
                    />
                    <button
                      onClick={() => triggerHotelSearch()}
                      className="absolute right-3 top-3 text-slate-400 hover:text-blue-600 transition cursor-pointer"
                      id="btn-trigger-search"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Filters Collapse Head */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="w-full text-slate-600 hover:text-slate-800 flex items-center justify-between text-xs font-bold py-2"
                    id="btn-filters-toggle"
                  >
                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10.5px]">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600" />
                      Configure Filters & Amenities
                      {(filters.price !== "any" || filters.rating !== "any" || filters.amenities.length > 0) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
                      )}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {showFilters ? "Collapse" : "Expand"}
                    </span>
                  </button>

                  <AnimatePresence>
                    {showFilters && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden pt-3 space-y-4"
                        id="filters-drawer"
                      >
                        {/* Price tier selection */}
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            Price Segment
                          </span>
                          <div className="grid grid-cols-4 gap-1.5">
                            {["any", "$", "$$", "$$$"].map((p) => (
                              <button
                                key={p}
                                onClick={() => setFilters({ ...filters, price: p })}
                                className={`py-2 px-2 rounded-xl font-mono text-[11px] font-extrabold border transition cursor-pointer ${
                                  filters.price === p
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                                }`}
                              >
                                {p === "any" ? "Any" : p}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Rating threshold selection */}
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            Minimum Guest Rating
                          </span>
                          <div className="grid grid-cols-4 gap-1.5">
                            {["any", "3.5", "4.0", "4.5"].map((r) => (
                              <button
                                key={r}
                                onClick={() => setFilters({ ...filters, rating: r })}
                                className={`py-2 px-1 rounded-xl text-[11px] font-bold border transition flex items-center justify-center gap-0.5 cursor-pointer ${
                                  filters.rating === r
                                    ? "bg-blue-50 text-blue-755 border-blue-100"
                                    : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
                                }`}
                              >
                                {r === "any" ? (
                                  "Any"
                                ) : (
                                  <>
                                    <span>{r}</span>
                                    <Star className="h-2.5 w-2.5 fill-current" />
                                  </>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Amenities checklist selection */}
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            Amenities Preferences
                          </span>
                          <div className="grid grid-cols-1 gap-2 text-[11px]">
                            {COMMONLY_REQUESTED_AMENITIES.map((item) => {
                              const selected = filters.amenities.includes(item);
                              return (
                                <button
                                  key={item}
                                  onClick={() => handleToggleAmenity(item)}
                                  className={`py-2 px-3 rounded-xl flex items-center justify-between transition text-left border cursor-pointer text-xs font-semibold ${
                                    selected
                                      ? "bg-blue-50 text-blue-755 border-blue-100 font-bold"
                                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                  }`}
                                >
                                  <span className="truncate">{item}</span>
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    readOnly
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer"
                                  />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Primary search submit */}
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => triggerHotelSearch()}
                  className="w-full bg-slate-900 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-slate-800 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer shadow-sm"
                  id="btn-search-hotels"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Scanning Grounds...</span>
                    </>
                  ) : (
                    <>
                      <Compass className="h-4 w-4 animate-spin-slow" />
                      <span>Check Availability</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Presets Panel */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                Inspire Your Search
              </span>
              <div className="grid grid-cols-1 gap-2.5">
                <button
                  onClick={() => handleQuickPreset("Boutique historic hotels", "Downtown Seattle", { price: "$$", rating: "4.0", amenities: ["Free Wi-Fi"] })}
                  className="text-left text-xs p-3 rounded-xl hover:bg-slate-50 border border-slate-100 flex items-center justify-between group transition cursor-pointer"
                >
                  <div>
                    <p className="font-bold text-slate-800 group-hover:text-blue-600 transition">Historic Boutique stay</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Seattle • $$ • 4.0+ Star</p>
                  </div>
                  <HelpCircle className="h-4 w-4 text-slate-300 group-hover:text-blue-400" />
                </button>

                <button
                  onClick={() => handleQuickPreset("Beachfront ocean view resort", "Miami, FL", { price: "$$$", rating: "4.5", amenities: ["Swimming Pool", "Spa Services"] })}
                  className="text-left text-xs p-3 rounded-xl hover:bg-slate-50 border border-slate-100 flex items-center justify-between group transition cursor-pointer"
                >
                  <div>
                    <p className="font-bold text-slate-800 group-hover:text-blue-600 transition">Oceanfront Spa Resort</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Miami • $$$ • 4.5+ Star • Pool / Spa</p>
                  </div>
                  <HelpCircle className="h-4 w-4 text-slate-300 group-hover:text-blue-400" />
                </button>

                <button
                  onClick={() => handleQuickPreset("Cozy cabins with fireplaces", "Lake Tahoe", { price: "any", rating: "any", amenities: ["Parking", "Pet Friendly"] })}
                  className="text-left text-xs p-3 rounded-xl hover:bg-slate-50 border border-slate-100 flex items-center justify-between group transition cursor-pointer"
                >
                  <div>
                    <p className="font-bold text-slate-800 group-hover:text-blue-600 transition">Lake Tahoe Rustic Cabins</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Tahoe • Pet Friendly • Fireplace</p>
                  </div>
                  <HelpCircle className="h-4 w-4 text-slate-300 group-hover:text-blue-400" />
                </button>
              </div>
            </div>

            {/* Bookmarks Collection / Sidebar Drawer */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm" id="saved-stays-box">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between">
                <span>Bookmarked stays ({savedHotels.length})</span>
                <BookmarkCheck className="h-4 w-4 text-blue-600" />
              </span>

              {savedHotels.length === 0 ? (
                <div className="text-center py-6 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  <Heart className="h-6 w-6 mx-auto mb-1.5 opacity-50 text-slate-300" />
                  <p className="text-[10px]">No bookmarked hotels yet</p>
                  <p className="text-[9px] text-slate-400 px-4 mt-0.5">Click the heart icon on search outputs to save listings locally.</p>
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {savedHotels.map((hotel, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 border border-slate-200 rounded-xl flex items-start gap-2 text-[11px] hover:border-blue-200 transition bg-slate-50/65"
                    >
                      <MapPin className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 truncate" title={hotel.title}>{hotel.title}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">Saved stays • {hotel.savedAt}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={hotel.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 hover:bg-slate-200 rounded text-blue-600"
                          title="Open on Google Maps"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <button
                          onClick={() => {
                            const updated = savedHotels.filter((h) => h.uri !== hotel.uri);
                            setSavedHotels(updated);
                            localStorage.setItem("local_hotel_bookmarks", JSON.stringify(updated));
                          }}
                          className="p-1 hover:bg-red-50 text-red-500 rounded font-bold"
                          title="Remove bookmark"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Search results & detail maps rendering */}
          <div className="lg:col-span-8 flex flex-col gap-5">
            {/* Loading screen carousel wrapper */}
            {isLoading && (
              <div
                className="bg-white border border-slate-200 rounded-2xl p-10 py-16 text-center shadow-sm flex flex-col items-center justify-center min-h-[400px]"
                id="loading-stage"
              >
                <div className="relative mb-6">
                  <div className="absolute inset-0 rounded-full bg-blue-100 blur-xl animate-pulse"></div>
                  <Loader2 className="h-12 w-12 text-blue-600 animate-spin relative z-10" />
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={loadingMsgIndex}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -8, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="max-w-md mx-auto"
                  >
                    <h3 className="text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-widest text-blue-600">
                      Processing Grounded Search
                    </h3>
                    <p className="text-xs text-slate-500 font-bold h-8">
                      {REASSURANCE_MESSAGES[loadingMsgIndex]}
                    </p>
                  </motion.div>
                </AnimatePresence>

                <div className="w-48 bg-slate-100 h-1.5 rounded-full overflow-hidden mt-3">
                  <div className="bg-blue-600 h-full w-2/3 rounded-full animate-infinite"></div>
                </div>
              </div>
            )}

            {/* Dashboard Default screen before any query has run */}
            {!isLoading && !result && (
              <div
                className="bg-white border border-slate-200 rounded-2xl p-8 py-20 text-center shadow-sm min-h-[400px] flex flex-col justify-center items-center"
                id="dashboard-placeholder"
              >
                <div className="h-14 w-14 bg-blue-50 border border-blue-105 text-blue-600 flex items-center justify-center rounded-2xl mb-4 shadow-3xs animate-bounce-slow">
                  <Compass className="h-7 w-7" />
                </div>
                <h3 className="text-base font-bold text-slate-800 mb-1.5">
                  Your Next Adventure Starts Here
                </h3>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed mb-6">
                  Key in a landmark, hotel type, or specific preferences to search. We'll leverage Gemini AI with Google Maps grounding to return highly accurate local suggestions and direct links.
                </p>

                {/* Info block detailing benefits */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-2xl mt-4">
                  <div className="p-3 border border-slate-200 rounded-xl bg-white shadow-3xs">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto mb-1.5" />
                    <span className="block text-[11px] font-bold text-slate-700">Google Maps Grounded</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Real listings validated via search tools.</p>
                  </div>
                  <div className="p-3 border border-slate-200 rounded-xl bg-white shadow-3xs">
                    <Navigation className="h-4 w-4 text-blue-500 mx-auto mb-1.5" />
                    <span className="block text-[11px] font-bold text-slate-700">Proximity Oriented</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Filter by precise context coordinates.</p>
                  </div>
                  <div className="p-3 border border-slate-200 rounded-xl bg-white shadow-3xs">
                    <Sparkles className="h-4 w-4 text-blue-600 mx-auto mb-1.5" />
                    <span className="block text-[11px] font-bold text-slate-700">Detailed AI Analysis</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Summaries, amenities, and reasons to buy.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Active search results display */}
            {!isLoading && result && (
              <div className="space-y-5" id="hotel-response-viewer">
                {/* Result header navigation tabs (useful for responsive screens) */}
                <div className="bg-white border border-slate-200 rounded-xl p-1.5 flex items-center gap-1.5 shadow-sm">
                  <button
                    onClick={() => setActiveTab("ai-guide")}
                    className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeTab === "ai-guide"
                        ? "bg-slate-100 text-blue-700 shadow-2xs"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Info className="h-3.5 w-3.5" />
                    <span>AI Guided Selection</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("verified-maps")}
                    className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeTab === "verified-maps"
                        ? "bg-slate-100 text-blue-700 shadow-2xs"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <MapPin className="h-3.5 w-3.5 text-blue-600" />
                    <span>Verified Locations ({result.groundingChunks.length})</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* TAB 1 CONTENT / LEFT PANEL: AI Detailed Markdown guide */}
                  <div className={`${activeTab === "ai-guide" ? "block" : "hidden md:block"} md:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm`}>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                        Hotel Breakdown
                      </h3>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">
                        Gemini-3.5-Grounded
                      </span>
                    </div>

                    {/* Rendered markdown output */}
                    <div className="markdown-body text-xs leading-relaxed break-words max-h-[600px] overflow-y-auto pr-2">
                      <Markdown>{result.text}</Markdown>
                    </div>
                  </div>

                  {/* TAB 2 CONTENT / RIGHT PANEL: Verified Maps addresses and links from Grounding */}
                  <div className={`${activeTab === "verified-maps" ? "block" : "hidden md:block"} md:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm`}>
                    <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-red-500 animate-pulse" />
                        Grounded Map Resources
                      </h3>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">
                        {result.groundingChunks.length} results
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                      Below are direct references and place resource links fetched directly from active locations on Google Maps during AI grounding.
                    </p>

                    {result.groundingChunks.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 border border-dashed border-slate-100 rounded-lg">
                        <Info className="h-6 w-6 text-slate-300 mx-auto mb-1.5" />
                        <p className="text-xs font-medium">No verified map links returned.</p>
                        <p className="text-[10px] text-slate-400 px-4 mt-0.5">
                          Try searching for specific hotels or adding city details.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3.5 max-h-[600px] overflow-y-auto pr-1">
                        {result.groundingChunks.map((chunk, index) => {
                          // Standardize title and uri depending on web or map grounding metadata
                          const title = chunk.web?.title || chunk.maps?.title || `Stay Option #${index + 1}`;
                          const rawUri = chunk.web?.uri || chunk.maps?.uri || "";
                          // Trim or display simplified domain name
                          let domainName = "Google Maps";
                          if (chunk.web?.uri) {
                            try {
                              const parsed = new URL(chunk.web.uri);
                              domainName = parsed.hostname.replace("www.", "");
                            } catch (e) {
                              domainName = "Web Link";
                            }
                          }

                          const isBookmarked = savedHotels.some((item) => item.uri === rawUri);

                          return (
                            <div
                              key={index}
                              className="p-3.5 border border-slate-200 rounded-2xl bg-slate-50 hover:bg-white hover:border-blue-300 hover:shadow-xs transition-all duration-200 relative flex flex-col justify-between"
                            >
                              <div className="flex items-start gap-2 text-xs">
                                <div className="h-6 w-6 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-500 shrink-0">
                                  <MapPin className="h-3.5 w-3.5 fill-current" />
                                </div>
                                <div className="flex-1 min-w-0 pr-6">
                                  <h4 className="font-bold text-slate-800 tracking-tight leading-snug break-words">
                                    {title}
                                  </h4>
                                  <span className="inline-block text-[9px] text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-md mt-1 font-bold uppercase tracking-wider">
                                    {domainName}
                                  </span>
                                </div>

                                {/* Bookmark toggle icon heart */}
                                <button
                                  onClick={() => handleToggleBookmark(chunk)}
                                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-red-500 transition p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
                                  title={isBookmarked ? "Remove from bookmarks" : "Save location"}
                                >
                                  <Heart className={`h-4 w-4 ${isBookmarked ? "fill-red-500 text-red-500 animate-pulse" : ""}`} />
                                </button>
                              </div>

                              {/* Action Footer */}
                              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                <span className="text-slate-400 font-mono text-[9px]">Chunk #{index + 1}</span>
                                {rawUri ? (
                                  <a
                                    href={rawUri}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-650 font-bold inline-flex items-center gap-1 hover:text-blue-800 hover:underline"
                                  >
                                    <span>Open Official Link</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <span className="text-slate-300">Verified Listing Reference</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12 py-8 text-slate-405 text-xs text-center" id="app-footer-brand">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-medium">© 2026 StayVault • Powered by Gemini AI Grounding Search</p>
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/60 rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500 font-bold tracking-tight">StayVault Real-time Sync Active</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
