// src/services/jobNumberService.ts
'use server';

import type { PoolConnection } from 'mysql2/promise';
import { format as formatDateFns } from 'date-fns';
import type { RowDataPacket } from 'mysql2';

const SEQUENCE_PADDING = 4; // e.g., 0001, 0012, 0123, 1234

/**
 * Generates a new job number based on a pattern and the highest existing sequence.
 * @param pattern The job number pattern (e.g., "NA/{{YYYY}}/{{MM}}/{{SEQ}}").
 * @param connection An active MySQL PoolConnection for database queries.
 * @returns A promise that resolves to the newly generated job number string.
 * @throws Error if the pattern does not include "{{SEQ}}".
 */
export async function generateNewJobNumber(
  pattern: string,
  connection: PoolConnection
): Promise<string> {
  if (!pattern.includes('{{SEQ}}')) {
    throw new Error("Job number pattern must include the {{SEQ}} placeholder.");
  }

  const now = new Date();
  let processedPattern = pattern; // This is the pattern with date placeholders resolved, still contains {{SEQ}}

  // Replace date placeholders
  processedPattern = processedPattern.replace(/{{YYYY}}/g, formatDateFns(now, 'yyyy'));
  processedPattern = processedPattern.replace(/{{YY}}/g, formatDateFns(now, 'yy'));
  processedPattern = processedPattern.replace(/{{MM}}/g, formatDateFns(now, 'MM'));
  processedPattern = processedPattern.replace(/{{DD}}/g, formatDateFns(now, 'dd'));

  const seqPlaceholder = '{{SEQ}}';
  const seqIndex = processedPattern.indexOf(seqPlaceholder);

  // These are the prefix and suffix with date placeholders ALREADY resolved
  const currentPrefix = processedPattern.substring(0, seqIndex);
  const currentSuffix = processedPattern.substring(seqIndex + seqPlaceholder.length);

  // Query to find existing job numbers matching the current prefix and suffix.
  // This scopes the sequence number to the context (e.g., current month/year if specified in prefix).
  const sqlQuery = `
    SELECT job_number
    FROM tasks
    WHERE job_number LIKE ? 
      AND job_number LIKE ?
      AND job_number IS NOT NULL
  `;
  
  // mysql2 prepared statements will handle escaping for LIKE values
  const queryParams = [`${currentPrefix}%`, `%${currentSuffix}`];
  
  const [rows] = await connection.execute(sqlQuery, queryParams) as [RowDataPacket[], any];

  let maxSeq = 0;
  if (rows.length > 0) {
    for (const row of rows) {
      const jobNumber = row.job_number as string;
      
      // Ensure the job number actually starts with the prefix and ends with the suffix
      // and is long enough to contain a sequence.
      if (jobNumber.startsWith(currentPrefix) && 
          jobNumber.endsWith(currentSuffix) && 
          jobNumber.length >= currentPrefix.length + currentSuffix.length) {
        
        const seqStr = jobNumber.substring(
            currentPrefix.length,
            jobNumber.length - currentSuffix.length
        );

        // Check if the extracted sequence string is purely numeric and not empty
        if (seqStr.length > 0 && /^\d+$/.test(seqStr)) {
            const seqNum = parseInt(seqStr, 10);
            if (!isNaN(seqNum) && seqNum > maxSeq) {
              maxSeq = seqNum;
            }
        }
      }
    }
  }

  const nextSeq = maxSeq + 1;
  const paddedNextSeq = String(nextSeq).padStart(SEQUENCE_PADDING, '0');

  return `${currentPrefix}${paddedNextSeq}${currentSuffix}`;
}
