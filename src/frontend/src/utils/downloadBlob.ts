/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Hand a URL to the browser as a file download.
 *
 * The anchor is attached to the document before the click — some
 * browsers ignore a click on a detached anchor — and removed right after.
 * For a presigned or data URL there is nothing else to release.
 */
export function downloadUrl(url: string, filename: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

/**
 * Hand a Blob to the browser as a file download, then revoke its object
 * URL so the Blob can be collected. Six call sites used to carry their
 * own copy of these lines; this is the one.
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    try {
        downloadUrl(url, filename);
    } finally {
        URL.revokeObjectURL(url);
    }
}
