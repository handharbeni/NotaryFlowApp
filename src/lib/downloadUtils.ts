
// src/lib/downloadUtils.ts

export function triggerBrowserDownload(fileName: string, mimeType: string, base64Data: string): void {
  try {
    // Convert base64 to a Uint8Array
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    // Create a Blob from the Uint8Array
    const blob = new Blob([byteArray], { type: mimeType });

    // Create an object URL for the Blob
    const objectUrl = URL.createObjectURL(blob);

    // Create a temporary <a> element to trigger the download
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;

    // Append the <a> element to the body, click it, and then remove it
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Revoke the object URL to free up resources
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error("Error triggering browser download:", error);
    // Optionally, re-throw or notify the user via a toast message from the calling component
    throw new Error("Failed to initiate download. The file data might be corrupted or an unexpected error occurred.");
  }
}
