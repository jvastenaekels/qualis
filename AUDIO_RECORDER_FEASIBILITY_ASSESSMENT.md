# Audio Recorder for Fine Sort Step - Technical Feasibility Assessment

**Date:** 2026-01-16
**Status:** ✅ FEASIBLE with specific recommendations
**Risk Level:** LOW to MEDIUM (depending on implementation choices)

---

## Executive Summary

Implementing a **robust, resilient, and lightweight audio recorder** for the fine sort step is **technically feasible** with modern web technologies. The fine sort step's architecture provides clear integration points, and browser APIs are mature enough to support this feature across desktop and mobile devices. However, careful attention must be paid to storage, privacy, performance, and user experience considerations.

---

## 1. Current Architecture Analysis

### Fine Sort Step Overview

The fine sort (Step 4) is where participants place statement cards into a forced distribution grid (typically -4 to +4 scores). This is the most cognitively intensive step in Q-methodology, making it an ideal candidate for capturing verbal think-aloud protocols.

**Key Components:**
- **FineSortPage.tsx** (438 lines): Main page container managing DnD context, routing, and validation
- **GridSort.tsx** (850 lines): Interactive grid UI rendering slots, cards, and controls
- **useFineSortDrag.ts** (213 lines): Drag-drop logic and card placement
- **useResponseStore.ts**: Zustand state management with localStorage persistence

**Data Flow:**
```
User Interaction → useFineSortDrag → useGridPlacement → useResponseStore → localStorage/sessionStorage
```

**Current Data Storage:**
- `presort_answers`: JSON (dict) - stored in PostgreSQL
- `postsort_answers`: JSON (dict) - stored in PostgreSQL
- `qsort_entries`: Relational table with `statement_id`, `grid_score`, `card_comment`
- No binary file storage currently exists in the system

---

## 2. Technical Implementation Strategy

### 2.1 Browser Audio Recording APIs

**MediaStream Recording API (MediaRecorder)**
- ✅ **Mature & Well-Supported**: Available in all modern browsers (Chrome 49+, Firefox 25+, Safari 14.1+, Edge 79+)
- ✅ **Mobile Support**: Works on iOS Safari 14.5+, Android Chrome 53+
- ✅ **Native Audio Compression**: Supports WebM (Opus/Vorbis), MP4 (AAC), OGG depending on browser
- ✅ **Low Performance Overhead**: Hardware-accelerated encoding where available

**Recommended Implementation:**
```typescript
// Pseudocode for audio recorder hook
function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlobs, setAudioBlobs] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000 // Lower rate for smaller file size
      }
    });

    const recorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus', // Excellent compression
      audioBitsPerSecond: 32000 // ~240KB per minute
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        setAudioBlobs(prev => [...prev, e.data]);
      }
    };

    recorder.start(5000); // Chunk every 5 seconds for resilience
    mediaRecorderRef.current = recorder;
    streamRef.current = stream;
    setIsRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
    setIsRecording(false);
  };

  const getAudioFile = () => {
    return new Blob(audioBlobs, { type: 'audio/webm' });
  };

  return { startRecording, stopRecording, isRecording, getAudioFile };
}
```

**Browser Compatibility:**
| Browser | MediaRecorder | WebM/Opus | MP4/AAC | Mobile Support |
|---------|---------------|-----------|---------|----------------|
| Chrome 90+ | ✅ | ✅ | ✅ | ✅ Android |
| Firefox 90+ | ✅ | ✅ | ❌ | ✅ Android |
| Safari 14.1+ | ✅ | ❌ | ✅ | ✅ iOS 14.5+ |
| Edge 90+ | ✅ | ✅ | ✅ | ✅ Android |

**Format Recommendation:** Use WebM/Opus as primary, fallback to MP4/AAC for Safari.

---

### 2.2 Integration Points in Fine Sort Step

**Option A: Full-Session Recording (Recommended)**
- Start recording when entering fine sort step
- Stop recording when confirming completion
- Single audio file per participant
- Pros: Simple UX, captures entire sorting process
- Cons: Larger file size if session is long

