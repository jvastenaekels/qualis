# Study Data Visualization Overhaul Plan

**Project:** Open-Q Admin UI Enhancement
**Date:** 2026-01-15
**Branch:** `claude/improve-study-visualization-y9qUF`

---

## Executive Summary

This plan outlines a comprehensive overhaul of study data visualization in the Open-Q admin UI. Currently, the admin interface relies primarily on tables, basic metric cards, and progress bars. While functional, it lacks advanced visual analytics that would help researchers quickly identify patterns, trends, and insights in their study data.

**Key Goals:**
1. Implement time-series visualizations for tracking participation trends
2. Add distribution charts for duration, scores, and demographic analysis
3. Create interactive statement analysis visualizations
4. Enhance recruitment analytics with funnel and cohort visualizations
5. Build a dedicated Analytics dashboard
6. Ensure mobile responsiveness and accessibility
7. Leverage the already-installed `recharts` library (v3.6.0)

---

## Current State Analysis

### Existing Implementation

**Location:** `/home/user/open-q/frontend/src/`

#### Current Pages & Components:
1. **StudyOverviewPage** (`pages/admin/StudyOverviewPage.tsx`)
   - 3 metric cards (Sample Size, Completion Rate, Median Duration)
   - Recent activity list (participants)
   - Basic progress bar for completion rate
   - Status control component

2. **RecruitmentPage** (`pages/admin/RecruitmentPage.tsx`)
   - 4 metric cards (Total Links, Started, Submitted, Success Rate)
   - Recruitment links table with usage progress bars
   - QR code generation

3. **InteractiveDataView** (`components/admin/dashboard/InteractiveDataView.tsx`)
   - Participant data table (@tanstack/react-table)
   - Global search/filter
   - Sortable columns
   - 3 consent metric cards (Email, Newsletter, Interview)

4. **ParticipantDetailContent** (`components/admin/dashboard/ParticipantDetailContent.tsx`)
   - Q-Sort reconstruction visualization
   - Score piles display
   - Survey and debrief data

### Current Data Available

**Study Statistics (StudyStatsRead):**
- `started_count`: Total participants who began
- `completed_count`: Total completed participants
- `completion_rate`: Percentage completion
- `median_duration_seconds`: Median time to complete
- `device_breakdown`: Object mapping device types to counts

**Participant Data (DumpParticipant):**
- `id`: Unique identifier
- `duration_seconds`: Time spent
- `scores`: Array of Q-sort scores
- `placements`: Statement placements
- `presort`: Survey responses
- `postsort`: Debrief data, consent flags, comments
- `language`: Language used
- `is_discarded`: Discard status
- `discard_reason`: Reason for discard

**Recruitment Data (RecruitmentLinkRead):**
- `token`: Link identifier
- `type`: public/individual/limited
- `usage_count`: Number of completions
- `start_count`: Number of initiations
- `capacity`: Max usage (if applicable)
- `is_active`: Active status

**Temporal Data:**
- `created_at`: Participant start timestamp
- `submitted_at`: Completion timestamp
- `study.created_at`: Study creation date
- `study.updated_at`: Last study update

### Technology Stack

**Installed Libraries:**
- ✅ `recharts` v3.6.0 - **NOT CURRENTLY USED** (primary visualization library)
- ✅ `@tanstack/react-table` v8.21.3 - Table management
- ✅ `framer-motion` v12.23.26 - Animations
- ✅ `lucide-react` v0.562.0 - Icons
- ✅ `@radix-ui/*` - UI primitives
- ✅ `tailwindcss` v3.4.1 - Styling
- ✅ `date-fns` - Date formatting

**Design System:**
- Card-based layouts with shadows and rounded corners
- Color palette: indigo (primary), emerald (success), amber (warning), red (error), slate (neutral)
- Responsive breakpoints: sm, md, lg
- Font: font-mono for data, font-black for headings

### Limitations Identified

1. **No Time-Series Visualizations**
   - Cannot see participation trends over time
   - No understanding of peak submission periods
   - No recruitment campaign effectiveness tracking

2. **No Distribution Charts**
   - Duration distribution is invisible (only median shown)
   - Cannot identify outliers or patterns
   - No statement score distributions
   - Device breakdown is just a number object

3. **Limited Recruitment Analytics**
   - No conversion funnel visualization
   - No cohort comparison
   - No link performance trends

4. **No Statement-Level Analytics**
   - Cannot see which statements are most controversial
   - No consensus/disagreement visualization
   - No statement correlation analysis

5. **No Comparative Visualizations**
   - Cannot compare across languages
   - Cannot compare recruitment channels
   - Cannot see before/after trends

6. **Mobile Responsiveness**
   - Tables become difficult on small screens
   - Charts would need responsive design

---

## Proposed Enhancements

