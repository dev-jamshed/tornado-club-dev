import { createCookieSessionStorage } from "@remix-run/node";

// Session storage setup
export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    secrets: ["my-secret-key"], 
    sameSite: "lax",
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;