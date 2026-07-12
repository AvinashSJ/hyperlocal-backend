const BASE_URL = "https://api.olamaps.io";

type LatLng = { lat: number; lng: number };

type OlaDistanceMatrixRow = {
  elements: { distance: number; duration: number; status: string }[];
};

type OlaDistanceMatrixResponse = {
  status: string;
  rows: OlaDistanceMatrixRow[];
};

type OlaGeocodeResponse = {
  status: string;
  geocodingResults: { formatted_address: string; geometry: { location: LatLng } }[];
};

type OlaAutocompleteResponse = {
  status: string;
  predictions: { place_id: string; description: string }[];
};

export class OlaMaps {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.OLA_MAPS_API_KEY ?? "";
    if (!this.apiKey) {
      throw new Error(
        "OLA_MAPS_API_KEY is not configured. Set it in .env.local or pass it to the constructor.",
      );
    }
  }

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(path, BASE_URL);
    url.searchParams.set("api_key", this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OLA Maps API error (${res.status}): ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async geocode(address: string): Promise<LatLng> {
    const data = await this.request<OlaGeocodeResponse>("/places/v1/geocode", { address });
    if (!data.geocodingResults?.length) {
      throw new Error(`Geocode failed for "${address}"`);
    }
    const loc = data.geocodingResults[0].geometry.location;
    return { lat: loc.lat, lng: loc.lng };
  }

  async reverseGeocode(lat: number, lng: number): Promise<string> {
    const data = await this.request<OlaGeocodeResponse>("/places/v1/reverse-geocode", {
      latlng: `${lat},${lng}`,
    });
    if (!data.geocodingResults?.length) {
      throw new Error(`Reverse geocode failed for (${lat},${lng})`);
    }
    return data.geocodingResults[0].formatted_address;
  }

  async autocomplete(input: string): Promise<{ place_id: string; description: string }[]> {
    const data = await this.request<OlaAutocompleteResponse>("/places/v1/autocomplete", {
      input,
    });
    return data.predictions ?? [];
  }

  async distanceMatrix(
    origins: LatLng[],
    destinations: LatLng[],
  ): Promise<{ distances: (number | null)[][]; durations: (number | null)[][] }> {
    const originsStr = origins.map((p) => `${p.lat},${p.lng}`).join("|");
    const destinationsStr = destinations.map((p) => `${p.lat},${p.lng}`).join("|");
    const data = await this.request<OlaDistanceMatrixResponse>(
      "/routing/v1/distanceMatrix",
      { origins: originsStr, destinations: destinationsStr },
    );
    const distances: (number | null)[][] = [];
    const durations: (number | null)[][] = [];
    for (const row of data.rows ?? []) {
      const distRow: (number | null)[] = [];
      const durRow: (number | null)[] = [];
      for (const el of row.elements) {
        distRow.push(el.status?.toUpperCase() === "OK" ? el.distance : null);
        durRow.push(el.status?.toUpperCase() === "OK" ? el.duration : null);
      }
      distances.push(distRow);
      durations.push(durRow);
    }
    return { distances, durations };
  }
}
