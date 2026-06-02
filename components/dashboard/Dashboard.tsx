'use client';

/**
 * Dashboard.tsx — Root layout component for VBHSR-SIM.
 *
 * Full-screen flex layout:
 *   TopBar (48px fixed)
 *   └─ Body (flex-1)
 *        ├─ LeftPanel (280px fixed)
 *        ├─ Centre column (flex-1)
 *        │    ├─ 3D Viewport (flex-1)
 *        │    └─ ControlStrip (48px fixed)
 *        └─ RightPanel (300px fixed)
 *   TabRow (40px fixed)
 *   TabContent (300px fixed)
 *
 * On mount: fires runCompute() with default params so the panel has results
 * immediately, matching the UX intent described in the project spec.
 */

import React, { useEffect, useRef, Suspense, lazy } from 'react';
import { Box } from 'lucide-react';
import { TopBar }        from './TopBar';
import { ControlStrip }  from './ControlStrip';
import { LeftPanel }     from './LeftPanel';
import { RightPanel }    from './RightPanel';
import { useSimulationStore, type SimTab } from '@/store/simulation';
import { OverviewTab }   from '@/components/tabs/OverviewTab';
import { AeroTab }       from '@/components/tabs/AeroTab';
import { DynamicsTab }   from '@/components/tabs/DynamicsTab';
import { BrakingTab }    from '@/components/tabs/BrakingTab';
import { StructuralTab } from '@/components/tabs/StructuralTab';
import { TractionTab }   from '@/components/tabs/TractionTab';
import { TunnelTab }     from '@/components/tabs/TunnelTab';
import { AcousticsTab }  from '@/components/tabs/AcousticsTab';
import { MAHSRTab }      from '@/components/tabs/MAHSRTab';
import { ReportTab }     from '@/components/tabs/ReportTab';

// ── Tab definitions ────────────────────────────────────────────────────────────

interface TabDef {
  id:    SimTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'overview',      label: 'Overview'         },
  { id: 'aerodynamics',  label: 'Aerodynamics'     },
  { id: 'dynamics',      label: 'Dynamics'         },
  { id: 'braking',       label: 'Braking'          },
  { id: 'structural',    label: 'Structural'       },
  { id: 'traction',      label: 'Traction'         },
  { id: 'tunnel',        label: 'Tunnel Pressure'  },
  { id: 'acoustics',     label: 'Acoustics & NVH'  },
  { id: 'mahsr',         label: 'MAHSR Readiness'  },
  { id: 'report',        label: 'Report'           },
];

// ── Tab row ────────────────────────────────────────────────────────────────────

function TabRow() {
  const { activeTab, setActiveTab } = useSimulationStore();

  return (
    <div
      className="flex items-end gap-0 border-t border-b border-surface-border bg-surface shrink-0 overflow-x-auto"
      style={{ height: 40 }}
      role="tablist"
      aria-label="Simulation domains"
    >
      {TABS.map(tab => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center h-full px-4 shrink-0
              text-[11px] font-sans font-medium
              border-b-2 transition-all duration-150
              whitespace-nowrap
              ${active
                ? 'border-b-ir-blue text-ir-blue bg-white'
                : 'border-b-transparent text-text-secondary hover:text-text-primary hover:bg-white/50'
              }
            `}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Tab content ────────────────────────────────────────────────────────────────
// Each tab renders the relevant chart / detail view.
// Heavy chart panels are lazy-loaded to keep initial bundle lean.

function TabContent() {
  const { activeTab } = useSimulationStore();

  const content = (() => {
    switch (activeTab) {
      case 'overview':     return <OverviewTab />;
      case 'aerodynamics': return <AeroTab />;
      case 'dynamics':     return <DynamicsTab />;
      case 'braking':      return <BrakingTab />;
      case 'structural':   return <StructuralTab />;
      case 'traction':     return <TractionTab />;
      case 'tunnel':       return <TunnelTab />;
      case 'acoustics':    return <AcousticsTab />;
      case 'mahsr':        return <MAHSRTab />;
      case 'report':       return <ReportTab />;
      default:             return null;
    }
  })();

  return (
    <div className="flex-1 overflow-auto bg-surface" style={{ height: 300 }}>
      {content}
    </div>
  );
}


// ── 3D Viewport ────────────────────────────────────────────────────────────────
// Rendered as a distinct region to isolate Three.js canvas from the layout.

function ViewportRegion() {
  return (
    <div className="flex-1 relative bg-[#F0F4FC] overflow-hidden">
      {/* Three.js canvas will mount here. Grid overlay for dev reference. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,56,147,0.04) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(0,56,147,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Placeholder label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
        <div className="w-16 h-16 rounded-2xl bg-white/60 backdrop-blur-sm border border-white/80 flex items-center justify-center shadow-card">
          <Box className="w-8 h-8 text-ir-blue/50" />
        </div>
        <div className="text-center">
          <p className="font-sans text-[13px] font-medium text-text-secondary">
            3D Viewport
          </p>
          <p className="font-mono text-[10px] text-text-muted mt-0.5">
            @react-three/fiber · Vande Bharat 3D Model
          </p>
        </div>
      </div>

      {/* Speed overlay — bottom-left HUD */}
      <SpeedHUD />

      {/* Viewport source note — bottom-right */}
      <div className="absolute bottom-2 right-3">
        <span className="font-mono text-[9px] text-text-muted/60">
          Nominal specification — ICF/RDSO
        </span>
      </div>
    </div>
  );
}

// ── Speed HUD overlay ──────────────────────────────────────────────────────────

function SpeedHUD() {
  const { params, results } = useSimulationStore();

  return (
    <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
      {/* Current simulation speed */}
      <div className="bg-white/80 backdrop-blur-sm border border-white/90 rounded px-3 py-1.5 shadow-card">
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-[22px] font-bold text-ir-blue leading-none">
            {params.speed_kmh}
          </span>
          <span className="font-mono text-[11px] text-text-muted">km/h</span>
        </div>
        <span className="font-sans text-[9px] text-text-muted uppercase tracking-wider">
          Simulation speed
        </span>
      </div>

      {/* Max speed (from traction) */}
      {results?.traction && (
        <div className="bg-white/80 backdrop-blur-sm border border-white/90 rounded px-3 py-1.5 shadow-card">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-[16px] font-semibold text-status-ok leading-none">
              {results.traction.max_speed_kmh.toFixed(0)}
            </span>
            <span className="font-mono text-[10px] text-text-muted">km/h max</span>
          </div>
          <span className="font-sans text-[9px] text-text-muted uppercase tracking-wider">
            Traction equilibrium
          </span>
        </div>
      )}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { runCompute, computeStatus } = useSimulationStore();
  const didMount = useRef(false);

  // Fire initial compute on mount with default params.
  // Guard with didMount ref to avoid React StrictMode double-fire in dev.
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;

    // Only auto-compute if we haven't already run
    if (computeStatus === 'idle') {
      runCompute();
    }
  }, [runCompute, computeStatus]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-surface font-sans">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <TopBar />

      {/* ── Body: panels + centre ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <LeftPanel />

        {/* Centre column: viewport + control strip */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* 3D Viewport — flex-1 so it fills available height */}
          <ViewportRegion />

          {/* Control strip — 48px fixed */}
          <ControlStrip />
        </div>

        {/* Right panel */}
        <RightPanel />
      </div>

      {/* ── Tab row ───────────────────────────────────────────────────── */}
      <TabRow />

      {/* ── Tab content ───────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-surface-border" style={{ height: 300 }}>
        <TabContent />
      </div>
    </div>
  );
}
