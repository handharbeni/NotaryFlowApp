
import NextAuth from 'next-auth';
import type { NextAuthOptions, User as NextAuthUser } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { loginUser } from '@/actions/authActions'; 
import type { User } from '@/types'; 

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'anda@contoh.com' },
        password: { label: 'Kata Sandi', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          throw new Error('Email atau kata sandi tidak ada.');
        }

        const result = await loginUser({
          email: credentials.email,
          password: credentials.password,
        });

        if (result.success && result.user) {
          const userForNextAuth: NextAuthUser & { role: string; name?: string | null } = {
            id: String(result.user.id), 
            email: result.user.email,
            name: result.user.name,
            role: result.user.role,
          };
          return userForNextAuth;
        } else {
          throw new Error(result.error || 'Kredensial tidak valid.');
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const appUser = user as User & { role: string; name?: string | null; id: string};
        token.id = appUser.id;
        token.role = appUser.role;
        token.name = appUser.name;
        token.email = appUser.email;
      }
      return token;
    },
    async session({ session, token }) {
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
    signIn: '/', 
    error: '/', 
  },
  secret: process.env.NEXTAUTH_SECRET, 
};

const handler = NextAuth(authOptions); 

export { handler as GET, handler as POST };
