
export { default } from "next-auth/middleware"

// The middleware will protect routes matching this pattern
export const config = { 
  matcher: [
    "/dashboard/:path*",
    "/documents/:path*", // Keep documents/keyword-suggestion protected for now
    "/tasks/:path*",
    "/notifications/:path*",
    "/admin/:path*",
    "/settings/:path*", 
    "/reports/:path*",
    "/archive/:path*", 
    // Note: "/track-task" is intentionally NOT listed here to make it public.
    // Ensure specific sub-paths of /documents like /documents/keyword-suggestion are protected if needed.
    // If /documents/keyword-suggestion needs to be public, it should be excluded or handled differently.
    // For now, all of /documents/* will remain protected.
  ] 
}

    
