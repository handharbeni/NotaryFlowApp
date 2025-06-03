
'use server';

/**
 * @fileOverview Standalone script to migrate database schemas.
 * Creates 'documents', 'tasks', 'task_documents', 'notifications', and 'users' tables.
 * Defines user roles: admin, cs, manager, staff, notary.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const dbConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT, 10) : 3306,
};

const createDocumentsTableSQL = `
CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'Draft',
  dateUploaded DATETIME DEFAULT CURRENT_TIMESTAMP,
  lastModified DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  fileSize VARCHAR(50),
  version INT DEFAULT 1,
  tags JSON,
  contentPreview TEXT,
  userId VARCHAR(255) COMMENT 'Identifier for the user who owns/uploaded this document',
  ownCloudPath VARCHAR(1023) COMMENT 'Path or ID of the file in OwnCloud'
);
`;

// Removed UNIQUE constraint from primary_document_id
const createTasksTableSQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'To Do',
  dueDate DATETIME,
  assignedTo VARCHAR(255) COMMENT 'FK to users table, stores user ID',
  priority VARCHAR(50) DEFAULT 'Medium',
  parentId VARCHAR(36),
  primary_document_id VARCHAR(36) NULL COMMENT 'FK to documents table for the primary document',
  userId VARCHAR(255) COMMENT 'Identifier for the user this task belongs to or is assigned by',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parentId) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (primary_document_id) REFERENCES documents(id) ON DELETE SET NULL,
  FOREIGN KEY (assignedTo) REFERENCES users(id) ON DELETE SET NULL
);
`;

// Removed uq_supporting_document_id constraint
const createTaskDocumentsJunctionTableSQL = `
CREATE TABLE IF NOT EXISTS task_documents (
  task_id VARCHAR(36) NOT NULL,
  document_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (task_id, document_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
`;

const createNotificationsTableSQL = `
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) PRIMARY KEY,
  userId VARCHAR(255) NULL COMMENT 'For user-specific notifications in the future',
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  date DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`read\` BOOLEAN DEFAULT FALSE COMMENT '\`read\` is a keyword, so it is escaped',
  priority VARCHAR(50) DEFAULT 'medium',
  relatedTaskId VARCHAR(36) NULL,
  relatedDocumentId VARCHAR(36) NULL,
  FOREIGN KEY (relatedTaskId) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (relatedDocumentId) REFERENCES documents(id) ON DELETE SET NULL
);
`;

const createUsersTableSQL = `
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL COMMENT 'Stored as a bcrypt hash',
  name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'staff' COMMENT 'Roles: admin, cs, manager, staff, notary',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
`;


async function columnExists(connection: mysql.Connection, tableName: string, columnName: string): Promise<boolean> {
  const [rows]: [any[], any] = await connection.execute(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbConfig.database, tableName, columnName]
  );
  return rows[0].count > 0;
}

async function constraintExists(connection: mysql.Connection, tableName: string, constraintName: string, constraintType: 'FOREIGN KEY' | 'UNIQUE' | 'PRIMARY KEY'): Promise<boolean> {
  const [rows]: [any[], any] = await connection.execute(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = ?`,
    [dbConfig.database, tableName, constraintName, constraintType]
  );
  return rows[0].count > 0;
}

async function dropConstraintIfExists(connection: mysql.Connection, tableName: string, constraintName: string) {
    // For unique constraints, the constraint_name is often the same as the column name or an auto-generated name.
    // For FKs, it's explicitly named or auto-generated.
    // This check is simplified; a more robust check would query INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    try {
        const [constraints]: [any[], any] = await connection.execute(
            `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
            [dbConfig.database, tableName, constraintName]
        );
        if (constraints.length > 0) {
            // Check if it's a FOREIGN KEY or UNIQUE constraint to decide ALTER TABLE DROP FOREIGN KEY or DROP INDEX
            const [constraintDetails]: [any[], any] = await connection.execute(
                `SELECT CONSTRAINT_TYPE FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
                [dbConfig.database, tableName, constraintName]
            );
            if (constraintDetails.length > 0) {
                if (constraintDetails[0].CONSTRAINT_TYPE === 'FOREIGN KEY') {
                    console.log(`Dropping foreign key constraint ${constraintName} from table ${tableName}...`);
                    await connection.execute(`ALTER TABLE ${tableName} DROP FOREIGN KEY ${constraintName}`);
                    console.log(`Foreign key constraint ${constraintName} dropped.`);
                } else if (constraintDetails[0].CONSTRAINT_TYPE === 'UNIQUE') {
                    console.log(`Dropping unique constraint ${constraintName} from table ${tableName}...`);
                    await connection.execute(`ALTER TABLE ${tableName} DROP INDEX ${constraintName}`);
                    console.log(`Unique constraint ${constraintName} dropped.`);
                }
            }
        }
    } catch (err: any) {
        // If constraint doesn't exist, MySQL might throw an error. We can ignore specific error codes (like 1091 for 'Can't DROP...; check that column/key exists')
        if (err.errno === 1091) {
            console.log(`Constraint ${constraintName} not found on table ${tableName}, or already dropped.`);
        } else {
            console.warn(`Warning trying to drop constraint ${constraintName} from ${tableName}: ${err.message}`);
        }
    }
}


async function runMigrations() {
  let connection: mysql.Connection | undefined;
  try {
    if (!dbConfig.host || !dbConfig.user || !dbConfig.database) {
      console.error('Database configuration is incomplete. Please check your .env file.');
      process.exit(1);
    }

    connection = await mysql.createConnection(dbConfig);
    console.log('Successfully connected to MySQL database for migration.');

    console.log('Ensuring "users" table exists (must exist before tasks table due to FK)...');
    await connection.execute(createUsersTableSQL);
    console.log('"users" table processed.');

    console.log('Ensuring "documents" table exists...');
    await connection.execute(createDocumentsTableSQL);
    console.log('"documents" table processed.');

    // Drop old unique constraint on tasks.primary_document_id if it exists
    await dropConstraintIfExists(connection, 'tasks', 'uq_primary_document_id');
    // Add new FK constraint for tasks.assignedTo
    // Before altering 'tasks', ensure 'users' table is fully processed.
    // We might need to add assignedTo as a new column if it doesn't exist
    if (!await columnExists(connection, 'tasks', 'assignedTo')) {
        console.log('Adding assignedTo column to tasks table...');
        await connection.execute('ALTER TABLE tasks ADD COLUMN assignedTo VARCHAR(255) COMMENT \'FK to users table, stores user ID\' AFTER dueDate');
    }
    // Add FK if not exists for assignedTo
    if (!await constraintExists(connection, 'tasks', 'tasks_ibfk_2', 'FOREIGN KEY') && // tasks_ibfk_2 is a common auto-name for the second FK
        !await constraintExists(connection, 'tasks', 'tasks_assignedto_fk', 'FOREIGN KEY') // Or a custom name
    ) {
        console.log('Adding foreign key for tasks.assignedTo to users.id...');
        // Check if an FK for assignedTo already exists with a different name
        const [fkAssignedToRows]: [any[], any] = await connection.execute(
          `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'assignedTo' AND REFERENCED_TABLE_NAME = 'users'`,
          [dbConfig.database]
        );
        if (fkAssignedToRows.length === 0) {
           await connection.execute('ALTER TABLE tasks ADD CONSTRAINT tasks_assignedto_fk FOREIGN KEY (assignedTo) REFERENCES users(id) ON DELETE SET NULL');
           console.log('Foreign key tasks.assignedTo -> users.id added.');
        } else {
           console.log('Foreign key for tasks.assignedTo already exists.');
        }
    }


    console.log('Ensuring "tasks" table structure...');
    await connection.execute(createTasksTableSQL); // This will now create it without uq_primary_document_id
    console.log('"tasks" table processed.');
    
    // Drop old unique constraint on task_documents.document_id if it exists
    await dropConstraintIfExists(connection, 'task_documents', 'uq_supporting_document_id');
    console.log('Creating "task_documents" junction table for supporting documents...');
    await connection.execute(createTaskDocumentsJunctionTableSQL); // This will now create it without uq_supporting_document_id
    console.log('"task_documents" junction table created/ensured.');

    console.log('Ensuring "notifications" table exists...');
    await connection.execute(createNotificationsTableSQL);
    console.log('"notifications" table processed.');


    // Seed default admin user
    const adminUsername = 'admin';
    const adminEmail = 'admin@notaryflow.app';
    const adminPassword = 'admin'; // Plain text for hashing
    const adminRole = 'admin';
    const adminName = 'Administrator';

    const [existingUsers]: [any[], any] = await connection.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [adminUsername, adminEmail]
    );

    if (existingUsers.length === 0) {
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);
      const adminId = uuidv4();
      
      await connection.execute(
        'INSERT INTO users (id, username, email, password, role, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [adminId, adminUsername, adminEmail, hashedPassword, adminRole, adminName]
      );
      console.log(`Default admin user "${adminUsername}" created successfully.`);
    } else {
      console.log(`Default admin user "${adminUsername}" or email "${adminEmail}" already exists. Skipping creation.`);
    }


    console.log('Database migration completed successfully.');

  } catch (error) {
    console.error('Error during database migration:');
    if (error instanceof Error) {
        console.error(`Message: ${error.message}`);
        // @ts-ignore
        if (error.sqlMessage) console.error(`SQL Message: ${error.sqlMessage}`);
        // @ts-ignore
        if (error.sqlState) console.error(`SQL State: ${error.sqlState}`);
        // @ts-ignore
        if (error.errno) console.error(`Error Number: ${error.errno}`);
    } else {
        console.error(String(error));
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed.');
    }
  }
}

if (require.main === module) {
  runMigrations();
}

export { runMigrations };
