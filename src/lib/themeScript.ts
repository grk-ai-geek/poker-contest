// Shared by the server layout and the client theme store (so not a "use client" module).
export const THEME_STORAGE_KEY = "theme";

/**
 * Runs in <head> before the page paints, so a saved light theme never flashes dark.
 * Kept tiny and self-contained (it's inlined as a string).
 */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
