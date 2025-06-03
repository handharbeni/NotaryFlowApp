import type { DefaultSession, DefaultUser } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

// Extend the built-in session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      name?: string | null;
      email?: string | null;
    } & DefaultSession['user'];
     error?: string; // For custom error handling if needed
  }

  interface User extends DefaultUser {
    id: string;
    role: string;
    name?: string | null;
  }
}

// Extend the built-in JWT types
declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    name?: string | null;
    email?: string | null;
  }
}