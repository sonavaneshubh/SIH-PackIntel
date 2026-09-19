'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase/client';
import { Inspection } from '@/types/database';

const PIPELINE_STAGES = [
  { id: 'image_quality', name: 'Image Quality', icon: 'high_quality', description: 'Checking image quality...' },
  { id: 'auto_crop', name: 'AI Auto-Crop', icon: 'crop', description: 'Applying AI auto-crop...' },
  { id: 'extraction', name: 'Data Extraction', icon: 'document_scanner', description: 'Extracting text and data...' },
  { id: 'classification', name: 'Category Classification', icon: 'category', description: 'Classifying product category...' },
  { id: 'missing_info', name: 'Missing Information / Recapture Check', icon: 'find_in_page', description: 'Checking for missing information...' },
  { id: 'comparison', name: 'Previous Comparison', icon: 'compare', description: 'Comparing with previous scans...' },
  { id: 'validation', name: 'Rule Validation', icon: 'rule', description: 'Validating against compliance rules...' },
  { id: 'report', name: 'Report Generation', icon: 'summarize', description: 'Generating final report...' },
];

export function AnalyzingView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inspectionId = searchParams.get('inspection');
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [currentStage, setCurrentStage] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [backendCompleted, setBackendCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inspectionId) {
      setError('No inspection ID provided');
      return;
    }

    const fetchInspection = async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .eq('id', inspectionId)
        .single();

      if (error) {
        setError(error.message);
        return;
      }

      setInspection(data);
      updateStageFromStatus(data.status);
      if (data.status === 'completed' || data.status === 'failed') {
        setBackendCompleted(true);
      }
    };

    fetchInspection();

    // Poll for updates
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('inspections')
        .select('status, overall_result, risk_score')
        .eq('id', inspectionId)
        .single();

      if (data) {
        setInspection(prev => {
          if (prev) {
            updateStageFromStatus(data.status, prev.status);
            return { ...prev, ...data };
          }
          return null;
        });

        if (data.status === 'completed' || data.status === 'failed') {
          setBackendCompleted(true);
          clearInterval(interval);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [inspectionId, router]);

  const updateStageFromStatus = (status: string, prevStatus?: string) => {
    // If backend is completed during polling, we handle it via visual zip-through
    if ((status === 'completed' || status === 'failed') && prevStatus !== undefined) return;
    
    if (status === prevStatus && status === 'processing') return; // Don't reset if we are advancing visually

    const stageMap: Record<string, number> = {
      draft: 0,
      processing: 1,
      completed: 7,
      failed: 7,
    };
    
    // Only update if it's a new status or we're not currently processing
    setCurrentStage(current => {
      if (status === 'processing' && current > 1 && current < 7) {
        return current;
      }
      return stageMap[status] || 0;
    });
  };

  const addLog = (message: string) => {
    setLogs(prev => [...prev, message]);
  };

  // Simulate logs based on current stage
  useEffect(() => {
    if (currentStage > 0) {
      setLogs(prev => {
        if (prev.length < currentStage) {
          const newLogs = [...prev];
          for (let i = prev.length; i < currentStage; i++) {
            newLogs.push(PIPELINE_STAGES[i].description);
          }
          return newLogs;
        }
        return prev;
      });
    }
  }, [currentStage]);

  // Visually progress through stages
  useEffect(() => {
    // If backend is processing, or backend completed but UI hasn't caught up yet
    if ((inspection?.status === 'processing' || backendCompleted) && currentStage >= 1 && currentStage < PIPELINE_STAGES.length - 1 && !isCompleted) {
      const speed = backendCompleted ? 300 : 2500; // Zip through at 300ms if backend is done
      const timer = setTimeout(() => {
        setCurrentStage(prev => prev + 1);
      }, speed);
      
      return () => clearTimeout(timer);
    } else if (backendCompleted && currentStage === PIPELINE_STAGES.length - 1 && !isCompleted) {
      // Reached the end AND backend is done
      setIsCompleted(true);
      setTimeout(() => router.push(`/results?inspection=${inspectionId}`), 1500);
    }
  }, [inspection?.status, currentStage, backendCompleted, isCompleted, inspectionId, router]);

  if (error) {
    return (
      <AppShell pageTitle="Analysis Error">
        <div className="max-w-md mx-auto text-center py-12">
          <span className="material-symbols-outlined text-6xl text-error mb-4">error</span>
          <h2 className="text-headline-lg font-headline-lg text-on-surface mb-2">Analysis Failed</h2>
          <p className="text-body-base text-on-surface-variant mb-6">{error}</p>
          <Button variant="primary" onClick={() => router.push('/scan/new')}>
            Start New Scan
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!inspection) {
    return (
      <AppShell pageTitle="Analyzing Label">
        <div className="max-w-5xl mx-auto w-full flex flex-col items-center justify-center py-6 min-h-[calc(100vh-160px)]">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-4">autorenew</span>
          <p className="text-body-base text-on-surface-variant">Loading inspection...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="Analyzing Label">
      <div className="max-w-5xl mx-auto w-full flex flex-col items-center justify-center py-6 min-h-[calc(100vh-160px)]">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-display-lg-mobile md:text-display-lg font-display-lg text-on-surface mb-2 tracking-tight">
            Analyzing Product Label
          </h2>
          <p className="text-headline-md font-headline-md text-secondary font-normal tracking-wide">
            {inspection.product_name || 'Product'} • {inspection.inspection_number}
          </p>
        </div>

        {/* Pipeline Grid Card */}
        <div className="w-full bg-surface border border-outline-variant shadow-sm rounded-xl p-6 md:p-8 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4 relative">
            {/* Connector Line (Desktop) */}
            <div className="hidden lg:block absolute top-6 left-[6.25%] right-[6.25%] h-1 bg-surface-container-highest z-0">
              <div
                className="h-full bg-primary transition-all duration-700 ease-in-out"
                style={{ width: `${(currentStage / (PIPELINE_STAGES.length - 1)) * 100}%` }}
              />
            </div>

            {/* Stages */}
            {PIPELINE_STAGES.map((stage, index) => {
              const isActive = index === currentStage && !isCompleted;
              const isDone = index < currentStage || (isCompleted && index === currentStage);

              return (
                <div
                  key={stage.id}
                  className={`flex flex-col items-center relative z-10 text-center transition-all duration-300 ${
                    index > currentStage && !isCompleted ? 'opacity-50' : 'opacity-100'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-all ${
                      isDone
                        ? 'bg-green-600 text-white shadow-xs'
                        : isActive
                        ? 'bg-primary text-white pulsing-dot shadow-md'
                        : 'bg-surface-container-highest text-secondary border-2 border-surface-container-high'
                    }`}
                  >
                    <span
                      className="material-symbols-outlined text-[24px]"
                      style={{
                        fontVariationSettings: isDone || isActive ? "'FILL' 1" : "'FILL' 0",
                      }}
                    >
                      {isDone ? 'check' : stage.icon}
                    </span>
                  </div>

                  <h3 className="text-label-bold font-label-bold text-on-surface uppercase mb-2 tracking-wider text-xs">
                    {stage.name}
                  </h3>

                  <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden mb-2 max-w-[140px]">
                    <div
                      className={`h-full transition-all duration-500 ease-out ${
                        isDone ? 'bg-green-600' : 'bg-primary'
                      }`}
                      style={{ width: `${isDone ? 100 : (isActive ? 50 : 0)}%` }}
                    />
                  </div>

                  <p className="text-body-sm font-data-tabular text-secondary text-xs">
                    {isDone ? '100%' : isActive ? '50%' : '0%'}
                  </p>

                  <p className="text-body-sm font-body-sm text-on-surface-variant mt-2 text-xs leading-relaxed max-w-[140px]">
                    {stage.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Logs Section */}
        <div className="w-full max-w-2xl bg-surface border border-outline-variant shadow-sm rounded-xl p-6">
          <div className="flex justify-between items-center border-b border-surface-container-highest pb-2 mb-4">
            <h4 className="text-label-bold font-label-bold text-secondary uppercase tracking-wider">
              Analysis Logs
            </h4>
            <span className="text-xs text-on-surface-variant flex items-center gap-1 font-mono">
              <span className={`w-2 h-2 rounded-full ${isCompleted ? 'bg-green-500' : 'bg-primary animate-ping'}`} />
              {isCompleted ? 'Complete' : 'Live Stream'}
            </span>
          </div>

          <ul className="space-y-3 font-data-tabular text-body-sm">
            {logs.map((log, index) => (
              <li
                key={index}
                className="flex items-start gap-3 text-on-surface text-xs animate-in fade-in slide-in-from-left-2 duration-200"
              >
                <span className="material-symbols-outlined text-green-600 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
                <span className="text-on-surface font-medium">{log}</span>
              </li>
            ))}
            {!isCompleted && currentStage < PIPELINE_STAGES.length && (
              <li className="flex items-start gap-3 text-on-surface text-xs animate-in fade-in slide-in-from-left-2 duration-200">
                <span className="material-symbols-outlined animate-spin-slow text-primary text-[18px]">autorenew</span>
                <span className="text-primary font-semibold">{PIPELINE_STAGES[currentStage]?.description || 'Processing...'}</span>
              </li>
            )}
          </ul>

          <div className="mt-6 pt-4 border-t border-outline-variant/60 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => router.push('/scan/new')}
              disabled={isCompleted}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="arrow_forward"
              iconPosition="right"
              className="w-full sm:w-auto"
              onClick={() => router.push(`/results?inspection=${inspectionId}`)}
              disabled={!isCompleted}
            >
              {isCompleted ? 'View Results' : 'Wait for Completion'}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}