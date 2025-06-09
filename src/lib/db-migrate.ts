
'use server';

/**
 * @fileOverview Standalone script to migrate database schemas.
 * Creates/Alters tables: 'documents', 'tasks', 'task_documents', 'notifications', 'users', 'system_settings', 'document_requests', 'document_location_logs'.
 * Standardizes User ID foreign keys to VARCHAR(36).
 * Adds original document tracking fields and location logging.
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

// Helper functions (columnExists, constraintExists, dropConstraintIfExists - assumed to be robust)
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
    try {
        const [constraints]: [any[], any] = await connection.execute(
            `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
            [dbConfig.database, tableName, constraintName]
        );
        if (constraints.length > 0) {
            const constraintType = constraints[0].CONSTRAINT_TYPE;
            let dropStatement = '';
            if (constraintType === 'FOREIGN KEY') {
                dropStatement = `ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${constraintName}\``;
            } else if (constraintType === 'UNIQUE') {
                dropStatement = `ALTER TABLE \`${tableName}\` DROP INDEX \`${constraintName}\``;
            } else if (constraintType === 'PRIMARY KEY') {
                // Be careful with dropping primary keys if no replacement is planned immediately
                // dropStatement = `ALTER TABLE \`${tableName}\` DROP PRIMARY KEY`; 
                console.warn(`Primary key drop for ${constraintName} on ${tableName} skipped by default in helper.`); return;
            }
            if (dropStatement) {
                console.log(`Dropping ${constraintType} constraint ${constraintName} from table ${tableName}...`);
                await connection.execute(dropStatement);
                console.log(`${constraintType} constraint ${constraintName} dropped.`);
            }
        }
    } catch (err: any) {
        if (err.errno === 1091 || err.code === 'ER_CANNOT_DROP_FIELD_OR_KEY') { 
            console.log(`Constraint ${constraintName} not found on table ${tableName}, or already dropped.`);
        } else {
            console.warn(`Warning trying to drop constraint ${constraintName} from ${tableName}: ${err.message}`);
        }
    }
}


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
  userId VARCHAR(36) NULL COMMENT 'FK to users table, stores uploader user ID',
  ownCloudPath VARCHAR(1023) COMMENT 'Path or ID of the file in OwnCloud',
  originalFileHolderId VARCHAR(36) NULL COMMENT 'FK to users.id, current physical holder',
  originalFileLocation VARCHAR(255) NULL COMMENT 'Physical location description',
  isOriginalRequested BOOLEAN DEFAULT FALSE,
  currentRequesterId VARCHAR(36) NULL COMMENT 'FK to users.id, who actively requested/has it',
  requestedAt DATETIME NULL,
  activeRequestId VARCHAR(36) NULL COMMENT 'FK to document_requests.id'
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

const createTasksTableSQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'To Do',
  dueDate DATETIME,
  assignedTo VARCHAR(36) NULL COMMENT 'FK to users table, stores user ID',
  priority VARCHAR(50) DEFAULT 'Medium',
  parentId VARCHAR(36),
  job_number VARCHAR(255) NULL COMMENT 'Generated job/case number',
  userId VARCHAR(36) NULL COMMENT 'FK to users table, user who created task',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parentId) REFERENCES tasks(id) ON DELETE CASCADE
);
`;

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
  userId VARCHAR(36) NULL COMMENT 'FK to users.id, for user-specific notifications',
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  date DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`read\` BOOLEAN DEFAULT FALSE,
  priority VARCHAR(50) DEFAULT 'medium',
  relatedTaskId VARCHAR(36) NULL,
  relatedDocumentId VARCHAR(36) NULL,
  relatedRequestId VARCHAR(36) NULL COMMENT 'FK to document_requests.id',
  FOREIGN KEY (relatedTaskId) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (relatedDocumentId) REFERENCES documents(id) ON DELETE SET NULL
);
`;

const createSystemSettingsTableSQL = `
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(255) PRIMARY KEY,
  setting_value TEXT
);
`;

const createDocumentRequestsTableSQL = `
CREATE TABLE IF NOT EXISTS document_requests (
  id VARCHAR(36) PRIMARY KEY,
  documentId VARCHAR(36) NOT NULL,
  requesterId VARCHAR(36) NOT NULL,
  requestTimestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'Pending Approval' COMMENT 'e.g., Pending Approval, Approved - Pending Pickup, Checked Out, Returned, Rejected, Cancelled',
  handlerUserId VARCHAR(36) NULL COMMENT 'FK to users.id, CS/Admin who handled it',
  handledTimestamp DATETIME NULL,
  pickupTimestamp DATETIME NULL,
  expectedReturnDate DATETIME NULL,
  actualReturnTimestamp DATETIME NULL,
  notes TEXT NULL,
  FOREIGN KEY (documentId) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (requesterId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (handlerUserId) REFERENCES users(id) ON DELETE SET NULL
);
`;

const createDocumentLocationLogsTableSQL = `
CREATE TABLE IF NOT EXISTS document_location_logs (
  id VARCHAR(36) PRIMARY KEY,
  documentId VARCHAR(36) NOT NULL,
  location VARCHAR(255) NOT NULL,
  userId VARCHAR(36) NULL COMMENT 'User associated with this location state (e.g., holder)',
  actorUserId VARCHAR(36) NULL COMMENT 'User who performed the action causing this log',
  changeReason VARCHAR(255) NULL COMMENT 'e.g., Initial Upload, Checked Out, Returned to CS',
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (documentId) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (actorUserId) REFERENCES users(id) ON DELETE SET NULL
);
`;


async function alterColumn(connection: mysql.Connection, tableName: string, columnName: string, columnDefinition: string) {
    if (await columnExists(connection, tableName, columnName)) {
        console.log(`Altering column ${columnName} in table ${tableName}...`);
        try {
            await connection.execute(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${columnDefinition}`);
            console.log(`Column ${columnName} in table ${tableName} altered successfully.`);
        } catch (error: any) {
            console.error(`Error altering column ${columnName} in ${tableName}: ${error.message}`);
        }
    } else {
        console.log(`Adding column ${columnName} to table ${tableName}...`);
        try {
            await connection.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDefinition}`);
            console.log(`Column ${columnName} in table ${tableName} added successfully.`);
        } catch (error: any) {
            console.error(`Error adding column ${columnName} to ${tableName}: ${error.message}`);
        }
    }
}

async function addForeignKeyIfNotExists(connection: mysql.Connection, tableName: string, constraintName: string, columnName: string, foreignTable: string, foreignColumn: string, onDeleteAction: string = 'SET NULL') {
    if (!await constraintExists(connection, tableName, constraintName, 'FOREIGN KEY')) {
        console.log(`Adding foreign key ${constraintName} to ${tableName}.${columnName} -> ${foreignTable}.${foreignColumn}...`);
        try {
            await connection.execute(`ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` FOREIGN KEY (\`${columnName}\`) REFERENCES \`${foreignTable}\`(\`${foreignColumn}\`) ON DELETE ${onDeleteAction}`);
            console.log(`Foreign key ${constraintName} added successfully.`);
        } catch (error: any) {
            console.error(`Error adding foreign key ${constraintName} to ${tableName}: ${error.message}`);
        }
    } else {
        console.log(`Foreign key ${constraintName} on ${tableName} already exists.`);
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

    // 1. Users table (base for FKs)
    console.log('Ensuring "users" table exists...');
    await connection.execute(createUsersTableSQL);
    console.log('"users" table processed.');

    // 2. Documents table
    console.log('Ensuring "documents" table structure...');
    await connection.execute(createDocumentsTableSQL); // Creates if not exists
    // Modify existing userId to VARCHAR(36) if it exists and is different
    await alterColumn(connection, 'documents', 'userId', 'VARCHAR(36) NULL COMMENT \'FK to users table, stores uploader user ID\'');
    await alterColumn(connection, 'documents', 'originalFileHolderId', 'VARCHAR(36) NULL COMMENT \'FK to users.id, current physical holder\'');
    await alterColumn(connection, 'documents', 'originalFileLocation', 'VARCHAR(255) NULL COMMENT \'Physical location description\'');
    await alterColumn(connection, 'documents', 'isOriginalRequested', 'BOOLEAN DEFAULT FALSE');
    await alterColumn(connection, 'documents', 'currentRequesterId', 'VARCHAR(36) NULL COMMENT \'FK to users.id, who actively requested/has it\'');
    await alterColumn(connection, 'documents', 'requestedAt', 'DATETIME NULL');
    await alterColumn(connection, 'documents', 'activeRequestId', 'VARCHAR(36) NULL COMMENT \'FK to document_requests.id\'');
    
    await addForeignKeyIfNotExists(connection, 'documents', 'fk_documents_userId', 'userId', 'users', 'id', 'SET NULL');
    await addForeignKeyIfNotExists(connection, 'documents', 'fk_documents_originalFileHolderId', 'originalFileHolderId', 'users', 'id', 'SET NULL');
    await addForeignKeyIfNotExists(connection, 'documents', 'fk_documents_currentRequesterId', 'currentRequesterId', 'users', 'id', 'SET NULL');
    console.log('"documents" table processed and columns updated.');

    // 3. Tasks table
    console.log('Ensuring "tasks" table structure...');
    await connection.execute(createTasksTableSQL); // Creates if not exists
    await alterColumn(connection, 'tasks', 'assignedTo', 'VARCHAR(36) NULL COMMENT \'FK to users table, stores user ID\'');
    await alterColumn(connection, 'tasks', 'userId', 'VARCHAR(36) NULL COMMENT \'FK to users table, user who created task\'');
    await addForeignKeyIfNotExists(connection, 'tasks', 'fk_tasks_assignedTo', 'assignedTo', 'users', 'id', 'SET NULL');
    await addForeignKeyIfNotExists(connection, 'tasks', 'fk_tasks_userId', 'userId', 'users', 'id', 'SET NULL');
    console.log('"tasks" table processed and columns updated.');

    // 4. Task Documents Junction Table
    console.log('Ensuring "task_documents" junction table exists...');
    await connection.execute(createTaskDocumentsJunctionTableSQL);
    console.log('"task_documents" junction table processed.');
    
    // 5. Document Requests Table (MUST be created before FK from documents.activeRequestId can be added)
    console.log('Ensuring "document_requests" table exists...');
    await connection.execute(createDocumentRequestsTableSQL);
    console.log('"document_requests" table processed.');

    // Now, add FK from documents.activeRequestId to document_requests.id
    await addForeignKeyIfNotExists(connection, 'documents', 'fk_documents_activeRequestId', 'activeRequestId', 'document_requests', 'id', 'SET NULL');
    
    // 6. Notifications Table
    console.log('Ensuring "notifications" table structure...');
    await connection.execute(createNotificationsTableSQL); // Creates if not exists
    await alterColumn(connection, 'notifications', 'userId', 'VARCHAR(36) NULL COMMENT \'FK to users.id, for user-specific notifications\'');
    await alterColumn(connection, 'notifications', 'relatedRequestId', 'VARCHAR(36) NULL COMMENT \'FK to document_requests.id\'');
    await addForeignKeyIfNotExists(connection, 'notifications', 'fk_notifications_userId', 'userId', 'users', 'id', 'SET NULL');
    await addForeignKeyIfNotExists(connection, 'notifications', 'fk_notifications_relatedRequestId', 'relatedRequestId', 'document_requests', 'id', 'SET NULL');
    console.log('"notifications" table processed and columns updated.');

    // 7. System Settings Table
    console.log('Ensuring "system_settings" table exists...');
    await connection.execute(createSystemSettingsTableSQL);
    console.log('"system_settings" table processed.');

    // 8. Document Location Logs Table
    console.log('Ensuring "document_location_logs" table exists...');
    await connection.execute(createDocumentLocationLogsTableSQL);
    console.log('"document_location_logs" table processed.');


    // Seed default admin user and job number pattern (if not exists)
    const adminUsername = 'admin';
    const adminEmail = 'admin@notaryflow.app';
    const adminPassword = 'admin'; // In a real app, use env var or prompt
    const adminRole = 'admin';
    const adminName = 'Administrator';

    const [existingAdmin]: [any[], any] = await connection.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [adminUsername, adminEmail]
    );

    if (existingAdmin.length === 0) {
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);
      const adminId = uuidv4();
      await connection.execute(
        'INSERT INTO users (id, username, email, password, role, name) VALUES (?, ?, ?, ?, ?, ?)',
        [adminId, adminUsername, adminEmail, hashedPassword, adminRole, adminName]
      );
      console.log(`Default admin user "${adminUsername}" created.`);
    } else {
      console.log(`Admin user "${adminUsername}" or email "${adminEmail}" already exists.`);
    }

    const defaultJobNumberPatternKey = 'job_number_pattern';
    const defaultJobNumberPatternValue = 'NA/{{YYYY}}/{{MM}}/{{SEQ}}';
    const [existingPattern]: [any[], any] = await connection.execute(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      [defaultJobNumberPatternKey]
    );
    if (existingPattern.length === 0) {
      await connection.execute(
        'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)',
        [defaultJobNumberPatternKey, defaultJobNumberPatternValue]
      );
      console.log(`Default job number pattern seeded.`);
    }

    console.log('Database migration completed successfully.');

  } catch (error) {
    console.error('Error during database migration:');
    if (error instanceof Error) {
        console.error(`Message: ${error.message}`);
        const sqlError = error as mysql.MysqlError;
        if (sqlError.sqlMessage) console.error(`SQL Message: ${sqlError.sqlMessage}`);
        if (sqlError.sqlState) console.error(`SQL State: ${sqlError.sqlState}`);
        if (sqlError.errno) console.error(`Error Number: ${sqlError.errno}`);
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
