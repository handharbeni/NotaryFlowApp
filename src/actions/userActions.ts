
'use server';

import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import type { User, UserRole } from '@/types';
import type { RowDataPacket, OkPacket } from 'mysql2';

// Exclude password and other sensitive fields if necessary for general fetching
export async function fetchUsers(): Promise<Pick<User, 'id' | 'username' | 'email' | 'role' | 'name' | 'createdAt'>[]> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, username, email, role, name, createdAt FROM users ORDER BY createdAt DESC'
    );
    return rows.map(row => ({
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role as UserRole,
      name: row.name,
      createdAt: new Date(row.createdAt),
    })) as Pick<User, 'id' | 'username' | 'email' | 'role' | 'name' | 'createdAt'>[];
  } catch (error: any) {
    console.error('Error fetching users:', error);
    throw new Error(`Failed to fetch users: ${error.message}`);
  }
}

export async function fetchUserById(id: string): Promise<Pick<User, 'id' | 'username' | 'email' | 'role' | 'name' | 'createdAt'> | null> {
  if (!id) return null;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, username, email, role, name, createdAt FROM users WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return null;
    }
    const user = rows[0];
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role as UserRole,
      name: user.name,
      createdAt: new Date(user.createdAt),
    };
  } catch (error: any) {
    console.error(`Error fetching user by ID (${id}):`, error);
    // In a real app, you might throw or return a more specific error object
    return null;
  }
}


export interface CreateUserResult {
  success: boolean;
  error?: string;
  userId?: string;
}

export interface CreateUserInput extends Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'role'> {
  password?: string; // Password is required for creation
  role: UserRole;
}


export async function createUser(data: CreateUserInput): Promise<CreateUserResult> {
  const { username, email, password, name, role = 'staff' } = data;

  if (!username || !email || !password) {
    return { success: false, error: 'Username, email, and password are required.' };
  }

  if (password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long.' };
  }

  const validRoles: UserRole[] = ['admin', 'cs', 'manager', 'staff', 'notary'];
  if (!validRoles.includes(role)) {
    return { success: false, error: 'Invalid user role provided.' };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingUsers] = await connection.query<RowDataPacket[]>(
      'SELECT id, username, email FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUsers.length > 0) {
      await connection.rollback();
      const existingUser = existingUsers[0];
      let conflictField = '';
      if (existingUser.username === username) conflictField = 'username';
      else if (existingUser.email === email) conflictField = 'email';
      return { success: false, error: `User with this ${conflictField} already exists.` };
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();

    await connection.execute(
      'INSERT INTO users (id, username, email, password, name, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [userId, username, email, hashedPassword, name || null, role]
    );
    
    await connection.commit();
    return { success: true, userId };

  } catch (error: any) {
    await connection.rollback();
    console.error('Error creating user:', error);
    if (error.code === 'ER_DUP_ENTRY') {
        return { success: false, error: 'A user with this username or email already exists.' };
    }
    return { success: false, error: `Failed to create user: ${error.message}` };
  } finally {
    connection.release();
  }
}

export interface UpdateUserInput {
  name?: string | null;
  username?: string;
  email?: string;
  password?: string | null; // Optional: only update if provided
  role?: UserRole;
}

export interface UpdateUserResult {
  success: boolean;
  error?: string;
}

export async function updateUser(userId: string, data: UpdateUserInput): Promise<UpdateUserResult> {
  const { name, username, email, password, role } = data;

  if (!userId) {
    return { success: false, error: 'User ID is required for update.' };
  }
  if (password && password.length > 0 && password.length < 6) {
    return { success: false, error: 'New password must be at least 6 characters long.' };
  }
  if (role) {
    const validRoles: UserRole[] = ['admin', 'cs', 'manager', 'staff', 'notary'];
    if (!validRoles.includes(role)) {
      return { success: false, error: 'Invalid user role provided for update.' };
    }
  }


  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Check for username/email conflicts with OTHER users
    if (username || email) {
      const params: string[] = [];
      let conflictQuery = 'SELECT id, username, email FROM users WHERE (';
      if (username) {
        conflictQuery += 'username = ?';
        params.push(username);
      }
      if (email) {
        if (username) conflictQuery += ' OR ';
        conflictQuery += 'email = ?';
        params.push(email);
      }
      conflictQuery += ') AND id != ?';
      params.push(userId);
      
      const [conflictingUsers] = await connection.query<RowDataPacket[]>(conflictQuery, params);

      if (conflictingUsers.length > 0) {
        await connection.rollback();
        const conflictingUser = conflictingUsers[0];
        let conflictField = '';
        if (username && conflictingUser.username === username) conflictField = 'username';
        else if (email && conflictingUser.email === email) conflictField = 'email';
        return { success: false, error: `Another user with this ${conflictField} already exists.` };
      }
    }

    const setClauses: string[] = [];
    const queryParams: (string | null | undefined)[] = [];

    if (name !== undefined) {
      setClauses.push('name = ?');
      queryParams.push(name);
    }
    if (username) {
      setClauses.push('username = ?');
      queryParams.push(username);
    }
    if (email) {
      setClauses.push('email = ?');
      queryParams.push(email);
    }
    if (password && password.length > 0) {
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      setClauses.push('password = ?');
      queryParams.push(hashedPassword);
    }
    if (role) {
      setClauses.push('role = ?');
      queryParams.push(role);
    }

    if (setClauses.length === 0) {
      await connection.rollback(); // Or commit if no changes is also a "success"
      return { success: true, error: 'No changes provided.' };
    }

    setClauses.push('updatedAt = NOW()');
    const updateQuery = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;
    queryParams.push(userId);

    const [result] = await connection.execute(updateQuery, queryParams);
    const okPacket = result as OkPacket;


    if (okPacket.affectedRows === 0) {
      await connection.rollback();
      return { success: false, error: 'User not found or no changes made.' };
    }

    await connection.commit();
    return { success: true };

  } catch (error: any) {
    await connection.rollback();
    console.error('Error updating user:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      // This might still happen due to race conditions if not handled by the above check,
      // or if the unique constraint is on a field not explicitly checked above.
      return { success: false, error: 'A user with this username or email already exists.' };
    }
    return { success: false, error: `Failed to update user: ${error.message}` };
  } finally {
    connection.release();
  }
}
