// Unica fonte delle zone consentite per le posizioni simulate.
// Il server le usa per validare gli update e le invia al client con `location:config`.

export type Zone = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
};

export const RADIUS_M = 5000;

// Margine oltre il raggio, per non scartare un punto appena fuori per arrotondamenti.
export const TOLERANCE_M = 150;

export const ZONES: readonly Zone[] = [
  { id: "parma", name: "Parma", lat: 44.8015, lng: 10.3279, radiusM: RADIUS_M },
  { id: "reggio-emilia", name: "Reggio Emilia", lat: 44.6983, lng: 10.6312, radiusM: RADIUS_M },
  { id: "modena", name: "Modena", lat: 44.6471, lng: 10.9252, radiusM: RADIUS_M },
  { id: "bologna", name: "Bologna", lat: 44.4949, lng: 11.3426, radiusM: RADIUS_M },
  { id: "imola", name: "Imola", lat: 44.3532, lng: 11.7147, radiusM: RADIUS_M },
  { id: "forli", name: "Forlì", lat: 44.2227, lng: 12.0407, radiusM: RADIUS_M },
];
