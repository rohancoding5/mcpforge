export type WeatherReport = {
  temp: number;
  condition: string;
};

export function getWeather(city: string, units?: "metric" | "imperial"): WeatherReport {
  return { temp: units === "imperial" ? 72 : 22, condition: `sunny in ${city}` };
}

export function add(a: number, b: number): number {
  return a + b;
}