**Option B: Manual Start/Stop Control**
- Floating record button (like Zoom's record indicator)
- Participant controls when to record
- Pros: User agency, privacy-conscious
- Cons: May forget to record, interrupts flow

**Option C: Auto-Pause During Idle**
- Detect when no cards moved for N seconds
- Auto-pause recording during idle periods
- Resume on next interaction
- Pros: Reduces file size, maintains flow
- Cons: Complex state management

**Recommended Approach:** Start with **Option A** for MVP, add **Option C** for optimization.

**UI Placement Recommendations:**
1. **Top-right corner indicator**: Small recording pill (🔴 Recording 02:34)
2. **Sticky footer element**: Below grid panel with pause/resume controls
3. **Inside validation footer**: Integrate with existing "Confirm" button

**Preferred:** Top-right corner indicator (minimal distraction) with optional pause in validation footer.

---

### 2.3 State Management Integration

**Extend `useResponseStore` with Audio State:**

```typescript
// In useResponseStore.ts
interface ResponseState {
  // ... existing state
  audio: {
    isRecording: boolean;
    isPaused: boolean;
    duration: number; // seconds
    chunks: Blob[];
    hasRecording: boolean;
  };

  startAudioRecording: () => void;
  stopAudioRecording: () => void;
  pauseAudioRecording: () => void;
  resumeAudioRecording: () => void;
  clearAudioRecording: () => void;
}
```

**Important Considerations:**
- ⚠️ **Do NOT persist Blobs to localStorage** (will exceed quota)
- ✅ Store only metadata (duration, status) in Zustand
- ✅ Keep audio Blobs in memory via refs
- ✅ Upload immediately on submission or store in IndexedDB temporarily

---

### 2.4 Storage Architecture

**Current Backend Storage:**
- PostgreSQL for structured data (qsort_entries, presort_answers, postsort_answers)
- No file/blob storage currently implemented
- No S3, Azure Blob Storage, or similar cloud storage detected

**Storage Options:**

| Option | Implementation Effort | Cost | Scalability | Recommendation |
|--------|----------------------|------|-------------|----------------|
| **PostgreSQL BYTEA** | Low (simple) | Free | Poor (max 1GB) | ❌ Not recommended |
| **PostgreSQL Large Objects (LO)** | Medium | Free | Medium (up to 4TB) | ⚠️ Acceptable for MVP |
| **Local File System** | Low | Free | Medium | ✅ Good for self-hosted |
| **S3-Compatible Storage** | Medium | Variable | Excellent | ✅✅ Best for production |
| **Azure Blob Storage** | Medium | Variable | Excellent | ✅ Good alternative |

**Recommended: S3-Compatible Storage (MinIO for self-hosted, AWS S3 for cloud)**

**Why S3?**
- ✅ Industry standard
- ✅ Decouples file storage from database
- ✅ Easy to implement presigned URLs for upload/download
- ✅ Works with MinIO (self-hosted), AWS S3, DigitalOcean Spaces, Backblaze B2
- ✅ Automatic redundancy and backups

**Implementation Approach:**

```python
# backend/app/storage.py (new file)
import boto3
from botocore.client import Config

class AudioStorageService:
    def __init__(self):
        self.s3 = boto3.client(
            's3',
            endpoint_url=settings.S3_ENDPOINT,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            config=Config(signature_version='s3v4')
        )
        self.bucket = settings.S3_BUCKET_NAME

    def generate_upload_url(self, participant_id: int, filename: str) -> str:
        """Generate presigned URL for direct browser upload."""
        key = f"audio/{participant_id}/{filename}"
        url = self.s3.generate_presigned_url(
            'put_object',
            Params={'Bucket': self.bucket, 'Key': key},
            ExpiresIn=3600  # 1 hour
        )
        return url

    def generate_download_url(self, participant_id: int, filename: str) -> str:
        """Generate presigned URL for download."""
        key = f"audio/{participant_id}/{filename}"
        url = self.s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': self.bucket, 'Key': key},
            ExpiresIn=86400  # 24 hours
        )
        return url
```

**Database Schema Extension:**

```python
# In models.py - Add to Participant model
audio_recording_url: Mapped[str | None] = mapped_column(String, nullable=True)
audio_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
audio_file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
audio_mime_type: Mapped[str | None] = mapped_column(String, nullable=True)
```

**Upload Flow:**
1. Frontend requests presigned upload URL from backend
2. Backend generates URL and stores metadata (pending upload)
3. Frontend uploads directly to S3 using presigned URL
4. Frontend notifies backend of successful upload
5. Backend updates participant record with final metadata

**Benefits of Presigned URLs:**
- ✅ No audio data passes through backend
- ✅ Reduces server load and bandwidth
- ✅ Faster uploads (direct to storage)
- ✅ More secure (temporary, scoped permissions)

---

### 2.5 File Size Estimation

**Compression Settings:**
- Codec: Opus (WebM) or AAC (MP4)
- Sample Rate: 16kHz (speech-optimized)
- Bitrate: 32 kbps (sufficient for voice)

**File Size Calculations:**

| Duration | File Size (32 kbps) | Storage for 100 Participants |
|----------|---------------------|------------------------------|
| 5 min | ~1.2 MB | 120 MB |
| 10 min | ~2.4 MB | 240 MB |
| 15 min | ~3.6 MB | 360 MB |
| 30 min | ~7.2 MB | 720 MB |
| 60 min | ~14.4 MB | 1.44 GB |

**Typical Fine Sort Duration:** 10-20 minutes based on 40 statements
**Expected File Size:** 2-5 MB per participant

**Storage Cost Estimates (AWS S3 Standard):**
- 100 participants × 3 MB = 300 MB → ~$0.007/month
- 1,000 participants × 3 MB = 3 GB → ~$0.07/month
- 10,000 participants × 3 MB = 30 GB → ~$0.70/month

**Bandwidth Costs (Upload + Download):**
- Upload: Free on AWS S3
- Download: $0.09/GB (first 10 TB)
- Example: 1,000 participants × 3 MB download = 3 GB → ~$0.27

**Total Monthly Cost (1,000 participants):** ~$0.34 (negligible)

---

## 3. Resilience & Error Handling

### 3.1 Recording Interruptions

**Potential Failure Scenarios:**
1. Browser tab backgrounded (mobile)
2. Device goes to sleep
3. Microphone disconnected
4. Memory pressure causes crash
5. Network interruption during upload

**Mitigation Strategies:**

**1. Chunked Recording**
```typescript
// Record in 5-second chunks
recorder.start(5000); // Pass timeslice parameter

// Store chunks immediately
recorder.ondataavailable = (e) => {
  if (e.data.size > 0) {
    // Save to IndexedDB immediately for recovery
    saveChunkToIndexedDB(e.data);
    audioChunks.push(e.data);
  }
};
```

**Benefits:**
- If recording stops unexpectedly, chunks already saved
- Can resume with partial recording
- Progressive upload possible

**2. Page Visibility API**
```typescript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Tab backgrounded - pause recording
    mediaRecorder?.pause();
    sessionStore.pauseAudioRecording();
  } else {
    // Tab foregrounded - resume
    mediaRecorder?.resume();
    sessionStore.resumeAudioRecording();
  }
});
```

**3. IndexedDB for Resilience**
```typescript
// Store chunks in IndexedDB for crash recovery
const db = await openDB('open-q-audio', 1, {
  upgrade(db) {
    db.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true });
  }
});

// Save chunk
await db.add('chunks', {
  participantId,
  timestamp: Date.now(),
  blob: chunk
});

// Recover after crash
const savedChunks = await db.getAll('chunks');
```

**4. Network Retry with Exponential Backoff**
```typescript
async function uploadWithRetry(blob: Blob, url: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': 'audio/webm' }
      });

      if (response.ok) return true;

      // Wait before retry: 2s, 4s, 8s
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 2000));
    } catch (error) {
      if (i === maxRetries - 1) throw error;
    }
  }
  return false;
}
```

**5. BeforeUnload Warning**
```typescript
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isRecording || hasUnsavedRecording) {
      e.preventDefault();
      e.returnValue = ''; // Chrome requires returnValue to be set
      return 'You have an active recording. Are you sure you want to leave?';
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [isRecording, hasUnsavedRecording]);
```

---

### 3.2 Browser Permission Handling

**Microphone Permission States:**
1. **Prompt**: First-time, user hasn't decided
2. **Granted**: User allowed
3. **Denied**: User blocked
4. **Unknown**: Not yet requested

**Permission Checking:**
```typescript
async function checkMicrophonePermission() {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });

    if (result.state === 'granted') {
      return 'granted';
    } else if (result.state === 'denied') {
      return 'denied';
    } else {
      return 'prompt';
    }
  } catch {
    // Fallback for browsers without Permissions API
    return 'unknown';
  }
}
```

**UX Flow:**
1. Show permission request modal before starting
2. If denied, show instructions on how to enable in browser settings
3. Provide "Skip Audio" option for users who decline
4. Store permission state in session to avoid repeated prompts

**Graceful Degradation:**
- ❌ Do NOT block study completion if audio recording fails
- ✅ Allow participants to continue without audio
- ✅ Log permission denials for analytics
- ✅ Show clear feedback when recording is unavailable

---

## 4. Performance Considerations

### 4.1 Memory Usage

**Recording 10 minutes at 32 kbps:**
- Raw memory: ~2.4 MB buffered
- Peak memory (with chunks): ~3-4 MB
- Impact: NEGLIGIBLE (modern devices have GB of RAM)

**Optimization Strategies:**
1. **Chunked recording** (already covered): Prevents unbounded memory growth
2. **Progressive upload**: Upload chunks as recorded (advanced)
3. **Compression in browser**: Use native MediaRecorder encoding (automatic)

**Recommendation:** Memory is NOT a concern for typical recording durations (<30 min).

---

### 4.2 CPU & Battery Impact

**MediaRecorder CPU Usage:**
- Hardware-accelerated encoding on most devices
- ~1-3% CPU usage on modern laptops
- ~5-10% on older mobile devices
- Battery impact: ~1-2% per 10 minutes on mobile

**Mitigation:**
- Use efficient codec (Opus is best)
- Lower sample rate (16kHz sufficient for speech)
- Pause during idle periods (optional)

**Verdict:** CPU and battery impact is MINIMAL and acceptable.

---

### 4.3 Network Bandwidth

**Upload Bandwidth:**
- 3 MB file takes ~2-6 seconds on 4G (5-10 Mbps typical)
- ~1 second on WiFi (50+ Mbps)
- Can upload in background during post-sort step

**Recommendation:**
- Upload after fine sort completion (during transition to post-sort)
- Show progress indicator
- Allow retry if upload fails
- Store locally if offline, upload when connected

---

## 5. Privacy & Compliance

### 5.1 Consent Requirements

**Essential Actions:**
1. ✅ **Explicit consent**: Add checkbox in consent form specifically for audio recording
2. ✅ **Purpose disclosure**: Explain why audio is collected ("to understand your thinking process")
3. ✅ **Optional participation**: Allow opting out without affecting study access
4. ✅ **Data retention policy**: State how long audio is kept and when it's deleted
5. ✅ **Data access**: Explain who can access recordings (researchers only)

**Sample Consent Text:**
> "With your permission, we would like to record your voice during the card sorting step to better understand your decision-making process. This recording is:
> - Optional (you can decline and still complete the study)
> - Used solely for research purposes
> - Accessible only to the research team
> - Deleted after [X months/years] or upon your request
>
> [ ] I consent to audio recording during the study"

---

### 5.2 GDPR Compliance

**Requirements:**
1. ✅ **Lawful basis**: Consent (Art. 6.1.a) or legitimate interest (Art. 6.1.f)
2. ✅ **Purpose limitation**: Only use for stated research purposes
3. ✅ **Data minimization**: Only record during fine sort, not entire session
4. ✅ **Storage limitation**: Delete after retention period
5. ✅ **Right to erasure**: Provide deletion mechanism
6. ✅ **Data portability**: Allow participant to download their recording
7. ✅ **Security**: Encrypt at rest and in transit (S3 provides this)

**Implementation:**
- Add `audio_consent: bool` field to Participant model
- Add `audio_deleted_at: datetime | None` for audit trail
- Implement `/api/participants/{session_token}/delete-audio` endpoint
- Use HTTPS for all transfers (already in place)
- Enable S3 server-side encryption (SSE-S3 or SSE-KMS)

---

### 5.3 Data Security

**Encryption:**
- ✅ **In transit**: HTTPS (TLS 1.2+) - already enforced
- ✅ **At rest**: S3 SSE-S3 (AES-256) - enable in bucket settings
- ✅ **Presigned URLs**: Time-limited (1 hour for upload, 24 hours for download)

**Access Control:**
- Only authenticated admin/researchers can download recordings
- No public access to S3 bucket
- Use IAM roles with least privilege principle
- Audit logs for all access (S3 access logging)

**Anonymization:**
- Store audio separately from identifiable metadata
- Use `participant_id` or hash as filename, not names/emails
- Example filename: `audio/1234/finesort_2026-01-16_abcdef.webm`

---

## 6. User Experience Design

### 6.1 Recording Indicator

**Visual Design:**
```
┌────────────────────────────────────────┐
│  🔴 Recording  02:34  [Pause] [Stop]  │  ← Compact top bar
└────────────────────────────────────────┘
```

**or**

```
┌─────────────────────────────────────────────┐
│  Grid Panel                      🔴 02:34   │  ← Minimal indicator
└─────────────────────────────────────────────┘
```

**Preferred:** Minimal red dot + timer in top-right, with pause/stop in validation footer.

---

### 6.2 Permission Request Flow

**Step-by-Step UX:**

1. **Before Fine Sort Start:**
   ```
   ┌──────────────────────────────────────────┐
   │  🎙️ Voice Recording (Optional)           │
   │                                           │
   │  We'd like to record your voice during   │
   │  the sorting to understand your thought  │
   │  process. You can decline or pause at    │
   │  any time.                                │
   │                                           │
   │  [Decline]  [Allow Recording] ✓          │
   └──────────────────────────────────────────┘
   ```

2. **If Permission Denied:**
   ```
   ┌──────────────────────────────────────────┐
   │  ⚠️ Microphone Access Blocked             │
   │                                           │
   │  To enable recording:                     │
   │  1. Click the 🔒 icon in your address bar │
   │  2. Allow microphone access               │
   │  3. Refresh this page                     │
   │                                           │
   │  [Continue Without Recording]             │
   └──────────────────────────────────────────┘
   ```

3. **During Recording:**
   - Subtle pulsing animation on red dot
   - Live timer (00:00 → MM:SS)
   - Clear pause/resume/stop controls

4. **After Recording:**
   ```
   ✅ Recording saved (3.2 MB, 12:34 duration)
   ```

---

### 6.3 Mobile Considerations

**iOS Safari Specifics:**
- ✅ MediaRecorder supported (iOS 14.5+)
- ⚠️ Must use MP4/AAC (not WebM/Opus)
- ⚠️ Stops recording when tab backgrounded (use Page Visibility API)
- ⚠️ Silent Mode switch may mute microphone (warn user)

**Android Chrome:**
- ✅ Full WebM/Opus support
- ✅ Background recording works (with Wake Lock API if needed)
- ✅ Better compression than iOS

**Responsive Design:**
- Move recording controls to bottom on mobile (thumb-reachable)
- Larger tap targets (44×44 px minimum)
- Toast notifications for status changes

---

## 7. Implementation Roadmap

### Phase 1: MVP (2-3 weeks)
1. ✅ Create `useAudioRecorder` hook
2. ✅ Integrate into FineSortPage with start/stop controls
3. ✅ Add audio consent to consent form
4. ✅ Implement local file storage (filesystem) for backend
5. ✅ Add audio metadata fields to Participant model
6. ✅ Upload audio to backend on submission
7. ✅ Basic admin UI to download recordings
8. ✅ E2E tests for recording flow

**Files to Modify:**
- `frontend/src/hooks/useAudioRecorder.ts` (new)
- `frontend/src/pages/FineSortPage.tsx`
- `frontend/src/components/AudioRecorder.tsx` (new)
- `frontend/src/store/useResponseStore.ts`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/routers/submissions.py`
- `backend/app/routers/admin/exports.py`

### Phase 2: Production-Ready (1-2 weeks)
1. ✅ Implement S3-compatible storage
2. ✅ Presigned URL upload flow
3. ✅ Chunked recording with IndexedDB recovery
4. ✅ Network retry with exponential backoff
5. ✅ Page visibility auto-pause
6. ✅ BeforeUnload warning
7. ✅ Progressive upload during post-sort
8. ✅ Admin download interface with presigned URLs

### Phase 3: Optimization (1 week)
1. ✅ Auto-pause during idle periods
2. ✅ Audio waveform visualization (optional)
3. ✅ Compression settings per study
4. ✅ Analytics (recording durations, success rates)
5. ✅ GDPR delete endpoint

---

## 8. Alternative Approaches Considered

### 8.1 Third-Party Services

**Options:**
- **AssemblyAI, Deepgram**: Transcription APIs (not needed for raw audio)
- **Twilio Voice**: Over-engineered for this use case
- **Agora.io**: Real-time communication (not relevant)

**Verdict:** ❌ Not recommended. MediaRecorder API is simpler, free, and sufficient.

---

### 8.2 WebRTC Recording

**Pros:**
- More control over audio stream
- Can apply filters/effects

**Cons:**
- More complex setup
- Redundant when MediaRecorder exists

**Verdict:** ❌ Not necessary. MediaRecorder is the right tool.

---

### 8.3 Server-Side Recording

**Approach:** Stream audio to backend via WebSocket, record server-side

**Pros:**
- No client-side storage concerns
- Server can process in real-time

**Cons:**
- Requires constant network connection
- Higher bandwidth usage
- More complex infrastructure
- Increased latency

**Verdict:** ❌ Not recommended. Client-side recording with post-upload is simpler and more resilient.

---

## 9. Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| User denies microphone permission | High | Medium | Make optional, provide clear instructions |
| Browser incompatibility | Low | High | Feature detection, graceful degradation, polyfills |
| Large file sizes | Low | Medium | Use Opus codec (32 kbps), 16kHz sample rate |
| Upload failure | Medium | High | Retry logic, IndexedDB backup, allow re-upload |
| Storage costs exceed budget | Low | Low | Monitor usage, implement quotas, compress aggressively |
| Privacy concerns | Medium | High | Clear consent, GDPR compliance, secure storage |
| Mobile tab backgrounding | High | Medium | Page Visibility API auto-pause, recovery mechanism |
| Memory leak on long sessions | Low | Medium | Chunked recording, periodic garbage collection |

**Overall Risk Level:** LOW to MEDIUM
**Recommendation:** Proceed with implementation, prioritize resilience and privacy.

---

## 10. Testing Strategy

### 10.1 Unit Tests
- `useAudioRecorder` hook behavior
- Permission state management
- Blob chunking and merging
- Upload retry logic

### 10.2 Integration Tests
- Full recording → upload → storage flow
- Permission denial handling
- Network interruption recovery
- Page visibility auto-pause

### 10.3 E2E Tests (Playwright)
```typescript
test('should record audio during fine sort', async ({ page, context }) => {
  // Grant microphone permission
  await context.grantPermissions(['microphone']);

  await page.goto('/study/test-study/fine-sort');

  // Start recording
  await page.click('[data-testid="start-recording"]');
  await expect(page.locator('[data-testid="recording-indicator"]')).toBeVisible();

  // Perform some card placements
  await page.dragAndDrop('[data-card-id="1"]', '[data-slot="0-0"]');

  // Wait a bit
  await page.waitForTimeout(3000);

  // Stop recording
  await page.click('[data-testid="stop-recording"]');

  // Verify recording exists
  const hasRecording = await page.evaluate(() => {
    return window.localStorage.getItem('audio-metadata') !== null;
  });
  expect(hasRecording).toBe(true);
});
```

### 10.4 Manual Testing Checklist
- [ ] Desktop Chrome recording
- [ ] Desktop Firefox recording
- [ ] Desktop Safari recording
- [ ] Mobile iOS Safari recording (MP4/AAC)
- [ ] Mobile Android Chrome recording (WebM/Opus)
- [ ] Permission denial flow
- [ ] Tab backgrounding during recording
- [ ] Network interruption during upload
- [ ] Page refresh during recording (recovery)
- [ ] File size validation (should be ~2-5 MB for 10 min)
- [ ] Audio playback quality check
- [ ] Admin download interface

---

## 11. Recommended Dependencies

**Frontend:**
```json
{
  "devDependencies": {
    "@types/dom-mediacapture-record": "^1.0.16"
  }
}
```
(TypeScript types for MediaRecorder)

**Backend:**
```toml
# pyproject.toml
[project]
dependencies = [
    "boto3>=1.34.0",  # AWS SDK for S3
    "python-multipart>=0.0.6"  # For file uploads if needed
]
```

**Optional (Future):**
- `idb` (npm): Promise-based IndexedDB wrapper
- `wavesurfer.js` (npm): Audio waveform visualization

---

## 12. Cost-Benefit Analysis

### Benefits
1. **Research Value:** Captures verbal think-aloud protocols (gold standard in Q-methodology)
2. **Richer Data:** Complements quantitative placements with qualitative insights
3. **Participant Engagement:** May increase thoughtfulness during sorting
4. **Replay Capability:** Researchers can review decision-making process

### Costs
1. **Development Time:** ~4-6 weeks (MVP + production-ready + testing)
2. **Storage Costs:** ~$0.34/month per 1,000 participants (negligible)
3. **Bandwidth Costs:** ~$0.27/month per 1,000 participants (negligible)
4. **Maintenance Burden:** Low (mature APIs, minimal ongoing work)

### ROI
- **High value for qualitative research studies**
- **Low technical and financial cost**
- **Aligns with Q-methodology best practices**

**Verdict:** ✅ Excellent ROI. Recommend implementation.

---

## 13. Final Recommendations

### ✅ DO
1. Implement using MediaRecorder API (native, simple, well-supported)
2. Use S3-compatible storage (MinIO for self-hosted, AWS S3 for cloud)
3. Make recording optional with clear consent
4. Implement chunked recording for resilience
5. Use presigned URLs for direct browser → S3 upload
6. Add IndexedDB recovery for crash scenarios
7. Test thoroughly on iOS Safari (different codec)
8. Provide graceful degradation if audio fails
9. Monitor storage usage and implement quotas

### ❌ DON'T
1. Store audio in PostgreSQL (BYTEA or LO)
2. Use third-party recording services (over-engineered)
3. Require audio recording (make it optional)
4. Skip permission request UX (bad user experience)
5. Upload large files through backend (use presigned URLs)
6. Ignore mobile browser differences (test iOS vs Android)
7. Forget GDPR compliance (add consent + delete endpoints)

---

## 14. Conclusion

Implementing an audio recorder for the fine sort step is **technically feasible** and **highly recommended**. The MediaRecorder API is mature, browser support is excellent, and the integration points in the current architecture are clear. With careful attention to resilience, privacy, and user experience, this feature can be delivered in 4-6 weeks with minimal ongoing costs.

**Key Success Factors:**
1. Chunked recording with IndexedDB recovery
2. S3-compatible storage with presigned URLs
3. Clear consent and optional participation
4. Thorough testing on mobile devices (especially iOS)
5. Graceful degradation if audio fails

**Next Steps:**
1. Review this assessment with the team
2. Decide on storage backend (MinIO vs AWS S3)
3. Draft consent form updates for legal review
4. Create implementation tickets based on Phase 1-3 roadmap
5. Set up dev/staging S3 buckets for testing

**Estimated Total Effort:** 4-6 weeks (1 developer)
**Risk Level:** LOW to MEDIUM
**Recommendation:** ✅ **PROCEED with implementation**

---

## Appendix A: Code Examples

### A.1 Complete useAudioRecorder Hook

```typescript
// frontend/src/hooks/useAudioRecorder.ts
import { useState, useRef, useCallback, useEffect } from 'react';

interface AudioRecorderOptions {
  mimeType?: string;
  audioBitsPerSecond?: number;
  sampleRate?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  onChunk?: (blob: Blob) => void;
  onError?: (error: Error) => void;
}

export function useAudioRecorder(options: AudioRecorderOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: options.echoCancellation ?? true,
          noiseSuppression: options.noiseSuppression ?? true,
          sampleRate: options.sampleRate ?? 16000,
        },
      });

      // Detect supported MIME type
      let mimeType = options.mimeType;
      if (!mimeType) {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else {
          mimeType = 'audio/webm';
        }
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: options.audioBitsPerSecond ?? 32000,
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          options.onChunk?.(event.data);
        }
      };

      recorder.onerror = (event) => {
        const error = new Error(`Recording error: ${event}`);
        setError(error);
        options.onError?.(error);
      };

      recorder.onstop = () => {
        setIsRecording(false);
        setIsPaused(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      recorder.start(5000); // 5-second chunks
      mediaRecorderRef.current = recorder;
      streamRef.current = stream;
      setIsRecording(true);
      setError(null);
      chunksRef.current = [];

      // Start timer
      timerRef.current = window.setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options.onError?.(error);
      cleanup();
    }
  }, [options, cleanup]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      cleanup();
    }
  }, [isRecording, cleanup]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording, isPaused]);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = window.setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
  }, [isRecording, isPaused]);

  // Get final audio blob
  const getAudioBlob = useCallback(() => {
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
    return new Blob(chunksRef.current, { type: mimeType });
  }, []);

  // Clear recording
  const clearRecording = useCallback(() => {
    chunksRef.current = [];
    setDuration(0);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isRecording,
    isPaused,
    duration,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    getAudioBlob,
    clearRecording,
  };
}
```

### A.2 Backend API Endpoints

```python
# backend/app/routers/audio.py (new file)
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
import logging

