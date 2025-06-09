
'use server';

import pool from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import type { Document, PaginatedDocumentsResponse, DocumentRequest, DocumentRequestStatus, Notification, User, DocumentLocationLog } from '@/types';
import { createClient, AuthType } from "webdav";
import https from 'https';
import type { RowDataPacket, OkPacket, PoolConnection } from 'mysql2/promise';
import { createNotificationInDB } from './notificationActions';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { fetchUserById } from './userActions';


export interface UploadDocumentResult {
  success: boolean;
  error?: string;
  document?: Document;
}

async function createDocumentLocationLogInDB(
  logData: Omit<DocumentLocationLog, 'id' | 'timestamp' | 'userName' | 'actorUserName'>,
  connection: PoolConnection
): Promise<void> {
  const logId = uuidv4();
  const query = `
    INSERT INTO document_location_logs (id, documentId, location, userId, actorUserId, changeReason, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, NOW())
  `;
  try {
    await connection.execute(query, [
      logId,
      logData.documentId,
      logData.location,
      logData.userId,
      logData.actorUserId,
      logData.changeReason,
    ]);
  } catch (error: any) {
    console.error(`Failed to create document location log for doc ${logData.documentId}: ${error.message}`);
    // Decide if this error should propagate or just be logged
  }
}

export async function uploadDocumentAndCreateRecord(
  formData: FormData,
  uploaderId: string, 
  initialLocation: string = "Kantor CS - Area Penyimpanan Umum" 
): Promise<UploadDocumentResult> {
  const file = formData.get('documentFile') as File | null;
  const customName = formData.get('documentName') as string | null;
  const customType = formData.get('documentType') as string | null;

  if (!file) {
    return { success: false, error: 'No file provided for upload.' };
  }
  if (!uploaderId) {
    return { success: false, error: 'Uploader ID is required to set initial document holder.' };
  }

  const {
    OWNCLOUD_URL,
    OWNCLOUD_USERNAME,
    OWNCLOUD_APP_PASSWORD
  } = process.env;

  if (!OWNCLOUD_URL || !OWNCLOUD_USERNAME || !OWNCLOUD_APP_PASSWORD) {
    return { success: false, error: 'OwnCloud server configuration is missing.' };
  }

  const documentId = uuidv4();
  const fileName = customName || file.name;
  const fileType = customType || file.type;
  const fileSize = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  const dateUploaded = new Date();
  
  let ownCloudPath: string | undefined = undefined;
  let targetPath: string | undefined = undefined;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    const client = createClient(OWNCLOUD_URL, {
      authType: AuthType.Password,
      username: OWNCLOUD_USERNAME,
      password: OWNCLOUD_APP_PASSWORD,
      httpsAgent: httpsAgent,
    });

    const owncloudBaseDir = '/remote.php/webdav';
    const targetDirectory = `${owncloudBaseDir}/NotaryFlowUploads`;
    const uniqueFileNameInOwnCloud = `${documentId}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    targetPath = `${targetDirectory}/${uniqueFileNameInOwnCloud}`;

    try {
      await client.getDirectoryContents(targetDirectory, { deep: false });
    } catch (getDirError: any) {
      if (getDirError.status === 404) {
        await client.createDirectory(targetDirectory, { recursive: true });
      } else {
        throw getDirError;
      }
    }
    
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await client.putFileContents(targetPath, fileBuffer, { overwrite: true, contentLength: file.size });
    ownCloudPath = targetPath;

    if (!ownCloudPath) {
      await connection.rollback();
      return { success: false, error: 'File upload to OwnCloud failed silently.' };
    }

    const query = `
      INSERT INTO documents (
        id, name, type, status, dateUploaded, lastModified, fileSize, version, ownCloudPath, tags, 
        userId, originalFileHolderId, originalFileLocation, isOriginalRequested, currentRequesterId, requestedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const documentData: Document = {
      id: documentId,
      name: fileName,
      type: fileType,
      status: 'Draft',
      dateUploaded: dateUploaded,
      lastModified: dateUploaded,
      fileSize: fileSize,
      version: 1,
      ownCloudPath: ownCloudPath,
      userId: uploaderId, // User who uploaded/created the record
      originalFileHolderId: uploaderId, 
      originalFileLocation: initialLocation,
      isOriginalRequested: false,
      currentRequesterId: null,
      requestedAt: null,
    };

    await connection.execute(query, [
      documentData.id, documentData.name, documentData.type, documentData.status,
      documentData.dateUploaded, documentData.lastModified, documentData.fileSize,
      documentData.version, documentData.ownCloudPath, JSON.stringify(documentData.tags || []),
      documentData.userId, documentData.originalFileHolderId, documentData.originalFileLocation,
      documentData.isOriginalRequested, documentData.currentRequesterId, documentData.requestedAt
    ]);

    await createDocumentLocationLogInDB({
      documentId: documentId,
      location: initialLocation,
      userId: uploaderId, // The uploader is the initial holder
      actorUserId: uploaderId, // The uploader performed the action
      changeReason: "Initial Upload",
    }, connection);

    await connection.commit();
    return { success: true, document: documentData };

  } catch (error: any)
 {
    await connection.rollback();
    console.error('Error in uploadDocumentAndCreateRecord:', error);
    return { success: false, error: error.message || 'An unexpected error occurred during document processing.' };
  } finally {
    connection.release();
  }
}

