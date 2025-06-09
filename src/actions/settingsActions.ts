
'use server';

import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import type { RowDataPacket, OkPacket } from 'mysql2';
import type { User } from '@/types';

export interface UpdatePasswordResult {
  success: boolean;
  error?: string;
}

export async function updateUserPassword(currentPassword: string, newPassword: string): Promise<UpdatePasswordResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, error: 'Pengguna tidak diautentikasi.' };
  }
  const userId = session.user.id;

  if (!currentPassword || !newPassword) {
    return { success: false, error: 'Kata sandi saat ini dan kata sandi baru diperlukan.' };
  }
  if (newPassword.length < 6) {
    return { success: false, error: 'Kata sandi baru harus minimal 6 karakter.' };
  }
  if (currentPassword === newPassword) {
    return { success: false, error: 'Kata sandi baru tidak boleh sama dengan kata sandi saat ini.' };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT password as hashedPassword FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return { success: false, error: 'Pengguna tidak ditemukan.' };
    }

    const userRecord = rows[0];
    const isPasswordValid = await bcrypt.compare(currentPassword, userRecord.hashedPassword);

    if (!isPasswordValid) {
      await connection.rollback();
      return { success: false, error: 'Kata sandi saat ini salah.' };
    }

    const saltRounds = 10;
    const newHashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const [updateResult] = await connection.execute(
      'UPDATE users SET password = ?, updatedAt = NOW() WHERE id = ?',
      [newHashedPassword, userId]
    );
    const okPacket = updateResult as OkPacket;

    if (okPacket.affectedRows === 0) {
      await connection.rollback();
      return { success: false, error: 'Gagal memperbarui kata sandi. Tidak ada baris yang terpengaruh.' };
    }
    
    await connection.commit();
    return { success: true };

  } catch (error: any) {
    await connection.rollback();
    console.error('Error updating password:', error);
    return { success: false, error: `Terjadi kesalahan server: ${error.message}` };
  } finally {
    connection.release();
  }
}


export async function getJobNumberPattern(): Promise<string | null> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'job_number_pattern'"
    );
    if (rows.length > 0) {
      return rows[0].setting_value as string;
    }
    return null; // Or a default pattern if preferred
  } catch (error: any) {
    console.error('Error fetching job number pattern:', error);
    return null;
  }
}

export async function updateJobNumberPattern(pattern: string): Promise<{ success: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return { success: false, error: 'Akses ditolak. Hanya admin yang dapat mengubah pengaturan ini.' };
  }

  if (typeof pattern !== 'string') {
    return { success: false, error: 'Pola nomor pekerjaan tidak valid.' };
  }

  try {
    await pool.execute(
      "INSERT INTO system_settings (setting_key, setting_value) VALUES ('job_number_pattern', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)",
      [pattern]
    );
    return { success: true };
  } catch (error: any) {
    console.error('Error updating job number pattern:', error);
    return { success: false, error: `Gagal memperbarui pola nomor pekerjaan: ${error.message}` };
  }
}

    