from app.database import get_db
from app.services.audio_service import AudioService
from app.dependencies import get_current_user_from_session

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/upload-url")
async def get_upload_url(
    session_token: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Generate presigned URL for audio upload."""
    participant = await StudyService.get_participant_by_token(db, session_token)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    if not participant.audio_consent:
        raise HTTPException(
            status_code=403,
            detail="Audio recording not consented"
        )

    filename = f"finesort_{participant.id}_{int(time.time())}.webm"
    upload_url = AudioService.generate_upload_url(participant.id, filename)

    return {
        "upload_url": upload_url,
        "filename": filename
    }


@router.post("/confirm-upload")
async def confirm_upload(
    session_token: UUID,
    filename: str,
    file_size: int,
    duration: int,
    mime_type: str,
    db: AsyncSession = Depends(get_db)
):
    """Confirm successful upload and update participant metadata."""
    participant = await StudyService.get_participant_by_token(db, session_token)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant.audio_recording_url = filename
    participant.audio_file_size_bytes = file_size
    participant.audio_duration_seconds = duration
    participant.audio_mime_type = mime_type

    await db.commit()

    return {"status": "success"}


@router.delete("/{session_token}")
async def delete_audio(
    session_token: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete participant's audio recording (GDPR right to erasure)."""
    participant = await StudyService.get_participant_by_token(db, session_token)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    if participant.audio_recording_url:
        # Delete from S3
        AudioService.delete_file(participant.id, participant.audio_recording_url)

        # Update database
        participant.audio_recording_url = None
        participant.audio_deleted_at = datetime.now(timezone.utc)
        await db.commit()

    return {"status": "deleted"}
```

---

**Document Version:** 1.0
**Last Updated:** 2026-01-16
**Author:** Technical Assessment
**Status:** Ready for Review