export interface DownloadDocumentDataResult {
    success: boolean;
    fileName?: string;
    mimeType?: string;
    data?: string; 
    error?: string;
}

export async function downloadDocumentData(documentId: string): Promise<DownloadDocumentDataResult> {
    if (!documentId) {
        return { success: false, error: "Document ID is required." };
    }

    const {
        OWNCLOUD_URL,
        OWNCLOUD_USERNAME,
        OWNCLOUD_APP_PASSWORD
    } = process.env;

    if (!OWNCLOUD_URL || !OWNCLOUD_USERNAME || !OWNCLOUD_APP_PASSWORD) {
        console.error('OwnCloud environment variables for download are not set.');
        return { success: false, error: 'OwnCloud server configuration is missing.' };
    }
    
    try {
        const [rows]: [any[], any] = await pool.query(
            'SELECT name, type, ownCloudPath FROM documents WHERE id = ?',
            [documentId]
        );

        if (rows.length === 0) {
            return { success: false, error: 'Document not found in database.' };
        }
        const doc = rows[0];

        if (!doc.ownCloudPath) {
            return { success: false, error: 'Document storage path (OwnCloud) is not available.' };
        }

        const httpsAgent = new https.Agent({ rejectUnauthorized: false });
        const client = createClient(OWNCLOUD_URL, {
            authType: AuthType.Password,
            username: OWNCLOUD_USERNAME,
            password: OWNCLOUD_APP_PASSWORD,
            httpsAgent: httpsAgent,
        });
        
        const fileContents = await client.getFileContents(doc.ownCloudPath, { format: "binary" }) as Buffer;

        if (!(fileContents instanceof Buffer)) {
             return { success: false, error: 'Failed to retrieve file from storage. Unexpected format.' };
        }
        
        return {
            success: true,
            fileName: doc.name,
            mimeType: doc.type,
            data: fileContents.toString('base64'),
        };

    } catch (error: any) {
        console.error(`Error in downloadDocumentData for ID ${documentId}:`, error);
        let message = 'An unexpected error occurred during document download.';
        if (error.status) { 
             message = `OwnCloud/WebDAV Error: Status ${error.status}. ${error.message || ''}`.trim();
        } else if (error instanceof Error) {
            message = error.message;
        }
        return { success: false, error: message };
    }
}


function parseJsonStringSafe(jsonString: string | null | undefined): string[] | undefined {
  if (!jsonString) return undefined;
  try {
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
      return parsed;
    }
    if (typeof parsed === 'string') return [parsed];
    return undefined;
  } catch (error) {
    if (typeof jsonString === 'string') {
        const tags = jsonString.split(',').map(tag => tag.trim()).filter(tag => tag);
        return tags.length > 0 ? tags : undefined;
    }
    return undefined;
  }
}