### Phase 1: Time-Series Visualizations (Core Analytics)

#### 1.1 Submissions Timeline
**Component:** `SubmissionsTimelineChart.tsx`
**Location:** `/components/admin/dashboard/charts/`

**Description:**
Line chart showing participant submissions over time with start vs. completion comparison.

**Features:**
- Dual-line chart: Started (amber) vs. Completed (emerald)
- X-axis: Time (by day/week/month based on data range)
- Y-axis: Count of participants
- Interactive tooltips showing exact counts
- Time range selector (7d, 30d, 90d, All)
- Responsive design with mobile-friendly legend

**Data Source:**
- Parse `created_at` and `submitted_at` from participants
- Aggregate by time bucket
- Calculate cumulative and per-period counts

**Recharts Components:**
```typescript
<LineChart>
  <Line dataKey="started" stroke="#f59e0b" />
  <Line dataKey="completed" stroke="#10b981" />
  <XAxis dataKey="date" />
  <YAxis />
  <Tooltip />
  <Legend />
  <CartesianGrid />
</LineChart>
```

**Integration Point:**
- StudyOverviewPage (below status control)
- New Analytics dashboard

---

#### 1.2 Completion Rate Trend
**Component:** `CompletionRateTrendChart.tsx`

**Description:**
Area chart showing completion rate evolution over time.

**Features:**
- Single area chart with gradient fill
- Shows how completion rate changes as study progresses
- Benchmark line for target completion rate (configurable)
- Trend indicator (improving/declining)

**Data Source:**
- Rolling calculation of completion rate over time
- Compare started vs completed in time windows

**Integration Point:**
- StudyOverviewPage (metrics section)
- Analytics dashboard

---

### Phase 2: Distribution Visualizations

#### 2.1 Duration Distribution Histogram
**Component:** `DurationHistogramChart.tsx`

**Description:**
Histogram showing distribution of participant completion times.

**Features:**
- Bar chart with time buckets (0-5m, 5-10m, 10-15m, etc.)
- Color coding for suspect durations (< 2 minutes in red/amber)
- Median line overlay
- Mean and mode indicators
- Outlier highlighting

**Data Source:**
- `duration_seconds` from all completed participants
- Exclude discarded participants (optional toggle)

**Recharts Components:**
```typescript
<BarChart>
  <Bar dataKey="count" fill="#4f46e5" />
  <XAxis dataKey="timeBucket" />
  <YAxis />
  <Tooltip />
  <ReferenceLine y={median} stroke="#ef4444" label="Median" />
</BarChart>
```

**Integration Point:**
- New "Analytics" tab/page
- Data exports page (above participant table)

---

#### 2.2 Device Breakdown Chart
**Component:** `DeviceBreakdownChart.tsx`

**Description:**
Pie or donut chart showing device distribution.

**Features:**
- Donut chart with percentage labels
- Color-coded segments (desktop, mobile, tablet)
- Interactive legend with counts
- Responsive labels

**Data Source:**
- `device_breakdown` from StudyStatsRead
- Parse and visualize object mapping

**Recharts Components:**
```typescript
<PieChart>
  <Pie
    data={deviceData}
    dataKey="count"
    nameKey="device"
    innerRadius={60}
    outerRadius={80}
  >
    {deviceData.map((entry, index) => (
      <Cell key={index} fill={COLORS[index % COLORS.length]} />
    ))}
  </Pie>
  <Tooltip />
  <Legend />
</PieChart>
```

**Integration Point:**
- StudyOverviewPage (below metrics)
- Analytics dashboard

---

#### 2.3 Score Distribution Heatmap
**Component:** `ScoreDistributionHeatmap.tsx`

**Description:**
Heatmap showing how many participants placed statements at each score level.

**Features:**
- Grid visualization: Statements (Y-axis) × Score Values (X-axis)
- Color intensity indicates frequency
- Hover shows exact count
- Sortable by consensus/controversy
- Filter by statement category (if available)

**Data Source:**
- Parse `scores` array from all participants
- Aggregate statement-score combinations
- Calculate distribution percentages

