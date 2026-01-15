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
4. **Transform individual participant visualization with rich, interactive components**
5. Enhance recruitment analytics with funnel and cohort visualizations
6. Build a dedicated Analytics dashboard
7. Ensure mobile responsiveness and accessibility
8. Leverage the already-installed `recharts` library (v3.6.0)

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

### Phase 4.5: Individual Participant Visualization Enhancement

#### Overview
While aggregate analytics provide macro-level insights, researchers need rich, interactive visualizations for individual participant responses. The current `ParticipantDetailContent` component shows basic data but lacks visual sophistication for deep analysis. This phase transforms the individual participant view into a comprehensive analytical interface.

**Current Limitations:**
- Q-Sort shown as simple vertical list with score badges
- No visual grid representation matching actual sorting experience
- No comparison with cohort average or other participants
- Presort/postsort data displayed as plain text key-value pairs
- No journey visualization showing participant progression
- No visual quality indicators or anomaly detection
- Limited interactivity and exploration capabilities

---

#### 4.5.1 Enhanced Q-Sort Grid Visualization
**Component:** `QSortGridVisualization.tsx`
**Location:** `/components/admin/dashboard/participant/`

**Description:**
Transform the linear score pile display into an interactive 2D grid that matches the actual Q-sort experience.

**Features:**

**Grid Layout Views:**
1. **Pyramid View** (Default)
   - Recreate the forced-distribution grid structure
   - Visual representation matching participant's actual sorting board
   - Statements positioned in their grid columns by score
   - Color gradient from negative (red) to positive (green)

2. **Compact List View** (Current implementation, improved)
   - Vertical timeline with enhanced visual design
   - Statement cards with richer information
   - Smooth animations when expanding/collapsing

3. **Heatmap View**
   - Grid showing statement placement intensity
   - Compare this participant's placement with cohort average
   - Highlight outlier placements (statements placed unusually)

**Interactive Features:**
- Toggle between grid/list/heatmap views
- Hover on statement to see:
  - Statement full text with translations
  - Statement code/ID
  - Time spent on this statement (if tracked)
  - Average placement across all participants
  - How many other participants placed it at same score
- Click statement to see detailed analysis:
  - Statement distribution chart (mini histogram)
  - Other participants who placed it similarly
  - Comments related to this statement (if available)
- Zoom controls for grid view
- Export grid as image (PNG/SVG)

**Visual Enhancements:**
- Smooth transitions when switching views (framer-motion)
- Statement cards with gradient borders based on score
- Subtle shadows and depth for better visual hierarchy
- Responsive design: grid → list on mobile

**Data Source:**
- `participant.scores` array
- `participant.placements` for grid positioning
- `studyData.study.statements` for statement content
- `studyData.study.grid_config` for grid structure
- Aggregate statistics for comparison

**Component Structure:**
```typescript
interface QSortGridVisualizationProps {
  participant: DumpParticipant;
  studyData: DumpResponse;
  viewMode?: 'grid' | 'list' | 'heatmap';
  showComparison?: boolean;
  comparisonData?: ParticipantComparison;
}

interface ParticipantComparison {
  averageScores: number[]; // Average score for each statement
  stdDevScores: number[];  // Standard deviation for each statement
  similarity: number;       // 0-100 similarity to cohort
}
```

**Recharts Integration:**
For heatmap view, use custom SVG with color scales:
```typescript
<HeatmapGrid
  data={heatmapData}
  xAxis="statement"
  yAxis="score"
  colorScale={['#ef4444', '#f59e0b', '#fbbf24', '#a3e635', '#22c55e']}
/>
```

**Integration Point:**
- ParticipantDetailContent (replace current Q-Sort reconstruction)
- Participant comparison modal

---

#### 4.5.2 Participant Journey Timeline
**Component:** `ParticipantJourneyTimeline.tsx`

**Description:**
Visual timeline showing participant's progression through the study, from start to completion.

**Features:**

**Timeline Stages:**
1. **Study Start** - Initial landing
2. **Consent** - Consent form completion
3. **Presort Survey** - Pre-sorting questions
4. **Rough Sort** - Initial categorization
5. **Fine Sort** - Detailed Q-sort placement
6. **Postsort** - Debrief and comments
7. **Completion** - Final submission

**Visual Elements:**
- Horizontal timeline with stage markers
- Time spent at each stage (bar width or annotation)
- Color coding:
  - Completed stages: Emerald green
  - Current stage: Indigo blue
  - Skipped/incomplete: Slate gray
- Progress percentage indicator
- Total duration overlay

**Interactive Features:**
- Hover on stage to see:
  - Exact timestamps (started, completed)
  - Time spent in this stage
  - Actions taken (if tracked)
  - Average time for this stage across cohort
- Click stage to jump to relevant data section
- Compare with average participant journey

**Anomaly Detection:**
- Visual indicators for unusual patterns:
  - ⚠️ Suspiciously fast completion (< 2 minutes)
  - 🐌 Unusually slow progression
  - 🔄 Multiple revisits to same stage
  - ⏸️ Long pauses between stages

**Data Source:**
- `created_at` (study start)
- `submitted_at` (completion)
- `duration_seconds` (total duration)
- Stage-specific timestamps (if backend tracks them)
- Cohort averages for comparison

**Recharts Component:**
```typescript
<BarChart
  layout="vertical"
  data={journeyStages}
  margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
>
  <XAxis type="number" dataKey="duration" label="Time (seconds)" />
  <YAxis type="category" dataKey="stage" />
  <Bar dataKey="duration" fill="#4f46e5">
    {journeyStages.map((stage, index) => (
      <Cell key={index} fill={stage.completed ? '#10b981' : '#94a3b8'} />
    ))}
  </Bar>
  <Tooltip content={<CustomTooltip />} />
</BarChart>
```

**Integration Point:**
- ParticipantDetailContent (new section near header)
- Overview dashboards for quality monitoring

---

#### 4.5.3 Statement Interaction Heatmap
**Component:** `StatementInteractionHeatmap.tsx`

**Description:**
Show how participant engaged with each statement during the sorting process.

**Features:**

