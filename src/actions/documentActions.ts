
'use server';

import pool from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import type { Document } from '@/types';
import { createClient, AuthType } from "webdav"; // Import webdav client
import https from 'https'; // Import the https module

export interface UploadDocumentResult {
  success: boolean;
  error?: string;
  document?: Document;
}

// This is a simplified Zod-like schema for form data validation,
// actual validation might be more complex or use a library.
interface DocumentUploadFormData {
  documentFile: File;
  documentName?: string; // Optional, can derive from file name
  documentType?: string; // Optional, can derive from file type or user input
  tags?: string; // Comma-separated string
}


export async function uploadDocumentAndCreateRecord(formData: FormData): Promise<UploadDocumentResult> {
  const file = formData.get('documentFile') as File | null;
  const customName = formData.get('documentName') as string | null;
  const customType = formData.get('documentType') as string | null; // e.g. "Application PDF", "Client Agreement"
  // const tagsString = formData.get('tags') as string | null; // "tag1,tag2,tag3"

  if (!file) {
    return { success: false, error: 'No file provided for upload.' };
  }

  const {
    OWNCLOUD_URL,
    OWNCLOUD_USERNAME,
    OWNCLOUD_APP_PASSWORD
  } = process.env;

  if (!OWNCLOUD_URL || !OWNCLOUD_USERNAME || !OWNCLOUD_APP_PASSWORD) {
    console.error('OwnCloud environment variables (OWNCLOUD_URL, OWNCLOUD_USERNAME, OWNCLOUD_APP_PASSWORD) are not set.');
    return { success: false, error: 'OwnCloud server configuration is missing. Please contact an administrator.' };
  }

  const documentId = uuidv4();
  const fileName = customName || file.name;
  const fileType = customType || file.type; // Use custom type if provided, else MIME type
  const fileSize = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  const dateUploaded = new Date();
  // const tagsArray = tagsString ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

  let ownCloudPath: string | undefined = undefined;
  let targetPath: string | undefined = undefined; 

  try {
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false 
    });

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
    
    console.log(`Checking/Creating OwnCloud directory: ${targetDirectory}`);
    try {
      // Check if directory exists and is accessible by trying to list its contents (non-recursively)
      await client.getDirectoryContents(targetDirectory, { deep: false });
      console.log(`OwnCloud directory ${targetDirectory} already exists and is accessible.`);
    } catch (getDirError: any) {
      if (getDirError.status === 404) { // Not Found
        console.log(`OwnCloud directory ${targetDirectory} not found. Attempting to create.`);
        try {
          await client.createDirectory(targetDirectory, { recursive: true }); // recursive: true is good practice
          console.log(`Successfully created OwnCloud directory: ${targetDirectory}`);
        } catch (createError: any) {
          const errorMsg = `Failed to create target directory on OwnCloud: ${createError.message || 'Unknown directory creation error'}. Status: ${createError.status || 'N/A'}`;
          console.error(`Fatal: ${errorMsg}`);
          return { success: false, error: errorMsg };
        }
      } else { // Other error accessing directory (permissions, server error, targetDirectory is a file, etc.)
        const errorMsg = `Failed to access/verify target directory on OwnCloud: ${getDirError.message || 'Unknown directory access error'}. Status: ${getDirError.status || 'N/A'}`;
        console.error(`Fatal: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    }
    
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    console.log(`Attempting to upload to OwnCloud. Target path: ${targetPath}, File size: ${file.size}, Overwrite: true`);
    let uploadSuccess = false;
    try {
        uploadSuccess = await client.putFileContents(targetPath, fileBuffer, {
            overwrite: true,
            contentLength: file.size,
        });

        if (uploadSuccess) {
            ownCloudPath = targetPath;
            console.log(`File successfully uploaded to OwnCloud: ${ownCloudPath}`);
        } else {
            const lastError = (client as any).lastError; 
            let errorDetail = 'Unknown reason for upload failure from client library.';
            if (lastError) {
                errorDetail = `Status: ${lastError.status || 'N/A'}, Message: ${lastError.message || 'N/A'}`;
            }
            console.error(`OwnCloud upload failed (putFileContents returned false). Path: ${targetPath}. Details: ${errorDetail}`);
            return { success: false, error: `Failed to upload file to OwnCloud. ${errorDetail}` };
        }
    } catch (uploadError: any) {
        console.error(`OwnCloud upload threw an error. Path: ${targetPath}. Error:`, uploadError);
        let message = `OwnCloud upload error: ${uploadError.message || 'An unexpected error occurred.'}`;
        if (uploadError.status) {
            message = `OwnCloud/WebDAV Error: Status ${uploadError.status}. ${uploadError.message || ''}`.trim();
            if (uploadError.status === 409) {
                message += ` This could indicate a conflict with an existing file or directory on the server.`;
            }
        }
        return { success: false, error: message };
    }
    
    if (!ownCloudPath) {
        return { success: false, error: 'File was processed but did not get a valid storage path from OwnCloud.' };
    }

    const query = `
      INSERT INTO documents (id, name, type, status, dateUploaded, lastModified, fileSize, version, ownCloudPath, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      // tags: tagsArray, 
    };

    await pool.execute(query, [
      documentData.id,
      documentData.name,
      documentData.type,
      documentData.status,
      documentData.dateUploaded,
      documentData.lastModified,
      documentData.fileSize,
      documentData.version,
      documentData.ownCloudPath,
      JSON.stringify(documentData.tags || []), 
    ]);

    return { success: true, document: documentData };

  } catch (error: any) {
    console.error('Error in uploadDocumentAndCreateRecord (Outer Catch Block - Full Error):', error);
    let message = 'An unexpected error occurred during document processing.';
    if (error.status) { 
        message = `OwnCloud/WebDAV Error: Status ${error.status}. ${error.message || ''} ${error.response?.data?.message || error.response?.data || ''}`.trim();
    } else if ((error as any).isAxiosError && (error as any).response) { 
        const axiosError = error as any;
        message = `OwnCloud API Error (Axios): ${axiosError.response.status} - ${axiosError.response.statusText}. ${axiosError.response.data?.message || axiosError.response.data || ''}`;
    } else if (error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') { 
        message = `OwnCloud connection failed: Self-signed certificate issue. Ensure 'rejectUnauthorized: false' is set for the httpsAgent if this is expected.`;
    } else if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    } else if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      message = error.message;
    }
    
    if (error.status === 401) message = "OwnCloud authentication failed. Check credentials in .env (OWNCLOUD_USERNAME, OWNCLOUD_APP_PASSWORD).";
    if (error.status === 404) message = `OwnCloud URL or path might be incorrect. Base URL: ${OWNCLOUD_URL}, Target path: ${targetPath || 'not determined'}. Check server configuration and paths.`;
    if (error.status === 403) message = `Forbidden. The OwnCloud user may not have permission to write to the target directory or file. Target Path: ${targetPath || 'not determined'}`;
    if (error.status === 409) { // Ensure this is specific and informative
      message = `OwnCloud/WebDAV Error: Status 409 Conflict. This usually means the file/folder cannot be created due to an existing item with the same name or other server-side restrictions. Path: ${targetPath || 'not determined'}. Original server message: ${error.message || ''}`.trim();
    }

    return { success: false, error: message };
  }
}