**Recharts Alternative:**
Use custom component with Tailwind gradients (recharts doesn't have built-in heatmap)

**Integration Point:**
- New "Statement Analysis" page/tab
- ParticipantDetailContent (for comparison)

---

### Phase 3: Recruitment Analytics Enhancement

#### 3.1 Recruitment Funnel Chart
**Component:** `RecruitmentFunnelChart.tsx`

**Description:**
Funnel visualization showing conversion from link click → started → completed.

**Features:**
- Stepped funnel with percentage dropoff at each stage
- Color gradient from amber → emerald
- Conversion rate labels between stages
- Comparison across recruitment link types

**Data Source:**
- `start_count` and `usage_count` from recruitment links
- Calculate dropoff percentages

**Recharts Alternative:**
Use custom SVG funnel component (recharts doesn't have funnel chart)
Or use horizontal bar chart with decreasing widths

**Integration Point:**
- RecruitmentPage (below stats cards)
- Analytics dashboard

---

#### 3.2 Link Performance Comparison
**Component:** `LinkPerformanceChart.tsx`

**Description:**
Bar chart comparing recruitment links by conversion rate and volume.

**Features:**
- Grouped/stacked bar chart
- X-axis: Link names/tokens
- Y-axis: Count (started, submitted)
- Color coding by link type
- Sort by conversion rate or volume
- Show only top N links (configurable)

**Data Source:**
- Recruitment links with `start_count` and `usage_count`
- Calculate conversion rates

**Recharts Components:**
```typescript
<BarChart>
  <Bar dataKey="started" fill="#f59e0b" stackId="a" />
  <Bar dataKey="completed" fill="#10b981" stackId="a" />
  <XAxis dataKey="linkName" />
  <YAxis />
  <Tooltip />
  <Legend />
</BarChart>
```

**Integration Point:**
- RecruitmentPage (new section)

---

### Phase 4: Statement-Level Analytics

#### 4.1 Statement Consensus Chart
**Component:** `StatementConsensusChart.tsx`

**Description:**
Bar chart showing consensus score for each statement (lower variance = higher consensus).

**Features:**
- Horizontal bars showing variance/standard deviation
- Sorted by consensus (least controversial first)
- Color coding: Green (consensus) → Red (controversial)
- Click to drill down to individual statement distribution

**Data Source:**
- Calculate standard deviation of scores for each statement
- Parse `scores` array across all participants

**Integration Point:**
- New "Statement Analysis" page

---

#### 4.2 Statement Sentiment Distribution
**Component:** `StatementSentimentChart.tsx`

**Description:**
For each statement, show distribution of positive/neutral/negative placements.

**Features:**
- Diverging stacked bar chart
- Center line represents neutral scores
- Left side: negative scores (red gradient)
- Right side: positive scores (green gradient)
- Sort by overall sentiment

**Data Source:**
- Parse `scores` and `grid_config` to determine score ranges
- Aggregate by statement

**Integration Point:**
- Statement Analysis page
- Study Design page (for feedback)

---

### Phase 5: New Analytics Dashboard

#### 5.1 Create Analytics Page
**Component:** `AnalyticsPage.tsx`
**Location:** `/pages/admin/AnalyticsPage.tsx`
**Route:** `/admin/studies/:slug/analytics`

**Description:**
Dedicated page for comprehensive study analytics and visualizations.

**Layout Structure:**
```
┌─────────────────────────────────────────┐
│ Page Header: "Analytics"                │
├─────────────────────────────────────────┤
│ Time Range Selector (7d/30d/90d/All)   │
├─────────────────────────────────────────┤
│ ┌───────────────────┬─────────────────┐ │
│ │ Submissions       │ Completion      │ │
│ │ Timeline          │ Rate Trend      │ │
│ │ (Line Chart)      │ (Area Chart)    │ │
│ └───────────────────┴─────────────────┘ │
├─────────────────────────────────────────┤
│ ┌───────────────────┬─────────────────┐ │
│ │ Duration          │ Device          │ │
│ │ Histogram         │ Breakdown       │ │
│ │ (Bar Chart)       │ (Pie Chart)     │ │
│ └───────────────────┴─────────────────┘ │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ Recruitment Funnel                  │ │
│ │ (Funnel Chart)                      │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ Quick Actions:                          │
│ [Export Analytics] [Schedule Report]    │
└─────────────────────────────────────────┘
```

**Features:**
- All phase 1-3 charts in one consolidated view
- Export analytics as PDF/PNG
- Print-friendly layout
- Shareable dashboard URL
- Auto-refresh data (optional)

**Navigation:**
Add "Analytics" to AppSidebar navigation

---

#### 5.2 Statement Analysis Page
**Component:** `StatementAnalysisPage.tsx`
**Location:** `/pages/admin/StatementAnalysisPage.tsx`
**Route:** `/admin/studies/:slug/statements`

**Description:**
Deep dive into statement-level data and patterns.

**Layout Structure:**
```
┌─────────────────────────────────────────┐
│ Page Header: "Statement Analysis"      │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ Score Distribution Heatmap          │ │
│ │ (Custom Grid Visualization)         │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ Statement Consensus Ranking         │ │
│ │ (Horizontal Bar Chart)              │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ Statement Sentiment Distribution    │ │
│ │ (Diverging Stacked Bar Chart)       │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ Statement Selector (Dropdown)           │
│ Individual Statement Deep Dive          │
│ - Distribution chart                    │
│ - Common placements                     │
│ - Participant comments (if available)   │
└─────────────────────────────────────────┘
```

**Features:**
- Filter by statement category
- Sort by various metrics (consensus, sentiment, controversy)
- Export statement report
- Compare statements side-by-side

**Navigation:**
Add "Statements" to AppSidebar (below "Data")

---

### Phase 6: Interactive Features & UX Enhancements

#### 6.1 Chart Interaction Patterns

**Tooltip Enhancements:**
- Rich tooltips with formatted data
- Show percentages and absolute numbers
- Include contextual information (e.g., "15% above average")

**Click-Through Navigation:**
- Click on chart data point → drill down to detailed view
- Click on time period → filter to that period
- Click on statement → open statement detail modal

**Zoom & Pan:**
- Enable zoom on timeline charts for detailed inspection
- Pan to navigate large datasets
- Reset zoom button

**Legend Interaction:**
- Click legend to toggle series visibility
- Hover to highlight corresponding data

#### 6.2 Responsive Design

**Mobile Adaptations:**
- Stack charts vertically on small screens
- Use simpler chart types on mobile (bar instead of line)
- Collapsible sections for better mobile UX
- Touch-friendly tooltips
- Horizontal scroll for tables on mobile

**Breakpoint Strategy:**
- `sm` (640px): Single column, simplified charts
- `md` (768px): Two-column grid, full features
- `lg` (1024px): Three-column where appropriate
- `xl` (1280px): Full desktop experience

#### 6.3 Loading States

**Skeleton Loaders:**
- Chart skeleton with shimmer effect
- Preserve layout during loading
- Smooth transition when data loads

**Error Handling:**
- Graceful degradation if chart library fails
- Fallback to table view
- Clear error messages with retry button

**Empty States:**
- Meaningful empty state illustrations
- Guidance on how to collect data
- Preview with sample data option

---

### Phase 7: Performance & Optimization

#### 7.1 Data Processing

**Client-Side Optimization:**
- Memoize expensive calculations (useMemo)
- Debounce filter/search inputs
- Virtual scrolling for large datasets
- Lazy load chart components

**Data Aggregation:**
- Pre-aggregate data on backend where possible
- Use web workers for heavy client-side processing
- Cache processed data in React Query

#### 7.2 Chart Rendering

**Recharts Optimization:**
- Limit data points on charts (sample if > 1000 points)
- Use `ResponsiveContainer` for responsive charts
- Disable animations on large datasets
- Use `isAnimationActive={false}` for performance-critical scenarios

#### 7.3 Bundle Size

**Code Splitting:**
- Lazy load analytics pages
- Dynamic import for recharts components
- Separate bundle for heavy visualizations

**Tree Shaking:**
- Import only needed recharts components
- Use named imports from recharts
- Avoid importing entire library

---

## Implementation Strategy

### Step-by-Step Implementation

#### Sprint 1: Foundation (Week 1-2)
1. **Create chart components directory structure**
   ```
   /components/admin/dashboard/charts/
   ├── SubmissionsTimelineChart.tsx
   ├── CompletionRateTrendChart.tsx
   ├── DurationHistogramChart.tsx
   ├── DeviceBreakdownChart.tsx
   └── index.ts
   ```

2. **Build base chart wrapper component**
   - `ChartContainer.tsx` - Wrapper with loading, error, empty states
   - Consistent styling and theming
   - Responsive behavior

3. **Implement Phase 1 charts**
   - SubmissionsTimelineChart
   - CompletionRateTrendChart
   - Integrate into StudyOverviewPage

4. **Testing & refinement**
   - Test with various data sizes
   - Mobile responsiveness check
   - Performance profiling

#### Sprint 2: Distribution Charts (Week 3-4)
1. **Implement Phase 2 charts**
   - DurationHistogramChart
   - DeviceBreakdownChart
   - Add to appropriate pages

2. **Create Analytics page structure**
   - Page layout and routing
   - Navigation integration
   - Responsive grid system

3. **Testing & refinement**

#### Sprint 3: Recruitment & Statements (Week 5-6)
1. **Implement Phase 3 charts**
   - RecruitmentFunnelChart
   - LinkPerformanceChart
   - Integrate into RecruitmentPage

2. **Implement Phase 4 charts**
   - ScoreDistributionHeatmap
   - StatementConsensusChart
   - StatementSentimentChart

3. **Create Statement Analysis page**
   - Page structure and routing
   - Integration of statement charts

4. **Testing & refinement**

#### Sprint 4: Polish & Optimization (Week 7-8)
1. **Interactive features**
   - Click-through navigation
   - Advanced tooltips
   - Filter and time range controls

2. **Performance optimization**
   - Code splitting
   - Data caching
   - Chart rendering optimization

3. **Accessibility**
   - Keyboard navigation
   - Screen reader support
   - Color contrast validation
   - ARIA labels

4. **Documentation**
   - Component documentation
   - Usage examples
   - Admin guide for interpreting charts

5. **Comprehensive testing**
   - Cross-browser testing
   - Mobile device testing
   - Performance benchmarking
   - User acceptance testing

---

## Technical Specifications

### Component Architecture

#### Base Chart Component Pattern

```typescript
// components/admin/dashboard/charts/ChartContainer.tsx
interface ChartContainerProps {
  title: string;
  description?: string;
  isLoading?: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function ChartContainer({
  title,
  description,
  isLoading,
  error,
  isEmpty,
  emptyMessage,
  children,
  actions,
  className
}: ChartContainerProps) {
  if (isLoading) return <ChartSkeleton />;
  if (error) return <ChartError error={error} />;
  if (isEmpty) return <ChartEmpty message={emptyMessage} />;

  return (
    <Card className={cn('rounded-2xl shadow-sm border-none', className)}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">
            {title}
          </CardTitle>
          {description && (
            <CardDescription className="text-xs mt-1">
              {description}
            </CardDescription>
          )}
        </div>
        {actions}
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}
```

#### Example: Submissions Timeline Implementation

```typescript
// components/admin/dashboard/charts/SubmissionsTimelineChart.tsx
import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ChartContainer } from './ChartContainer';
import type { ParticipantRead } from '@/api/model';

interface SubmissionsTimelineChartProps {
  participants: ParticipantRead[];
  timeRange?: '7d' | '30d' | '90d' | 'all';
}

export function SubmissionsTimelineChart({
  participants,
  timeRange = '30d'
}: SubmissionsTimelineChartProps) {
  const chartData = useMemo(() => {
    // Group participants by date
    const dateMap = new Map<string, { started: number; completed: number }>();

    participants.forEach(p => {
      // Process started count
      const startDate = format(parseISO(p.created_at), 'yyyy-MM-dd');
      const existing = dateMap.get(startDate) || { started: 0, completed: 0 };
      existing.started += 1;
      dateMap.set(startDate, existing);

      // Process completed count
      if (p.submitted_at) {
        const completeDate = format(parseISO(p.submitted_at), 'yyyy-MM-dd');
        const existingComplete = dateMap.get(completeDate) || { started: 0, completed: 0 };
        existingComplete.completed += 1;
        dateMap.set(completeDate, existingComplete);
      }
    });

    // Convert to array and sort
    return Array.from(dateMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [participants, timeRange]);

  const isEmpty = chartData.length === 0;

  return (
    <ChartContainer
      title="Submissions Timeline"
      description="Track participant engagement over time"
      isEmpty={isEmpty}
      emptyMessage="No submission data available yet"
    >
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            stroke="#64748b"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#64748b"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, fontWeight: 600 }}
          />
          <Line
            type="monotone"
            dataKey="started"
            stroke="#f59e0b"
            strokeWidth={2}
            name="Started"
            dot={{ fill: '#f59e0b', r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="completed"
            stroke="#10b981"
            strokeWidth={2}
            name="Completed"
            dot={{ fill: '#10b981', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
```

### Data Transformation Utilities

```typescript
// lib/chartUtils.ts

import { parseISO, format, startOfDay, endOfDay, subDays } from 'date-fns';
import type { DumpParticipant, ParticipantRead } from '@/api/model';

/**
 * Group participants by date for timeline charts
 */
export function groupParticipantsByDate(
  participants: ParticipantRead[],
  timeRange: '7d' | '30d' | '90d' | 'all' = '30d'
) {
  const now = new Date();
  const startDate = timeRange === 'all'
    ? new Date(0)
    : subDays(now, parseInt(timeRange));

  const filtered = participants.filter(p =>
    parseISO(p.created_at) >= startDate
  );

  // Implementation details...
  return filtered;
}

/**
 * Calculate duration histogram buckets
 */
export function calculateDurationBuckets(
  participants: DumpParticipant[]
) {
  const buckets = [
    { range: '0-2m', min: 0, max: 120, count: 0, suspect: true },
    { range: '2-5m', min: 120, max: 300, count: 0, suspect: false },
    { range: '5-10m', min: 300, max: 600, count: 0, suspect: false },
    { range: '10-15m', min: 600, max: 900, count: 0, suspect: false },
    { range: '15-20m', min: 900, max: 1200, count: 0, suspect: false },
    { range: '20+m', min: 1200, max: Infinity, count: 0, suspect: false }
  ];

  participants.forEach(p => {
    if (p.duration_seconds !== null) {
      const bucket = buckets.find(b =>
        p.duration_seconds! >= b.min && p.duration_seconds! < b.max
      );
      if (bucket) bucket.count++;
    }
  });

  return buckets;
}

/**
 * Calculate statement score distributions
 */
export function calculateScoreDistributions(
  participants: DumpParticipant[],
  statementCount: number
) {
  const distributions = Array.from({ length: statementCount }, () =>
    new Map<number, number>()
  );

  participants.forEach(p => {
    p.scores.forEach((score, index) => {
      if (score !== null) {
        const dist = distributions[index];
        dist.set(score, (dist.get(score) || 0) + 1);
      }
    });
  });

  return distributions;
}

/**
 * Calculate statement consensus (lower std dev = higher consensus)
 */
export function calculateStatementConsensus(
  participants: DumpParticipant[],
  statementIndex: number
): { mean: number; stdDev: number; consensus: number } {
  const scores = participants
    .map(p => p.scores[statementIndex])
    .filter((s): s is number => s !== null);

  if (scores.length === 0) {
    return { mean: 0, stdDev: 0, consensus: 0 };
  }

  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  // Consensus score: inverse of std dev, normalized to 0-100
  const maxStdDev = 10; // Theoretical max based on typical Q-sort range
  const consensus = Math.max(0, 100 - (stdDev / maxStdDev) * 100);

  return { mean, stdDev, consensus };
}
```

### API Enhancements (Optional Backend Work)

If backend modifications are possible, consider adding these endpoints for better performance:

```python
# New endpoints to consider

GET /api/admin/studies/{slug}/analytics/timeline
# Returns pre-aggregated timeline data
Response: {
  "daily": [{"date": "2025-01-01", "started": 10, "completed": 8}, ...],
  "weekly": [...],
  "monthly": [...]
}

GET /api/admin/studies/{slug}/analytics/durations
# Returns duration statistics
Response: {
  "buckets": [{"range": "0-2m", "count": 5, "percentage": 10}, ...],
  "median": 600,
  "mean": 650,
  "percentiles": {"p25": 400, "p50": 600, "p75": 800, "p90": 1000}
}

GET /api/admin/studies/{slug}/analytics/statements
# Returns statement-level analytics
Response: {
  "statements": [
    {
      "id": 1,
      "code": "S1",
      "consensus": 85,
      "mean_score": 2.5,
      "std_dev": 1.2,
      "distribution": {"-3": 5, "-2": 10, ...}
    },
    ...
  ]
}

GET /api/admin/studies/{slug}/analytics/recruitment
# Returns recruitment funnel data
Response: {
  "overall": {"started": 100, "completed": 75, "conversion_rate": 0.75},
  "by_link": [...],
  "by_type": {...}
}
```

These endpoints would reduce client-side processing burden and improve performance, especially for studies with large datasets.

---

## Design System Integration

### Color Palette for Charts

```typescript
// lib/chartColors.ts

export const chartColors = {
  primary: {
    indigo: {
      DEFAULT: '#4f46e5',
      light: '#818cf8',
      lighter: '#a5b4fc',
      dark: '#3730a3'
    },
    emerald: {
      DEFAULT: '#10b981',
      light: '#34d399',
      lighter: '#6ee7b7',
      dark: '#059669'
    },
    amber: {
      DEFAULT: '#f59e0b',
      light: '#fbbf24',
      lighter: '#fcd34d',
      dark: '#d97706'
    },
    red: {
      DEFAULT: '#ef4444',
      light: '#f87171',
      lighter: '#fca5a5',
      dark: '#dc2626'
    }
  },

  semantic: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    neutral: '#64748b'
  },

  gradients: {
    positive: ['#10b981', '#34d399', '#6ee7b7'],
    negative: ['#ef4444', '#f87171', '#fca5a5'],
    neutral: ['#64748b', '#94a3b8', '#cbd5e1'],
    heatmap: ['#dbeafe', '#93c5fd', '#3b82f6', '#1e40af', '#1e3a8a']
  }
};

export const getChartColorByIndex = (index: number): string => {
  const colors = [
    chartColors.primary.indigo.DEFAULT,
    chartColors.primary.emerald.DEFAULT,
    chartColors.primary.amber.DEFAULT,
    chartColors.primary.red.DEFAULT,
    chartColors.semantic.info,
    chartColors.semantic.neutral
  ];
  return colors[index % colors.length];
};
```

### Typography & Spacing

```typescript
// Chart typography standards
export const chartStyles = {
  title: 'text-sm font-black uppercase tracking-wider text-slate-500',
  description: 'text-xs text-slate-400 font-medium',
  axisLabel: 'text-[11px] font-semibold text-slate-600',
  legendLabel: 'text-xs font-semibold text-slate-700',
  tooltipLabel: 'text-xs font-bold text-slate-900',
  tooltipValue: 'text-sm font-black text-indigo-600',

  spacing: {
    cardPadding: 'p-4 sm:p-6',
    chartMargin: { top: 20, right: 30, left: 20, bottom: 20 },
    gridGap: 'gap-4 md:gap-6'
  }
};
```

---

## Testing Strategy

### Unit Tests

```typescript
// __tests__/chartUtils.test.ts
import {
  groupParticipantsByDate,
  calculateDurationBuckets,
  calculateStatementConsensus
} from '@/lib/chartUtils';

describe('chartUtils', () => {
  describe('groupParticipantsByDate', () => {
    it('should group participants by creation date', () => {
      // Test implementation
    });

    it('should filter by time range', () => {
      // Test implementation
    });
  });

  describe('calculateDurationBuckets', () => {
    it('should correctly bucket durations', () => {
      // Test implementation
    });

    it('should flag suspect durations', () => {
      // Test implementation
    });
  });

  describe('calculateStatementConsensus', () => {
    it('should calculate correct consensus score', () => {
      // Test implementation
    });

    it('should handle empty data gracefully', () => {
      // Test implementation
    });
  });
});
```

### Component Tests

```typescript
// __tests__/SubmissionsTimelineChart.test.tsx
import { render, screen } from '@testing-library/react';
import { SubmissionsTimelineChart } from '@/components/admin/dashboard/charts';

describe('SubmissionsTimelineChart', () => {
  it('should render chart with data', () => {
    const mockParticipants = [/* mock data */];
    render(<SubmissionsTimelineChart participants={mockParticipants} />);
    expect(screen.getByText('Submissions Timeline')).toBeInTheDocument();
  });

  it('should show empty state when no data', () => {
    render(<SubmissionsTimelineChart participants={[]} />);
    expect(screen.getByText(/No submission data/i)).toBeInTheDocument();
  });

  it('should be responsive', () => {
    // Test responsive behavior
  });
});
```

### Integration Tests

```typescript
// __tests__/integration/AnalyticsPage.test.tsx
import { render, waitFor } from '@testing-library/react';
import { AnalyticsPage } from '@/pages/admin/AnalyticsPage';

describe('AnalyticsPage integration', () => {
  it('should load and display all charts', async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Submissions Timeline')).toBeInTheDocument();
      expect(screen.getByText('Duration Distribution')).toBeInTheDocument();
      expect(screen.getByText('Device Breakdown')).toBeInTheDocument();
    });
  });

  it('should handle time range changes', async () => {
    // Test time range selector
  });
});
```

### Performance Tests

```typescript
// __tests__/performance/chartPerformance.test.ts
describe('Chart Performance', () => {
  it('should render 1000 data points in under 100ms', () => {
    const largeDataset = generateMockParticipants(1000);
    const startTime = performance.now();

    render(<SubmissionsTimelineChart participants={largeDataset} />);

    const endTime = performance.now();
    expect(endTime - startTime).toBeLessThan(100);
  });
});
```

---

## Accessibility (A11Y) Considerations

### WCAG 2.1 AA Compliance

1. **Color Contrast**
   - Ensure 4.5:1 contrast ratio for text
   - Use patterns in addition to colors for differentiation
   - Provide color-blind friendly palettes

2. **Keyboard Navigation**
   - All interactive elements must be keyboard accessible
   - Visible focus indicators
   - Logical tab order

3. **Screen Reader Support**
   - ARIA labels for charts
   - Alt text for visual elements
   - Descriptive tooltips

4. **Data Tables as Alternative**
   - Provide data table view as alternative to charts
   - Toggle between chart and table view
   - Ensure table is properly structured with headers

### Implementation Example

```typescript
// Accessible chart wrapper
export function AccessibleChart({
  ariaLabel,
  dataTableId,
  children
}: AccessibleChartProps) {
  return (
    <div>
      <div
        role="img"
        aria-label={ariaLabel}
        aria-describedby={dataTableId}
      >
        {children}
      </div>

      {/* Hidden data table for screen readers */}
      <div id={dataTableId} className="sr-only">
        <table>
          {/* Render data in table format */}
        </table>
      </div>
    </div>
  );
}
```

---

## Migration & Rollout Plan

### Phase 1: Soft Launch (Week 1-2)
- Deploy to staging environment
- Internal testing with team
- Gather feedback from researchers
- Fix critical bugs

### Phase 2: Beta Release (Week 3-4)
- Enable for subset of users (feature flag)
- Monitor performance metrics
- Collect user feedback
- Iterate on UX issues

### Phase 3: Full Rollout (Week 5-6)
- Enable for all users
- Announce new features in changelog
- Provide documentation and tutorials
- Monitor adoption and usage metrics

### Feature Flags

```typescript
// lib/featureFlags.ts
export const features = {
  analyticsCharts: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS_CHARTS === 'true',
  statementAnalysis: process.env.NEXT_PUBLIC_ENABLE_STATEMENT_ANALYSIS === 'true',
  advancedFiltering: process.env.NEXT_PUBLIC_ENABLE_ADVANCED_FILTERING === 'true'
};

// Usage in component
if (features.analyticsCharts) {
  return <SubmissionsTimelineChart {...props} />;
}
return <LegacyMetricsView {...props} />;
```

---

## Success Metrics

### Key Performance Indicators (KPIs)

1. **Adoption Metrics**
   - % of users visiting Analytics page
   - Average time spent on Analytics page
   - Number of chart interactions per session

2. **Performance Metrics**
   - Page load time (target: < 2s)
   - Chart render time (target: < 100ms)
   - Time to interactive (target: < 3s)

3. **User Satisfaction**
   - User feedback score (target: > 4/5)
   - Feature request reduction for visualizations
   - Support ticket reduction related to data interpretation

4. **Business Impact**
   - Increased study completion rates (through better monitoring)
   - Reduced time to identify issues
   - Improved researcher efficiency

### Analytics Tracking

```typescript
// Track chart interactions
const trackChartInteraction = (chartType: string, action: string) => {
  analytics.track('chart_interaction', {
    chart_type: chartType,
    action: action,
    timestamp: new Date().toISOString()
  });
};

// Usage
<LineChart onClick={() => trackChartInteraction('timeline', 'click')}>
  {/* Chart content */}
</LineChart>
```

---

## Risk Assessment & Mitigation

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Recharts performance with large datasets | High | Medium | Implement data sampling, pagination, lazy loading |
| Browser compatibility issues | Medium | Low | Polyfills, progressive enhancement, fallback views |
| Bundle size increase | Medium | High | Code splitting, lazy loading, tree shaking |
| Mobile responsiveness issues | High | Medium | Mobile-first design, extensive device testing |

### UX Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Users find charts confusing | High | Medium | User testing, clear labels, contextual help |
| Information overload | Medium | High | Progressive disclosure, collapsible sections |
| Accessibility barriers | High | Low | WCAG 2.1 compliance, screen reader testing |
| Performance perception | Medium | Medium | Loading skeletons, optimistic UI updates |

### Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Increased development time | Medium | Medium | Phased rollout, MVP focus, iterative delivery |
| User resistance to change | Low | Low | Gradual introduction, user education, documentation |
| Maintenance overhead | Medium | Low | Comprehensive tests, clear documentation, modular code |

---

## Documentation Requirements

### 1. Developer Documentation
- Component API reference
- Chart customization guide
- Data transformation utilities
- Performance optimization guide
- Testing guide

### 2. User Documentation
- Admin guide for interpreting charts
- Interactive tutorial/walkthrough
- FAQ for common questions
- Video tutorials

### 3. Technical Specifications
- Architecture decision records (ADRs)
- Data flow diagrams
- Component hierarchy
- API contracts

---

## Future Enhancements (Post-MVP)

### Advanced Analytics
1. **Predictive Analytics**
   - Forecast completion rates
   - Predict optimal sample size
   - Identify potential dropoff points

2. **Comparative Analysis**
   - Compare multiple studies side-by-side
   - Benchmark against historical data
   - Cross-study statement analysis

3. **Real-Time Analytics**
   - Live dashboard with WebSocket updates
   - Real-time participant tracking
   - Live recruitment monitoring

### Export & Reporting
1. **Automated Reports**
   - Scheduled PDF reports
   - Email digests with key metrics
   - Custom report templates

2. **Advanced Exports**
   - Export charts as images (PNG, SVG)
   - Export to PowerPoint/Keynote
   - Interactive HTML exports

### Integration
1. **External Analytics**
   - Google Analytics integration
   - Mixpanel/Amplitude tracking
   - Custom webhook for events

2. **Data Science Tools**
   - Jupyter notebook integration
   - R/Python export scripts
   - API for custom analysis tools

---

## Conclusion

This overhaul plan transforms the Open-Q admin UI from a data-management interface into a comprehensive analytics platform. By leveraging the already-installed `recharts` library and implementing a phased approach, we can deliver significant value to researchers while maintaining code quality and performance.

### Key Benefits:
✅ **Better Insights** - Visual analytics reveal patterns invisible in tables
✅ **Faster Decision-Making** - Real-time visualizations enable quick adjustments
✅ **Improved UX** - Interactive charts are more engaging than static tables
✅ **Research Quality** - Early detection of issues improves data quality
✅ **Efficiency** - Reduced time spent on manual data analysis

### Next Steps:
1. Review and approve this plan
2. Prioritize phases based on business needs
3. Set up development environment with recharts
4. Begin Sprint 1 implementation
5. Schedule regular review meetings

---

**Plan Author:** Claude (AI Assistant)
**Date:** 2026-01-15
**Status:** Proposal - Pending Review
**Estimated Effort:** 8 weeks (4 sprints × 2 weeks)
**Priority:** High