**Visualization Types:**
1. **Movement Tracker**
   - Show initial placement vs. final placement
   - Arrow indicators for statement movement
   - Color intensity = amount of movement
   - Highlight statements that moved significantly

2. **Attention Heatmap**
   - Time spent on each statement (if tracked)
   - Click frequency (if tracked)
   - Hover duration (if tracked)

3. **Placement Confidence**
   - Statements placed quickly (< 5s): Low confidence?
   - Statements with multiple adjustments: Uncertainty
   - Final placements without changes: High confidence

**Visual Design:**
- Grid layout: Statements × Metrics
- Color scales:
  - Blue for attention/time
  - Purple for interactions
  - Green for confidence
- Gradient intensity based on values

**Interactive Features:**
- Hover cell to see exact values
- Click statement row to highlight across all metrics
- Filter by statement category
- Sort by any metric column
- Export as CSV or image

**Data Requirements:**
This feature requires backend tracking of:
- Statement interaction timestamps
- Placement changes during sorting
- Time spent per statement

**Fallback:**
If tracking data unavailable, show simplified version:
- Final placement only
- Comparison with average
- Outlier highlighting

**Integration Point:**
- ParticipantDetailContent (optional advanced section)
- Quality assurance dashboard

---

#### 4.5.4 Comparative Participant Analysis
**Component:** `ParticipantComparison.tsx`

**Description:**
Side-by-side comparison of individual participant with cohort statistics.

**Features:**

**Comparison Metrics:**

1. **Score Distribution Comparison**
   - Dual histogram: This participant vs. Cohort average
   - Overlaid line charts showing score patterns
   - Similarity score (correlation coefficient)
   - Outlier statements highlighted

2. **Duration Benchmarking**
   - Visual indicator: participant duration vs. cohort
   - Percentile ranking (e.g., "Faster than 75% of participants")
   - Stage-by-stage duration comparison

3. **Statement Placement Divergence**
   - List of statements placed very differently from average
   - Magnitude and direction of divergence
   - Color-coded: Red (controversial), Green (consensus)

4. **Response Pattern Analysis**
   - Use of score range (did they use full spectrum?)
   - Central tendency bias (clustering around zero?)
   - Extreme scores usage frequency

**Visual Components:**

```typescript
// Dual histogram comparison
<ComposedChart data={comparisonData}>
  <Bar dataKey="participantCount" fill="#4f46e5" name="This Participant" />
  <Line
    dataKey="cohortAverage"
    stroke="#10b981"
    strokeWidth={2}
    name="Cohort Average"
  />
  <XAxis dataKey="score" />
  <YAxis />
  <Tooltip />
  <Legend />
</ComposedChart>

// Similarity gauge
<RadialBarChart
  data={[{ name: 'Similarity', value: 85, fill: '#4f46e5' }]}
  innerRadius="70%"
  outerRadius="100%"
>
  <RadialBar dataKey="value" />
  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
    <tspan fontSize="24" fontWeight="bold">85%</tspan>
    <tspan x="50%" dy="1.5em" fontSize="12">Similar to cohort</tspan>
  </text>
</RadialBarChart>
```

**Statistical Indicators:**
- Pearson correlation coefficient with cohort
- Z-scores for outlier statements
- Percentage of statements within 1 standard deviation
- Quality flags (e.g., "Straight-lining", "Acquiescence bias")

**Interactive Features:**
- Toggle comparison on/off
- Select comparison group:
  - All participants
  - Same recruitment link
  - Same language
  - Custom segment
- Drill down to specific divergent statements

**Integration Point:**
- ParticipantDetailContent (new comparison section)
- Batch comparison tool for reviewing multiple participants

---

#### 4.5.5 Enhanced Presort/Postsort Visualization
**Component:** `SurveyDataVisualization.tsx`

**Description:**
Transform plain text survey responses into rich, interactive visualizations.

**Features:**

**Data Type-Specific Visualizations:**

1. **Multiple Choice Questions**
   - Pie chart showing selected option
   - Bar chart comparing with cohort distribution
   - Percentage of participants who selected same option

2. **Likert Scales**
   - Horizontal bar with marker showing participant's response
   - Distribution curve showing where they fall
   - Color coding: Strongly Disagree (red) → Strongly Agree (green)

3. **Numeric Responses**
   - Number display with context (min, max, average)
   - Position on number line
   - Percentile ranking

4. **Text Responses**
   - Card display with better formatting
   - Character/word count
   - Sentiment indicator (if analyzed)
   - Word cloud for longer responses

5. **Consent Checkboxes**
   - Visual checkmarks with icons
   - Percentage of cohort who consented
   - Color-coded status badges

**Layout Structure:**
```
┌─────────────────────────────────────────┐
│ Survey Data (Presort)                   │
├─────────────────────────────────────────┤
│ ┌─────────────────┬─────────────────┐   │
│ │ Question 1      │ [Pie Chart]     │   │
│ │ Multiple choice │ + Distribution  │   │
│ └─────────────────┴─────────────────┘   │
│ ┌─────────────────────────────────────┐ │
│ │ Question 2                          │ │
│ │ [====█=========] (Likert Scale)     │ │
│ │ You: 4/5 | Avg: 3.2/5              │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Question 3: [Text Response Card]    │ │
│ │ 156 words | Positive sentiment 😊   │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Debrief / Postsort                      │
├─────────────────────────────────────────┤
│ ✅ Email Collected: user@example.com    │
│ ✅ Newsletter: Opted in (45% of cohort) │
│ ❌ Interview: Declined (65% declined)   │
│                                         │
│ Comments on statements:                 │
│ [Card for each commented statement]    │
└─────────────────────────────────────────┘
```

**Interactive Features:**
- Expand/collapse sections
- Filter comments by statement
- Export responses
- Print-friendly format

