# HTTP 413 Error Fix - Direct S3 Upload via Presigned URLs

## Problem
Vercel has a **4.5MB payload limit** on free tier. When uploading large recordings through your backend, the request exceeds this limit and returns **HTTP 413 (Payload Too Large)**.

## Solution
Use **presigned URLs** to upload directly from the client to S3, completely bypassing your backend for file transfer.

## Backend Changes Made

### 1. Reduced Express Body Limits
**File:** `server.js`
- Changed from `500mb` to `10mb` to prevent buffering large files in memory

### 2. New Presigned URL Endpoint
**File:** `controllers/recordingController.js`
- Added `getPresignedUrl()` function that:
  - Validates appointmentId
  - Generates a presigned S3 URL valid for 1 hour
  - Creates a Recording entry in the database
  - Returns the presigned URL to the client

**File:** `utils/s3Service.js`
- Added `generatePresignedUploadUrl()` utility function

**File:** `routes/recordingRoutes.js`
- Added route: `POST /api/recordings/presigned-url`

## Frontend Implementation

### Step 1: Get Presigned URL
```javascript
const response = await fetch('/api/recordings/presigned-url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    fileName: file.name,
    contentType: file.type,
    appointmentId: appointmentId,
    metadata: {
      duration: recordingDuration,
      recordedAt: new Date().toISOString(),
      deviceType: 'web',
      platform: 'browser'
    }
  })
});

const { data } = await response.json();
const { presignedUrl, fileUrl, recordingId } = data;
```

### Step 2: Upload Directly to S3
```javascript
const uploadResponse = await fetch(presignedUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': file.type
  },
  body: file // The actual file blob/buffer
});

if (uploadResponse.ok) {
  console.log('Upload successful!', fileUrl);
  // Recording is already created in database with pending analysis
}
```

## Benefits
- ✅ Bypasses Vercel's 4.5MB payload limit
- ✅ No backend memory overhead for large files
- ✅ Faster uploads (direct to S3)
- ✅ Recording entry created immediately for tracking
- ✅ Presigned URL expires after 1 hour for security

## Testing
1. Deploy backend to Vercel
2. Update frontend to use `/api/recordings/presigned-url` endpoint
3. Upload a recording > 4.5MB
4. Verify file appears in S3 and recording is in database
