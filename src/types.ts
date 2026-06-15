export interface HotelFilters {
  price: string;
  rating: string;
  amenities: string[];
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
  maps?: {
    uri: string;
    title: string;
  };
}

export interface SearchResult {
  text: string;
  groundingChunks: GroundingChunk[];
}

export const COMMONLY_REQUESTED_AMENITIES = [
  "Free Wi-Fi",
  "Swimming Pool",
  "Fitness Center",
  "Free Breakfast",
  "Parking",
  "Pet Friendly",
  "Air Conditioning",
  "Restuarant / Bar",
  "Spa Services"
];

export const REASSURANCE_MESSAGES = [
  "Consulting local guides...",
  "Querying Google Maps grounding tool...",
  "Validating rates and accommodation details...",
  "Structuring active hotel offers and reviews...",
  "Sorting by proximity and highest customer satisfaction..."
];