**Recharts Components:**
```typescript
// Likert scale visualization
<BarChart
  layout="vertical"
  data={[{ category: question.text, value: response, avg: cohortAvg }]}
  margin={{ left: 150 }}
>
  <XAxis type="number" domain={[1, 5]} />
  <YAxis type="category" dataKey="category" width={140} />
  <Bar dataKey="value" fill="#4f46e5" />
  <ReferenceLine x={cohortAvg} stroke="#10b981" strokeDasharray="3 3" />
  <Tooltip />
</BarChart>

// Multiple choice distribution
<PieChart>
  <Pie
    data={optionDistribution}
    dataKey="count"
    nameKey="option"
    cx="50%"
    cy="50%"
    outerRadius={60}
  >
    {optionDistribution.map((entry, index) => (
      <Cell
        key={index}
        fill={entry.selected ? '#4f46e5' : '#e2e8f0'}
        stroke={entry.selected ? '#312e81' : '#cbd5e1'}
        strokeWidth={entry.selected ? 3 : 1}
      />
    ))}
  </Pie>
  <Tooltip />
  <Legend />
</PieChart>
```

**Integration Point:**
- Replace current plain text display in ParticipantDetailContent
- Survey analysis page (aggregate view)

---

#### 4.5.6 Response Quality Dashboard
**Component:** `ResponseQualityIndicators.tsx`

**Description:**
Visual indicators and metrics to assess participant response quality and engagement.

**Features:**

**Quality Metrics:**

1. **Response Completeness**
   - Progress ring showing % of data provided
   - Breakdown: Survey, Q-sort, Debrief
   - Missing data indicators

2. **Engagement Score**
   - Composite score (0-100) based on:
     - Duration appropriateness
     - Full score range usage
     - Survey response completeness
     - Comment/debrief provision
   - Color-coded: Red (low) → Green (high)
   - Comparison with cohort average

3. **Attention Checks**
   - If study includes attention checks, show results
   - Visual pass/fail indicators
   - Flag suspicious patterns

4. **Response Patterns**
   - **Straight-lining**: Used same score repeatedly?
   - **Central tendency**: Over-used neutral scores?
   - **Extreme responding**: Over-used extreme scores?
   - **Acquiescence**: Agreed with everything?
   - Visual indicators with explanations

5. **Data Quality Flags**
   - ⚠️ Suspiciously fast completion
   - ⚠️ Incomplete responses
   - ⚠️ Failed attention checks
   - ⚠️ Unusual patterns detected
   - ✅ High quality response

**Visual Design:**

```typescript
// Engagement score gauge
<RadialBarChart
  width={200}
  height={200}
  innerRadius="80%"
  outerRadius="100%"
  data={[{ name: 'Engagement', value: engagementScore, fill: getColorByScore(engagementScore) }]}
  startAngle={180}
  endAngle={0}
>
  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
  <RadialBar dataKey="value" />
  <text x="50%" y="50%" textAnchor="middle">
    <tspan fontSize="32" fontWeight="bold">{engagementScore}</tspan>
    <tspan x="50%" dy="1.5em" fontSize="14">Engagement</tspan>
  </text>
</RadialBarChart>

// Completeness breakdown
<PieChart>
  <Pie
    data={completenessData}
    dataKey="percentage"
    nameKey="section"
    cx="50%"
    cy="50%"
    innerRadius={40}
    outerRadius={60}
  >
    {completenessData.map((entry, index) => (
      <Cell key={index} fill={entry.percentage === 100 ? '#10b981' : '#f59e0b'} />
    ))}
  </Pie>
  <Tooltip />
  <Legend />
</PieChart>
```

**Pattern Detection Visualization:**
```
Score Distribution Analysis:
[====] Too concentrated (Straight-lining detected)
[========] Balanced distribution ✓
[=] Under-utilized score range
```

**Interactive Features:**
- Hover on quality flags for explanations
- Click to see detailed breakdown
- Compare quality score with cohort
- Export quality report

**Integration Point:**
- ParticipantDetailContent (prominent header section)
- Quality filtering in InteractiveDataView
- Bulk quality assessment tool

---

#### 4.5.7 Participant Comparison Side Panel
**Component:** `ParticipantCompareSidePanel.tsx`

**Description:**
Side-by-side comparison panel for analyzing multiple participants simultaneously.

**Features:**

**Comparison Interface:**
- Select 2-4 participants for side-by-side comparison
- Synchronized scrolling through sections
- Highlight differences automatically
- Show similarity scores between selected participants

**Comparison Views:**
1. **Q-Sort Grids** - Side by side
2. **Score Distributions** - Overlaid charts
3. **Survey Responses** - Table comparison
4. **Quality Metrics** - Comparative dashboard
5. **Timeline Journeys** - Parallel timelines

**Visual Design:**
```
┌────────────┬────────────┬────────────┐
│ Participant│ Participant│ Participant│
│ A (ref)    │ B          │ C          │
├────────────┼────────────┼────────────┤
│ [Q-Sort A] │ [Q-Sort B] │ [Q-Sort C] │
│            │ 85% similar│ 62% similar│
├────────────┼────────────┼────────────┤
│ Engagement │ Engagement │ Engagement │
│   92/100   │   88/100   │   45/100   │
│     ✓      │     ✓      │     ⚠      │
├────────────┼────────────┼────────────┤
│ Duration:  │ Duration:  │ Duration:  │
│   12m 34s  │   15m 02s  │   2m 15s   │
│            │            │   ⚠ Fast   │
└────────────┴────────────┴────────────┘
```

**Difference Highlighting:**
- Statements placed differently: highlighted in orange
- Score divergence > 2 points: highlighted in red
- Unique responses: highlighted in blue

**Statistical Comparison:**
- Correlation matrix between selected participants
- Agreement/disagreement percentages
- Common patterns identification

**Integration Point:**
- New dedicated comparison page: `/admin/studies/:slug/compare`
- Accessible from participant list (checkbox multi-select)
- "Compare" button in InteractiveDataView

---

#### 4.5.8 Export & Reporting for Individual Participants
**Component:** `ParticipantReportExporter.tsx`

**Description:**
Generate comprehensive, print-friendly reports for individual participant analysis.

**Features:**

**Report Formats:**
1. **PDF Report**
   - Professional layout with study branding
   - All visualizations rendered as images
   - Printable format (A4/Letter)
   - Table of contents with page numbers

2. **Interactive HTML**
   - Standalone HTML file with embedded charts
   - Interactive visualizations preserved
   - Shareable via email or web

