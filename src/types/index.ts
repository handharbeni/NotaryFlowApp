
export interface Document {
  id: string;
  name: string;
  type: string;
  status: 'Draft' | 'Pending Review' | 'Notarized' | 'Archived' | string;
  dateUploaded: Date;
  lastModified: Date;
  fileSize: string;
  version: number;
  tags?: string[];
  contentPreview?: string;
  ownCloudPath?: string;
}

export type UserRole = 'admin' | 'cs' | 'manager' | 'staff' | 'notary';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'To Do' | 'In Progress' | 'Pending Review' | 'Approved' | 'Pending Notarization' | 'Notarization Complete' | 'Archived' | 'Blocked';
  dueDate: Date;
  assignedTo: string | null; // User ID, can be null if unassigned
  assignedToName?: string | null; // User's display name, fetched via JOIN
  priority: 'Low' | 'Medium' | 'High';
  parentId?: string;
  subtaskIds?: string[];

  primaryDocumentId?: string | null;
  primaryDocument?: {
    id: string;
    name: string;
    type?: string;
    ownCloudPath?: string;
  } | null;

  supportingDocuments?: Array<{
    id: string;
    name: string;
    type?: string;
    ownCloudPath?: string;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Notification {
  id: string;
  userId?: string | null;
  type: string;
  title: string;
  description: string;
  date: Date;
  read: boolean;
  priority: 'low' | 'medium' | 'high';
  relatedTaskId?: string | null;
  relatedDocumentId?: string | null;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole | string; // Allow string for flexibility but prefer UserRole
  name?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  // Password hash should never be sent to the client
}

