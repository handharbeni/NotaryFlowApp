
'use server';

import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import type { User } from '@/types';
import type { RowDataPacket } from 'mysql2';

interface LoginCredentials {
  email: string;
  password: string;
}

interface LoginResult {
  success: boolean;
  user?: Pick<User, 'id' | 'username' | 'email' | 'role' | 'name'>;
  error?: string;
}

export async function loginUser(credentials: LoginCredentials): Promise<LoginResult> {
  const { email, password } = credentials;

  if (!email || !password) {
    return { success: false, error: 'Email and password are required.' };
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, username, email, password as hashedPassword, role, name FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return { success: false, error: 'Invalid email or password.' };
    }

    const userRecord = rows[0];

    const isPasswordValid = await bcrypt.compare(password, userRecord.hashedPassword);

    if (!isPasswordValid) {
      return { success: false, error: 'Invalid email or password.' };
    }

    // Do not send password hash to client
    const userToReturn: Pick<User, 'id' | 'username' | 'email' | 'role' | 'name'> = {
      id: userRecord.id,
      username: userRecord.username,
      email: userRecord.email,
      role: userRecord.role,
      name: userRecord.name,
    };

    return { success: true, user: userToReturn };

  } catch (error: any) {
    console.error('Login error:', error);
    return { success: false, error: 'An internal server error occurred during login.' };
  }
}