3. **Presentation Slides**
   - Key insights formatted for presentations
   - One slide per major section
   - Export to PPTX or PDF

**Report Sections:**
1. Executive Summary
2. Participant Profile (ID, metadata, quality score)
3. Journey Timeline
4. Q-Sort Grid Visualization
5. Statement Analysis
6. Survey Responses
7. Quality Assessment
8. Cohort Comparison
9. Appendix (raw data)

**Customization:**
- Select which sections to include
- Choose visualization styles
- Add researcher notes/annotations
- Include or exclude identifiable information

**Integration Point:**
- Export button in ParticipantDetailContent header
- Bulk export for multiple participants
- Scheduled report generation

---

#### Implementation Priority

**High Priority (Sprint 1):**
1. Enhanced Q-Sort Grid Visualization (4.5.1)
2. Response Quality Dashboard (4.5.6)
3. Enhanced Presort/Postsort Visualization (4.5.5)

**Medium Priority (Sprint 2):**
4. Participant Journey Timeline (4.5.2)
5. Comparative Participant Analysis (4.5.4)

**Low Priority (Sprint 3):**
6. Statement Interaction Heatmap (4.5.3) - requires backend changes
7. Participant Comparison Side Panel (4.5.7)
8. Export & Reporting (4.5.8)

---

#### Technical Considerations

**Component Architecture:**
```
/components/admin/dashboard/participant/
├── QSortGridVisualization.tsx
├── ParticipantJourneyTimeline.tsx
├── StatementInteractionHeatmap.tsx
├── ParticipantComparison.tsx
├── SurveyDataVisualization.tsx
├── ResponseQualityIndicators.tsx
├── ParticipantCompareSidePanel.tsx
├── ParticipantReportExporter.tsx
└── shared/
    ├── StatementCard.tsx
    ├── QualityBadge.tsx
    ├── ComparisonMetric.tsx
    └── EngagementGauge.tsx
```

**Data Processing:**
```typescript
// lib/participantAnalysis.ts

export function calculateEngagementScore(
  participant: DumpParticipant,
  studyData: DumpResponse
): number {
  const durationScore = calculateDurationScore(participant.duration_seconds);
  const completenessScore = calculateCompletenessScore(participant);
  const diversityScore = calculateScoreDiversityScore(participant.scores);

  return (durationScore + completenessScore + diversityScore) / 3;
}

export function detectResponsePatterns(
  participant: DumpParticipant
): ResponsePattern[] {
  const patterns: ResponsePattern[] = [];

  // Detect straight-lining
  if (isStraightLining(participant.scores)) {
    patterns.push({
      type: 'straight-lining',
      severity: 'high',
      description: 'Multiple statements assigned identical scores'
    });
  }

  // Detect central tendency
  if (hasCentralTendencyBias(participant.scores)) {
    patterns.push({
      type: 'central-tendency',
      severity: 'medium',
      description: 'Over-reliance on neutral scores'
    });
  }

  return patterns;
}

export function compareParticipants(
  participant1: DumpParticipant,
  participant2: DumpParticipant
): ComparisonResult {
  // Calculate correlation
  const correlation = pearsonCorrelation(
    participant1.scores,
    participant2.scores
  );

  // Find divergent statements
  const divergentStatements = findDivergentStatements(
    participant1.scores,
    participant2.scores,
    threshold: 2
  );

  return {
    similarity: correlation * 100,
    divergentStatements,
    agreementPercentage: calculateAgreementPercentage(
      participant1.scores,
      participant2.scores
    )
  };
}
```

**Performance Optimization:**
- Lazy load complex visualizations
- Memoize expensive calculations
- Virtual scrolling for large comparison grids
- Progressive image loading for reports

**Accessibility:**
- Keyboard navigation for all interactive elements
- Screen reader descriptions for visualizations
- High contrast mode support
- Text alternatives for all visual data

---

#### Success Metrics for Individual Visualizations

**User Engagement:**
- Average time spent on participant detail page
- Number of visualization interactions per session
- Feature adoption rate (% using new visualizations)

**Research Efficiency:**
- Time to identify quality issues (before vs. after)
- Number of participants reviewed per session
- False positive rate in quality flagging

**User Satisfaction:**
- Researcher feedback scores
- Feature request patterns
- Support ticket reduction

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

### Phase 5.5: Overview Dashboard Data Vignettes Refactor

#### Overview
The current StudyOverviewPage shows basic recent activity as a simple list of participants. This phase transforms these data vignettes into rich, visual mini-insights that provide researchers with at-a-glance understanding of their study health and trends without leaving the overview page.

**Current Limitations of Overview Page:**
- Recent Activity is just a list of last 5 participants
- Metric cards show static numbers without trends
- No visual indicators of data quality or study health
- No quick insights about participant behavior patterns
- Missing quick-action visualizations
- No at-a-glance problem detection

---

#### 5.5.1 Enhanced Recent Activity Panel
**Component:** `EnhancedRecentActivityPanel.tsx`
**Location:** `/components/admin/dashboard/`

**Description:**
Transform the basic participant list into an interactive, information-rich activity feed with mini visualizations.

**Features:**

**Visual Enhancements:**

1. **Participant Cards with Mini Stats**
   - Replace plain list items with rich cards
   - Show mini sparkline of their journey duration
   - Quality score badge (color-coded: green/amber/red)
   - Visual indicators for flags (⚠️ fast completion, 💬 has comments, 📊 outlier)

2. **Activity Timeline Mini-Chart**
   - Small line chart showing submissions over last 7 days
   - Embedded above the participant list
   - Hover to see exact counts per day
   - Click to navigate to full Analytics page

3. **Real-time Quality Indicators**
   - Visual gauge showing % of high-quality responses today
   - Trend indicator (↑ improving, ↓ declining, → stable)
   - Color coding based on thresholds

