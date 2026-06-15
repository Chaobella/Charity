import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialize client to prevent server crash if key is missing on start
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
      throw new Error("GEMINI_API_KEY environment variable is not configured. Please supply an API key in the Settings > Secrets panel of the AI Studio UI to search hotels.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// API endpoint for hotel searches
app.post("/api/hotels/search", async (req, res) => {
  try {
    const { query, latitude, longitude, filters } = req.body;

    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "Search query is required." });
      return;
    }

    // Build standard, constructive search prompt 
    let prompt = `Find accommodations or hotels for: "${query}".`;
    
    if (filters) {
      const parts: string[] = [];
      if (filters.price && filters.price !== "any") parts.push(`Price range: ${filters.price}`);
      if (filters.rating && filters.rating !== "any") parts.push(`Minimum rating: ${filters.rating}`);
      if (filters.amenities && Array.isArray(filters.amenities) && filters.amenities.length > 0) {
        parts.push(`Amenities: ${filters.amenities.join(", ")}`);
      }
      if (parts.length > 0) {
        prompt += ` Filter matching these specific criteria: ${parts.join("; ")}.`;
      }
    }

    prompt += ` Provide a list of local hotels with brief descriptions, estimated pricing, ratings, location details, and standout amenities. Use clear, modern markdown with typography enhancements (bold names, structured bullet lists). Do not output XML tags.`;

    const config: any = {
      tools: [{ googleMaps: {} }],
    };

    // If user provided latitude and longitude, pass them in retrievalConfig for localized results
    if (latitude !== undefined && longitude !== undefined && latitude !== "" && longitude !== "") {
      const latNum = Number(latitude);
      const lngNum = Number(longitude);
      if (!isNaN(latNum) && !isNaN(lngNum)) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: latNum,
              longitude: lngNum,
            },
          },
        };
      }
    }

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config,
    });

    // Retrieve grounding chunks from the response structure to display verified links
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    res.json({
      success: true,
      text: response.text,
      groundingChunks: groundingChunks,
    });
  } catch (error: any) {
    console.error("Hotel search API failed:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred during hotel retrieval.",
    });
  }
});

// Setup Vite Dev Server / Static production files
async function initializeApp() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

initializeApp().catch((err) => {
  console.error("Failed to start server:", err);
});
