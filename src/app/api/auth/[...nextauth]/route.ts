
import NextAuth from 'next-auth';
import type { NextAuthOptions, User as NextAuthUser } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { loginUser } from '@/actions/authActions'; // Your existing login logic
import type { User } from '@/types'; // Your application's User type

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'you@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          throw new Error('Missing email or password.');
        }

        const result = await loginUser({
          email: credentials.email,
          password: credentials.password,
        });

        if (result.success && result.user) {
          // Map your user object to what NextAuth expects
          // Ensure `id` is a string as NextAuth's User type expects it.
          const userForNextAuth: NextAuthUser & { role: string; name?: string | null } = {
            id: String(result.user.id), // Ensure id is string
            email: result.user.email,
            name: result.user.name,
            role: result.user.role,
          };
          return userForNextAuth;
        } else {
          throw new Error(result.error || 'Invalid credentials.');
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      // When a user signs in (user object is present), add custom properties to the token
      if (user) {
        // Cast user to include your custom properties
        const appUser = user as User & { role: string; name?: string | null; id: string};
        token.id = appUser.id;
        token.role = appUser.role;
        token.name = appUser.name;
        token.email = appUser.email;
      }
      return token;
    },
    async session({ session, token }) {
      // Add custom properties from the token to the session object
      // Ensure session.user exists
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.name = token.name as string | null | undefined;
        session.user.email = token.email as string | null | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: '/', // Your login page path
    error: '/', // Redirect to login page on error
  },
  secret: process.env.NEXTAUTH_SECRET, // Make sure this is set in .env
};

const handler = NextAuth(authOptions); // Corrected line

export { handler as GET, handler as POST };