**Layout Structure:**
```
┌─────────────────────────────────────────┐
│ 📊 Recent Activity                      │
│                                         │
│ Last 7 Days: [mini sparkline chart]    │
│ ┌─────────────────────────────────────┐ │
│ │ Today: 12 submissions  ↑ +25%      │ │
│ │ Quality Score: 87/100  [gauge]     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Recently Completed (5)                  │
│ ┌───────────────────────────────────┐   │
│ │ [Avatar] abc123def  ✓ 92          │   │
│ │ Duration: [mini bar] 12m 34s      │   │
│ │ 2 hours ago                       │   │
│ └───────────────────────────────────┘   │
│ ┌───────────────────────────────────┐   │
│ │ [Avatar] def456ghi  ⚠️ 45          │   │
│ │ Duration: [mini bar] 2m 15s ⚠️    │   │
│ │ 3 hours ago                       │   │
│ └───────────────────────────────────┘   │
│                                         │
│ [View All Participants →]              │
└─────────────────────────────────────────┘
```

**Mini Visualizations:**

```typescript
// Mini sparkline for 7-day trend
<Sparklines data={last7DaysData} width={100} height={20}>
  <SparklinesLine color="#4f46e5" style={{ strokeWidth: 2 }} />
  <SparklinesSpots />
</Sparklines>

// Or using recharts for consistency
<LineChart width={150} height={40} data={last7DaysData}>
  <Line
    type="monotone"
    dataKey="count"
    stroke="#4f46e5"
    strokeWidth={2}
    dot={false}
  />
</LineChart>

// Duration mini bar
<div className="w-20 h-1 bg-slate-200 rounded-full overflow-hidden">
  <div
    className={cn(
      "h-full transition-all",
      duration < 120 ? "bg-red-500" : duration < 300 ? "bg-amber-500" : "bg-emerald-500"
    )}
    style={{ width: `${Math.min((duration / 1200) * 100, 100)}%` }}
  />
</div>

// Quality score badge
<Badge className={cn(
  "font-bold",
  score >= 80 ? "bg-emerald-100 text-emerald-700" :
  score >= 60 ? "bg-amber-100 text-amber-700" :
  "bg-red-100 text-red-700"
)}>
  {score}
</Badge>
```

**Interactive Features:**
- Hover on participant card to see quick preview of Q-sort
- Click participant to navigate to detail page
- Click sparkline to navigate to Analytics page
- Filter buttons: All / Completed / In Progress / Flagged

**Data Source:**
- Recent participants (last 24 hours or last 10)
- Calculated quality scores
- 7-day submission trend data
- Study statistics

**Integration Point:**
- Replace current Recent Activity section in StudyOverviewPage

---

#### 5.5.2 Smart Insights Cards
**Component:** `SmartInsightsCards.tsx`

**Description:**
Automatic detection and display of noteworthy patterns, issues, or achievements in study data.

**Features:**

**Insight Types:**

1. **Quality Alerts** 🚨
   - "⚠️ 3 suspicious submissions in last hour (< 2 min duration)"
   - "✅ Quality improving: 92% high-quality responses today"
   - "📊 2 outlier participants detected - review recommended"

2. **Milestone Achievements** 🎯
   - "🎉 Reached 50% of target sample size!"
   - "✨ Completion rate improved by 15% this week"
   - "📈 Best recruitment day: 25 submissions today"

3. **Trend Notifications** 📊
   - "↗️ Submissions trending up (+35% vs. last week)"
   - "⏰ Peak activity time: 2-4 PM (45% of submissions)"
   - "🌍 New language detected: 15% now using FR"

4. **Action Recommendations** 💡
   - "💡 Review 5 flagged participants from yesterday"
   - "🔗 Link 'social-media' has 85% completion - consider promoting"
   - "📧 12 participants opted in for follow-up interviews"

**Visual Design:**
```
┌─────────────────────────────────────────┐
│ 💡 Smart Insights                       │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 🎉 Milestone Reached!               │ │
│ │ You've collected 50 responses       │ │
│ │ [Progress bar: 50/100] ────●────    │ │
│ │ Keep going! → View Analytics        │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ ⚠️ Quality Alert                    │ │
│ │ 3 rapid submissions detected        │ │
│ │ Avg duration: 1m 45s (⚠️ suspect)   │ │
│ │ [Review Now →]                      │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 📈 Trend                            │ │
│ │ Submissions up 35% this week!       │ │
│ │ [mini chart] ↗️                     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Intelligence Engine:**
```typescript
// lib/insightsEngine.ts

