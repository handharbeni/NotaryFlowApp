
export { default } from "next-auth/middleware"

// The middleware will protect routes matching this pattern
export const config = { 
  matcher: [
    "/dashboard/:path*",
    "/documents/:path*",
    "/tasks/:path*",
    "/notifications/:path*",
    "/admin/:path*", // Add admin routes to protected paths
    // Add any other routes you want to protect here
  ] 
}
