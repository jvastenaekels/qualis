/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import ErrorPage from '../pages/ErrorPage';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    // Deployment Handling: Failed to fetch dynamically imported module
    // This happens when a new version is deployed and old chunks are 404ing.
    // We force a hard reload to get the new index.html and assets.
    if (error.message.includes('Failed to fetch dynamically imported module') || 
        error.message.includes('Importing a module script failed')) {
            console.warn('Chunk load error detected. Reloading...');
            // Prevent infinite loops if reload doesn't fix it (e.g. persistent network issue)
            const storageKey = 'chunk_load_error_reload';
            const lastReload = sessionStorage.getItem(storageKey);
            const now = Date.now();

            if (!lastReload || (now - parseInt(lastReload) > 10000)) {
                sessionStorage.setItem(storageKey, now.toString());
                window.location.reload();
                return;
            }
    }
  }

  public render() {
    if (this.state.hasError) {
      return <ErrorPage error={this.state.error} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
