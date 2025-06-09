
export type DocumentRequestStatus = 
  | 'Pending Approval' 
  | 'Approved - Pending Pickup' 
  | 'Checked Out' 
  | 'Returned' 
  | 'Rejected' 
  | 'Cancelled';

export interface DocumentRequest {
  id: string;
  documentId: string;
  documentName?: string; // For display purposes
  requesterId: string;
  requesterName?: string; // For display purposes
  requestTimestamp: Date;
  status: DocumentRequestStatus;
  handlerUserId?: string | null; // CS/Admin who handled it
  handlerName?: string | null; // For display
  handledTimestamp?: Date | null;
  pickupTimestamp?: Date | null;
  expectedReturnDate?: Date | null;
  actualReturnTimestamp?: Date | null;
  notes?: string | null;
}

export interface Document {
  id: string;
  name:string;
  type: string;
  status: 'Draft' | 'Pending Review' | 'Notarized' | 'Archived' | string;
  dateUploaded: Date;
  lastModified: Date;
  fileSize: string;
  version: number;
  tags?: string[];
  contentPreview?: string;
  userId?: string | null; // User who uploaded/owns the record, VARCHAR(36)
  ownCloudPath?: string;

  // New fields for original document tracking
  originalFileHolderId?: string | null; // User ID of current physical holder (FK to users.id), VARCHAR(36)
  originalFileHolderName?: string | null; // For display
  originalFileLocation?: string | null; // e.g., "CS Rack A-3", "John Doe's Desk"
  isOriginalRequested?: boolean; // True if there's an active, unresolved request by someone else
  currentRequesterId?: string | null; // User ID of the person who has an active request/checkout (FK to users.id), VARCHAR(36)
  currentRequesterName?: string | null; // For display
  requestedAt?: Date | null; // Timestamp of the current active request
  activeRequestId?: string | null; // ID of the active DocumentRequest
}

export type UserRole = 'admin' | 'cs' | 'manager' | 'staff' | 'notary';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'To Do' | 'In Progress' | 'Pending Review' | 'Approved' | 'Pending Notarization' | 'Ready for Notarization' | 'Notarization Complete' | 'Archived' | 'Blocked';
  dueDate: Date;
  assignedTo: string | null; // User ID, VARCHAR(36)
  assignedToName?: string | null; 
  priority: 'Low' | 'Medium' | 'High';
  parentId?: string;
  subtaskIds?: string[];
  jobNumber?: string | null;

  documents?: Array<{ // Richer document info for tasks
    id: string;
    name: string;
    type?: string;
    ownCloudPath?: string;
    isOriginalRequested?: boolean;
    originalFileHolderId?: string | null;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Notification {
  id: string;
  userId?: string | null; // User ID, VARCHAR(36)
  type: 'Task Assignment' | 'Task Status Update' | 'Document Upload' | 'New Document Request' | 'Document Request Approved' | 'Document Request Rejected' | 'Document Ready for Pickup' | 'Document Checked Out' | 'Document Returned' | 'Document Overdue' | string;
  title: string;
  description: string;
  date: Date;
  read: boolean;
  priority: 'low' | 'medium' | 'high';
  relatedTaskId?: string | null;
  relatedDocumentId?: string | null;
  relatedRequestId?: string | null; // Link to DocumentRequest
}

export interface User {
  id: string; // VARCHAR(36)
  username: string;
  email: string;
  role: UserRole | string; 
  name?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ActivityReportData {
  totalNewTasks: number;
  newTasks: ActivityReportItem[];
  startDate: string; 
  endDate: string;  
}

export interface ActivityReportItem {
  id: string;
  title: string;
  createdAt: Date; 
  status: Task['status']; 
  priority: Task['priority'];
  assignedToName: string | null;
}

export interface PublicSubtaskDetail {
  id: string;
  title: string;
  status: Task['status'];
  dueDate: Date;
}

export interface PublicTaskDetail {
  id: string;
  title: string;
  status: Task['status'];
  subtasks: PublicSubtaskDetail[];
}

export interface PublicTaskStatusResult {
  task?: PublicTaskDetail;
  message?: string;
  error?: string;
}

export interface PaginatedDocumentsResponse {
  documents: Document[];
  totalDocuments: number;
  totalPages: number;
  currentPage: number;
  limit: number;
}

export interface DocumentLocationLog {
  id: string;
  documentId: string;
  location: string;
  userId: string | null; // User associated with this state (e.g., holder)
  userName?: string | null; // For display
  actorUserId: string | null; // User who performed the action leading to this log
  actorUserName?: string | null; // For display
  changeReason: string | null;
  timestamp: Date;
}
