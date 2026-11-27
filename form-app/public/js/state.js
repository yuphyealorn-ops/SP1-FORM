// Shared app state, filled in by main.js after sign-in.
export const state = { user: null, today: null, lib: null, places: [], travel: [] };

export const gyms = () => state.places.filter((p) => p.kind === 'gym');
export const placeName = (id) => (state.places.find((p) => p.id === id) || {}).name || '';
export const exerciseName = (key) => (state.lib.exercises.find((e) => e.key === key) || {}).name || key;
