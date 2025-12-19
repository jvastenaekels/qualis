/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi } from 'vitest';
import i18n from '../i18n';
import { applyStudyOverrides, resetBaseLocales } from './i18nOverrides';

// Mock the locales to keep tests stable and fast
vi.mock('../locales/en.json', () => ({
  default: {
    common: {
      agree: 'Agree',
      disagree: 'Disagree'
    }
  }
}));

vi.mock('../locales/fr.json', () => ({
  default: {
    common: {
      agree: "D'accord",
      disagree: 'Pas d\'accord'
    }
  }
}));

vi.mock('../locales/fi.json', () => ({
  default: {
    common: {
      agree: 'Samaa mieltä',
      disagree: 'Eri mieltä'
    }
  }
}));

// Mock i18next functions we are using
vi.spyOn(i18n, 'addResourceBundle');

describe('i18nOverrides utility', () => {
  it('should apply study overrides successfully', () => {
    const labels = {
      'common.agree': 'Approuve',
      'common.disagree': 'Désapprouve'
    };

    applyStudyOverrides('fr', labels);

    expect(i18n.addResourceBundle).toHaveBeenCalledWith(
      'fr',
      'translation',
      labels,
      true,
      true
    );
  });

  it('should do nothing if labels are empty', () => {
    vi.clearAllMocks();
    
    applyStudyOverrides('en', {});
    applyStudyOverrides('en', undefined as any);

    expect(i18n.addResourceBundle).not.toHaveBeenCalled();
  });

  it('should reset base locales to original state', () => {
    vi.clearAllMocks();

    resetBaseLocales();

    // Check once for each supported language
    expect(i18n.addResourceBundle).toHaveBeenCalledWith(
      'en',
      'translation',
      expect.any(Object),
      true,
      true
    );
    expect(i18n.addResourceBundle).toHaveBeenCalledWith(
      'fr',
      'translation',
      expect.any(Object),
      true,
      true
    );
    expect(i18n.addResourceBundle).toHaveBeenCalledWith(
      'fi',
      'translation',
      expect.any(Object),
      true,
      true
    );
  });
});