export function generateInsights(
  studyData: StudyRead,
  stats: StudyStatsRead,
  participants: ParticipantRead[],
  historicalData?: HistoricalStats
): Insight[] {
  const insights: Insight[] = [];

  // Quality alerts
  const recentSuspicious = participants.filter(
    p => p.duration_seconds && p.duration_seconds < 120 &&
    isRecent(p.submitted_at, 1) // Last hour
  );
  if (recentSuspicious.length >= 3) {
    insights.push({
      type: 'alert',
      severity: 'warning',
      icon: '⚠️',
      title: 'Quality Alert',
      message: `${recentSuspicious.length} suspicious submissions in last hour`,
      action: { label: 'Review Now', route: '/exports?filter=suspect' }
    });
  }

  // Milestone detection
  const targetSize = 100; // Could be from study config
  if (stats.completed_count >= targetSize * 0.5 &&
      stats.completed_count < targetSize * 0.5 + 5) {
    insights.push({
      type: 'success',
      severity: 'info',
      icon: '🎉',
      title: 'Milestone Reached!',
      message: `You've collected ${stats.completed_count} responses`,
      progress: (stats.completed_count / targetSize) * 100
    });
  }

  // Trend analysis
  if (historicalData) {
    const weeklyTrend = calculateWeeklyTrend(participants, historicalData);
    if (weeklyTrend.percentChange > 25) {
      insights.push({
        type: 'info',
        severity: 'info',
        icon: '📈',
        title: 'Trend',
        message: `Submissions up ${weeklyTrend.percentChange}% this week!`,
        miniChart: weeklyTrend.dailyCounts
      });
    }
  }

  return insights.slice(0, 3); // Show top 3 insights
}
```

**Interactive Features:**
- Click insight card to navigate to relevant page
- Dismiss button (with "Don't show again" option)
- Refresh insights manually
- Configure which insights to show in settings

**Integration Point:**
- New section in StudyOverviewPage (below metrics, above recent activity)
- Optional: Notification bell in header showing insight count

---

#### 5.5.3 Enhanced Metric Cards with Trends
**Component:** `TrendMetricCard.tsx`

**Description:**
Upgrade the static metric cards (Sample Size, Completion Rate, Median Duration) with trend indicators and mini charts.

**Features:**

**Visual Enhancements:**

1. **Trend Indicators**
   - Show change compared to previous period (↑ +15%, ↓ -5%, → stable)
   - Color coding: green for improvement, red for decline
   - Sparkline showing last 7 days

2. **Comparison Context**
   - "15% above your average" or "On track"
   - Percentile ranking if multiple studies

3. **Interactive Tooltips**
   - Hover to see detailed breakdown
   - Historical data graph
   - Benchmark comparisons

**Enhanced Metric Card Layout:**
```
┌─────────────────────────────────────────┐
│ 👥 Sample Size (N)                      │
│                                         │
│     142                                 │
│     ↑ +15 this week  [sparkline]       │
│                                         │
│ Target: 200 (71% complete)              │
│ [Progress bar ─────●──]                 │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ✅ Completion Rate                      │
│                                         │
│     78%                                 │
│     ↑ +5% vs last week  [sparkline]    │
│                                         │
│ 112 of 144 started   [mini chart]      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ⏱️ Median Duration                      │
│                                         │
│     12m 34s                             │
│     ↓ -2m from avg  [sparkline]        │
│                                         │
│ Distribution: [mini histogram]          │
│ Most common: 10-15 min (45%)           │
└─────────────────────────────────────────┘
```

**Implementation:**
```typescript
interface TrendMetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    value: string;
    isGood: boolean; // Is this direction positive?
  };
  sparklineData?: number[];
  target?: {
    value: number;
    current: number;
  };
  miniChart?: {
    type: 'histogram' | 'line' | 'bar';
    data: any[];
  };
  tooltip?: string;
}