interface FetchDocumentsParams {
  page?: number;
  limit?: number;
  keyword?: string;
  documentType?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function fetchPaginatedDocuments(
  params: FetchDocumentsParams
): Promise<PaginatedDocumentsResponse> {
  const { 
    page = 1, 
    limit = 10, 
    keyword, 
    documentType, 
    status, 
    dateFrom, 
    dateTo 
  } = params;

  const offset = (page - 1) * limit;
  let whereClauses: string[] = [];
  let queryParams: (string | number)[] = [];

  if (keyword) {
    whereClauses.push('(name LIKE ? OR type LIKE ? OR JSON_SEARCH(LOWER(tags), "one", ?) IS NOT NULL)');
    queryParams.push(`%${keyword.toLowerCase()}%`, `%${keyword.toLowerCase()}%`, `%${keyword.toLowerCase()}%`);
  }
  if (documentType) {
    whereClauses.push('type = ?');
    queryParams.push(documentType);
  }
  if (status) {
    whereClauses.push('status = ?');
    queryParams.push(status);
  }
  if (dateFrom) {
    whereClauses.push('dateUploaded >= ?');
    queryParams.push(`${dateFrom} 00:00:00`);
  }
  if (dateTo) {
    whereClauses.push('dateUploaded <= ?');
    queryParams.push(`${dateTo} 23:59:59`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countQuery = `SELECT COUNT(*) as totalDocuments FROM documents ${whereSql}`;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, queryParams);
  const totalDocuments = countRows[0].totalDocuments || 0;
  const totalPages = Math.ceil(totalDocuments / limit);

  const dataQuery = `
    SELECT id, name, type, status, dateUploaded, lastModified, fileSize, version, tags, contentPreview, 
           ownCloudPath, userId, originalFileHolderId, originalFileLocation, isOriginalRequested, 
           currentRequesterId, requestedAt, activeRequestId
    FROM documents 
    ${whereSql}
    ORDER BY dateUploaded DESC 
    LIMIT ? OFFSET ?
  `;
  const dataQueryParams = [...queryParams, limit, offset];
  const [documentRows] = await pool.query<RowDataPacket[]>(dataQuery, dataQueryParams);

  const documents: Document[] = documentRows.map(row => ({
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status as Document['status'],
    dateUploaded: new Date(row.dateUploaded),
    lastModified: new Date(row.lastModified),
    fileSize: row.fileSize || 'N/A',
    version: row.version || 1,
    tags: parseJsonStringSafe(row.tags),
    contentPreview: row.contentPreview || undefined,
    ownCloudPath: row.ownCloudPath || undefined,
    userId: row.userId,
    originalFileHolderId: row.originalFileHolderId,
    originalFileLocation: row.originalFileLocation,
    isOriginalRequested: Boolean(row.isOriginalRequested),
    currentRequesterId: row.currentRequesterId,
    requestedAt: row.requestedAt ? new Date(row.requestedAt) : null,
    activeRequestId: row.activeRequestId,
  }));

  return {
    documents,
    totalDocuments,
    totalPages,
    currentPage: page,
    limit,
  };
}


export async function getExtendedDocumentDetails(documentId: string): Promise<(Document & { originalFileHolderName?: string, currentRequesterName?: string }) | null> {
    if (!documentId) return null;
    const query = `
        SELECT 
            d.*, 
            holder.name AS originalFileHolderName,
            requester.name AS currentRequesterName
        FROM documents d
        LEFT JOIN users holder ON d.originalFileHolderId = holder.id
        LEFT JOIN users requester ON d.currentRequesterId = requester.id
        WHERE d.id = ?
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [documentId]);
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        status: row.status as Document['status'],
        dateUploaded: new Date(row.dateUploaded),
        lastModified: new Date(row.lastModified),
        fileSize: row.fileSize || 'N/A',
        version: row.version || 1,
        tags: parseJsonStringSafe(row.tags),
        contentPreview: row.contentPreview || undefined,
        userId: row.userId,
        ownCloudPath: row.ownCloudPath || undefined,
        originalFileHolderId: row.originalFileHolderId,
        originalFileHolderName: row.originalFileHolderName,
        originalFileLocation: row.originalFileLocation,
        isOriginalRequested: Boolean(row.isOriginalRequested),
        currentRequesterId: row.currentRequesterId,
        currentRequesterName: row.currentRequesterName,
        requestedAt: row.requestedAt ? new Date(row.requestedAt) : null,
        activeRequestId: row.activeRequestId,
    };
}

export async function requestOriginalDocument(
  documentId: string,
  targetRequesterUserId: string
): Promise<{ success: boolean; error?: string; requestId?: string }> {
  const actorSession = await getServerSession(authOptions);
  if (!actorSession?.user?.id) {
    return { success: false, error: 'User (actor) not authenticated.' };
  }
  const actorUserId = actorSession.user.id;
  const actorUserName = actorSession.user.name || actorSession.user.email || actorUserId;
  const actorUserRole = actorSession.user.role;

  const targetUser = await fetchUserById(targetRequesterUserId);
  if (!targetUser) {
    return { success: false, error: 'Target requester user not found.' };
  }
  const targetUserName = targetUser.name || targetUser.username;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [docRows] = await connection.query<RowDataPacket[]>(
      'SELECT name, isOriginalRequested, currentRequesterId, originalFileHolderId, originalFileLocation FROM documents WHERE id = ? FOR UPDATE', 
      [documentId]
    );
    if (docRows.length === 0) {
      await connection.rollback();
      return { success: false, error: 'Document not found.' };
    }
    const doc = docRows[0];
    const docName = doc.name;

    if (doc.isOriginalRequested || doc.currentRequesterId) {
      await connection.rollback();
      return { success: false, error: 'Original document is already requested or checked out.' };
    }

    const requestId = uuidv4();
    await connection.execute(
      `INSERT INTO document_requests (id, documentId, requesterId, status, requestTimestamp)
       VALUES (?, ?, ?, ?, NOW())`,
      [requestId, documentId, targetRequesterUserId, 'Pending Approval']
    );

    await connection.execute(
      `UPDATE documents 
       SET isOriginalRequested = TRUE, currentRequesterId = ?, requestedAt = NOW(), activeRequestId = ?
       WHERE id = ?`,
      [targetRequesterUserId, requestId, documentId]
    );
    
    await createDocumentLocationLogInDB({
      documentId: documentId,
      location: doc.originalFileLocation || 'Unknown (Pre-Request)', // Use current location as reference
      userId: doc.originalFileHolderId, // Who had it before request
      actorUserId: actorUserId,
      changeReason: `Requested by ${targetUserName} (via ${actorUserName})`,
    }, connection);
    
    // Notify CS/Admin
    const [csUsers] = await connection.query<RowDataPacket[]>("SELECT id FROM users WHERE role IN ('cs', 'admin')");
    
    let notificationTitleToCS = `Permintaan Dokumen Asli: ${docName}`;
    let notificationDescToCS = `Pengguna ${targetUserName} (${targetRequesterUserId}) meminta dokumen asli "${docName}".`;

    if (actorUserId !== targetRequesterUserId && (actorUserRole === 'cs' || actorUserRole === 'admin')) {
        notificationDescToCS = `Pengguna ${actorUserName} mengajukan permintaan untuk dokumen "${docName}" atas nama ${targetUserName}.`;
    }

    for (const csUser of csUsers) {
        await createNotificationInDB({
            userId: csUser.id,
            type: 'New Document Request',
            title: notificationTitleToCS,
            description: notificationDescToCS,
            priority: 'medium',
            relatedDocumentId: documentId,
            relatedRequestId: requestId,
        }, connection);
    }

    // Notify Target User if request was made on their behalf by CS/Admin
    if (actorUserId !== targetRequesterUserId && (actorUserRole === 'cs' || actorUserRole === 'admin')) {
        await createNotificationInDB({
            userId: targetRequesterUserId,
            type: 'Document Request Submitted',
            title: `Permintaan Dokumen Diajukan Atas Nama Anda`,
            description: `${actorUserName} telah mengajukan permintaan untuk dokumen asli "${docName}" atas nama Anda. Status: Menunggu Persetujuan.`,
            priority: 'medium',
            relatedDocumentId: documentId,
            relatedRequestId: requestId,
        }, connection);
    }


    await connection.commit();
    return { success: true, requestId };
  } catch (error: any) {
    await connection.rollback();
    console.error('Error requesting original document:', error);
    return { success: false, error: error.message || 'Failed to request original document.' };
  } finally {
    connection.release();
  }
}


export async function getDocumentRequests(filters: {
  status?: DocumentRequestStatus | DocumentRequestStatus[];
  requesterId?: string;
  documentId?: string;
  page?: number;
  limit?: number;
}): Promise<{ requests: DocumentRequest[]; total: number; totalPages: number; currentPage: number }> {
  const { status, requesterId, documentId, page = 1, limit = 10 } = filters;
  const offset = (page - 1) * limit;

  let whereClauses: string[] = [];
  let queryParams: any[] = [];

  if (status) {
    if (Array.isArray(status)) {
      whereClauses.push(`dr.status IN (?)`);
      queryParams.push(status);
    } else {
      whereClauses.push('dr.status = ?');
      queryParams.push(status);
    }
  }
  if (requesterId) {
    whereClauses.push('dr.requesterId = ?');
    queryParams.push(requesterId);
  }
  if (documentId) {
    whereClauses.push('dr.documentId = ?');
    queryParams.push(documentId);
  }
  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countQuery = `SELECT COUNT(*) as total FROM document_requests dr ${whereSql}`;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, queryParams);
  const total = countRows[0].total || 0;
  const totalPages = Math.ceil(total / limit);

  const dataQuery = `
    SELECT 
      dr.*, 
      d.name as documentName, 
      u_req.name as requesterName,
      u_handler.name as handlerName
    FROM document_requests dr
    JOIN documents d ON dr.documentId = d.id
    JOIN users u_req ON dr.requesterId = u_req.id
    LEFT JOIN users u_handler ON dr.handlerUserId = u_handler.id
    ${whereSql}
    ORDER BY dr.requestTimestamp DESC
    LIMIT ? OFFSET ?
  `;
  const [requestRows] = await pool.query<RowDataPacket[]>(dataQuery, [...queryParams, limit, offset]);

  const requests: DocumentRequest[] = requestRows.map(row => ({
    id: row.id,
    documentId: row.documentId,
    documentName: row.documentName,
    requesterId: row.requesterId,
    requesterName: row.requesterName,
    requestTimestamp: new Date(row.requestTimestamp),
    status: row.status as DocumentRequestStatus,
    handlerUserId: row.handlerUserId,
    handlerName: row.handlerName,
    handledTimestamp: row.handledTimestamp ? new Date(row.handledTimestamp) : null,
    pickupTimestamp: row.pickupTimestamp ? new Date(row.pickupTimestamp) : null,
    expectedReturnDate: row.expectedReturnDate ? new Date(row.expectedReturnDate) : null,
    actualReturnTimestamp: row.actualReturnTimestamp ? new Date(row.actualReturnTimestamp) : null,
    notes: row.notes,
  }));

  return { requests, total, totalPages, currentPage: page };
}

export async function updateDocumentRequestStatus(
  requestId: string,
  newStatus: DocumentRequestStatus,
  actorUserId: string, 
  newLocation?: string, 
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [requestRows] = await connection.query<RowDataPacket[]>(
      'SELECT dr.*, d.name as documentName, u.name as requesterFullName FROM document_requests dr JOIN documents d ON dr.documentId = d.id JOIN users u ON dr.requesterId = u.id WHERE dr.id = ?', [requestId]
    );
    if (requestRows.length === 0) {
      await connection.rollback();
      return { success: false, error: 'Document request not found.' };
    }
    const request = requestRows[0] as DocumentRequest & { documentName: string, requesterFullName: string };
    const docId = request.documentId;
    const requesterName = request.requesterFullName || request.requesterId;

    let updateRequestQuery = 'UPDATE document_requests SET status = ?, handlerUserId = ?, handledTimestamp = NOW()';
    const requestParams: any[] = [newStatus, actorUserId];

    if (newStatus === 'Checked Out') {
      updateRequestQuery += ', pickupTimestamp = NOW()';
    } else if (newStatus === 'Returned') {
      updateRequestQuery += ', actualReturnTimestamp = NOW()';
    }
    if (notes) {
      updateRequestQuery += ', notes = ?';
      requestParams.push(notes);
    }
    updateRequestQuery += ' WHERE id = ?';
    requestParams.push(requestId);
    await connection.execute(updateRequestQuery, requestParams);

    let notificationType: Notification['type'] = 'Document Request Approved'; 
    let notificationTitle = `Permintaan Dokumen "${request.documentName}" Disetujui`;
    let notificationDesc = `Permintaan Anda untuk dokumen "${request.documentName}" telah disetujui.`;
    let locationLogChangeReason = `Status permintaan diubah menjadi ${newStatus}`;
    let locationForLog = newLocation;


    if (newStatus === 'Approved - Pending Pickup') {
      notificationType = 'Document Request Approved';
      notificationTitle = `Permintaan Dokumen Disetujui: ${request.documentName}`;
      notificationDesc = `Permintaan Anda untuk dokumen "${request.documentName}" telah disetujui oleh CS dan siap untuk diambil.`;
      locationLogChangeReason = "Permintaan disetujui, menunggu pengambilan.";
      // Location doesn't change yet, so no new log needed just for approval.
    } else if (newStatus === 'Checked Out') {
      const determinedLocation = newLocation || `Di tangan ${requesterName}`;
      await connection.execute(
        `UPDATE documents SET originalFileHolderId = ?, originalFileLocation = ?, isOriginalRequested = TRUE, currentRequesterId = ? WHERE id = ?`,
        [request.requesterId, determinedLocation, request.requesterId, docId]
      );
      notificationType = 'Document Checked Out';
      notificationTitle = `Dokumen Telah Diambil: ${request.documentName}`;
      notificationDesc = `Anda telah mengambil dokumen asli "${request.documentName}". Lokasi baru: ${determinedLocation}.`;
      locationLogChangeReason = `Dokumen diambil oleh ${requesterName}.`;
      locationForLog = determinedLocation;
       await createDocumentLocationLogInDB({
        documentId: docId,
        location: locationForLog,
        userId: request.requesterId, // Now held by requester
        actorUserId: actorUserId,
        changeReason: locationLogChangeReason,
      }, connection);
    } else if (newStatus === 'Returned') {
      const determinedLocation = newLocation || 'Kantor CS - Area Penyimpanan Umum';
      await connection.execute(
        `UPDATE documents SET originalFileHolderId = ?, originalFileLocation = ?, isOriginalRequested = FALSE, currentRequesterId = NULL, requestedAt = NULL, activeRequestId = NULL WHERE id = ?`,
        [actorUserId, determinedLocation, docId] // CS/Admin (actor) is now the holder
      );
      notificationType = 'Document Returned';
      notificationTitle = `Dokumen Telah Dikembalikan: ${request.documentName}`;
      notificationDesc = `Dokumen "${request.documentName}" telah dikembalikan ke CS.`;
      locationLogChangeReason = `Dokumen dikembalikan ke ${determinedLocation}.`;
      locationForLog = determinedLocation;
      await createDocumentLocationLogInDB({
        documentId: docId,
        location: locationForLog,
        userId: actorUserId, // Now held by CS/Admin who processed return
        actorUserId: actorUserId,
        changeReason: locationLogChangeReason,
      }, connection);
    } else if (newStatus === 'Rejected' || newStatus === 'Cancelled') {
       await connection.execute(
        `UPDATE documents SET isOriginalRequested = FALSE, currentRequesterId = NULL, requestedAt = NULL, activeRequestId = NULL WHERE id = ?`,
        [docId]
      );
      notificationType = newStatus === 'Rejected' ? 'Document Request Rejected' : 'Document Request Cancelled';
      notificationTitle = newStatus === 'Rejected' ? `Permintaan Ditolak: ${request.documentName}` : `Permintaan Dibatalkan: ${request.documentName}`;
      notificationDesc = `Permintaan Anda untuk dokumen "${request.documentName}" telah ${newStatus === 'Rejected' ? 'ditolak' : 'dibatalkan'}.`;
      if (notes) notificationDesc += ` Catatan: ${notes}`;
      locationLogChangeReason = `Permintaan ${newStatus.toLowerCase()}.${notes ? ' Catatan: ' + notes : ''}`;
       // Location doesn't change, but good to log the event if we want detailed audit for rejections.
       // For now, assuming no location log for rejection/cancellation unless explicitly needed.
    }
    
    if (request.requesterId !== actorUserId || newStatus === 'Returned' || newStatus === 'Rejected' || newStatus === 'Cancelled') {
         const targetUserIdForNotif = (newStatus === 'Returned' && request.handlerUserId && request.handlerUserId !== request.requesterId) 
                                ? request.requesterId // If CS1 handles and CS2 returns, requester should know.
                                : request.requesterId;

         let finalNotificationDesc = notificationDesc;
         if (newStatus === 'Returned') {
            const returnerInfo = (await fetchUserById(actorUserId))?.name || actorUserId; // Person who actually did the return in UI
            finalNotificationDesc = `Dokumen "${request.documentName}" telah dikembalikan oleh ${returnerInfo}. Lokasi baru: ${locationForLog || 'Kantor CS'}.`;
         } else if (newStatus === 'Checked Out' && actorUserId !== request.requesterId) {
             finalNotificationDesc = `Dokumen "${request.documentName}" telah diambil oleh ${requesterName}. Lokasi dokumen kini di tangan mereka.`
         } else if (newStatus === 'Approved - Pending Pickup' && actorUserId !== request.requesterId) {
             finalNotificationDesc = `Permintaan Anda untuk dokumen "${request.documentName}" telah disetujui dan siap diambil.`
         }


         await createNotificationInDB({
            userId: targetUserIdForNotif,
            type: notificationType,
            title: notificationTitle,
            description: finalNotificationDesc,
            priority: 'medium',
            relatedDocumentId: docId,
            relatedRequestId: requestId,
        }, connection);
    }

    await connection.commit();
    return { success: true };
  } catch (error: any) {
    await connection.rollback();
    console.error('Error updating document request status:', error);
    return { success: false, error: error.message || 'Failed to update request status.' };
  } finally {
    connection.release();
  }
}

export async function fetchDocumentLocationHistory(documentId: string): Promise<DocumentLocationLog[]> {
  if (!documentId) {
    return [];
  }
  try {
    const query = `
      SELECT 
        dll.id,
        dll.documentId,
        dll.location,
        dll.userId,
        u.name as userName,
        dll.actorUserId,
        actor_u.name as actorUserName,
        dll.changeReason,
        dll.timestamp
      FROM document_location_logs dll
      LEFT JOIN users u ON dll.userId = u.id
      LEFT JOIN users actor_u ON dll.actorUserId = actor_u.id
      WHERE dll.documentId = ?
      ORDER BY dll.timestamp DESC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [documentId]);
    return rows.map(row => ({
      id: row.id,
      documentId: row.documentId,
      location: row.location,
      userId: row.userId,
      userName: row.userName,
      actorUserId: row.actorUserId,
      actorUserName: row.actorUserName,
      changeReason: row.changeReason,
      timestamp: new Date(row.timestamp),
    }));
  } catch (error: any) {
    console.error(`Error fetching location history for document ${documentId}:`, error);
    return [];
  }
}
    