export function TrendMetricCard({
  title,
  value,
  icon: Icon,
  trend,
  sparklineData,
  target,
  miniChart
}: TrendMetricCardProps) {
  return (
    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
      <CardContent className="pt-4 pb-4">
        {/* Header with icon and title */}
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-4 w-4 text-indigo-600" />
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
            {title}
          </div>
        </div>

        {/* Main value */}
        <div className="flex items-baseline gap-3 mb-2">
          <div className="text-4xl font-bold text-slate-900">
            {value}
          </div>

          {/* Trend indicator */}
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-bold",
              trend.isGood ? "text-emerald-600" : "text-red-600"
            )}>
              {trend.direction === 'up' && <ArrowUp className="h-3 w-3" />}
              {trend.direction === 'down' && <ArrowDown className="h-3 w-3" />}
              {trend.direction === 'stable' && <Minus className="h-3 w-3" />}
              {trend.value}
            </div>
          )}
        </div>

        {/* Sparkline */}
        {sparklineData && (
          <div className="mb-2">
            <ResponsiveContainer width="100%" height={30}>
              <LineChart data={sparklineData.map((val, idx) => ({ value: val, day: idx }))}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Target progress */}
        {target && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>Target: {target.value}</span>
              <span>{Math.round((target.current / target.value) * 100)}%</span>
            </div>
            <Progress
              value={(target.current / target.value) * 100}
              className="h-1.5 bg-slate-100"
            />
          </div>
        )}

        {/* Mini chart */}
        {miniChart && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <MiniChartRenderer type={miniChart.type} data={miniChart.data} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Data Source:**
- Current study statistics
- Historical data (last 7 days, last 30 days)
- Comparative benchmarks
- Study configuration (targets)

**Integration Point:**
- Replace existing metric cards in StudyOverviewPage

---

#### 5.5.4 Quick Actions Widget
**Component:** `QuickActionsWidget.tsx`

**Description:**
Contextual quick actions based on current study state and data patterns.

**Features:**

**Action Recommendations:**

1. **Study State-Based Actions**
   - Draft: "Complete study design", "Test with sample data"
   - Active: "Monitor quality", "Check recruitment links"
   - Paused: "Resume recruitment", "Review pause reasons"
   - Closed: "Export final data", "Generate report"

2. **Data-Driven Actions**
   - Low completion rate: "Review study difficulty", "Check dropout points"
   - High quality scores: "Increase sample size", "Close recruitment early"
   - Suspicious patterns: "Review flagged participants", "Check attention checks"

3. **Time-Sensitive Actions**
   - New submissions: "Review 5 recent participants"
   - Old in-progress: "Send reminder to incomplete participants"
   - Milestone reached: "Celebrate & share progress"

**Visual Design:**
```
┌─────────────────────────────────────────┐
│ ⚡ Quick Actions                        │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 📊 Review Data Quality              │ │
│ │ 5 flagged participants              │ │
│ │ [Review →]                          │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 📈 View Analytics Dashboard         │ │
│ │ See detailed trends & patterns      │ │
│ │ [Open Analytics →]                  │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 💾 Export Data                      │ │
│ │ Download CSV, PQMethod, or R-Kit   │ │
│ │ [Export →]                          │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Implementation:**
```typescript
interface QuickAction {
  id: string;
  icon: string;
  title: string;
  description: string;
  action: {
    label: string;
    route?: string;
    onClick?: () => void;
  };
  badge?: {
    count: number;
    variant: 'default' | 'success' | 'warning' | 'error';
  };
  priority: number; // Higher = show first
}

export function generateQuickActions(
  study: StudyRead,
  stats: StudyStatsRead,
  flags: DataQualityFlags
): QuickAction[] {
  const actions: QuickAction[] = [];

  // Quality review action
  if (flags.suspiciousCount > 0) {
    actions.push({
      id: 'review-quality',
      icon: '📊',
      title: 'Review Data Quality',
      description: `${flags.suspiciousCount} flagged participants`,
      action: {
        label: 'Review',
        route: `/admin/studies/${study.slug}/exports?filter=flagged`
      },
      badge: { count: flags.suspiciousCount, variant: 'warning' },
      priority: 90
    });
  }

  // Analytics navigation
  actions.push({
    id: 'view-analytics',
    icon: '📈',
    title: 'View Analytics Dashboard',
    description: 'See detailed trends & patterns',
    action: {
      label: 'Open Analytics',
      route: `/admin/studies/${study.slug}/analytics`
    },
    priority: 70
  });

  // Export action
  if (stats.completed_count > 0) {
    actions.push({
      id: 'export-data',
      icon: '💾',
      title: 'Export Data',
      description: 'Download CSV, PQMethod, or R-Kit',
      action: {
        label: 'Export',
        route: `/admin/studies/${study.slug}/exports`
      },
      priority: 60
    });
  }

  // Sort by priority and return top 3-5
  return actions.sort((a, b) => b.priority - a.priority).slice(0, 5);
}
```

**Integration Point:**
- Right sidebar in StudyOverviewPage (alongside RecruitmentModule)
- Or as a collapsible section below metrics

---

#### 5.5.5 Live Activity Indicator
**Component:** `LiveActivityIndicator.tsx`

**Description:**
Real-time indicator showing current active participants and study engagement.

**Features:**

**Real-Time Indicators:**

1. **Active Now**
   - Show count of participants currently taking study
   - Live pulse animation
   - Updates every 30 seconds (via polling or WebSocket)

2. **Today's Summary**
   - Started today: X
   - Completed today: Y
   - Conversion: Z%
   - Mini bar chart comparing to yesterday

3. **Peak Hours**
   - Visual timeline showing submission times
   - Highlight current hour
   - Indicate peak hours

**Visual Design:**
```
┌─────────────────────────────────────────┐
│ 🟢 Live Activity                        │
├─────────────────────────────────────────┤
│ 3 participants active now ●             │
│                                         │
│ Today:                                  │
│ Started:    24  [bar]  ↑ +5 vs yesterday│
│ Completed:  18  [bar]  ↑ +3             │
│ Rate:       75% [gauge] ↑ +2%           │
│                                         │
│ Peak hours: 10am-12pm, 2pm-4pm         │
│ [timeline visualization]                │
└─────────────────────────────────────────┘
```

**Implementation:**
```typescript
export function LiveActivityIndicator({ slug }: { slug: string }) {
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);

  // Poll for updates every 30 seconds
  useEffect(() => {
    const fetchLiveStats = async () => {
      const stats = await fetchLiveActivityStats(slug);
      setLiveStats(stats);
    };

    fetchLiveStats();
    const interval = setInterval(fetchLiveStats, 30000);

    return () => clearInterval(interval);
  }, [slug]);

  if (!liveStats) return <Skeleton className="h-48" />;

  return (
    <Card className="border-none shadow-sm bg-gradient-to-br from-emerald-50 to-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className="relative">
            <div className="h-2 w-2 bg-emerald-500 rounded-full" />
            <div className="absolute inset-0 h-2 w-2 bg-emerald-500 rounded-full animate-ping" />
          </div>
          Live Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold mb-4">
          {liveStats.activeNow} {liveStats.activeNow === 1 ? 'participant' : 'participants'} active now
        </div>

        <div className="space-y-2">
          <MetricRow
            label="Started today"
            value={liveStats.todayStarted}
            trend={liveStats.todayStarted - liveStats.yesterdayStarted}
          />
          <MetricRow
            label="Completed today"
            value={liveStats.todayCompleted}
            trend={liveStats.todayCompleted - liveStats.yesterdayCompleted}
          />
        </div>

        {/* Peak hours visualization */}
        <div className="mt-4 pt-4 border-t border-emerald-100">
          <div className="text-xs font-bold text-slate-500 mb-2">
            Peak Hours
          </div>
          <HourlyActivityTimeline data={liveStats.hourlyBreakdown} />
        </div>
      </CardContent>
    </Card>
  );
}
```

**Data Source:**
- Real-time participant session tracking (if available)
- Submission timestamps for today/yesterday
- Historical hourly patterns

**Integration Point:**
- Top of StudyOverviewPage (alert banner style)
- Or within metrics section as an additional card

---

#### 5.5.6 Data Health Score
**Component:** `DataHealthScore.tsx`

**Description:**
Composite score (0-100) indicating overall study data quality and health.

**Features:**

**Score Components:**
1. **Sample Quality** (40%)
   - % of high-quality responses (duration appropriate, patterns normal)
   - Attention check pass rate

2. **Completion Health** (30%)
   - Completion rate
   - Dropout rate
   - Time to completion appropriateness

3. **Recruitment Effectiveness** (20%)
   - Link conversion rates
   - Source diversity
   - Steady flow vs. spikes

4. **Response Diversity** (10%)
   - Score range usage
   - Statement distribution variety
   - Demographic spread (if tracked)

**Visual Design:**
```
┌─────────────────────────────────────────┐
│ Data Health Score                       │
├─────────────────────────────────────────┤
│          ┌────────┐                     │
│          │   87   │                     │
│          │ Excellent│                   │
│          └────────┘                     │
│     [radial gauge visualization]        │
│                                         │
│ Breakdown:                              │
│ Sample Quality      ████████░░  92%     │
│ Completion Health   ███████░░░  85%     │
│ Recruitment         ████████░░  88%     │
│ Response Diversity  ███████░░░  78%     │
│                                         │
│ 💡 Tip: Your data health is excellent!  │
│    Continue current recruitment pace.   │
└─────────────────────────────────────────┘
```

**Score Calculation:**
```typescript
export function calculateDataHealthScore(
  participants: DumpParticipant[],
  stats: StudyStatsRead,
  recruitmentLinks: RecruitmentLinkRead[]
): DataHealthScore {
  // Sample quality (40%)
  const qualityScores = participants.map(p => calculateEngagementScore(p, studyData));
  const avgQuality = mean(qualityScores);
  const sampleQuality = (avgQuality / 100) * 40;

  // Completion health (30%)
  const completionRate = stats.completion_rate || 0;
  const completionHealth = (completionRate / 100) * 30;

  // Recruitment effectiveness (20%)
  const avgConversion = mean(
    recruitmentLinks.map(l => l.usage_count / Math.max(l.start_count, 1))
  );
  const recruitmentEffectiveness = avgConversion * 20;

  // Response diversity (10%)
  const diversityScore = calculateDiversityScore(participants);
  const responseDiversity = (diversityScore / 100) * 10;

  const totalScore = Math.round(
    sampleQuality + completionHealth + recruitmentEffectiveness + responseDiversity
  );

  return {
    total: totalScore,
    grade: getGrade(totalScore),
    breakdown: {
      sampleQuality: (sampleQuality / 40) * 100,
      completionHealth: (completionHealth / 30) * 100,
      recruitmentEffectiveness: (recruitmentEffectiveness / 20) * 100,
      responseDiversity: (responseDiversity / 10) * 100
    },
    recommendation: getRecommendation(totalScore, breakdown)
  };
}

function getGrade(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Very Good';
  if (score >= 70) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Needs Improvement';
}
```

**Integration Point:**
- Prominent position in StudyOverviewPage (near top)
- Link to detailed breakdown page

---

#### Implementation Priority

**High Priority (Sprint 2):**
1. Enhanced Recent Activity Panel (5.5.1)
2. Enhanced Metric Cards with Trends (5.5.3)
3. Quick Actions Widget (5.5.4)

**Medium Priority (Sprint 3):**
4. Smart Insights Cards (5.5.2)
5. Data Health Score (5.5.6)

**Low Priority (Sprint 4):**
6. Live Activity Indicator (5.5.5) - requires real-time backend

---

#### Technical Considerations

**Component Architecture:**
```
/components/admin/dashboard/overview/
├── EnhancedRecentActivityPanel.tsx
├── SmartInsightsCards.tsx
├── TrendMetricCard.tsx
├── QuickActionsWidget.tsx
├── LiveActivityIndicator.tsx
├── DataHealthScore.tsx
└── shared/
    ├── MiniSparkline.tsx
    ├── MiniHistogram.tsx
    ├── TrendBadge.tsx
    └── QualityIndicator.tsx
```

**Data Utilities:**
```typescript
// lib/overviewAnalytics.ts

export function calculateTrends(
  currentPeriod: ParticipantRead[],
  previousPeriod: ParticipantRead[]
): TrendData {
  const currentCount = currentPeriod.length;
  const previousCount = previousPeriod.length;
  const percentChange = ((currentCount - previousCount) / previousCount) * 100;

  return {
    current: currentCount,
    previous: previousCount,
    change: currentCount - previousCount,
    percentChange: Math.round(percentChange),
    direction: percentChange > 0 ? 'up' : percentChange < 0 ? 'down' : 'stable'
  };
}

export function getSparklineData(
  participants: ParticipantRead[],
  days: number = 7
): number[] {
  const endDate = new Date();
  const startDate = subDays(endDate, days);

  const dailyCounts = Array.from({ length: days }, (_, i) => {
    const date = addDays(startDate, i);
    return participants.filter(p =>
      isSameDay(parseISO(p.submitted_at || p.created_at), date)
    ).length;
  });

  return dailyCounts;
}
```

**Performance Optimization:**
- Cache insights calculations (refresh every 5 minutes)
- Lazy load non-critical widgets
- Optimize sparkline rendering with canvas for large datasets
- Debounce real-time updates

**Accessibility:**
- All mini charts have text alternatives
- Color coding supplemented with icons/patterns
- Keyboard navigation for action buttons
- Screen reader announcements for live updates

---

#### Success Metrics

**User Engagement:**
- Time spent on Overview page
- Click-through rate on insights and quick actions
- Frequency of returning to overview vs. diving into details

**Research Efficiency:**
- Time to identify issues (with vs. without insights)
- Number of quality issues caught early
- User satisfaction with overview information density

**Actionability:**
- % of insights that lead to action
- Most-used quick actions
- Reduction in "lost" or missed issues

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

#### Sprint 2: Distribution Charts & Individual Participant Enhancement (Week 3-4)
1. **Implement Phase 2 charts**
   - DurationHistogramChart
   - DeviceBreakdownChart
   - Add to appropriate pages

2. **Implement Phase 4.5 high-priority components**
   - Enhanced Q-Sort Grid Visualization (4.5.1)
   - Response Quality Dashboard (4.5.6)
   - Enhanced Presort/Postsort Visualization (4.5.5)
   - Create `/components/admin/dashboard/participant/` directory
   - Integrate into ParticipantDetailContent

3. **Create Analytics page structure**
   - Page layout and routing
   - Navigation integration
   - Responsive grid system

4. **Testing & refinement**

#### Sprint 3: Recruitment, Statements & Comparative Analysis (Week 5-6)
1. **Implement Phase 3 charts**
   - RecruitmentFunnelChart
   - LinkPerformanceChart
   - Integrate into RecruitmentPage

2. **Implement Phase 4 charts**
   - ScoreDistributionHeatmap
   - StatementConsensusChart
   - StatementSentimentChart

3. **Implement Phase 4.5 medium-priority components**
   - Participant Journey Timeline (4.5.2)
   - Comparative Participant Analysis (4.5.4)
   - Integrate into ParticipantDetailContent

4. **Create Statement Analysis page**
   - Page structure and routing
   - Integration of statement charts

5. **Testing & refinement**

#### Sprint 4: Advanced Features, Polish & Optimization (Week 7-8)
1. **Implement Phase 4.5 low-priority components**
   - Statement Interaction Heatmap (4.5.3) - if backend ready
   - Participant Comparison Side Panel (4.5.7)
   - Export & Reporting for Individual Participants (4.5.8)
   - Create comparison page route

2. **Interactive features**
   - Click-through navigation
   - Advanced tooltips
   - Filter and time range controls

3. **Performance optimization**
   - Code splitting
   - Data caching
   - Chart rendering optimization
   - Lazy loading for participant visualizations

4. **Accessibility**
   - Keyboard navigation
   - Screen reader support
   - Color contrast validation
   - ARIA labels

5. **Documentation**
   - Component documentation
   - Usage examples
   - Admin guide for interpreting charts
   - Individual participant visualization guide

6. **Comprehensive testing**
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
